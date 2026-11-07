import { findLeak } from "./leak";

/** Shown in the editable line when Workers AI does not return a reading. */
export const READ_FALLBACK = "We could not read this picture. Type what changed.";

export type Reading = {
  description: string;
  keep: string[];
  replace: string[];
};

export function canOfferAfterUpload(beforeCount: number): boolean {
  return beforeCount > 0;
}

export function describePrompt(zoneName: string): string {
  return [
    `Compare the before and after of this ${zoneName}.`,
    "The left half of the picture is the before. The right half is the after.",
    "Reply with JSON only, no markdown.",
    '{"description":"one or two short sentences","keep":["short name"],"replace":["short name"]}',
    "description says what the after changed, in plain English.",
    "keep lists what stayed. replace lists what changed.",
    "Do not mention money, brands, or people.",
  ].join(" ");
}

function cleanLine(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  const sentences = compact.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  if (sentences.length <= 280) return sentences;
  return `${sentences.slice(0, 277).trim()}…`;
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const text = entry.replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    items.push(text);
    if (items.length === 6) break;
  }
  return items;
}

export function parseReading(raw: string): Reading | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let data: unknown;
  try {
    data = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.description !== "string") return null;
  const description = cleanLine(record.description);
  const keep = cleanList(record.keep);
  const replace = cleanList(record.replace);
  if (!description) return null;
  if (findLeak(description) || keep.some((item) => findLeak(item)) || replace.some((item) => findLeak(item))) return null;
  return { description, keep, replace };
}

export function alignChips(items: string[], suggestions: string[]): string[] {
  return items.map((item) => {
    const norm = item.toLowerCase();
    const exact = suggestions.find((suggestion) => suggestion.toLowerCase() === norm);
    if (exact) return exact;
    const loose = suggestions.find((suggestion) => {
      const needle = suggestion.toLowerCase();
      return needle.includes(norm) || norm.includes(needle);
    });
    return loose ?? item;
  });
}

export function usableRead(text: string | undefined): string {
  const trimmed = text?.trim() ?? "";
  if (!trimmed || trimmed === READ_FALLBACK) return "";
  return trimmed;
}
