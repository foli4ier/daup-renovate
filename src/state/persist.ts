import { emptyState, STORAGE_KEY } from "../data/seed";
import { withMessages, type State } from "./types";

/**
 * Picture bytes live in IndexedDB. The plan document keeps this prefix
 * instead of a data URL, under the same localStorage key as before.
 */
const PICTURE_REF_PREFIX = "pic:";

/** Shown when a stored picture cannot be opened. Not written back over the real bytes. */
const MISSING_PICTURE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export type Bucket = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type PictureRecord = {
  id: string;
  dataUrl: string;
};

export type PictureBytes = {
  put(records: PictureRecord[]): Promise<void>;
  get(ids: string[]): Promise<Map<string, string>>;
  delete(ids: string[]): Promise<void>;
};

type SlotKind = "photo" | "proposal" | "before" | "after";

type Slot = {
  kind: SlotKind;
  id: string;
  value: string;
};

export type OpenedPlan = {
  state: State;
  unresolved: Set<string>;
};

function pictureId(kind: SlotKind, id: string): string {
  if (kind === "photo") return `photo:${id}`;
  if (kind === "proposal") return `proposal:${id}`;
  if (kind === "before") return `request:${id}:before`;
  return `request:${id}:after`;
}

function pictureRef(id: string): string {
  return `${PICTURE_REF_PREFIX}${id}`;
}

function pictureIdFromRef(value: string): string | null {
  return value.startsWith(PICTURE_REF_PREFIX) ? value.slice(PICTURE_REF_PREFIX.length) : null;
}

function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

function slots(state: State): Slot[] {
  const out: Slot[] = [];
  for (const photo of state.photos) {
    if (!photo || typeof photo.id !== "string") continue;
    out.push({ kind: "photo", id: photo.id, value: typeof photo.url === "string" ? photo.url : "" });
  }
  for (const proposal of state.proposals) {
    if (!proposal || typeof proposal.id !== "string") continue;
    out.push({ kind: "proposal", id: proposal.id, value: typeof proposal.imageUrl === "string" ? proposal.imageUrl : "" });
  }
  for (const request of state.requests) {
    if (!request || typeof request.id !== "string") continue;
    out.push({ kind: "before", id: request.id, value: typeof request.beforeUrl === "string" ? request.beforeUrl : "" });
    out.push({ kind: "after", id: request.id, value: typeof request.afterUrl === "string" ? request.afterUrl : "" });
  }
  return out;
}

function writeSlots(state: State, values: Map<string, string>): State {
  if (!values.size) return state;
  return {
    ...state,
    photos: state.photos.map((photo) => {
      const next = values.get(pictureId("photo", photo.id));
      return next === undefined ? photo : { ...photo, url: next };
    }),
    proposals: state.proposals.map((proposal) => {
      const next = values.get(pictureId("proposal", proposal.id));
      return next === undefined ? proposal : { ...proposal, imageUrl: next };
    }),
    requests: state.requests.map((request) => {
      const before = values.get(pictureId("before", request.id));
      const after = values.get(pictureId("after", request.id));
      if (before === undefined && after === undefined) return request;
      return {
        ...request,
        beforeUrl: before === undefined ? request.beforeUrl : before,
        afterUrl: after === undefined ? request.afterUrl : after,
      };
    }),
  };
}

function ready(state: State): State {
  return withMessages({
    ...state,
    photos: Array.isArray(state.photos) ? state.photos : [],
    proposals: Array.isArray(state.proposals) ? state.proposals : [],
    requests: Array.isArray(state.requests) ? state.requests : [],
  });
}

function isOwnerDocument(value: unknown): value is State {
  if (!value || typeof value !== "object") return false;
  const state = value as State;
  return state.version === 2 && state.sample === false && Array.isArray(state.zones) && Array.isArray(state.plans);
}

/** Read a v2 owner plan. Sample sessions and broken JSON are ignored. */
export function readStoredOwner(raw: string | null): State | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isOwnerDocument(parsed)) return null;
    return ready(parsed);
  } catch {
    return null;
  }
}

export function hasPictureRefs(state: State): boolean {
  return slots(ready(state)).some((slot) => pictureIdFromRef(slot.value) !== null);
}

type Prepared = {
  document: State;
  writes: PictureRecord[];
  keep: string[];
};

