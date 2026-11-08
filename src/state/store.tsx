import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { calloutSource } from "../api/callout";
import { ServiceUnreachable } from "../api/errors";
import { describeAfter } from "../api/describe";
import { generateImage } from "../api/images";
import { projectSource } from "../api/project";
import { browserHouseClient } from "../api/housePlan";
import { loadProperties, type PropertyQuery } from "../api/property";
import { freshPhases } from "../data/phases";
import { copy } from "../copy";
import { emptyState, SAMPLE_SESSION_KEY, sampleRequested, seed, STORAGE_KEY } from "../data/seed";
import { captureHubHandoff, type HubHandoff } from "../lib/handoff";
import { unmatchedHouseName } from "../lib/properties";
import { locateLeak, type LeakSpot } from "../lib/leak";
import { assessTotal } from "../lib/budget";
import { SUGGESTIONS } from "../data/guides";
import { capReached, type StyleId, type Tier } from "../lib/prompt";
import { fitPictureForHouse } from "../lib/pictureFit";
import { canOfferAfterUpload, READ_FALLBACK } from "../lib/reading";
import { readSyncMarks, SYNC_KEY, syncHousePlans, type SyncMarks, type SyncResult } from "./houseSync";
import { isEffectivelyEmpty, planFingerprint, sliceProperty } from "./slice";
import { hasPictureRefs, loadOwner, readStoredOwner, saveOwner } from "./persist";
import { pictureDb } from "./pictureDb";
import { reduce, type Action } from "./reducer";
import { activePlan, activeProperty, budgetLines, linkFor, photosFor, proposalsFor, scopeFor, starredPhoto } from "./select";
import { withMessages, type CalloutRequest, type Photo, type State, type Zone, type ZoneKind } from "./types";

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
  saveFailed: boolean;
  houseSaveFailed: boolean;
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

function loadSample(): State {
  if (new URLSearchParams(window.location.search).get("plan") === "none") {
    const fresh = seed();
    return { ...fresh, plans: [], links: [], proposals: [], requests: [], activePlanId: null };
  }
  try {
    const raw = sessionStorage.getItem(SAMPLE_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (parsed.version === 2 && parsed.sample) return withMessages(parsed);
    }
  } catch {
    /* start a fresh sample */
  }
  return seed();
}

function storedMarks(): SyncMarks {
  try {
    if (typeof localStorage === "undefined") return {};
    return readSyncMarks(localStorage.getItem(SYNC_KEY));
  } catch {
    return {};
  }
}

function writeMarks(next: SyncMarks) {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(next));
  } catch {
    /* The house holds the plan. A missed timestamp only delays the next push. */
  }
}

