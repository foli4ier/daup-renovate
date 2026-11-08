import { encodePictureId } from "../lib/pictureKey";
import { bytesToDataUrl, MAX_PICTURE_BYTES, type PicturePayload } from "../lib/pictureFit";
import { materializePictures, readOwnerDocument, splitPictures } from "./persist";
import { isEffectivelyEmpty, mergeProperty, sliceProperty } from "./slice";
import type { State } from "./types";

export const SYNC_KEY = "daup-renovate-house-sync";

const JSON_CAP = 1024 * 1024;

export type HouseFailure = "unauthorized" | "forbidden" | "too-large" | "unreachable";

export type PropertyMark = {
  /** `updatedAt` from the last successful GET or PUT. */
  serverUpdatedAt?: string;
  /** When this browser last changed the plan, or the server time after a hydrate. */
  localUpdatedAt?: string;
  /** Local picture ids last known to be on the house. */
  pictureIds?: string[];
};

export type SyncMarks = Record<string, PropertyMark>;

export type DocumentRead =
  | { ok: true; found: false }
  | { ok: true; found: true; updatedAt: string; document: unknown }
  | { ok: false; reason: HouseFailure };

export type DocumentWrite = { ok: true; updatedAt: string } | { ok: false; reason: HouseFailure };

export type PictureRead =
  | { ok: true; bytes: Uint8Array; contentType: PicturePayload["contentType"] }
  | { ok: false };

export type HouseClient = {
  readDocument(propertyId: string): Promise<DocumentRead>;
  writeDocument(propertyId: string, document: unknown): Promise<DocumentWrite>;
  readPicture(propertyId: string, pictureId: string): Promise<PictureRead>;
  writePicture(
    propertyId: string,
    pictureId: string,
    picture: PicturePayload,
  ): Promise<{ ok: true } | { ok: false; reason: HouseFailure }>;
  deletePicture(propertyId: string, pictureId: string): Promise<boolean>;
};

export type SyncNotice = "ok" | "too-large";

export type SyncResult = {
  state: State;
  marks: SyncMarks;
  unresolved: Set<string>;
  notice: SyncNotice;
  /** Properties whose cache now matches what we decided. A failed push is absent so the next save retries. */
  syncedIds: string[];
};

function cloneMarks(marks: SyncMarks): SyncMarks {
  const next: SyncMarks = {};
  for (const [id, mark] of Object.entries(marks)) {
    next[id] = { ...mark, pictureIds: mark.pictureIds ? [...mark.pictureIds] : undefined };
  }
  return next;
}

function justAfter(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  return new Date(time + 1).toISOString();
}

function localIsNewer(mark: PropertyMark | undefined, remoteUpdatedAt: string): boolean {
  if (!mark?.localUpdatedAt) return false;
  if (!mark.serverUpdatedAt) return mark.localUpdatedAt > remoteUpdatedAt;
  if (mark.localUpdatedAt <= mark.serverUpdatedAt) return false;
  if (remoteUpdatedAt <= mark.serverUpdatedAt) return true;
  return mark.localUpdatedAt > remoteUpdatedAt;
}

function houseIsNewer(mark: PropertyMark | undefined, remoteUpdatedAt: string): boolean {
  if (!mark?.serverUpdatedAt) return true;
  return remoteUpdatedAt > mark.serverUpdatedAt;
}

export function readSyncMarks(raw: string | null): SyncMarks {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const marks: SyncMarks = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as Record<string, unknown>;
      const mark: PropertyMark = {};
      if (typeof record.serverUpdatedAt === "string") mark.serverUpdatedAt = record.serverUpdatedAt;
      if (typeof record.localUpdatedAt === "string") mark.localUpdatedAt = record.localUpdatedAt;
      if (Array.isArray(record.pictureIds)) {
        mark.pictureIds = record.pictureIds.filter((item): item is string => typeof item === "string");
      }
      marks[id] = mark;
    }
    return marks;
  } catch {
    return {};
  }
}

/**
 * Bring one browser's cache into line with the house.
 * Sample sessions are not read or written. A failed house leaves the cache as it was.
 * Last write wins by Property's `updatedAt` against the time we stored from the last good GET or PUT.
 */