/**
 * Replace data URLs with picture refs. A missing picture that we failed to
 * open keeps its old ref so a later save does not overwrite the bytes.
 */
function toDocument(state: State, unresolved: ReadonlySet<string>): Prepared {
  const values = new Map<string, string>();
  const writes: PictureRecord[] = [];
  const keep: string[] = [];
  for (const slot of slots(state)) {
    const id = pictureId(slot.kind, slot.id);
    const refId = pictureIdFromRef(slot.value);
    if (refId) {
      values.set(id, pictureRef(refId));
      keep.push(refId);
      continue;
    }
    const keptAside = unresolved.has(id) && (slot.value === "" || slot.value === MISSING_PICTURE);
    if (isDataUrl(slot.value) && !keptAside) {
      values.set(id, pictureRef(id));
      writes.push({ id, dataUrl: slot.value });
      keep.push(id);
      continue;
    }
    if (unresolved.has(id)) {
      values.set(id, pictureRef(id));
      keep.push(id);
    }
  }
  return { document: writeSlots(state, values), writes, keep };
}

function materialize(state: State, found: ReadonlyMap<string, string>): OpenedPlan {
  const values = new Map<string, string>();
  const unresolved = new Set<string>();
  for (const slot of slots(state)) {
    const refId = pictureIdFromRef(slot.value);
    if (!refId) continue;
    const dataUrl = found.get(refId);
    if (dataUrl && isDataUrl(dataUrl)) {
      values.set(pictureId(slot.kind, slot.id), dataUrl);
      continue;
    }
    values.set(pictureId(slot.kind, slot.id), MISSING_PICTURE);
    unresolved.add(refId);
  }
  return { state: writeSlots(state, values), unresolved };
}

/**
 * Open an owner plan. Embedded data URLs are copied into the picture store
 * and removed from the bucket. Refs are turned back into data URLs in memory.
 * Never throws.
 */
export async function loadOwner(
  bucket: Bucket,
  bytes: PictureBytes,
  known: Map<string, string>,
  key = STORAGE_KEY,
): Promise<OpenedPlan> {
  let state: State;
  try {
    state = readStoredOwner(bucket.getItem(key)) ?? emptyState();
  } catch {
    return { state: emptyState(), unresolved: new Set() };
  }
  try {
    const pending = toDocument(state, new Set());
    if (pending.writes.length) {
      await bytes.put(pending.writes);
      const json = JSON.stringify(pending.document);
      if (bucket.getItem(key) !== json) bucket.setItem(key, json);
      for (const record of pending.writes) known.set(record.id, record.dataUrl);
    }
    const reads = pending.keep.filter((id) => !pending.writes.some((record) => record.id === id));
    if (!reads.length) return { state, unresolved: new Set() };
    const found = await bytes.get(reads);
    for (const [id, dataUrl] of found) known.set(id, dataUrl);
    return materialize(state, found);
  } catch {
    return materialize(state, new Map());
  }
}

/**
 * Save an owner plan. Picture bytes go to the picture store; the bucket keeps
 * the plan without those strings. Returns false when the save fails, and does
 * not throw. A failed setItem leaves the previous bucket value in place.
 */
export async function saveOwner(
  bucket: Bucket,
  bytes: PictureBytes,
  state: State,
  known: Map<string, string>,
  unresolved: Set<string>,
  key = STORAGE_KEY,
): Promise<boolean> {
  try {
    const prepared = toDocument(state, unresolved);
    const writes = prepared.writes.filter((record) => known.get(record.id) !== record.dataUrl);
    if (writes.length) await bytes.put(writes);
    const json = JSON.stringify(prepared.document);
    const previousRaw = bucket.getItem(key);
    if (previousRaw !== json) bucket.setItem(key, json);
    for (const record of writes) known.set(record.id, record.dataUrl);
    for (const id of [...unresolved]) {
      if (!prepared.keep.includes(id) || writes.some((record) => record.id === id)) unresolved.delete(id);
    }
    const previous = readStoredOwner(previousRaw);
    if (previous) {
      const oldKeep = new Set(toDocument(previous, new Set()).keep);
      const nextKeep = new Set(prepared.keep);
      const drop = [...oldKeep].filter((id) => !nextKeep.has(id));
      if (drop.length) {
        try {
          await bytes.delete(drop);
          for (const id of drop) known.delete(id);
        } catch {
          /* Leftover pictures take space and do not block the plan. */
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}
