import { bearerFromCookie, hasForbiddenKey } from "./propertyLoad";
import { isHouseRedeem } from "./secrets";

const PICTURE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const JSON_CAP = 1024 * 1024;
const PICTURE_CAP = 10 * 1024 * 1024;

const EXTRA_FORBIDDEN = new Set(["email", "bearer", "authorization"]);

export function propertyOrigin(propertyUrl: string): string | null {
  try {
    const url = new URL(propertyUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function leaks(text: string, bearer: string): boolean {
  return Boolean(bearer) && text.includes(bearer);
}

function topLevelForbidden(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (hasForbiddenKey(value)) return true;
  return Object.keys(value).some((key) => EXTRA_FORBIDDEN.has(key.toLowerCase()));
}

function readSegment(raw: string): string | null {
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!id || id === "." || id === ".." || id.includes("/") || id.includes("\\") || id.includes("\0")) return null;
  return id;
}

async function readCapped(request: Request, cap: number): Promise<Uint8Array | "too-large" | "empty"> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > cap) return "too-large";
  if (!request.body) return "empty";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return "too-large";
    }
    chunks.push(step.value);
  }
  if (!total) return "empty";
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function mediaType(value: string | null): "image/jpeg" | "image/png" | null {
  const type = (value || "").toLowerCase().split(";", 1)[0]?.trim() ?? "";
  if (type === "image/jpeg" || type === "image/jpg") return "image/jpeg";
  if (type === "image/png") return "image/png";
  return null;
}

async function fromUpstream(response: Response, bearer: string): Promise<Response> {
  if (response.status === 204) {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  const type = (response.headers.get("content-type") || "").toLowerCase();
  const picture = mediaType(type);
  if (picture && response.ok) {
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": picture, "cache-control": "no-store" },
    });
  }
  const declared = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > JSON_CAP + 4096) return json({ error: "payload_too_large" }, 413);
  const text = await response.text();
  if (leaks(text, bearer)) return json({ error: "forbidden" }, 403);
  if (!type.includes("json")) return json({ error: "unreachable" }, 502);
  try {
    const parsed: unknown = JSON.parse(text);
    if (topLevelForbidden(parsed)) return json({ error: "forbidden" }, 403);
  } catch {
    return json({ error: "forbidden" }, 403);
  }
  return new Response(text, {
    status: response.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * Same-origin plan proxy. The page calls this Worker. The house cookie is sent
 * to Property as a bearer and is not copied onto the response.
 */
export async function handleRenovateRequest(
  request: Request,
  input: { cookie: string | null; propertyUrl: string; fetchImpl?: typeof fetch },
): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "renovate" || parts.length < 3 || parts.length > 5) {
    return json({ error: "bad_request" }, 400);
  }
  const propertyId = readSegment(parts[2] ?? "");
  if (!propertyId) return json({ error: "bad_request" }, 400);
  const picture = parts[3] === "pictures";
  if (parts[3] && !picture) return json({ error: "bad_request" }, 400);
  if (picture && parts.length !== 5) return json({ error: "bad_request" }, 400);
  const pictureId = picture ? readSegment(parts[4] ?? "") : null;
  if (picture && (!pictureId || !PICTURE_ID.test(pictureId))) return json({ error: "bad_request" }, 400);

  const bearer = bearerFromCookie(input.cookie);
  if (!bearer || isHouseRedeem(bearer) || /[\r\n]/.test(bearer)) return json({ error: "unauthorized" }, 401);

  const origin = propertyOrigin(input.propertyUrl);
  if (!origin) return json({ error: "unreachable" }, 502);

  const target = picture
    ? `${origin}/api/renovate/${encodeURIComponent(propertyId)}/pictures/${encodeURIComponent(pictureId ?? "")}`
    : `${origin}/api/renovate/${encodeURIComponent(propertyId)}`;

  const method = request.method.toUpperCase();
  const allowed = picture ? method === "GET" || method === "PUT" || method === "DELETE" : method === "GET" || method === "PUT";
  if (!allowed) return json({ error: "bad_request" }, 405);

  const headers = new Headers();
  headers.set("authorization", `Bearer ${bearer}`);
  let body: Blob | string | undefined;
  if (method === "PUT" && picture) {
    const type = mediaType(request.headers.get("content-type"));
    if (!type) return json({ error: "unsupported_media_type" }, 415);
    const bytes = await readCapped(request, PICTURE_CAP);
    if (bytes === "too-large") return json({ error: "payload_too_large" }, 413);
    if (bytes === "empty") return json({ error: "bad_request" }, 400);
    headers.set("content-type", type);
    body = new Blob([bytes], { type });
  } else if (method === "PUT") {
    const bytes = await readCapped(request, JSON_CAP);
    if (bytes === "too-large") return json({ error: "payload_too_large" }, 413);
    if (bytes === "empty") return json({ error: "bad_request" }, 400);
    const raw = new TextDecoder().decode(bytes);
    if (leaks(raw, bearer)) return json({ error: "forbidden" }, 403);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: "bad_request" }, 400);
    }
    if (!isRecord(parsed) || !("document" in parsed) || topLevelForbidden(parsed)) return json({ error: "bad_request" }, 400);
    headers.set("content-type", "application/json");
    headers.set("accept", "application/json");
    body = raw;
  } else if (method === "GET" && !picture) {
    headers.set("accept", "application/json");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(target, { method, headers, body });
  } catch {
    return json({ error: "unreachable" }, 502);
  }
  return fromUpstream(response, bearer);
}
