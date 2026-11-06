import { freshPhases } from "./phases";
import { emptyLink, type Photo, type PlanLink, type State, type Zone } from "../state/types";

export const STORAGE_KEY = "daup-renovate-v2";
export const SAMPLE_SESSION_KEY = "daup-renovate-sample-session";

const PROPERTY = "prop_esseboom";
const PLAN = "plan_refresh";

function zone(partial: Omit<Zone, "propertyId" | "answers"> & { answers?: Zone["answers"] }): Zone {
  return { propertyId: PROPERTY, answers: partial.answers ?? [], ...partial };
}

function photo(partial: Photo): Photo {
  return partial;
}

function link(partial: Partial<PlanLink> & Pick<PlanLink, "zoneId">): PlanLink {
  return { ...emptyLink(PLAN, partial.zoneId), ...partial, planId: PLAN };
}

export function seed(): State {
  const zones: Zone[] = [
    zone({ id: "zone_front", key: "front", name: "Front yard", kind: "outside", order: 1, hidden: false }),
    zone({ id: "zone_back", key: "back", name: "Back yard", kind: "outside", order: 2, hidden: false }),
    zone({ id: "zone_side", key: "side", name: "Side yard", kind: "outside", order: 3, hidden: false }),
    zone({
      id: "zone_living",
      key: "living",
      name: "Living area",
      kind: "inside",
      order: 4,
      hidden: false,
      answers: [{ questionId: "boards", text: "Yes. Boards." }],
    }),
    zone({
      id: "zone_kitchen",
      key: "kitchen",
      name: "Kitchen",
      kind: "inside",
      order: 5,
      hidden: false,
      answers: [{ questionId: "use", text: "Home kitchen." }],
    }),
    zone({ id: "zone_bath", key: "bath", name: "Bathroom 1", kind: "inside", order: 6, hidden: false }),
    zone({ id: "zone_sun", key: "sun", name: "Sun room (stoep)", kind: "inside", order: 7, hidden: false }),
    zone({ id: "zone_bed1", key: "bed1", name: "Bedroom 1", kind: "inside", order: 8, hidden: true }),
    zone({ id: "zone_bed2", key: "bed2", name: "Bedroom 2", kind: "inside", order: 9, hidden: true }),
    zone({ id: "zone_bed3", key: "bed3", name: "Bedroom 3", kind: "inside", order: 10, hidden: true }),
    zone({ id: "zone_garage", key: "garage", name: "Garage", kind: "inside", order: 11, hidden: true }),
    zone({ id: "zone_roof", key: "roof", name: "Roof & gutters", kind: "outside", order: 12, hidden: true }),
  ];

  const photos: Photo[] = [
    photo({
      id: "photo_front",
      zoneId: "zone_front",
      url: "/esseboom/front-yard-before.svg",
      width: 1200,
      height: 900,
      starred: true,
      sourceName: "Frontyard__Front_of_House.jpeg",
    }),
    photo({
      id: "photo_living",
      zoneId: "zone_living",
      url: "/esseboom/living-area-before.svg",
      width: 1200,
      height: 900,
      starred: true,
      sourceName: "Leef vetrek__Living_Area.jpeg",
    }),
    photo({
      id: "photo_cabinets",
      zoneId: "zone_kitchen",
      url: "/esseboom/kitchen-cabinets.svg",
      width: 1200,
      height: 900,
      starred: true,
      sourceName: "Kombuis__kitchen_3.jpeg",
    }),
    photo({
      id: "photo_sink",
      zoneId: "zone_kitchen",
      url: "/esseboom/kitchen-sink.svg",
      width: 1200,
      height: 900,
      starred: false,
      sourceName: "Kombuis__kitchen_1.jpeg",
    }),
    photo({
      id: "photo_bath",
      zoneId: "zone_bath",
      url: "/esseboom/bathroom-before.png",
      width: 320,
      height: 213,
      starred: true,
      sourceName: "Badkamer__Bathroom_2.jpeg",
    }),
  ];

  return {
    version: 2,
    sample: true,
    properties: [
      {
        id: PROPERTY,
        name: "Esseboom",
        suburb: "Gardens",
        ownerId: "owner_you",
        coverPhotoId: "photo_front",
      },
    ],
    zones,
    photos,
    plans: [
      {
        id: PLAN,
        propertyId: PROPERTY,
        name: "Esseboom refresh",
        status: "draft",
        createdAt: "2026-11-06T05:15:00.000Z",
        phasesApproved: false,
        phases: freshPhases(PLAN),
      },
      {
        id: "plan_winter",
        propertyId: PROPERTY,
        name: "Winter paint",
        status: "done",
        createdAt: "2026-06-01T08:00:00.000Z",
        phasesApproved: true,
        phases: freshPhases("plan_winter"),
      },
    ],
    links: [
      link({
        zoneId: "zone_front",
        style: "keep-character",
        budget: "mid",
        keep: ["Window layout", "Roof line"],
        replace: ["Beige paint", "Brown garage door", "Patchy lawn"],
        proposalIds: ["prop_front"],
        attempts: 1,
      }),
      link({ zoneId: "zone_back" }),
      link({ zoneId: "zone_side" }),
      link({
        zoneId: "zone_living",
        style: "modern",
        budget: "mid",
        keep: ["Leaded windows", "Wall aircon", "Stone fireplace"],
        replace: ["Brown carpet with the boards underneath", "Chandelier"],
        proposalIds: ["prop_living"],
        attempts: 1,
      }),
      link({
        zoneId: "zone_kitchen",
        style: "modern",
        budget: "high",
        keep: ["Floor tiles", "Window frames"],
        replace: ["Dark cabinets", "Cluttered worktops"],
        proposalIds: ["prop_kitchen"],
        attempts: 1,
      }),
      link({
        zoneId: "zone_bath",
        style: "budget-refresh",
        budget: "mid",
        keep: ["The bath", "The window"],
        replace: ["Old tiles", "Net curtain"],
        proposalIds: ["prop_bath"],
        attempts: 1,
      }),
      link({ zoneId: "zone_sun" }),
      link({ zoneId: "zone_bed1" }),
      link({ zoneId: "zone_bed2" }),
      link({ zoneId: "zone_bed3" }),
      link({ zoneId: "zone_garage" }),
      link({ zoneId: "zone_roof" }),
    ],
    proposals: [
      {
        id: "prop_front",
        planId: PLAN,
        zoneId: "zone_front",
        beforePhotoId: "photo_front",
        imageUrl: "/esseboom/front-yard-after.svg",
        createdAt: "2026-11-06T05:15:00.000Z",
      },
      {
        id: "prop_living",
        planId: PLAN,
        zoneId: "zone_living",
        beforePhotoId: "photo_living",
        imageUrl: "/esseboom/living-area-after.svg",
        createdAt: "2026-11-06T05:15:00.000Z",
      },
      {
        id: "prop_kitchen",
        planId: PLAN,
        zoneId: "zone_kitchen",
        beforePhotoId: "photo_cabinets",
        imageUrl: "/esseboom/kitchen-after.svg",
        createdAt: "2026-11-06T05:15:00.000Z",
      },
      {
        id: "prop_bath",
        planId: PLAN,
        zoneId: "zone_bath",
        beforePhotoId: "photo_bath",
        imageUrl: "/esseboom/bathroom-after.svg",
        createdAt: "2026-11-06T05:15:00.000Z",
      },
    ],
    requests: [],
    activePropertyId: PROPERTY,
    activePlanId: PLAN,
  };
}

export const SAMPLE_AFTER_BY_PHOTO: Record<string, string> = {
  photo_front: "/esseboom/front-yard-after.svg",
  photo_living: "/esseboom/living-area-after.svg",
  photo_cabinets: "/esseboom/kitchen-after.svg",
  photo_sink: "/esseboom/kitchen-after.svg",
  photo_bath: "/esseboom/bathroom-after.svg",
};

export function emptyState(): State {
  return {
    version: 2,
    sample: false,
    properties: [],
    zones: [],
    photos: [],
    plans: [],
    links: [],
    proposals: [],
    requests: [],
    activePropertyId: "",
    activePlanId: null,
  };
}

export function sampleRequested(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get("sample") === "1";
}
