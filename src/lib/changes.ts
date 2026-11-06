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

export function whatChanges(items: string[]): string[] {
  return items.map((item) => {
    const known = CHANGES[item];
    if (known) return known;
    const sentence = item.endsWith(".") ? item : `${item}.`;
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  });
}
