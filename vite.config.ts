import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";
import { DEFAULT_SEED_ORIGIN } from "./src/lib/propertyLoad";
import { PROPERTY_LIST_URL } from "./src/lib/properties";
import { handlePropertyPost } from "./src/lib/propertyRoute";
import { handleRenovateRequest } from "./src/lib/renovateRoute";

type BodyRequest = {
  url?: string;
  method?: string;
  on(event: "data", listener: (chunk: Uint8Array) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: unknown) => void): void;
};

function readRaw(req: BodyRequest): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      const merged = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(merged);
    });
    req.on("error", reject);
  });
}

function readBody(req: BodyRequest): Promise<string> {
  return readRaw(req).then((bytes) => new TextDecoder().decode(bytes));
}

function send(res: { statusCode: number; setHeader(name: string, value: string): void; end(body: string): void }, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function header(req: { headers: Record<string, string | string[] | undefined> }, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function attach(server: { middlewares: Connect.Server }, allowMock: boolean) {
  server.middlewares.use(async (req, res, next) => {
    const url = req.url ?? "";
    if (!url.startsWith("/api/")) {
      next();
      return;
    }
    if (url.startsWith("/api/renovate/")) {
      try {
        const method = req.method ?? "GET";
        const headers = new Headers();
        const cookie = header(req, "cookie");
        const contentType = header(req, "content-type");
        const accept = header(req, "accept");
        if (cookie) headers.set("cookie", cookie);
        if (contentType) headers.set("content-type", contentType);
        if (accept) headers.set("accept", accept);
        const hasBody = method !== "GET" && method !== "HEAD";
        const raw = hasBody ? await readRaw(req) : undefined;
        const request = new Request(`http://localhost${url}`, {
          method,
          headers,
          body: raw ? new Blob([raw]) : undefined,
        });
        const response = await handleRenovateRequest(request, {
          cookie,
          propertyUrl: process.env.PROPERTY_URL || process.env.VITE_PROPERTY_URL || PROPERTY_LIST_URL,
        });
        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          if (key.toLowerCase() === "set-cookie") return;
          res.setHeader(key, value);
        });
        const bytes = new Uint8Array(await response.arrayBuffer());
        res.end(Buffer.from(bytes));
      } catch {
        send(res, 502, { error: "unreachable" });
      }
      return;
    }
    if (url.startsWith("/api/properties") && req.method === "POST") {
      try {
        const raw = await readBody(req);
        const body = raw ? (JSON.parse(raw) as unknown) : {};
        const result = await handlePropertyPost({
          body,
          cookie: header(req, "cookie"),
          secure: false,
          seedOrigin: process.env.HOUSE_SEED_URL || DEFAULT_SEED_ORIGIN,
          propertyUrl: process.env.PROPERTY_URL || process.env.VITE_PROPERTY_URL || PROPERTY_LIST_URL,
          allowMock,
          envMock: process.env.PROPERTY_MOCK === "1",
        });
        if (result.setCookie) res.setHeader("set-cookie", result.setCookie);
        send(res, result.status, result.body);
      } catch {
        send(res, 200, { ok: false, code: "unreachable" });
      }
      return;
    }
    if (url.startsWith("/api/health")) {
      send(res, 200, { ok: true, ai: false });
      return;
    }
    if (url.startsWith("/api/describe") && req.method === "POST") {
      try {
        await readBody(req);
      } catch {
        send(res, 400, { ok: false });
        return;
      }
      send(res, 200, { ok: false, code: "unavailable" });
      return;
    }
    if (url.startsWith("/api/generate") && req.method === "POST") {
      try {
        const raw = await readBody(req);
        const body = raw ? (JSON.parse(raw) as { attemptsUsed?: number }) : {};
        if ((body.attemptsUsed ?? 0) >= 3) {
          send(res, 200, { ok: false, code: "cap" });
          return;
        }
      } catch {
        send(res, 400, { ok: false, code: "failed" });
        return;
      }
      send(res, 200, { ok: false, code: "unavailable" });
      return;
    }
    send(res, 404, { ok: false });
  });
}

const apiPlugin: Plugin = {
  name: "renovate-api",
  configureServer(server) {
    attach(server, true);
  },
  configurePreviewServer(server) {
    attach(server, process.env.PROPERTY_MOCK === "1");
  },
};

export default defineConfig({
  plugins: [react(), apiPlugin],
  appType: "spa",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
