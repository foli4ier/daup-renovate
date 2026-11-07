import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { calloutSource } from "../api/callout";
import { ServiceUnreachable } from "../api/errors";
import { describeAfter } from "../api/describe";
import { generateImage } from "../api/images";
import { projectSource } from "../api/project";
import { loadProperties, type PropertyQuery } from "../api/property";
import { freshPhases } from "../data/phases";
import { emptyState, SAMPLE_SESSION_KEY, sampleRequested, seed, STORAGE_KEY } from "../data/seed";
import { captureHubHandoff, type HubHandoff } from "../lib/handoff";
import { unmatchedHouseName } from "../lib/properties";
import { locateLeak, type LeakSpot } from "../lib/leak";
import { assessTotal } from "../lib/budget";
import { SUGGESTIONS } from "../data/guides";
import { capReached, type StyleId, type Tier } from "../lib/prompt";
import { canOfferAfterUpload, READ_FALLBACK } from "../lib/reading";
import { reduce, type Action } from "./reducer";
import { activePlan, activeProperty, budgetLines, linkFor, photosFor, proposalsFor, scopeFor, starredPhoto } from "./select";
import type { CalloutRequest, Photo, State, Zone, ZoneKind } from "./types";

export type PropertyLoad = "loading" | "ready" | "error";

type StoreValue = {
  state: State;
  propertyLoad: PropertyLoad;
  unmatchedHouse: string;
  busyZoneId: string | null;
  busyMode: "generate" | "read" | null;
  dispatch: (action: Action) => void;
  reloadProperties: () => void;
  chooseProperty: (propertyId: string) => void;
  startPlan: (name: string) => void;
  addPhoto: (photo: Photo) => void;
  saveGuides: (zoneId: string, guides: { style?: StyleId; styleNote?: string; budget?: Tier; keep: string[]; replace: string[] }) => void;
  uploadAfter: (
    zoneId: string,
    photo: { url: string; width: number; height: number },
  ) => Promise<{ ok: true; proposalId: string } | { ok: false }>;
  generate: (zoneId: string, options?: { drift?: boolean }) => Promise<{ ok: true; proposalId: string } | { ok: false }>;
  pushProject: () => Promise<{ ok: true; url: string } | { ok: false }>;
  sendCallouts: (zoneIds: string[]) => Promise<{ ok: boolean; blocked: boolean; spots: (LeakSpot & { zoneId: string; zoneName: string })[] }>;
};

const StoreContext = createContext<StoreValue | null>(null);

let cachedHandoff: HubHandoff | null = null;

function browserHandoff(): HubHandoff {
  if (cachedHandoff) return cachedHandoff;
  cachedHandoff = captureHubHandoff(
    { search: window.location.search, pathname: window.location.pathname, hash: window.location.hash },
    (url) => window.history.replaceState(null, "", url),
  );
  return cachedHandoff;
}

function devMock(): PropertyQuery["mock"] {
  if (!import.meta.env.DEV) return "";
  const value = new URLSearchParams(window.location.search).get("propertyMock");
  if (value === "house" || value === "empty" || value === "fail") return value;
  return "";
}

