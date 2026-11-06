import { findLeak } from "./leak";
import type { StyleId } from "./prompt";

export type ScopeInput = {
  zoneName: string;
  style: StyleId;
  styleNote?: string;
  keep: string[];
  replace: string[];
  answers: string[];
};

function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function styleSentence(style: StyleId, note?: string): string {
  if (style === "budget-refresh") return "Paint and small fixes.";
  if (style === "modern") return "A modern finish.";
  if (style === "keep-character") return "Keep the character of the place.";
  return sentence(note ?? "");
}

export function buildZoneScope(input: ScopeInput): string {
  const parts = [`${input.zoneName}.`];
  const look = styleSentence(input.style, input.styleNote);
  if (look) parts.push(look);
  if (input.replace.length) {
    parts.push(`Change: ${input.replace.join(", ")}.`);
  } else {
    parts.push("Freshen the worn finishes.");
  }
  if (input.keep.length) {
    parts.push(`Keep: ${input.keep.join(", ")}.`);
  }
  for (const answer of input.answers) {
    const line = sentence(answer);
    if (line) parts.push(line);
  }
  return parts.join(" ");
}

export function scopeIsClean(text: string): boolean {
  return findLeak(text) === null;
}
