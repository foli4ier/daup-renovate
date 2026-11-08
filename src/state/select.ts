import { zonesOnPhase, phaseName } from "../data/phases";
import { copy } from "../copy";
import { assessTotal, linesForZone, type MoneyLine, type TotalReport } from "../lib/budget";
import { buildZoneScope } from "../lib/scope";
import { nextStep, pillOf, type LinkSnap, type NextStep, type Pill } from "../lib/status";
import type { Photo, Plan, PlanLink, Property, Proposal, State, Zone, ZoneKind } from "./types";

function kindRank(kind?: ZoneKind): number {
  if (kind === "outside") return 0;
  if (kind === "inside") return 1;
  return 2;
}

export function activeProperty(state: State): Property | undefined {
  return state.properties.find((property) => property.id === state.activePropertyId) ?? state.properties[0];
}

export function activePlan(state: State): Plan | undefined {
  const property = activeProperty(state);
  if (!property) return undefined;
  return (
    state.plans.find((plan) => plan.id === state.activePlanId && plan.propertyId === property.id) ??
    state.plans.find((plan) => plan.propertyId === property.id)
  );
}

export function propertyZones(state: State, propertyId: string): Zone[] {
  return state.zones
    .filter((zone) => zone.propertyId === propertyId)
    .slice()
    .sort((a, b) => {
      const rank = kindRank(a.kind) - kindRank(b.kind);
      if (rank !== 0) return rank;
      return a.order - b.order;
    });
}

export function photosFor(state: State, zoneId: string): Photo[] {
  return state.photos.filter((photo) => photo.zoneId === zoneId);
}

export function linkFor(state: State, planId: string, zoneId: string): PlanLink | undefined {
  return state.links.find((link) => link.planId === planId && link.zoneId === zoneId);
}

export function proposalsFor(state: State, planId: string, zoneId: string): Proposal[] {
  const link = linkFor(state, planId, zoneId);
  if (!link) return [];
  return link.proposalIds
    .map((id) => state.proposals.find((proposal) => proposal.id === id))
    .filter((proposal): proposal is Proposal => Boolean(proposal));
}

export function starredPhoto(photos: Photo[]): Photo | undefined {
  return photos.find((photo) => photo.starred) ?? photos[0];
}

export function zonePill(state: State, planId: string, zone: Zone): Pill {
  const link = linkFor(state, planId, zone.id);
  const beforeCount = photosFor(state, zone.id).length;
  if (!link) return beforeCount ? "ready" : "needs-photos";
  return pillOf(link, beforeCount);
}

export function visibleZones(state: State, propertyId: string): Zone[] {
  return propertyZones(state, propertyId).filter((zone) => !zone.hidden);
}

const emptyLink: LinkSnap = {
  skipped: false,
  questionsPending: false,
  proposalIds: [],
  attempts: 0,
};

export function planNext(state: State): NextStep {
  const plan = activePlan(state);
  const property = activeProperty(state);
  if (!plan || !property) return { kind: "start", label: "Start a plan." };
  const zones = propertyZones(state, property.id).map((zone) => ({
    id: zone.id,
    name: zone.name,
    hidden: zone.hidden,
    order: zone.order,
    kind: zone.kind,
    beforeCount: photosFor(state, zone.id).length,
    link: linkFor(state, plan.id, zone.id) ?? emptyLink,
  }));
  const approved = zones.filter((zone) => !zone.hidden && zone.link.approvedProposalId && !zone.link.skipped);
  const approvedSent =
    approved.length === 0 ||
    approved.every((zone) => state.requests.some((request) => request.planId === plan.id && request.zoneId === zone.id));
  return nextStep({
    hasPlan: true,
    status: plan.status,
    phasesApproved: plan.phasesApproved,
    zones,
    approvedSent,
  });
}

