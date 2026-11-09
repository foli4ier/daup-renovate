import type { Phase } from "../data/phases";
import type { StyleId, Tier } from "../lib/prompt";
import type { PlanStatus } from "../lib/status";

export type ZoneKind = "inside" | "outside";

export type Property = {
  id: string;
  name: string;
  suburb: string;
  ownerId: string;
  coverPhotoId: string;
  placeId?: string;
  externalPlaceId?: string;
  placeName?: string;
};

export type ZoneAnswer = {
  questionId: string;
  text: string;
};

export type Zone = {
  id: string;
  propertyId: string;
  key: string;
  name: string;
  /** Missing when the owner named a zone and did not pick inside or outside. */
  kind?: ZoneKind;
  sizeM2?: number;
  order: number;
  hidden: boolean;
  answers: ZoneAnswer[];
};

export type Photo = {
  id: string;
  zoneId: string;
  url: string;
  width: number;
  height: number;
  starred: boolean;
  sourceName?: string;
};

export type ReactionKind = "like" | "dislike";

/** One person's reaction on an after. Uploaded and generated afters use the same list. */
export type AfterReaction = {
  personId: string;
  /** Shown for someone else. The person viewing is displayed as "you". */
  name: string;
  kind: ReactionKind;
};

export type Proposal = {
  id: string;
  planId: string;
  zoneId: string;
  beforePhotoId: string;
  imageUrl: string;
  createdAt: string;
  /** Missing means a generated picture, so older plans keep their cap. */
  source?: "generated" | "uploaded";
  width?: number;
  height?: number;
  reactions?: AfterReaction[];
};

export type PlanLink = {
  planId: string;
  zoneId: string;
  style?: StyleId;
  styleNote?: string;
  /** Short reading of an uploaded after. Stays when this zone picks another chip. */
  readLine?: string;
  /** Set on zones that follow another zone's uploaded look. */
  styleFromZoneId?: string;
  /** Uploaded picture used as the style reference. */
  styleReferenceProposalId?: string;
  /** Use this style on the other zones. Starts on after an upload. */
  shareLook?: boolean;
  budget?: Tier;
  keep: string[];
  replace: string[];
  proposalIds: string[];
  approvedProposalId?: string;
  skipped: boolean;
  attempts: number;
  questionsPending: boolean;
  lastFailed: boolean;
};

export type Plan = {
  id: string;
  propertyId: string;
  name: string;
  status: PlanStatus;
  createdAt: string;
  phasesApproved: boolean;
  projectId?: string;
  projectUrl?: string;
  /** Last zone the owner opened on this plan. */
  lastZoneId?: string;
  /** Work list for Project (Prep, Plumbing and electrics). Not spend phases. */
  phases: Phase[];
  /** Whole rands the owner can spend on this plan. Not the estimate and not a quote. */
  availableToSpend?: number;
  /** This plan's spend sequence. A zone sits in at most one of these. */
  spendPhases?: SpendPhase[];
};

export type SpendPhase = {
  id: string;
  name: string;
  order: number;
  zoneIds: string[];
};

export type CalloutRequest = {
  id: string;
  planId: string;
  zoneId: string;
  scope: string;
  beforeUrl: string;
  afterUrl: string;
  createdAt: string;
};

/** One line in a zone thread. Chips are the answers offered on a question. */
export type ThreadMessage = {
  id: string;
  zoneId: string;
  authorId: string;
  text: string;
  createdAt: string;
  chips?: string[];
  questionId?: string;
};

export type State = {
  version: 2;
  sample: boolean;
  properties: Property[];
  zones: Zone[];
  photos: Photo[];
  plans: Plan[];
  links: PlanLink[];
  proposals: Proposal[];
  requests: CalloutRequest[];
  /** Zone threads. The owner posts for now; authorId is ready for other people. */
  messages: ThreadMessage[];
  activePropertyId: string;
  activePlanId: string | null;
};

export function withMessages(state: State): State {
  return Array.isArray(state.messages) ? state : { ...state, messages: [] };
}

export function emptyLink(planId: string, zoneId: string): PlanLink {
  return {
    planId,
    zoneId,
    keep: [],
    replace: [],
    proposalIds: [],
    skipped: false,
    attempts: 0,
    questionsPending: false,
    lastFailed: false,
  };
}
