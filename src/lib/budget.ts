import type { Tier } from "./prompt";

export type RateUnit = "m2" | "room" | "job" | "quote";

export type RateLine = {
  id: string;
  label: string;
  unit: RateUnit;
  low?: number;
  mid?: number;
  high?: number;
  zoneKeys: string[];
};

export const RATES: RateLine[] = [
  { id: "carpet", label: "Remove carpet", unit: "m2", low: 30, mid: 45, high: 60, zoneKeys: ["living"] },
  { id: "sand", label: "Sand & seal floor", unit: "m2", low: 250, mid: 350, high: 450, zoneKeys: ["living"] },
  { id: "paint-room", label: "Interior paint", unit: "room", low: 1500, mid: 3750, high: 6000, zoneKeys: ["living", "sun"] },
  { id: "vinyl", label: "Vinyl plank", unit: "m2", low: 450, mid: 625, high: 800, zoneKeys: ["sun"] },
  { id: "ext-paint", label: "Exterior paint", unit: "m2", low: 40, mid: 70, high: 100, zoneKeys: ["front", "back", "side"] },
  { id: "bath", label: "Bathroom update", unit: "job", low: 15000, mid: 30000, high: 45000, zoneKeys: ["bath"] },
  { id: "kitchen", label: "Kitchen upgrade", unit: "job", low: 45000, mid: 90000, high: 150000, zoneKeys: ["kitchen"] },
  { id: "garden", label: "Garden, paving, and garage door", unit: "quote", zoneKeys: ["front", "back", "side"] },
];

export type MoneyLine = {
  id: string;
  label: string;
  quoteOnly: boolean;
  needsSize: boolean;
  low?: number;
  mid?: number;
  high?: number;
  per?: string;
};

export type ZoneBudgetInput = {
  key: string;
  sizeM2?: number;
};

function tierAmount(line: RateLine, tier: Tier): number | undefined {
  if (tier === "low") return line.low;
  if (tier === "mid") return line.mid;
  return line.high;
}

export function linesForZone(zone: ZoneBudgetInput): MoneyLine[] {
  const matched = RATES.filter((rate) => rate.zoneKeys.includes(zone.key));
  const source = matched.length
    ? matched
    : [{ id: `${zone.key}-quote`, label: "This zone", unit: "quote" as const, zoneKeys: [zone.key] }];
  return source.map((rate) => {
    if (rate.unit === "quote") {
      return { id: rate.id, label: rate.label, quoteOnly: true, needsSize: false };
    }
    if (rate.id === "bath" && zone.sizeM2 !== undefined && zone.sizeM2 > 5) {
      return { id: rate.id, label: rate.label, quoteOnly: true, needsSize: false };
    }
    if (rate.unit === "m2") {
      const size = zone.sizeM2;
      if (size === undefined || size <= 0) {
        return {
          id: rate.id,
          label: rate.label,
          quoteOnly: false,
          needsSize: true,
          low: rate.low,
          mid: rate.mid,
          high: rate.high,
          per: "per m²",
        };
      }
      return {
        id: rate.id,
        label: rate.label,
        quoteOnly: false,
        needsSize: false,
        low: (rate.low ?? 0) * size,
        mid: (rate.mid ?? 0) * size,
        high: (rate.high ?? 0) * size,
        per: "per m²",
      };
    }
    return {
      id: rate.id,
      label: rate.label,
      quoteOnly: false,
      needsSize: false,
      low: rate.low,
      mid: rate.mid,
      high: rate.high,
    };
  });
}

export type TotalReport = {
  /** False while a per-m² line has no size, or nothing can be added up. */
  ready: boolean;
  low: number;
  high: number;
  needsSize: number;
  quoteOnly: number;
};

/** The plan total is withheld until every sized line has a size. Quote-only lines stay out. */
export function assessTotal(lines: MoneyLine[]): TotalReport {
  const needsSize = lines.filter((line) => line.needsSize).length;
  const quoteOnly = lines.filter((line) => line.quoteOnly).length;
  const counted = lines.filter((line) => !line.quoteOnly && !line.needsSize && line.low !== undefined && line.high !== undefined);
  return {
    ready: needsSize === 0 && counted.length > 0,
    needsSize,
    quoteOnly,
    low: counted.reduce((sum, line) => sum + (line.low ?? 0), 0),
    high: counted.reduce((sum, line) => sum + (line.high ?? 0), 0),
  };
}

export function tierTotal(lines: MoneyLine[], tier: Tier): number | null {
  const counted = lines.filter((line) => !line.quoteOnly && !line.needsSize);
  if (!counted.length) return null;
  return counted.reduce((sum, line) => {
    const amount = tier === "low" ? line.low : tier === "mid" ? line.mid : line.high;
    return sum + (amount ?? 0);
  }, 0);
}

export function rateGuide(line: MoneyLine): { low: number; mid: number; high: number } | null {
  if (line.per !== "per m²") return null;
  const rate = RATES.find((item) => item.id === line.id);
  if (!rate || rate.low === undefined || rate.mid === undefined || rate.high === undefined) return null;
  return { low: rate.low, mid: rate.mid, high: rate.high };
}

export function selectedAmount(line: MoneyLine, tier: Tier): number | undefined {
  if (line.quoteOnly || line.needsSize) return undefined;
  return tierAmount(
    { id: line.id, label: line.label, unit: "job", low: line.low, mid: line.mid, high: line.high, zoneKeys: [] },
    tier,
  );
}
