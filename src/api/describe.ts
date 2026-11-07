import { alignChips, describePrompt, parseReading, type Reading } from "../lib/reading";

export type DescribeInput = {
  beforeUrl: string;
  afterUrl: string;
  zoneName: string;
  keepSuggestions: string[];
  replaceSuggestions: string[];
};

export async function describeAfter(input: DescribeInput): Promise<{ ok: true; reading: Reading } | { ok: false }> {
  try {
    const imageBase64 = await comparisonJpeg(input.beforeUrl, input.afterUrl);
    if (!imageBase64) return { ok: false };
    const response = await fetch("/api/describe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imageBase64,
        zoneName: input.zoneName,
        prompt: describePrompt(input.zoneName),
      }),
    });
    if (!response.ok) return { ok: false };
    const data = (await response.json()) as { ok?: boolean; description?: string; keep?: unknown; replace?: unknown };
    if (!data.ok) return { ok: false };
    const reading = parseReading(JSON.stringify({ description: data.description ?? "", keep: data.keep ?? [], replace: data.replace ?? [] }));
    if (!reading) return { ok: false };
    return {
      ok: true,
      reading: {
        description: reading.description,
        keep: alignChips(reading.keep, input.keepSuggestions),
        replace: alignChips(reading.replace, input.replaceSuggestions),
      },
    };
  } catch {
    return { ok: false };
  }
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** One picture for the vision model: before on the left, after on the right. */
async function comparisonJpeg(beforeUrl: string, afterUrl: string): Promise<string | null> {
  const [before, after] = await Promise.all([loadImage(beforeUrl), loadImage(afterUrl)]);
  const shown = after ?? before;
  if (!shown) return null;
  const height = 384;
  const beforeWidth = before ? Math.max(1, Math.round((before.naturalWidth / before.naturalHeight) * height)) : 0;
  const afterWidth = after ? Math.max(1, Math.round((after.naturalWidth / after.naturalHeight) * height)) : 0;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, beforeWidth + afterWidth);
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  if (before) context.drawImage(before, 0, 0, beforeWidth, height);
  if (after) context.drawImage(after, beforeWidth, 0, afterWidth, height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return dataUrl.split(",")[1] ?? null;
}
