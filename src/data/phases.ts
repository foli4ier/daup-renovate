export type Phase = {
  id: string;
  key: string;
  name: string;
  order: number;
  days: number;
  startsAfter: string[];
  alongside?: string;
};

const TEMPLATE: Omit<Phase, "id">[] = [
  { key: "prep", name: "Prep", order: 1, days: 7, startsAfter: [] },
  { key: "services", name: "Plumbing and electrics", order: 2, days: 6, startsAfter: ["prep"] },
  { key: "strip", name: "Strip-out", order: 3, days: 4, startsAfter: ["prep"] },
  { key: "build", name: "Build", order: 4, days: 12, startsAfter: ["services", "strip"] },
  { key: "paint", name: "Paint and woodwork", order: 5, days: 7, startsAfter: ["build"] },
  { key: "floors", name: "Floors", order: 6, days: 6, startsAfter: ["paint"] },
  {
    key: "outside",
    name: "Outside",
    order: 7,
    days: 8,
    startsAfter: ["prep"],
    alongside: "Alongside Build, Paint and woodwork, and Floors.",
  },
  { key: "finish", name: "Finish", order: 8, days: 3, startsAfter: ["paint", "floors", "outside"] },
];

const PHASE_ZONES: Record<string, string[] | "all"> = {
  prep: "all",
  services: ["kitchen", "bath"],
  strip: ["living", "kitchen", "bath", "sun"],
  build: ["kitchen", "bath"],
  paint: "all",
  floors: ["living", "sun"],
  outside: ["front", "back", "side"],
  finish: "all",
};

export function freshPhases(planId: string): Phase[] {
  return TEMPLATE.map((phase) => ({ ...phase, id: `${planId}_${phase.key}` }));
}

export function zonesOnPhase(phaseKey: string, approvedKeys: { id: string; key: string }[]): string[] {
  const rule = PHASE_ZONES[phaseKey] ?? "all";
  return approvedKeys
    .filter((zone) => rule === "all" || rule.includes(zone.key))
    .map((zone) => zone.id);
}

export function phaseName(phases: Phase[], key: string): string {
  return phases.find((phase) => phase.key === key)?.name ?? key;
}