export async function syncHousePlans(input: {
  state: State;
  propertyIds: string[];
  marks: SyncMarks;
  unresolved: Set<string>;
  client: HouseClient;
  fit: (dataUrl: string) => Promise<PicturePayload | null>;
}): Promise<SyncResult> {
  if (input.state.sample) {
    return {
      state: input.state,
      marks: input.marks,
      unresolved: input.unresolved,
      notice: "ok",
      syncedIds: [],
    };
  }

  let state = input.state;
  const marks = cloneMarks(input.marks);
  const unresolved = new Set(input.unresolved);
  const syncedIds: string[] = [];
  let notice: SyncNotice = "ok";

  async function push(propertyId: string): Promise<void> {
    const prepared = splitPictures(sliceProperty(state, propertyId), unresolved);
    const packed = JSON.stringify(prepared.document);
    if (packed.includes("data:image/") || packed.length > JSON_CAP) {
      notice = "too-large";
      return;
    }
    const fitted = new Map<string, { remoteId: string; payload: PicturePayload }>();
    for (const record of prepared.writes) {
      let payload: PicturePayload | null = null;
      try {
        payload = await input.fit(record.dataUrl);
      } catch {
        payload = null;
      }
      const remoteId = encodePictureId(record.id);
      if (!payload || payload.bytes.byteLength > MAX_PICTURE_BYTES || payload.bytes.byteLength === 0 || !remoteId) {
        notice = "too-large";
        return;
      }
      fitted.set(record.id, { remoteId, payload });
    }

    const written = await input.client.writeDocument(propertyId, prepared.document);
    if (!written.ok) {
      if (written.reason === "too-large") notice = "too-large";
      return;
    }

    for (const record of prepared.writes) {
      const item = fitted.get(record.id);
      if (!item) continue;
      const put = await input.client.writePicture(propertyId, item.remoteId, item.payload);
      if (!put.ok) {
        marks[propertyId] = {
          serverUpdatedAt: written.updatedAt,
          localUpdatedAt: justAfter(written.updatedAt),
          pictureIds: marks[propertyId]?.pictureIds,
        };
        if (put.reason === "too-large") notice = "too-large";
        return;
      }
    }

    const previous = marks[propertyId]?.pictureIds ?? [];
    const keep = new Set(prepared.keep);
    const leftover: string[] = [];
    for (const id of previous) {
      if (keep.has(id)) continue;
      const remoteId = encodePictureId(id);
      if (!remoteId) continue;
      const deleted = await input.client.deletePicture(propertyId, remoteId);
      if (!deleted) leftover.push(id);
    }
    marks[propertyId] = {
      serverUpdatedAt: written.updatedAt,
      localUpdatedAt: written.updatedAt,
      pictureIds: [...prepared.keep, ...leftover],
    };
    syncedIds.push(propertyId);
  }

  async function hydrate(propertyId: string, updatedAt: string, remote: State): Promise<void> {
    const prepared = splitPictures(remote, new Set());
    const found = new Map<string, string>();
    for (const id of prepared.keep) {
      const remoteId = encodePictureId(id);
      if (!remoteId) {
        unresolved.add(id);
        continue;
      }
      const picture = await input.client.readPicture(propertyId, remoteId);
      if (!picture.ok) {
        unresolved.add(id);
        continue;
      }
      found.set(id, bytesToDataUrl(picture.bytes, picture.contentType));
      unresolved.delete(id);
    }
    const opened = materializePictures(prepared.document, found);
    for (const id of opened.unresolved) unresolved.add(id);
    state = mergeProperty(state, propertyId, opened.state);
    marks[propertyId] = {
      serverUpdatedAt: updatedAt,
      localUpdatedAt: updatedAt,
      pictureIds: [...prepared.keep],
    };
    syncedIds.push(propertyId);
  }

  for (const propertyId of input.propertyIds) {
    if (!propertyId) continue;
    const mark = marks[propertyId];
    const empty = isEffectivelyEmpty(sliceProperty(state, propertyId));
    let read: DocumentRead;
    try {
      read = await input.client.readDocument(propertyId);
    } catch {
      continue;
    }
    if (!read.ok) {
      if (read.reason === "too-large") notice = "too-large";
      continue;
    }
    if (!read.found) {
      if (empty) {
        syncedIds.push(propertyId);
        continue;
      }
      await push(propertyId);
      continue;
    }

    const remote = readOwnerDocument(read.document);
    if (!remote) {
      syncedIds.push(propertyId);
      continue;
    }
    const localNewer = localIsNewer(mark, read.updatedAt);
    const houseNewer = houseIsNewer(mark, read.updatedAt);
    if (empty && !localNewer) {
      await hydrate(propertyId, read.updatedAt, remote);
      continue;
    }
    if (localNewer && !houseNewer) {
      await push(propertyId);
      continue;
    }
    if (!localNewer && houseNewer) {
      await hydrate(propertyId, read.updatedAt, remote);
      continue;
    }
    if (localNewer && houseNewer) {
      if (mark?.localUpdatedAt && mark.localUpdatedAt > read.updatedAt) await push(propertyId);
      else await hydrate(propertyId, read.updatedAt, remote);
      continue;
    }
    syncedIds.push(propertyId);
  }

  return { state, marks, unresolved, notice, syncedIds };
}
