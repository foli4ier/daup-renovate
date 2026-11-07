import type { StyleId } from "./prompt";
import type { PlanLink } from "../state/types";

export function isOwnStyleChip(style: StyleId | undefined): boolean {
  return style === "budget-refresh" || style === "modern" || style === "keep-character" || style === "custom";
}

/** Zones that may take a shared uploaded look. Own chips and a zone's own upload stay. */
export function canFollowSharedLook(link: PlanLink, sourceZoneId: string): boolean {
  if (link.zoneId === sourceZoneId) return false;
  if (link.approvedProposalId || link.skipped) return false;
  if (isOwnStyleChip(link.style)) return false;
  if (link.style === "from-after" && !link.styleFromZoneId) return false;
  return true;
}

export function withSharedLook(links: PlanLink[], planId: string, sourceZoneId: string, on: boolean): PlanLink[] {
  const source = links.find((link) => link.planId === planId && link.zoneId === sourceZoneId);
  if (!source) return links;
  if (!on) {
    return links.map((link) => {
      if (link.planId !== planId) return link;
      if (link.zoneId === sourceZoneId) return { ...link, shareLook: false };
      if (link.style === "from-after" && link.styleFromZoneId === sourceZoneId) {
        return {
          ...link,
          style: undefined,
          styleNote: undefined,
          styleFromZoneId: undefined,
          styleReferenceProposalId: undefined,
        };
      }
      return link;
    });
  }
  const note = source.readLine || source.styleNote;
  return links.map((link) => {
    if (link.planId !== planId) return link;
    if (link.zoneId === sourceZoneId) return { ...link, shareLook: true };
    const next = link.shareLook ? { ...link, shareLook: false } : link;
    if (!canFollowSharedLook(next, sourceZoneId)) return next;
    return {
      ...next,
      style: "from-after",
      styleNote: note,
      styleFromZoneId: sourceZoneId,
      styleReferenceProposalId: source.styleReferenceProposalId,
    };
  });
}
