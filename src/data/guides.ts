import type { StyleId, Tier } from "../lib/prompt";

export const STYLE_CHIPS: { id: StyleId; label: string }[] = [
  { id: "budget-refresh", label: "Budget refresh." },
  { id: "modern", label: "Modern." },
  { id: "keep-character", label: "Keep character." },
];

export const TIER_CHIPS: { id: Tier; label: string; hint: string }[] = [
  { id: "low", label: "Low.", hint: "Paint and fix" },
  { id: "mid", label: "Mid.", hint: "New finishes" },
  { id: "high", label: "High.", hint: "Bigger changes" },
];

export function styleLabel(style: StyleId, note?: string, fromZone?: string): string {
  if (style === "from-after") return fromZone ? `From ${fromZone}.` : "From your after.";
  if (style === "custom") return note?.trim() || "Your description";
  return STYLE_CHIPS.find((chip) => chip.id === style)?.label ?? "Style";
}

export function tierLabel(tier: Tier): string {
  return TIER_CHIPS.find((chip) => chip.id === tier)?.label ?? tier;
}

export const SUGGESTIONS: Record<string, { keep: string[]; replace: string[] }> = {
  front: {
    keep: ["Window layout", "Roof line"],
    replace: ["Beige paint", "Brown garage door", "Patchy lawn"],
  },
  back: {
    keep: ["The tree", "Garden beds"],
    replace: ["Worn concrete", "Bare plaster"],
  },
  side: {
    keep: ["Flagstone path", "Window frames"],
    replace: ["Tired paint on the wall"],
  },
  living: {
    keep: ["Leaded windows", "Wall aircon", "Stone fireplace"],
    replace: ["Brown carpet with the boards underneath", "Chandelier"],
  },
  kitchen: {
    keep: ["Floor tiles", "Window frames"],
    replace: ["Dark cabinets", "Cluttered worktops"],
  },
  bath: {
    keep: ["The bath", "The window"],
    replace: ["Old tiles", "Net curtain"],
  },
  sun: {
    keep: ["Wooden window frames"],
    replace: ["Dark carpet"],
  },
};
