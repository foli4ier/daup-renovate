import { copy } from "../copy";
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
  dest?: "capture" | "chat" | "gallery";
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
  if (!input.hasPlan) return { kind: "start", label: copy.startPlan };
  if (input.status === "in-project" || input.status === "done") {
    if (!input.approvedSent) return { kind: "callout", label: copy.sendNext };
    return { kind: "project", label: copy.openProject };
  }
  if (input.status === "approved" || input.phasesApproved) {
    return { kind: "push", label: copy.push };
  }
  const open = input.zones
    .filter((zone) => !zone.hidden)
    .slice()
    .sort((a, b) => {
      const rank = (kind?: "inside" | "outside") => (kind === "outside" ? 0 : kind === "inside" ? 1 : 2);
      const byKind = rank(a.kind) - rank(b.kind);
      if (byKind !== 0) return byKind;
      return a.order - b.order;
    })
    .map((zone) => ({ zone, pill: pillOf(zone.link, zone.beforeCount) }))
    .filter((item) => item.pill !== "approved" && item.pill !== "skipped");
  const first = open[0];
  if (!first) return { kind: "budget", label: copy.seeBudget };
  if (first.pill === "needs-photos") {
    return { kind: "zone", zoneId: first.zone.id, dest: "capture", label: copy.addPhotosTo(first.zone.name) };
  }
  if (first.pill === "questions") {
    return { kind: "zone", zoneId: first.zone.id, dest: "chat", label: copy.answerFor(first.zone.name) };
  }
  if (first.pill === "review") {
    return { kind: "zone", zoneId: first.zone.id, dest: "gallery", label: copy.review(first.zone.name) };
  }
  return { kind: "zone", zoneId: first.zone.id, dest: "capture", label: copy.generateZone(first.zone.name) };
}

export function triesRemaining(attempts: number): number {
  return triesLeft(attempts);
}

export type RailStep = "done" | "active" | "future" | "quiet";

export type RailNode = {
  id: "photos" | "after" | "approved";
  label: string;
  state: RailStep;
};

/** Photos → After → Approved. Sage marks done and in progress. Skipped stays quiet. */
export function stepRail(pill: Pill): RailNode[] {
  const nodes: Omit<RailNode, "state">[] = [
    { id: "photos", label: "Photos" },
    { id: "after", label: "After" },
    { id: "approved", label: "Approved" },
  ];
  if (pill === "skipped") return nodes.map((node) => ({ ...node, state: "quiet" }));
  const done: Record<RailNode["id"], boolean> = {
    photos: pill !== "needs-photos",
    after: pill === "review" || pill === "approved",
    approved: pill === "approved",
  };
  let active = false;
  return nodes.map((node) => {
    if (done[node.id]) return { ...node, state: "done" };
    if (!active) {
      active = true;
      return { ...node, state: "active" };
    }
    return { ...node, state: "future" };
  });
}