function readBoot(): State {
  if (sampleRequested()) return loadSample();
  try {
    return readStoredOwner(localStorage.getItem(STORAGE_KEY)) ?? emptyState();
  } catch {
    return emptyState();
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const boot = useRef<State | null>(null);
  if (boot.current === null) boot.current = readBoot();
  const hydratePictures = !boot.current.sample && hasPictureRefs(boot.current);
  const [visible, setVisible] = useState(!hydratePictures);
  const [persistReady, setPersistReady] = useState(boot.current.sample);
  const [state, rawDispatch] = useReducer(reduce, boot.current);
  const [busyZoneId, setBusyZoneId] = useState<string | null>(null);
  const [busyMode, setBusyMode] = useState<"generate" | "read" | null>(null);
  const [propertyLoad, setPropertyLoad] = useState<PropertyLoad>(sampleRequested() ? "ready" : "loading");
  const [unmatchedHouse, setUnmatchedHouse] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const [houseSaveFailed, setHouseSaveFailed] = useState(false);
  const [bootReady, setBootReady] = useState(sampleRequested());
  const preferApplied = useRef(false);
  const redeemSettled = useRef(false);
  const known = useRef(new Map<string, string>());
  const unresolved = useRef(new Set<string>());
  const saveSeq = useRef(0);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const stamp = useRef(0);
  const loadGen = useRef(0);
  const baselineReady = useRef(false);
  const baseline = useRef(new Map<string, string>());
  const marks = useRef<SyncMarks>(storedMarks());
  const houseClient = useRef(browserHouseClient());
  const ref = useRef(state);
  ref.current = state;
  const dispatch = (action: Action) => {
    stamp.current += 1;
    ref.current = reduce(ref.current, action);
    rawDispatch(action);
  };
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    if (boot.current?.sample) return;
    let cancel = false;
    void loadOwner(localStorage, pictureDb(), known.current)
      .then((loaded) => {
        if (cancel) return;
        unresolved.current = loaded.unresolved;
        if (hydratePictures) dispatchRef.current({ type: "replace", state: loaded.state });
        setVisible(true);
        setPersistReady(true);
      })
      .catch(() => {
        if (cancel) return;
        setVisible(true);
        setPersistReady(true);
      });
    return () => {
      cancel = true;
    };
  }, [hydratePictures]);

  function rememberHouse(result: SyncResult) {
    unresolved.current = result.unresolved;
    marks.current = result.marks;
    writeMarks(result.marks);
    for (const id of result.syncedIds) baseline.current.set(id, planFingerprint(result.state, id));
    baselineReady.current = true;
  }

  useEffect(() => {
    if (!persistReady) return;
    const seq = ++saveSeq.current;
    const job = async () => {
      if (seq !== saveSeq.current) return;
      const seen = stamp.current;
      const snapshot = ref.current;
      if (snapshot.sample) {
        if (new URLSearchParams(window.location.search).get("plan") === "none") return;
        try {
          sessionStorage.setItem(SAMPLE_SESSION_KEY, JSON.stringify(snapshot));
          if (seq === saveSeq.current) setSaveFailed(false);
        } catch {
          if (seq === saveSeq.current) setSaveFailed(true);
        }
        return;
      }
      const localOk = await saveOwner(localStorage, pictureDb(), snapshot, known.current, unresolved.current);
      if (seq !== saveSeq.current || stamp.current !== seen) {
        if (seq === saveSeq.current && !localOk) setSaveFailed(true);
        return;
      }
      if (!baselineReady.current) {
        setSaveFailed(!localOk);
        return;
      }
      const now = new Date().toISOString();
      let dirty = false;
      for (const property of snapshot.properties) {
        const finger = planFingerprint(snapshot, property.id);
        if (baseline.current.get(property.id) === finger) continue;
        if (isEffectivelyEmpty(sliceProperty(snapshot, property.id)) && !marks.current[property.id]?.serverUpdatedAt) continue;
        const previous = marks.current[property.id] ?? {};
        marks.current = { ...marks.current, [property.id]: { ...previous, localUpdatedAt: now } };
        dirty = true;
      }
      if (dirty) writeMarks(marks.current);
      if (!dirty) {
        if (localOk) setSaveFailed(false);
        return;
      }
      if (seq !== saveSeq.current) return;
      try {
        const result = await syncHousePlans({
          state: snapshot,
          propertyIds: snapshot.properties.map((property) => property.id),
          marks: marks.current,
          unresolved: unresolved.current,
          client: houseClient.current,
          fit: fitPictureForHouse,
        });
        if (seq !== saveSeq.current || stamp.current !== seen) return;
        rememberHouse(result);
        if (result.notice === "too-large") {
          setHouseSaveFailed(true);
          setSaveFailed(false);
        } else {
          setHouseSaveFailed(false);
          setSaveFailed(!localOk);
        }
        if (result.state !== snapshot) dispatchRef.current({ type: "replace", state: result.state });
      } catch {
        if (seq === saveSeq.current && !localOk) setSaveFailed(true);
      }
    };
    const run = saveChain.current.then(job, job);
    saveChain.current = run.then(
      () => undefined,
      () => undefined,
    );
  }, [persistReady, state]);

  useEffect(() => {
    if (!visible || state.sample) return;
    const gen = ++loadGen.current;
    const handoff = browserHandoff();
    const mock = devMock();
    const sendRedeem = redeemSettled.current ? "" : handoff.houseRedeem;
    const key = `${reloadKey}:${sendRedeem ? "r" : "l"}:${mock || ""}`;
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
        if (gen !== loadGen.current) return;
        const spent = !result.ok && (result.code === "redeem" || result.spent === true);
        if (sendRedeem && (result.ok || spent)) redeemSettled.current = true;
        if (!result.ok) {
          setPropertyLoad("error");
          setBootReady(true);
          return;
        }
        const job = async () => {
          if (gen !== loadGen.current) return;
          const first = !preferApplied.current;
          preferApplied.current = true;
          dispatchRef.current({
            type: "hydrate-properties",
            properties: result.properties,
            prefer: first
              ? { houseHint: handoff.houseHint, placeIdHints: handoff.placeIdHints }
              : undefined,
          });
          if (first) {
            setUnmatchedHouse(unmatchedHouseName(result.properties, {
              houseHint: handoff.houseHint,
              placeIdHints: handoff.placeIdHints,
            }));
          }
          const seen = stamp.current;
          const snapshot = ref.current;
          try {
            const synced = await syncHousePlans({
              state: snapshot,
              propertyIds: snapshot.properties.map((property) => property.id),
              marks: marks.current,
              unresolved: unresolved.current,
              client: houseClient.current,
              fit: fitPictureForHouse,
            });
            if (gen !== loadGen.current) return;
            if (stamp.current !== seen) {
              baselineReady.current = true;
              setPropertyLoad("ready");
              setBootReady(true);
              return;
            }
            rememberHouse(synced);
            if (synced.notice === "too-large") setHouseSaveFailed(true);
            else setHouseSaveFailed(false);
            if (synced.state !== snapshot) dispatchRef.current({ type: "replace", state: synced.state });
          } catch {
            if (gen !== loadGen.current) return;
            baselineReady.current = true;
          }
          if (gen !== loadGen.current) return;
          setPropertyLoad("ready");
          setBootReady(true);
        };
        const run = saveChain.current.then(job, job);
        saveChain.current = run.then(
          () => undefined,
          () => undefined,
        );
      })
      .catch(() => {
        if (gen !== loadGen.current) return;
        setPropertyLoad("error");
        setBootReady(true);
      });
    return () => {
      loadGen.current += 1;
    };
  }, [visible, reloadKey, state.sample]);

  const api: StoreValue = {
      state,
      propertyLoad,
      unmatchedHouse,
      busyZoneId,
      busyMode,
      saveFailed,
      houseSaveFailed,
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

  if (!visible) return null;
  if (!bootReady) {
    return (
      <div className="shell">
        <div className="brand-strip" aria-hidden="true" />
        <div className="page">
          <p>{copy.propertiesLoading}</p>
        </div>
      </div>
    );
  }
  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useRenovate(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Store missing");
  return value;
}

export type { Zone, ZoneKind };
