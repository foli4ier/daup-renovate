import { DEFAULT_SEED_ORIGIN } from "../src/lib/propertyLoad";
import { handlePropertyPost } from "../src/lib/propertyRoute";
import { buildEditPrompt, capReached, MODEL_KLEIN, type PromptInput } from "../src/lib/prompt";

type AiBinding = {
  run(
    model: string,
    input: { multipart: { body: ReadableStream<Uint8Array> | null; contentType: string } },
  ): Promise<unknown>;
};

interface Env {
  ASSETS: Fetcher;
  AI?: AiBinding;
  KONTEXT_API_URL?: string;
  KONTEXT_API_TOKEN?: string;
  HOUSE_SEED_URL?: string;
  PROPERTY_URL?: string;
}

type GenerateBody = Partial<PromptInput> & {
  attemptsUsed?: number;
  imageBase64?: string;
  mime?: string;
  width?: number;
  height?: number;
  prompt?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function mimeFor(value: string): string {
  if (value.startsWith("iVBOR")) return "image/png";
  if (value.startsWith("/9j/")) return "image/jpeg";
  return "image/jpeg";
}

function extractImage(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return payload.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  if (typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.image === "string") return extractImage(record.image);
  if (typeof record.result === "string" || (record.result && typeof record.result === "object")) return extractImage(record.result);
  const images = record.images;
  if (Array.isArray(images) && images[0] && typeof images[0] === "object") {
    const first = images[0] as Record<string, unknown>;
    if (typeof first.url === "string") return null;
    if (typeof first.image === "string") return extractImage(first.image);
  }
  return null;
}

async function runKlein(env: Env, prompt: string, bytes: Uint8Array, mime: string, width: number, height: number): Promise<string | null> {
  if (!env.AI) return null;
  const form = new FormData();
  form.set("prompt", prompt);
  form.set("width", String(width));
  form.set("height", String(height));
  form.set("input_image_0", new Blob([bytes]), mime === "image/png" ? "before.png" : "before.jpg");
  const encoded = new Response(form);
  const contentType = encoded.headers.get("content-type");
  if (!encoded.body || !contentType) return null;
  const result = await env.AI.run(MODEL_KLEIN, {
    multipart: { body: encoded.body, contentType },
  });
  return extractImage(result);
}

async function runKontext(env: Env, prompt: string, bytes: Uint8Array): Promise<string | null> {
  if (!env.KONTEXT_API_URL || !env.KONTEXT_API_TOKEN) return null;
  try {
    const response = await fetch(env.KONTEXT_API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.KONTEXT_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ prompt, image: bytesToBase64(bytes) }),
    });
    if (!response.ok) return null;
    return extractImage(await response.json());
  } catch {
    return null;
  }
}

function promptFrom(body: GenerateBody): string {
  if (body.zoneName && body.style && body.budget) {
    return buildEditPrompt({
      zoneName: body.zoneName,
      style: body.style,
      styleNote: body.styleNote,
      budget: body.budget,
      keep: body.keep ?? [],
      replace: body.replace ?? [],
      answers: body.answers ?? [],
      drift: Boolean(body.drift),
    });
  }
  return body.prompt?.trim() || "Edit the photo. Keep the same camera view. Remove any people.";
}

async function generate(request: Request, env: Env): Promise<Response> {
  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return json({ ok: false, code: "failed" }, 400);
  }
  const attemptsUsed = body.attemptsUsed ?? 0;
  if (capReached(attemptsUsed)) return json({ ok: false, code: "cap" });
  if (!body.imageBase64) return json({ ok: false, code: "unavailable" });
  const bytes = base64ToBytes(body.imageBase64);
  const mime = body.mime || "image/jpeg";
  const width = body.width && body.width > 0 ? body.width : 1024;
  const height = body.height && body.height > 0 ? body.height : 768;
  const prompt = promptFrom(body);
  let image: string | null = null;
  if (body.drift) image = await runKontext(env, prompt, bytes);
  if (!image) image = await runKlein(env, prompt, bytes, mime, width, height);
  if (!image) image = await runKontext(env, prompt, bytes);
  if (!image) return json({ ok: false, code: env.AI ? "failed" : "unavailable" });
  return json({ ok: true, imageBase64: image, mime: mimeFor(image) });
}

async function properties(request: Request, env: Env): Promise<Response> {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const result = await handlePropertyPost({
    body,
    cookie: request.headers.get("cookie"),
    secure: new URL(request.url).protocol === "https:",
    seedOrigin: env.HOUSE_SEED_URL || DEFAULT_SEED_ORIGIN,
    propertyUrl: env.PROPERTY_URL || "",
    allowMock: false,
    envMock: false,
  });
  const headers: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
  if (result.setCookie) headers["set-cookie"] = result.setCookie;
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ ok: true });
    if (url.pathname === "/api/properties" && request.method === "POST") return properties(request, env);
    if (url.pathname === "/api/generate" && request.method === "POST") return generate(request, env);
    return env.ASSETS.fetch(request);
  },
};
