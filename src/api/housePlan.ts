import type { PicturePayload } from "../lib/pictureFit";
import type { DocumentRead, DocumentWrite, HouseClient, HouseFailure, PictureRead } from "../state/houseSync";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function failure(status: number): HouseFailure {
  if (status === 413) return "too-large";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  return "unreachable";
}

export function interpretDocument(status: number, body: unknown): DocumentRead {
  if (status === 404 && isRecord(body) && body.error === "not_found") return { ok: true, found: false };
  if (status === 200 && isRecord(body) && typeof body.updatedAt === "string" && "document" in body) {
    return { ok: true, found: true, updatedAt: body.updatedAt, document: body.document };
  }
  return { ok: false, reason: failure(status) };
}

export function interpretWrite(status: number, body: unknown): DocumentWrite {
  if ((status === 200 || status === 201) && isRecord(body) && typeof body.updatedAt === "string") {
    return { ok: true, updatedAt: body.updatedAt };
  }
  return { ok: false, reason: failure(status) };
}

function documentPath(propertyId: string): string {
  return `/api/renovate/${encodeURIComponent(propertyId)}`;
}

function picturePath(propertyId: string, pictureId: string): string {
  return `${documentPath(propertyId)}/pictures/${encodeURIComponent(pictureId)}`;
}

function mediaType(value: string | null): PicturePayload["contentType"] | null {
  const type = (value || "").toLowerCase().split(";", 1)[0]?.trim() ?? "";
  if (type === "image/jpeg" || type === "image/jpg") return "image/jpeg";
  if (type === "image/png") return "image/png";
  return null;
}

/**
 * Same-origin plan client. The cookie goes with the request. The bearer stays on the Worker.
 */
export function browserHouseClient(fetchImpl: typeof fetch = fetch): HouseClient {
  return {
    async readDocument(propertyId) {
      try {
        const response = await fetchImpl(documentPath(propertyId), {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const body: unknown = await response.json().catch(() => null);
        return interpretDocument(response.status, body);
      } catch {
        return { ok: false, reason: "unreachable" };
      }
    },
    async writeDocument(propertyId, document) {
      try {
        const response = await fetchImpl(documentPath(propertyId), {
          method: "PUT",
          credentials: "include",
          cache: "no-store",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({ document }),
        });
        const body: unknown = await response.json().catch(() => null);
        return interpretWrite(response.status, body);
      } catch {
        return { ok: false, reason: "unreachable" };
      }
    },
    async readPicture(propertyId, pictureId): Promise<PictureRead> {
      try {
        const response = await fetchImpl(picturePath(propertyId, pictureId), {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return { ok: false };
        const contentType = mediaType(response.headers.get("content-type"));
        if (!contentType) return { ok: false };
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.byteLength) return { ok: false };
        return { ok: true, bytes, contentType };
      } catch {
        return { ok: false };
      }
    },
    async writePicture(propertyId, pictureId, picture) {
      try {
        const response = await fetchImpl(picturePath(propertyId, pictureId), {
          method: "PUT",
          credentials: "include",
          cache: "no-store",
          headers: { "content-type": picture.contentType },
          body: picture.bytes,
        });
        if (response.status === 204 || response.status === 200) return { ok: true };
        return { ok: false, reason: failure(response.status) };
      } catch {
        return { ok: false, reason: "unreachable" };
      }
    },
    async deletePicture(propertyId, pictureId) {
      try {
        const response = await fetchImpl(picturePath(propertyId, pictureId), {
          method: "DELETE",
          credentials: "include",
          cache: "no-store",
        });
        return response.status === 204 || response.status === 404;
      } catch {
        return false;
      }
    },
  };
}