export function approvedVisible(state: State, plan: Plan): Zone[] {
  return visibleZones(state, plan.propertyId).filter((zone) => {
    const link = linkFor(state, plan.id, zone.id);
    return Boolean(link?.approvedProposalId) && !link?.skipped;
  });
}

export function budgetLines(state: State, plan: Plan): { zone: Zone; lines: MoneyLine[] }[] {
  return approvedVisible(state, plan).map((zone) => ({
    zone,
    lines: linesForZone({ key: zone.key, sizeM2: zone.sizeM2 }),
  }));
}

export function budgetReport(groups: { lines: MoneyLine[] }[]): TotalReport {
  return assessTotal(groups.flatMap((group) => group.lines));
}

export function scopeFor(state: State, plan: Plan, zone: Zone): string {
  const link = linkFor(state, plan.id, zone.id);
  return buildZoneScope({
    zoneName: zone.name,
    style: link?.style ?? "keep-character",
    styleNote: link?.styleNote,
    keep: link?.keep ?? [],
    replace: link?.replace ?? [],
    answers: zone.answers.map((answer) => answer.text),
  });
}

export function phaseRows(state: State, plan: Plan) {
  const approved = approvedVisible(state, plan).map((zone) => ({ id: zone.id, key: zone.key, name: zone.name }));
  return plan.phases
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((phase, index) => {
      const zoneIds = zonesOnPhase(phase.key, approved);
      const names = zoneIds
        .map((id) => state.zones.find((zone) => zone.id === id)?.name)
        .filter((name): name is string => Boolean(name));
      const starts = phase.startsAfter.map((key) => phaseName(plan.phases, key));
      return { phase, index: index + 1, zoneNames: names, starts };
    });
}

export function stepHref(step: NextStep): string | null {
  if (step.kind === "zone" && step.zoneId && step.dest === "capture") return `/zone/${step.zoneId}`;
  if (step.kind === "zone" && step.zoneId && step.dest === "chat") return `/zone/${step.zoneId}/chat?from=capture`;
  if (step.kind === "zone" && step.zoneId && step.dest === "gallery") return `/gallery/${step.zoneId}`;
  if (step.kind === "budget") return "/budget";
  if (step.kind === "callout") return "/callout";
  return null;
}

export function coverUrl(state: State, property: Property): string | undefined {
  return state.photos.find((photo) => photo.id === property.coverPhotoId)?.url;
}

export function approvedCount(state: State, plan: Plan): { approved: number; total: number } {
  const zones = visibleZones(state, plan.propertyId);
  const approved = zones.filter((zone) => zonePill(state, plan.id, zone) === "approved").length;
  return { approved, total: zones.length };
}

export function zonesSettled(state: State, plan: Plan): boolean {
  return visibleZones(state, plan.propertyId).every((zone) => {
    const pill = zonePill(state, plan.id, zone);
    return pill === "approved" || pill === "skipped";
  });
}

export function zoneHasAfter(state: State, planId: string, zoneId: string): boolean {
  return proposalsFor(state, planId, zoneId).length > 0;
}

/** Gallery when the zone has an after, otherwise capture. */
export function zonePath(state: State, planId: string, zoneId: string): string {
  return zoneHasAfter(state, planId, zoneId) ? `/gallery/${zoneId}` : `/zone/${zoneId}`;
}

/** Last opened zone, or the plan when they have not opened one yet. */
export function continuePath(state: State): string {
  const plan = activePlan(state);
  const property = activeProperty(state);
  if (!plan || !property || !plan.lastZoneId) return "/plan";
  const zone = state.zones.find((item) => item.id === plan.lastZoneId && item.propertyId === property.id);
  if (!zone) return "/plan";
  return zonePath(state, plan.id, zone.id);
}

/** Terracotta on the zone list only once every visible zone is approved or skipped. */
export function zoneListLabel(state: State): string | null {
  const plan = activePlan(state);
  if (!plan || !zonesSettled(state, plan)) return null;
  return copy.seeBudget;
}
