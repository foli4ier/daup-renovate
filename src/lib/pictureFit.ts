/** House picture cap. A larger upload is resized before it is sent. */
export const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

export type PicturePayload = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png";
};

function normalizeType(value: string): PicturePayload["contentType"] | null {
  const type = value.toLowerCase().split(";", 1)[0]?.trim() ?? "";
  if (type === "image/jpeg" || type === "image/jpg") return "image/jpeg";
  if (type === "image/png") return "image/png";
  return null;
}

export function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

export function bytesToDataUrl(bytes: Uint8Array, contentType: PicturePayload["contentType"]): string {
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

/** Jpeg or png bytes already in a data URL. Other types return null. */
export function picturePayload(dataUrl: string): PicturePayload | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const contentType = normalizeType(match[1] ?? "");
  if (!contentType) return null;
  const bytes = decodeBase64(match[2] ?? "");
  if (!bytes) return null;
  return { bytes, contentType };
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function paintJpeg(image: HTMLImageElement, width: number, height: number, quality: number): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function recompress(dataUrl: string): Promise<PicturePayload | null> {
  const image = await loadImage(dataUrl);
  if (!image) return null;
  const width0 = image.naturalWidth || image.width;
  const height0 = image.naturalHeight || image.height;
  if (!width0 || !height0) return null;
  const scales = [1, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2, 0.12];
  const qualities = [0.85, 0.72, 0.58, 0.45, 0.34];
  for (const scale of scales) {
    const width = Math.max(1, Math.round(width0 * scale));
    const height = Math.max(1, Math.round(height0 * scale));
    for (const quality of qualities) {
      const painted = paintJpeg(image, width, height, quality);
      if (!painted) return null;
      const payload = picturePayload(painted);
      if (payload && payload.bytes.byteLength <= MAX_PICTURE_BYTES) return payload;
    }
  }
  return null;
}

/**
 * Bytes the house will store. Jpeg and png under the cap pass through.
 * Anything else, including a photo over the cap, is written as jpeg.
 */
export async function fitPictureForHouse(dataUrl: string): Promise<PicturePayload | null> {
  const direct = picturePayload(dataUrl);
  if (direct && direct.bytes.byteLength <= MAX_PICTURE_BYTES) return direct;
  if (typeof document === "undefined") return null;
  return recompress(dataUrl);
}
