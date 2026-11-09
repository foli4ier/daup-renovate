import { copy } from "../copy";
import { assessTotal, linesForZone, type TotalReport } from "./budget";
import { formatRand, formatRange } from "./money";
import type { AfterReaction, ReactionKind, SpendPhase } from "../state/types";

export type SpendZone = {
  id: string;
  name: string;
  key: string;
  sizeM2?: number;
  hidden: boolean;
  skipped: boolean;
};

export type PhaseSlice = {
  names: string[];
  ready: boolean;
  low: number;
  high: number;
  needsSize: boolean;
};

/** Whole rands from typed text. An empty field clears the ceiling. */
export function parseWholeRands(text: string): number | undefined {
  const digits = text.replace(/\D/g, "");
  if (!digits) return undefined;
  const amount = Number(digits);
  if (!Number.isInteger(amount) || amount < 0) return undefined;
  return amount;
}

/**
 * The ceiling compared with a ready estimate.
 * Missing ceiling, or a total that still needs a size, stays quiet.
 */
export function ceilingNote(report: Pick<TotalReport, "ready" | "low" | "high">, available?: number): string | null {
  if (available === undefined || !report.ready) return null;
  if (report.low > available) return copy.estimateOver;
  if (report.high > available) return copy.highEstimateOver;
  return null;
}

/** Same add-up as Budget. Quote-only lines stay out. Hidden and skipped zones stay out. */
export function phaseSlice(zones: SpendZone[], zoneIds: string[]): PhaseSlice {
  const chosen = zoneIds
    .map((id) => zones.find((zone) => zone.id === id))
    .filter((zone): zone is SpendZone => Boolean(zone))
    .filter((zone) => !zone.hidden && !zone.skipped);
  const report = assessTotal(chosen.flatMap((zone) => linesForZone({ key: zone.key, sizeM2: zone.sizeM2 })));
  return {
    names: chosen.map((zone) => zone.name),
    ready: report.ready,
    low: report.low,
    high: report.high,
    needsSize: report.needsSize > 0,
  };
}

/** Range for one phase. Includes "of R…" only when a ceiling is set. */
export function phaseRangeText(low: number, high: number, available?: number): string {
  const range = formatRange(low, high);
  if (available === undefined) return range;
  return `${range} of ${formatRand(available)}`;
}

/** High ends of ready phases, once each. A missing size withholds the comparison. */
export function phasesAddUpOver(slices: PhaseSlice[], available?: number): boolean {
  if (available === undefined || slices.length === 0) return false;
  if (slices.some((slice) => slice.needsSize)) return false;
  const ready = slices.filter((slice) => slice.ready);
  if (!ready.length) return false;
  const high = ready.reduce((sum, slice) => sum + slice.high, 0);
  return high > available;
}

export function keepSpendZoneIds(zoneIds: string[], allowed: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of zoneIds) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Save one spend phase and take its zones out of any other phase
 * so a zone is not counted twice. A phase left with no zones is dropped.
 */
export function placePhaseZones(phases: SpendPhase[], saved: SpendPhase): SpendPhase[] {
  const zoneIds = [...new Set(saved.zoneIds)];
  const name = saved.name.trim();
  if (!name || zoneIds.length === 0) return phases;
  const nextSaved: SpendPhase = { ...saved, name, zoneIds };
  const withSaved = phases.some((phase) => phase.id === saved.id)
    ? phases.map((phase) => (phase.id === saved.id ? nextSaved : phase))
    : [...phases, nextSaved];
  return withSaved
    .map((phase) =>
      phase.id === nextSaved.id ? phase : { ...phase, zoneIds: phase.zoneIds.filter((id) => !zoneIds.includes(id)) },
    )
    .filter((phase) => phase.zoneIds.length > 0);
}

export function nextReaction(current: ReactionKind | undefined, tapped: ReactionKind): ReactionKind | null {
  return current === tapped ? null : tapped;
}

/** "you" first, then other people's names. Oxford comma when there are three or more. */
export function reactionNameList(reactions: Pick<AfterReaction, "personId" | "name">[], viewerId: string): string {
  const you = reactions.some((item) => item.personId === viewerId);
  const others = reactions
    .filter((item) => item.personId !== viewerId)
    .map((item) => item.name.trim())
    .filter(Boolean);
  const labels = [...(you ? ["you"] : []), ...others];
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function reactionLines(
  reactions: AfterReaction[] | undefined,
  viewerId: string,
): { liked: string | null; disliked: string | null } {
  const list = reactions ?? [];
  const liked = reactionNameList(
    list.filter((item) => item.kind === "like"),
    viewerId,
  );
  const disliked = reactionNameList(
    list.filter((item) => item.kind === "dislike"),
    viewerId,
  );
  return {
    liked: liked ? copy.likedBy(liked) : null,
    disliked: disliked ? copy.dislikedBy(disliked) : null,
  };
}
