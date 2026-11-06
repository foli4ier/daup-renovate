import { SAMPLE_AFTER_BY_PHOTO } from "../data/seed";
import { buildEditPrompt, capReached, type PromptInput } from "../lib/prompt";

export type GenerateRequest = PromptInput & {
  attemptsUsed: number;
  beforePhotoId: string;
  imageUrl: string;
};

export type GenerateResponse =
  | { ok: true; imageUrl: string }
  | { ok: false; code: "cap" | "failed" | "unavailable" };

type WorkerBody = {
  ok?: boolean;
  code?: "cap" | "failed" | "unavailable";
  imageBase64?: string;
  mime?: string;
};

async function resizeForModel(src: string): Promise<{ base64: string; mime: string; outWidth: number; outHeight: number } | null> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("image"));
    element.src = src;
  }).catch(() => null);
  if (!image) return null;
  const longest = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const scale = longest > 511 ? 511 / longest : 1;
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const base64 = dataUrl.split(",")[1] ?? "";
  const outLong = 1024;
  const naturalLong = Math.max(image.naturalWidth || width, image.naturalHeight || height);
  const outScale = outLong / naturalLong;
  return {
    base64,
    mime: "image/jpeg",
    outWidth: Math.max(64, Math.round((image.naturalWidth || width) * outScale)),
    outHeight: Math.max(64, Math.round((image.naturalHeight || height) * outScale)),
  };
}

export async function generateImage(input: GenerateRequest): Promise<GenerateResponse> {
  if (capReached(input.attemptsUsed)) return { ok: false, code: "cap" };
  try {
    const fitted = await resizeForModel(input.imageUrl);
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: buildEditPrompt(input),
        attemptsUsed: input.attemptsUsed,
        drift: input.drift,
        imageBase64: fitted?.base64 ?? "",
        mime: fitted?.mime ?? "image/jpeg",
        width: fitted?.outWidth ?? 1024,
        height: fitted?.outHeight ?? 768,
      }),
    });
    if (response.ok) {
      const data = (await response.json()) as WorkerBody;
      if (data.ok && data.imageBase64) {
        const mime = data.mime || "image/jpeg";
        return { ok: true, imageUrl: `data:${mime};base64,${data.imageBase64}` };
      }
      if (data.code === "cap") return { ok: false, code: "cap" };
    }
  } catch {
    // Local Vite has no AI binding. Fall through to the sample picture.
  }
  const sample = SAMPLE_AFTER_BY_PHOTO[input.beforePhotoId];
  if (sample && input.attemptsUsed === 0) return { ok: true, imageUrl: sample };
  return { ok: false, code: "failed" };
}