function load(): State {
  if (typeof window !== "undefined" && sampleRequested()) {
    if (new URLSearchParams(window.location.search).get("plan") === "none") {
      const fresh = seed();
      return { ...fresh, plans: [], links: [], proposals: [], requests: [], activePlanId: null };
    }
    try {
      const raw = sessionStorage.getItem(SAMPLE_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as State;
        if (parsed.version === 2 && parsed.sample) return parsed;
      }
    } catch {
      /* start a fresh sample */
    }
    return seed();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as State;
    if (parsed.version !== 2 || parsed.sample || !Array.isArray(parsed.zones) || !Array.isArray(parsed.plans)) return emptyState();
    return parsed;
  } catch {
    return emptyState();
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reduce, undefined, load);
  const [busyZoneId, setBusyZoneId] = useState<string | null>(null);
  const [busyMode, setBusyMode] = useState<"generate" | "read" | null>(null);
  const [propertyLoad, setPropertyLoad] = useState<PropertyLoad>(sampleRequested() ? "ready" : "loading");
  const [unmatchedHouse, setUnmatchedHouse] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const preferApplied = useRef(false);
  const redeemSettled = useRef(false);
  const ref = useRef(state);
  ref.current = state;
  const dispatch = (action: Action) => {
    ref.current = reduce(ref.current, action);
    rawDispatch(action);
  };

  useEffect(() => {
    if (state.sample) {
      if (new URLSearchParams(window.location.search).get("plan") === "none") return;
      sessionStorage.setItem(SAMPLE_SESSION_KEY, JSON.stringify(state));
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (state.sample) return;
    const handoff = browserHandoff();
    const mock = devMock();
    const sendRedeem = redeemSettled.current ? "" : handoff.houseRedeem;
    const key = `${reloadKey}:${sendRedeem ? "r" : "l"}:${mock || ""}`;
    let cancel = false;
    setPropertyLoad("loading");
    loadProperties(
      {
        houseRedeem: sendRedeem,
        emailHint: handoff.emailHint,
        houseHint: handoff.houseHint,
        placeIdHints: handoff.placeIdHints,
        mock,
      },
      key,
    )
      .then((result) => {
        if (cancel) return;
        const spent = !result.ok && (result.code === "redeem" || result.spent === true);
        if (sendRedeem && (result.ok || spent)) redeemSettled.current = true;
        if (!result.ok) {
          setPropertyLoad("error");
          return;
        }
        const first = !preferApplied.current;
        preferApplied.current = true;
        dispatch({
          type: "hydrate-properties",
          properties: result.properties,
          prefer: first
            ? { houseHint: handoff.houseHint, placeIdHints: handoff.placeIdHints }
            : undefined,
        });
        if (first) setUnmatchedHouse(unmatchedHouseName(result.properties, {
          houseHint: handoff.houseHint,
          placeIdHints: handoff.placeIdHints,
        }));
        setPropertyLoad("ready");
      })
      .catch(() => {
        if (!cancel) setPropertyLoad("error");
      });
    return () => {
      cancel = true;
    };
  }, [reloadKey, state.sample]);

  const api: StoreValue = {
      state,
      propertyLoad,
      unmatchedHouse,
      busyZoneId,
      busyMode,
      dispatch,
      reloadProperties() {
        setReloadKey((value) => value + 1);
      },
      chooseProperty(propertyId: string) {
        setUnmatchedHouse("");
        dispatch({ type: "select-property", propertyId });
      },
      startPlan(name: string) {
        const property = activeProperty(ref.current);
        if (!property) return;
        const id = `plan_${crypto.randomUUID()}`;
        dispatch({
          type: "start-plan",
          plan: {
            id,
            propertyId: property.id,
            name: name.trim() || `${property.name} refresh`,
            status: "draft",
            createdAt: new Date().toISOString(),
            phasesApproved: false,
            phases: freshPhases(id),
          },
        });
      },
      addPhoto(photo: Photo) {
        dispatch({ type: "add-photo", photo });
      },
      saveGuides(zoneId, guides) {
        const plan = activePlan(ref.current);
        if (!plan) return;
        dispatch({ type: "set-guides", planId: plan.id, zoneId, ...guides });
      },
      async uploadAfter(zoneId, photo) {
        const current = ref.current;
        const plan = activePlan(current);
        const zone = current.zones.find((item) => item.id === zoneId);
        const photos = photosFor(current, zoneId);
        if (!plan || !zone || !canOfferAfterUpload(photos.length)) return { ok: false };
        const before = starredPhoto(photos);
        if (!before) return { ok: false };
        const proposalId = `proposal_${crypto.randomUUID()}`;
        setBusyZoneId(zoneId);
        setBusyMode("read");
        const suggestions = SUGGESTIONS[zone.key] ?? { keep: [], replace: [] };
        const reading = await describeAfter({
          beforeUrl: before.url,
          afterUrl: photo.url,
          zoneName: zone.name,
          keepSuggestions: suggestions.keep,
          replaceSuggestions: suggestions.replace,
        });
        dispatch({
          type: "upload-ok",
          proposal: {
            id: proposalId,
            planId: plan.id,
            zoneId,
            beforePhotoId: before.id,
            imageUrl: photo.url,
            createdAt: new Date().toISOString(),
            source: "uploaded",
            width: photo.width,
            height: photo.height,
          },
          description: reading.ok ? reading.reading.description : READ_FALLBACK,
          keep: reading.ok ? reading.reading.keep : [],
          replace: reading.ok ? reading.reading.replace : [],
        });
        setBusyZoneId(null);
        setBusyMode(null);
        return { ok: true, proposalId };
      },
      async generate(zoneId, options) {
        const current = ref.current;
        const plan = activePlan(current);
        const zone = current.zones.find((item) => item.id === zoneId);
        const link = plan ? linkFor(current, plan.id, zoneId) : undefined;
        if (!plan || !zone || !link) return { ok: false };
        if (capReached(link.attempts)) return { ok: false };
        const photo = starredPhoto(photosFor(current, zoneId));
        if (!photo) return { ok: false };
        if (!link.style || !link.budget) return { ok: false };
        const reference =
          link.style === "from-after" && link.styleReferenceProposalId
            ? current.proposals.find((item) => item.id === link.styleReferenceProposalId)
            : undefined;
        setBusyZoneId(zoneId);
        setBusyMode("generate");
        const result = await generateImage({
          zoneName: zone.name,
          style: link.style,
          styleNote: link.style === "from-after" ? link.readLine || link.styleNote : link.styleNote,
          budget: link.budget,
          keep: link.keep,
          replace: link.replace,
          answers: zone.answers.map((answer) => answer.text),
          drift: Boolean(options?.drift),
          attemptsUsed: link.attempts,
          beforePhotoId: photo.id,
          imageUrl: photo.url,
          styleImageUrl: reference?.imageUrl,
        });
        setBusyZoneId(null);
        setBusyMode(null);
        if (!result.ok) {
          dispatch({ type: "generate-failed", planId: plan.id, zoneId });
          return { ok: false };
        }
        const proposalId = `proposal_${crypto.randomUUID()}`;
        dispatch({
          type: "generate-ok",
          proposal: {
            id: proposalId,
            planId: plan.id,
            zoneId,
            beforePhotoId: photo.id,
            imageUrl: result.imageUrl,
            createdAt: new Date().toISOString(),
            source: "generated",
          },
        });
        return { ok: true, proposalId };
      },
      async pushProject() {
        const current = ref.current;
        const plan = activePlan(current);
        if (!plan) return { ok: false };
        const report = assessTotal(budgetLines(current, plan).flatMap((group) => group.lines));
        try {
          const created = await projectSource.createRenovationProject({
            propertyId: plan.propertyId,
            planId: plan.id,
            name: plan.name,
            phases: plan.phases
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((phase) => ({ name: phase.name, days: phase.days, startsAfter: phase.startsAfter })),
            estimate: report.ready ? { low: report.low, high: report.high, currency: "ZAR" } : null,
          });
          dispatch({ type: "pushed", planId: plan.id, projectId: created.projectId, projectUrl: created.url });
          return { ok: true, url: created.url };
        } catch {
          return { ok: false };
        }
      },
      async sendCallouts(zoneIds) {
        const current = ref.current;
        const plan = activePlan(current);
        if (!plan) return { ok: false, blocked: false, spots: [] };
        const spots: (LeakSpot & { zoneId: string; zoneName: string })[] = [];
        const drafts: CalloutRequest[] = [];
        for (const zoneId of zoneIds) {
          const zone = current.zones.find((item) => item.id === zoneId);
          const link = linkFor(current, plan.id, zoneId);
          if (!zone || !link?.approvedProposalId) continue;
          const spot = locateLeak({
            keep: link.keep,
            replace: link.replace,
            answers: zone.answers.map((answer) => answer.text),
            styleNote: link.styleNote,
          });
          if (spot) {
            spots.push({ ...spot, zoneId, zoneName: zone.name });
            continue;
          }
          const proposal = proposalsFor(current, plan.id, zoneId).find((item) => item.id === link.approvedProposalId);
          const before = proposal ? current.photos.find((photo) => photo.id === proposal.beforePhotoId) : undefined;
          if (!proposal || !before) continue;
          const scope = scopeFor(current, plan, zone);
          drafts.push({
            id: "",
            planId: plan.id,
            zoneId,
            scope,
            beforeUrl: before.url,
            afterUrl: proposal.imageUrl,
            createdAt: new Date().toISOString(),
          });
        }
        if (spots.length) return { ok: false, blocked: true, spots };
        if (!drafts.length) return { ok: false, blocked: false, spots: [] };
        try {
          const requests: CalloutRequest[] = [];
          for (const draft of drafts) {
            const sent = await calloutSource.sendRequest({
              planId: draft.planId,
              zoneId: draft.zoneId,
              zoneName: current.zones.find((zone) => zone.id === draft.zoneId)?.name ?? "",
              scope: draft.scope,
              beforeUrl: draft.beforeUrl,
              afterUrl: draft.afterUrl,
            });
            requests.push({ ...draft, id: sent.requestId });
          }
          dispatch({ type: "sent", requests });
          return { ok: true, blocked: false, spots: [] };
        } catch (error) {
          if (error instanceof ServiceUnreachable) return { ok: false, blocked: false, spots: [] };
          return { ok: false, blocked: false, spots: [] };
        }
      },
  };

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useRenovate(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Store missing");
  return value;
}

export type { Zone, ZoneKind };
