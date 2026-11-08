import { defaultZones } from "../data/zones";
import { withMessages, type State, type Zone } from "./types";

function zoneSet(zones: Zone[]): Set<string> {
  return new Set(zones.map((zone) => zone.id));
}

/** One property's plan: its row, zones, plans, and everything hanging off them. */
export function sliceProperty(state: State, propertyId: string): State {
  const property = state.properties.find((item) => item.id === propertyId);
  const zones = state.zones.filter((zone) => zone.propertyId === propertyId);
  const zoneIds = zoneSet(zones);
  const plans = state.plans.filter((plan) => plan.propertyId === propertyId);
  const planIds = new Set(plans.map((plan) => plan.id));
  const activePlanId = plans.some((plan) => plan.id === state.activePlanId)
    ? state.activePlanId
    : (plans[0]?.id ?? null);
  return {
    version: 2,
    sample: false,
    properties: property ? [property] : [],
    zones,
    photos: state.photos.filter((photo) => zoneIds.has(photo.zoneId)),
    plans,
    links: state.links.filter((link) => planIds.has(link.planId) && zoneIds.has(link.zoneId)),
    proposals: state.proposals.filter((proposal) => planIds.has(proposal.planId) && zoneIds.has(proposal.zoneId)),
    requests: state.requests.filter((request) => planIds.has(request.planId) && zoneIds.has(request.zoneId)),
    messages: (state.messages ?? []).filter((message) => zoneIds.has(message.zoneId)),
    activePropertyId: propertyId,
    activePlanId,
  };
}

function sameDefault(zone: Zone, template: Zone): boolean {
  return (
    zone.id === template.id &&
    zone.propertyId === template.propertyId &&
    zone.key === template.key &&
    zone.name === template.name &&
    zone.kind === template.kind &&
    zone.order === template.order &&
    zone.hidden === template.hidden &&
    zone.answers.length === 0 &&
    zone.sizeM2 === undefined
  );
}

/**
 * True when this property has nothing the owner saved: no plans, pictures,
 * threads, or edits. The stock zone list from a house load counts as empty.
 */
export function isEffectivelyEmpty(slice: State): boolean {
  const messages = slice.messages ?? [];
  if (
    slice.plans.length ||
    slice.photos.length ||
    slice.proposals.length ||
    slice.requests.length ||
    slice.links.length ||
    messages.length
  ) {
    return false;
  }
  const propertyId = slice.properties[0]?.id || slice.activePropertyId;
  if (!propertyId) return slice.zones.length === 0;
  if (slice.zones.length === 0) return true;
  const defaults = defaultZones(propertyId);
  if (slice.zones.length !== defaults.length) return false;
  return defaults.every((template) => slice.zones.some((zone) => sameDefault(zone, template)));
}

/** Stable enough to notice an edit. Picture bytes stay in the string so a new photo counts. */
export function planFingerprint(state: State, propertyId: string): string {
  const slice = sliceProperty(state, propertyId);
  return JSON.stringify({
    zones: slice.zones,
    plans: slice.plans,
    links: slice.links,
    photos: slice.photos,
    proposals: slice.proposals,
    requests: slice.requests,
    messages: slice.messages,
  });
}

/**
 * Replace one property's plan and leave every other property's slice in place.
 * The live house row keeps the name from the property list. The plan's cover
 * comes from the incoming document when the list has none.
 */
export function mergeProperty(base: State, propertyId: string, incoming: State): State {
  const next = withMessages(incoming);
  const keptZones = base.zones.filter((zone) => zone.propertyId !== propertyId);
  const keptPlans = base.plans.filter((plan) => plan.propertyId !== propertyId);
  const keptZoneIds = zoneSet(keptZones);
  const keptPlanIds = new Set(keptPlans.map((plan) => plan.id));
  const zones = [...keptZones, ...next.zones.filter((zone) => zone.propertyId === propertyId)];
  const plans = [...keptPlans, ...next.plans.filter((plan) => plan.propertyId === propertyId)];
  const zoneIds = zoneSet(zones);
  const planIds = new Set(plans.map((plan) => plan.id));
  const live = base.properties.find((item) => item.id === propertyId);
  const row = next.properties.find((item) => item.id === propertyId);
  const mergedRow = live
    ? {
        ...row,
        ...live,
        coverPhotoId: live.coverPhotoId || row?.coverPhotoId || "",
      }
    : row;
  const properties = mergedRow
    ? base.properties.some((item) => item.id === propertyId)
      ? base.properties.map((item) => (item.id === propertyId ? mergedRow : item))
      : [...base.properties, mergedRow]
    : base.properties.filter((item) => item.id !== propertyId);
  let activePlanId = base.activePlanId;
  if (base.activePropertyId === propertyId) {
    if (next.activePlanId && planIds.has(next.activePlanId)) activePlanId = next.activePlanId;
    else if (!plans.some((plan) => plan.id === activePlanId)) {
      activePlanId = plans.find((plan) => plan.propertyId === propertyId)?.id ?? null;
    }
  }
  return {
    ...base,
    sample: false,
    properties,
    zones,
    plans,
    photos: [
      ...base.photos.filter((photo) => keptZoneIds.has(photo.zoneId)),
      ...next.photos.filter((photo) => zoneIds.has(photo.zoneId) && !keptZoneIds.has(photo.zoneId)),
    ],
    links: [
      ...base.links.filter((link) => keptPlanIds.has(link.planId) && keptZoneIds.has(link.zoneId)),
      ...next.links.filter((link) => planIds.has(link.planId) && zoneIds.has(link.zoneId) && !keptPlanIds.has(link.planId)),
    ],
    proposals: [
      ...base.proposals.filter((proposal) => keptPlanIds.has(proposal.planId) && keptZoneIds.has(proposal.zoneId)),
      ...next.proposals.filter(
        (proposal) => planIds.has(proposal.planId) && zoneIds.has(proposal.zoneId) && !keptPlanIds.has(proposal.planId),
      ),
    ],
    requests: [
      ...base.requests.filter((request) => keptPlanIds.has(request.planId) && keptZoneIds.has(request.zoneId)),
      ...next.requests.filter(
        (request) => planIds.has(request.planId) && zoneIds.has(request.zoneId) && !keptPlanIds.has(request.planId),
      ),
    ],
    messages: [
      ...(base.messages ?? []).filter((message) => keptZoneIds.has(message.zoneId)),
      ...next.messages.filter((message) => zoneIds.has(message.zoneId) && !keptZoneIds.has(message.zoneId)),
    ],
    activePropertyId: base.activePropertyId,
    activePlanId,
  };
}
