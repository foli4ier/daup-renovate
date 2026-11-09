function splitX(width: number, splitPercent: number): number | null {
  if (!(width > 0) || !Number.isFinite(splitPercent)) return null;
  return (Math.min(100, Math.max(0, splitPercent)) / 100) * width;
}

/** Tap lands on the visible after, to the right of the comparison divider. */
export function afterHalf(x: number, width: number, splitPercent: number): boolean {
  const split = splitX(width, splitPercent);
  if (split === null || !Number.isFinite(x)) return false;
  return x > split;
}

/** Tap lands on the visible before, to the left of the comparison divider. */
export function beforeHalf(x: number, width: number, splitPercent: number): boolean {
  const split = splitX(width, splitPercent);
  if (split === null || !Number.isFinite(x)) return false;
  return x < split;
}

/** Step within the zone's afters. Stays put at either end. */
export function stepIndex(index: number, count: number, delta: number): number {
  if (count <= 0 || !Number.isFinite(delta) || delta === 0) return Math.max(0, index);
  const start = index < 0 ? 0 : index;
  const next = start + delta;
  if (next < 0 || next >= count) return start;
  return next;
}

export const SWIPE_PX = 48;

/** Horizontal swipe moves. A downward swipe may close. Neither loops. */
export function pointerGesture(dx: number, dy: number): "next" | "prev" | "close" | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE_PX && ay < SWIPE_PX) return null;
  if (ax > ay) return dx < 0 ? "next" : "prev";
  if (dy >= SWIPE_PX && dy > ax) return "close";
  return null;
}

export function isAfterViewerState(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;
  return (state as { afterViewer?: unknown }).afterViewer === true;
}
