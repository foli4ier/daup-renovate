import { triesLeft } from "./prompt";

export type Pill = "needs-photos" | "ready" | "questions" | "review" | "approved" | "skipped";

export type PlanStatus = "draft" | "approved" | "in-project" | "done";

export type LinkSnap = {
  skipped: boolean;
  approvedProposalId?: string;
  questionsPending: boolean;
  proposalIds: string[];
  attempts: number;
};

export function pillOf(link: LinkSnap, beforeCount: number): Pill {
  if (link.skipped) return "skipped";
  if (link.approvedProposalId) return "approved";
  if (link.questionsPending) return "questions";
  if (link.proposalIds.length > 0) return "review";
  if (beforeCount < 1) return "needs-photos";
  return "ready";
}

export function pillLabel(pill: Pill): string {
  switch (pill) {
    case "needs-photos":
      return "Needs photos";
    case "ready":
      return "Ready";
    case "questions":
      return "Questions";
    case "review":
      return "Review";
    case "approved":
      return "Approved";
    case "skipped":
      return "Skipped";
  }
}

export function statusLabel(status: PlanStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "approved":
      return "Approved";
    case "in-project":
      return "In Project";
    case "done":
      return "Done";
  }
}

export type NextKind = "start" | "zone" | "budget" | "push" | "callout" | "project";

export type NextStep = {
  kind: NextKind;
  label: string;
  zoneId?: string;
  dest?: "capture" | "questions" | "gallery";
};

export type NextZone = {
  id: string;
  name: string;
  hidden: boolean;
  order: number;
  kind?: "inside" | "outside";
  beforeCount: number;
  link: LinkSnap;
};

export function nextStep(input: {
  hasPlan: boolean;
  status: PlanStatus;
  phasesApproved: boolean;
  zones: NextZone[];
  approvedSent: boolean;
}): NextStep {
  if (!input.hasPlan) return { kind: "start", label: "Start a plan." };
  if (input.status === "in-project" || input.status === "done") {
    if (!input.approvedSent) return { kind: "callout", label: "Send zones to CallOut." };
    return { kind: "project", label: "Open in Project." };
  }
  if (input.status === "approved" || input.phasesApproved) {
    return { kind: "push", label: "Push to Project." };
  }
  const open = input.zones
    .filter((zone) => !zone.hidden)
    .slice()
    .sort((a, b) => {
      if (a.kind && b.kind && a.kind !== b.kind) return a.kind === "outside" ? -1 : 1;
      return a.order - b.order;
    })
    .map((zone) => ({ zone, pill: pillOf(zone.link, zone.beforeCount) }))
    .filter((item) => item.pill !== "approved" && item.pill !== "skipped");
  const first = open[0];
  if (!first) return { kind: "budget", label: "See budget." };
  if (first.pill === "needs-photos") {
    return { kind: "zone", zoneId: first.zone.id, dest: "capture", label: `Add photos to ${first.zone.name}.` };
  }
  if (first.pill === "questions") {
    return { kind: "zone", zoneId: first.zone.id, dest: "questions", label: `Answer questions for ${first.zone.name}.` };
  }
  if (first.pill === "review") {
    return { kind: "zone", zoneId: first.zone.id, dest: "gallery", label: `Review ${first.zone.name}.` };
  }
  return { kind: "zone", zoneId: first.zone.id, dest: "capture", label: `Generate ${first.zone.name}.` };
}

export function triesRemaining(attempts: number): number {
  return triesLeft(attempts);
}
