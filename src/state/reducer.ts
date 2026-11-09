import type { DaupProperty } from "../api/property";
import { pickPropertyId, type PropertyPrefer } from "../lib/properties";
import { freshPhases } from "../data/phases";
import { emptyState } from "../data/seed";
import { defaultZones } from "../data/zones";
import { withSharedLook } from "../lib/look";
import type { StyleId, Tier } from "../lib/prompt";
import { canOfferAfterUpload } from "../lib/reading";
import { keepSpendZoneIds, placePhaseZones } from "../lib/spend";
import { postThreadMessage, seedZoneThread } from "../lib/thread";
import { emptyLink, withMessages, type CalloutRequest, type Photo, type Plan, type Proposal, type ReactionKind, type SpendPhase, type State, type Zone, type ZoneKind } from "./types";

const PHOTO_CAP = 6;

export type Action =
  | { type: "replace"; state: State }
  | { type: "hydrate-properties"; properties: DaupProperty[]; prefer?: PropertyPrefer }
  | { type: "select-property"; propertyId: string }
  | { type: "select-plan"; planId: string }
  | { type: "visit-zone"; planId: string; zoneId: string }
  | { type: "start-plan"; plan: Plan }
  | { type: "rename-zone"; zoneId: string; name: string }
  | { type: "set-zone-kind"; zoneId: string; kind: ZoneKind }
  | { type: "set-zone-size"; zoneId: string; sizeM2?: number }
  | { type: "hide-zone"; zoneId: string; hidden: boolean }
  | { type: "move-zone"; zoneId: string; direction: "up" | "down" }
  | { type: "add-zone"; zone: Zone }
  | { type: "merge-zones"; sourceId: string; targetId: string }
  | { type: "add-photo"; photo: Photo }
  | { type: "star-photo"; zoneId: string; photoId: string }
  | { type: "remove-photo"; photoId: string }
  | { type: "set-guides"; planId: string; zoneId: string; style?: StyleId; styleNote?: string; budget?: Tier; keep: string[]; replace: string[] }
  | { type: "apply-style"; planId: string; zoneId: string }
  | { type: "upload-ok"; proposal: Proposal; description: string; keep: string[]; replace: string[] }
  | { type: "share-look"; planId: string; zoneId: string; on: boolean }
  | { type: "set-read-line"; planId: string; zoneId: string; text: string }
  | { type: "add-keep"; planId: string; zoneId: string; text: string }
  | { type: "save-answer"; zoneId: string; questionId: string; text: string }
  | { type: "questions-pending"; planId: string; zoneId: string; pending: boolean }
  | { type: "generate-failed"; planId: string; zoneId: string }
  | { type: "generate-ok"; proposal: Proposal }
  | { type: "remove-proposal"; planId: string; zoneId: string; proposalId: string }
  | { type: "seed-thread"; zoneId: string; ownerId: string; now: string }
  | {
      type: "post-message";
      id: string;
      zoneId: string;
      authorId: string;
      text: string;
      createdAt: string;
      questionId?: string;
    }
  | { type: "approve"; planId: string; zoneId: string; proposalId: string }
  | { type: "skip-zone"; planId: string; zoneId: string }
  | { type: "move-phase"; planId: string; phaseId: string; direction: "up" | "down" }
  | { type: "set-phase-days"; planId: string; phaseId: string; days: number }
  | { type: "set-available"; planId: string; amount?: number }
  | { type: "save-spend-phase"; planId: string; phase: SpendPhase }
  | { type: "move-spend-phase"; planId: string; phaseId: string; direction: "up" | "down" }
  | {
      type: "set-reaction";
      planId: string;
      zoneId: string;
      proposalId: string;
      personId: string;
      name: string;
      kind: ReactionKind | null;
    }
  | { type: "approve-plan"; planId: string }
  | { type: "pushed"; planId: string; projectId: string; projectUrl: string }
  | { type: "sent"; requests: CalloutRequest[] };

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = item.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function mapLink(state: State, planId: string, zoneId: string, edit: (link: State["links"][number]) => State["links"][number]): State {
  return {
    ...state,
    links: state.links.map((link) => (link.planId === planId && link.zoneId === zoneId ? edit(link) : link)),
  };
}

