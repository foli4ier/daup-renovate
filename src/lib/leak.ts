export type Leak = "amount" | "range" | "budget-word";

const BUDGET_WORDS = [
  "budget",
  "estimate",
  "estimates",
  "estimated",
  "estimation",
  "price",
  "prices",
  "priced",
  "pricing",
  "rand",
  "zar",
  "capex",
  "quote",
  "quotes",
  "quotation",
  "cost",
  "costs",
  "costing",
];

/** Scan contractor-facing text. The owner banner is not part of this text. */
export function findLeak(text: string): Leak | null {
  if (/\bR\s?\d/i.test(text)) return "amount";
  if (/\$\s?\d/.test(text)) return "amount";
  if (/\b\d[\d\s,.]*\s*(rand|zar)\b/i.test(text)) return "amount";
  if (/\d[\d\s,.]*\s*[-\u2013\u2014]\s*\d/.test(text)) return "range";
  for (const word of BUDGET_WORDS) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) return "budget-word";
  }
  return null;
}

export function assertClean(text: string): void {
  const leak = findLeak(text);
  if (leak) {
    throw new Error(`Request text is not clean (${leak}).`);
  }
}
