import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";

type BodyRequest = {
  url?: string;
  method?: string;
  on(event: "data", listener: (chunk: Uint8Array) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: unknown) => void): void;
};

function readBody(req: BodyRequest): Promise<string> {
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
      resolve(new TextDecoder().decode(merged));
    });
    req.on("error", reject);
  });
}

function send(res: { statusCode: number; setHeader(name: string, value: string): void; end(body: string): void }, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function attach(server: { middlewares: Connect.Server }) {
  server.middlewares.use(async (req, res, next) => {
    const url = req.url ?? "";
    if (!url.startsWith("/api/")) {
      next();
      return;
    }
    if (url.startsWith("/api/health")) {
      send(res, 200, { ok: true, ai: false });
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
  configureServer: attach,
  configurePreviewServer: attach,
};

export default defineConfig({
  plugins: [react(), apiPlugin],
  appType: "spa",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
