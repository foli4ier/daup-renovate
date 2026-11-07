import { usableRead } from "./reading";

const CHANGES: Record<string, string> = {
  "Beige paint": "Repaint the beige walls.",
  "Brown garage door": "Refinish the garage door.",
  "Patchy lawn": "Repair the lawn and plant a low border.",
  "Worn concrete": "Replace the worn concrete.",
  "Bare plaster": "Repaint the bare plaster.",
  "Tired paint on the wall": "Repaint the wall.",
  "Brown carpet with the boards underneath": "Lift the carpet and seal the boards.",
  Chandelier: "Replace the chandelier.",
  "Dark cabinets": "Paint the dark cabinets and fit new handles.",
  "Cluttered worktops": "Clear the worktops and fit a new top.",
  "Old tiles": "Retile.",
  "Net curtain": "Fit a blind instead of the net curtain.",
  "Dark carpet": "Replace the dark carpet with vinyl plank.",
};

function sentence(item: string): string {
  const known = CHANGES[item];
  if (known) return known;
  const line = item.endsWith(".") ? item : `${item}.`;
  return line.charAt(0).toUpperCase() + line.slice(1);
}

export function whatChanges(input: { read?: string; keep?: string[]; replace: string[] }): string[] {
  const lines: string[] = [];
  const read = usableRead(input.read);
  if (read) lines.push(sentence(read));
  for (const item of input.replace) lines.push(sentence(item));
  for (const item of input.keep ?? []) {
    const named = item.replace(/^keep\s+/i, "");
    lines.push(sentence(named.toLowerCase().startsWith("keep ") ? named : `Keep ${named}`));
  }
  return lines;
}
