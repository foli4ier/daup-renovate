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
  if (/\bR\s*\d/i.test(text)) return "amount";
  if (/\$\s?\d/.test(text)) return "amount";
  if (/\b\d[\d\s,.]*\s*(rand|zar)\b/i.test(text)) return "amount";
  if (/\d[\d\s,.]*\s*[-\u2013\u2014]\s*\d/.test(text)) return "range";
  for (const word of BUDGET_WORDS) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) return "budget-word";
  }
  return null;
}

export type LeakField = "Keep" | "Replace" | "Answer" | "Style";

export type LeakSpot = {
  field: LeakField;
  leak: Leak;
};

export function locateLeak(parts: {
  keep: string[];
  replace: string[];
  answers: string[];
  styleNote?: string;
}): LeakSpot | null {
  const fields: [LeakField, string][] = [
    ["Keep", parts.keep.join("\n")],
    ["Replace", parts.replace.join("\n")],
    ["Answer", parts.answers.join("\n")],
    ["Style", parts.styleNote ?? ""],
  ];
  for (const [field, text] of fields) {
    const leak = findLeak(text);
    if (leak) return { field, leak };
  }
  return null;
}

export function leakPhrase(spot: LeakSpot): string {
  const what = spot.leak === "amount" ? "an amount" : spot.leak === "range" ? "a range" : "a budget word";
  return `There’s ${what} in ${spot.field}.`;
}

export function assertClean(text: string): void {
  const leak = findLeak(text);
  if (leak) {
    throw new Error(`Request text is not clean (${leak}).`);
  }
}
