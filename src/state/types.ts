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
  kind: ZoneKind;
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

export type Proposal = {
  id: string;
  planId: string;
  zoneId: string;
  beforePhotoId: string;
  imageUrl: string;
  createdAt: string;
};

export type PlanLink = {
  planId: string;
  zoneId: string;
  style?: StyleId;
  styleNote?: string;
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
  phases: Phase[];
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
  activePropertyId: string;
  activePlanId: string | null;
};

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