export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "replace":
      return action.state.version === 2 ? withMessages(action.state) : emptyState();
    case "hydrate-properties": {
      const incoming = action.properties;
      let zones = state.zones.filter((zone) => incoming.some((property) => property.id === zone.propertyId));
      for (const property of incoming) {
        if (!zones.some((zone) => zone.propertyId === property.id)) zones = [...zones, ...defaultZones(property.id)];
      }
      const properties = incoming.map((property) => ({
        id: property.id,
        name: property.name,
        suburb: property.suburb,
        ownerId: property.ownerId,
        coverPhotoId: state.properties.find((item) => item.id === property.id)?.coverPhotoId ?? "",
        ...(property.placeId ? { placeId: property.placeId } : {}),
        ...(property.externalPlaceId ? { externalPlaceId: property.externalPlaceId } : {}),
        ...(property.placeName ? { placeName: property.placeName } : {}),
      }));
      const activePropertyId = pickPropertyId(properties, action.prefer, state.activePropertyId);
      const plans = state.plans.filter((plan) => incoming.some((property) => property.id === plan.propertyId));
      const planIds = new Set(plans.map((plan) => plan.id));
      const zoneIds = new Set(zones.map((zone) => zone.id));
      const activePlanId =
        plans.find((plan) => plan.id === state.activePlanId && plan.propertyId === activePropertyId)?.id ??
        plans.find((plan) => plan.propertyId === activePropertyId)?.id ??
        null;
      return {
        ...state,
        properties,
        zones,
        photos: state.photos.filter((photo) => zoneIds.has(photo.zoneId)),
        plans,
        links: state.links.filter((link) => planIds.has(link.planId) && zoneIds.has(link.zoneId)),
        proposals: state.proposals.filter((proposal) => planIds.has(proposal.planId) && zoneIds.has(proposal.zoneId)),
        requests: state.requests.filter((request) => planIds.has(request.planId)),
        messages: (state.messages ?? []).filter((message) => zoneIds.has(message.zoneId)),
        activePropertyId,
        activePlanId,
        sample: false,
      };
    }
    case "select-property": {
      const plans = state.plans.filter((plan) => plan.propertyId === action.propertyId);
      const current = plans.find((plan) => plan.id === state.activePlanId);
      const next = current ?? plans[0] ?? null;
      return { ...state, activePropertyId: action.propertyId, activePlanId: next ? next.id : null };
    }
    case "select-plan":
      return { ...state, activePlanId: action.planId };
    case "visit-zone":
      return {
        ...state,
        plans: state.plans.map((plan) => (plan.id === action.planId ? { ...plan, lastZoneId: action.zoneId } : plan)),
      };
    case "start-plan": {
      const zones = state.zones.filter((zone) => zone.propertyId === action.plan.propertyId);
      return {
        ...state,
        plans: [action.plan, ...state.plans],
        links: [...state.links, ...zones.map((zone) => emptyLink(action.plan.id, zone.id))],
        activePropertyId: action.plan.propertyId,
        activePlanId: action.plan.id,
      };
    }
    case "rename-zone":
      return { ...state, zones: state.zones.map((zone) => (zone.id === action.zoneId ? { ...zone, name: action.name } : zone)) };
    case "set-zone-kind":
      return { ...state, zones: state.zones.map((zone) => (zone.id === action.zoneId ? { ...zone, kind: action.kind } : zone)) };
    case "set-zone-size":
      return {
        ...state,
        zones: state.zones.map((zone) => {
          if (zone.id !== action.zoneId) return zone;
          const next = { ...zone };
          if (action.sizeM2 === undefined) delete next.sizeM2;
          else next.sizeM2 = action.sizeM2;
          return next;
        }),
      };
    case "hide-zone":
      return { ...state, zones: state.zones.map((zone) => (zone.id === action.zoneId ? { ...zone, hidden: action.hidden } : zone)) };
    case "move-zone": {
      const zone = state.zones.find((item) => item.id === action.zoneId);
      if (!zone) return state;
      const siblings = state.zones
        .filter((item) => item.propertyId === zone.propertyId)
        .slice()
        .sort((a, b) => a.order - b.order);
      const index = siblings.findIndex((item) => item.id === zone.id);
      const swapWith = action.direction === "up" ? index - 1 : index + 1;
      if (swapWith < 0 || swapWith >= siblings.length) return state;
      const other = siblings[swapWith];
      if (!other) return state;
      return {
        ...state,
        zones: state.zones.map((item) => {
          if (item.id === zone.id) return { ...item, order: other.order };
          if (item.id === other.id) return { ...item, order: zone.order };
          return item;
        }),
      };
    }
    case "add-zone": {
      const propertyPlans = state.plans.filter((plan) => plan.propertyId === action.zone.propertyId);
      return {
        ...state,
        zones: [...state.zones, action.zone],
        links: [...state.links, ...propertyPlans.map((plan) => emptyLink(plan.id, action.zone.id))],
      };
    }
    case "merge-zones": {
      if (action.sourceId === action.targetId) return state;
      const source = state.zones.find((zone) => zone.id === action.sourceId);
      const target = state.zones.find((zone) => zone.id === action.targetId);
      if (!source || !target) return state;
      const targetHasStar = state.photos.some((photo) => photo.zoneId === target.id && photo.starred);
      const answers = [...target.answers];
      for (const answer of source.answers) {
        if (!answers.some((item) => item.questionId === answer.questionId)) answers.push(answer);
      }
      return {
        ...state,
        zones: state.zones
          .filter((zone) => zone.id !== source.id)
          .map((zone) => (zone.id === target.id ? { ...zone, answers } : zone)),
        photos: state.photos.map((photo) => {
          if (photo.zoneId !== source.id) return photo;
          return { ...photo, zoneId: target.id, starred: targetHasStar ? false : photo.starred };
        }),
        proposals: state.proposals.filter((proposal) => proposal.zoneId !== source.id),
        links: state.links.filter((link) => link.zoneId !== source.id),
        messages: (state.messages ?? []).map((message) =>
          message.zoneId === source.id ? { ...message, zoneId: target.id } : message,
        ),
      };
    }
    case "add-photo": {
      const count = state.photos.filter((photo) => photo.zoneId === action.photo.zoneId).length;
      if (count >= PHOTO_CAP) return state;
      const starred = count === 0 ? true : action.photo.starred;
      return { ...state, photos: [...state.photos, { ...action.photo, starred }] };
    }
    case "star-photo":
      return {
        ...state,
        photos: state.photos.map((photo) =>
          photo.zoneId === action.zoneId ? { ...photo, starred: photo.id === action.photoId } : photo,
        ),
      };
    case "remove-photo": {
      const gone = state.photos.find((photo) => photo.id === action.photoId);
      if (!gone) return state;
      const zoneCount = state.photos.filter((photo) => photo.zoneId === gone.zoneId).length;
      const hasAfter = state.proposals.some((proposal) => proposal.zoneId === gone.zoneId);
      if (hasAfter && zoneCount <= 1) return state;
      const rest = state.photos.filter((photo) => photo.id !== action.photoId);
      const zonePhotos = rest.filter((photo) => photo.zoneId === gone.zoneId);
      if (gone.starred && zonePhotos.length && !zonePhotos.some((photo) => photo.starred)) {
        const first = zonePhotos[0];
        if (!first) return { ...state, photos: rest };
        return {
          ...state,
          photos: rest.map((photo) => (photo.id === first.id ? { ...photo, starred: true } : photo)),
        };
      }
      return { ...state, photos: rest };
    }
    case "set-guides":
      return mapLink(state, action.planId, action.zoneId, (link) => ({
        ...link,
        style: action.style,
        styleNote: action.styleNote,
        budget: action.budget,
        keep: action.keep,
        replace: action.replace,
      }));
    case "apply-style": {
      const source = state.links.find((link) => link.planId === action.planId && link.zoneId === action.zoneId);
      if (!source?.style || !source.budget) return state;
      const fromAfter = source.style === "from-after";
      const note = fromAfter ? source.readLine || source.styleNote : source.styleNote;
      return {
        ...state,
        links: state.links.map((link) => {
          if (link.planId !== action.planId || link.zoneId === action.zoneId) return link;
          if (link.approvedProposalId || link.skipped) return link;
          if (fromAfter) {
            return {
              ...link,
              style: source.style,
              styleNote: note,
              budget: source.budget,
              styleFromZoneId: action.zoneId,
              styleReferenceProposalId: source.styleReferenceProposalId,
            };
          }
          return {
            ...link,
            style: source.style,
            styleNote: source.styleNote,
            budget: source.budget,
            styleFromZoneId: undefined,
            styleReferenceProposalId: undefined,
          };
        }),
      };
    }
    case "upload-ok": {
      if (!canOfferAfterUpload(state.photos.filter((photo) => photo.zoneId === action.proposal.zoneId).length)) return state;
      if (action.proposal.source !== "uploaded") return state;
      if (state.proposals.some((item) => item.id === action.proposal.id)) return state;
      const stored: State = {
        ...state,
        proposals: [...state.proposals, action.proposal],
      };
      const described = mapLink(stored, action.proposal.planId, action.proposal.zoneId, (link) => ({
        ...link,
        style: "from-after",
        styleNote: action.description,
        readLine: action.description,
        keep: unique([...link.keep, ...action.keep]),
        replace: unique([...link.replace, ...action.replace]),
        proposalIds: [...link.proposalIds, action.proposal.id],
        styleFromZoneId: undefined,
        styleReferenceProposalId: action.proposal.id,
        shareLook: true,
        lastFailed: false,
        questionsPending: false,
        skipped: false,
      }));
      return {
        ...described,
        links: withSharedLook(described.links, action.proposal.planId, action.proposal.zoneId, true),
      };
    }
    case "share-look":
      return {
        ...state,
        links: withSharedLook(state.links, action.planId, action.zoneId, action.on),
      };
    case "set-read-line": {
      const source = state.links.find((link) => link.planId === action.planId && link.zoneId === action.zoneId);
      return {
        ...state,
        links: state.links.map((link) => {
          if (link.planId === action.planId && link.zoneId === action.zoneId) {
            return {
              ...link,
              readLine: action.text,
              styleNote: link.style === "from-after" ? action.text : link.styleNote,
            };
          }
          if (source?.shareLook && link.planId === action.planId && link.style === "from-after" && link.styleFromZoneId === action.zoneId) {
            return { ...link, styleNote: action.text };
          }
          return link;
        }),
      };
    }
    case "add-keep":
      return mapLink(state, action.planId, action.zoneId, (link) =>
        link.keep.includes(action.text) ? link : { ...link, keep: [...link.keep, action.text] },
      );
    case "save-answer":
      return {
        ...state,
        zones: state.zones.map((zone) => {
          if (zone.id !== action.zoneId) return zone;
          const answers = zone.answers.filter((answer) => answer.questionId !== action.questionId);
          return { ...zone, answers: [...answers, { questionId: action.questionId, text: action.text }] };
        }),
      };
    case "questions-pending":
      return mapLink(state, action.planId, action.zoneId, (link) => ({ ...link, questionsPending: action.pending }));
    case "generate-failed":
      return mapLink(state, action.planId, action.zoneId, (link) => ({
        ...link,
        lastFailed: true,
        questionsPending: false,
      }));
    case "remove-proposal": {
      const proposal = state.proposals.find(
        (item) => item.id === action.proposalId && item.planId === action.planId && item.zoneId === action.zoneId,
      );
      if (!proposal) return state;
      const generated = proposal.source !== "uploaded";
      return {
        ...state,
        proposals: state.proposals.filter((item) => item.id !== proposal.id),
        links: state.links.map((link) => {
          if (link.planId !== proposal.planId || link.zoneId !== proposal.zoneId) return link;
          const next = {
            ...link,
            proposalIds: link.proposalIds.filter((id) => id !== proposal.id),
            attempts: generated ? Math.max(0, link.attempts - 1) : link.attempts,
          };
          if (link.approvedProposalId === proposal.id) next.approvedProposalId = undefined;
          return next;
        }),
      };
    }
    case "seed-thread":
      return seedZoneThread(state, action.zoneId, action.ownerId, action.now);
    case "post-message":
      return postThreadMessage(state, action);
    case "generate-ok":
      return {
        ...state,
        proposals: [...state.proposals, action.proposal],
        links: state.links.map((link) =>
          link.planId === action.proposal.planId && link.zoneId === action.proposal.zoneId
            ? {
                ...link,
                proposalIds: [...link.proposalIds, action.proposal.id],
                attempts: link.attempts + 1,
                lastFailed: false,
                questionsPending: false,
                skipped: false,
              }
            : link,
        ),
      };
    case "approve":
      return mapLink(state, action.planId, action.zoneId, (link) => ({
        ...link,
        approvedProposalId: action.proposalId,
        skipped: false,
        questionsPending: false,
      }));
    case "skip-zone":
      return mapLink(state, action.planId, action.zoneId, (link) => ({
        ...link,
        skipped: true,
        approvedProposalId: undefined,
        questionsPending: false,
      }));
    case "move-phase":
      return {
        ...state,
        plans: state.plans.map((plan) => {
          if (plan.id !== action.planId || (plan.status !== "draft" && plan.status !== "approved")) return plan;
          const phases = plan.phases.slice().sort((a, b) => a.order - b.order);
          const index = phases.findIndex((phase) => phase.id === action.phaseId);
          const swapWith = action.direction === "up" ? index - 1 : index + 1;
          if (index < 0 || swapWith < 0 || swapWith >= phases.length) return plan;
          const current = phases[index];
          const other = phases[swapWith];
          if (!current || !other) return plan;
          const next = phases.map((phase) => {
            if (phase.id === current.id) return { ...phase, order: other.order };
            if (phase.id === other.id) return { ...phase, order: current.order };
            return phase;
          });
          return { ...plan, phases: next };
        }),
      };
    case "set-phase-days":
      return {
        ...state,
        plans: state.plans.map((plan) =>
          plan.id === action.planId && (plan.status === "draft" || plan.status === "approved")
            ? {
                ...plan,
                phases: plan.phases.map((phase) =>
                  phase.id === action.phaseId ? { ...phase, days: Math.max(1, action.days) } : phase,
                ),
              }
            : plan,
        ),
      };
    case "set-available":
      if (action.amount !== undefined && (!Number.isInteger(action.amount) || action.amount < 0)) return state;
      return {
        ...state,
        plans: state.plans.map((plan) => {
          if (plan.id !== action.planId) return plan;
          if (action.amount === undefined) {
            if (plan.availableToSpend === undefined) return plan;
            const next = { ...plan };
            delete next.availableToSpend;
            return next;
          }
          if (plan.availableToSpend === action.amount) return plan;
          return { ...plan, availableToSpend: action.amount };
        }),
      };
    case "save-spend-phase": {
      const plan = state.plans.find((item) => item.id === action.planId);
      if (!plan) return state;
      const allowed = new Set(
        state.zones
          .filter((zone) => zone.propertyId === plan.propertyId && !zone.hidden)
          .filter((zone) => !state.links.some((link) => link.planId === plan.id && link.zoneId === zone.id && link.skipped))
          .map((zone) => zone.id),
      );
      const zoneIds = keepSpendZoneIds(action.phase.zoneIds, allowed);
      const name = action.phase.name.trim();
      if (!name || zoneIds.length === 0) return state;
      const saved: SpendPhase = { ...action.phase, name, zoneIds };
      return {
        ...state,
        plans: state.plans.map((item) =>
          item.id === plan.id ? { ...item, spendPhases: placePhaseZones(item.spendPhases ?? [], saved) } : item,
        ),
      };
    }
    case "move-spend-phase":
      return {
        ...state,
        plans: state.plans.map((plan) => {
          if (plan.id !== action.planId) return plan;
          const phases = (plan.spendPhases ?? []).slice().sort((a, b) => a.order - b.order);
          const index = phases.findIndex((phase) => phase.id === action.phaseId);
          const swapWith = action.direction === "up" ? index - 1 : index + 1;
          if (index < 0 || swapWith < 0 || swapWith >= phases.length) return plan;
          const current = phases[index];
          const other = phases[swapWith];
          if (!current || !other) return plan;
          const next = phases.map((phase) => {
            if (phase.id === current.id) return { ...phase, order: other.order };
            if (phase.id === other.id) return { ...phase, order: current.order };
            return phase;
          });
          return { ...plan, spendPhases: next };
        }),
      };
    case "set-reaction":
      return {
        ...state,
        proposals: state.proposals.map((proposal) => {
          if (proposal.id !== action.proposalId || proposal.planId !== action.planId || proposal.zoneId !== action.zoneId) {
            return proposal;
          }
          const kept = (proposal.reactions ?? []).filter((item) => item.personId !== action.personId);
          if (!action.kind) {
            if (!kept.length) {
              if (!proposal.reactions?.length) return proposal;
              const next = { ...proposal };
              delete next.reactions;
              return next;
            }
            return { ...proposal, reactions: kept };
          }
          return {
            ...proposal,
            reactions: [...kept, { personId: action.personId, name: action.name.trim(), kind: action.kind }],
          };
        }),
      };
    case "approve-plan":
      return {
        ...state,
        plans: state.plans.map((plan) =>
          plan.id === action.planId && plan.status === "draft"
            ? { ...plan, status: "approved", phasesApproved: true }
            : plan,
        ),
      };
    case "pushed":
      return {
        ...state,
        plans: state.plans.map((plan) =>
          plan.id === action.planId
            ? { ...plan, status: "in-project", projectId: action.projectId, projectUrl: action.projectUrl, phasesApproved: true }
            : plan,
        ),
      };
    case "sent":
      return { ...state, requests: [...state.requests, ...action.requests] };
    default:
      return state;
  }
}

export function makePlan(propertyId: string, name: string, id: string, createdAt: string): Plan {
  return {
    id,
    propertyId,
    name,
    status: "draft",
    createdAt,
    phasesApproved: false,
    phases: freshPhases(id),
  };
}
