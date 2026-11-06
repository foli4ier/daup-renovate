import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { sampleCalloutSource } from "../api/callout";
import { generateImage } from "../api/images";
import { sampleProjectSource } from "../api/project";
import { freshPhases } from "../data/phases";
import { STORAGE_KEY, seed } from "../data/seed";
import { scopeIsClean } from "../lib/scope";
import { capReached, type StyleId, type Tier } from "../lib/prompt";
import { reduce, type Action } from "./reducer";
import { activePlan, activeProperty, budgetLines, budgetTotal, linkFor, photosFor, proposalsFor, scopeFor, starredPhoto } from "./select";
import type { CalloutRequest, Photo, State, Zone, ZoneKind } from "./types";

type StoreValue = {
  state: State;
  busyZoneId: string | null;
  dispatch: (action: Action) => void;
  reset: () => void;
  startPlan: (name: string) => void;
  addPhoto: (photo: Photo) => void;
  saveGuides: (zoneId: string, guides: { style?: StyleId; styleNote?: string; budget?: Tier; keep: string[]; replace: string[] }) => void;
  generate: (zoneId: string, options?: { drift?: boolean }) => Promise<{ ok: boolean }>;
  pushProject: () => Promise<{ ok: boolean }>;
  sendCallouts: (zoneIds: string[]) => Promise<{ ok: boolean; blocked: boolean }>;
};

const StoreContext = createContext<StoreValue | null>(null);

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as State;
    if (parsed.version !== 1 || !Array.isArray(parsed.zones) || !Array.isArray(parsed.plans)) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reduce, undefined, load);
  const [busyZoneId, setBusyZoneId] = useState<string | null>(null);
  const ref = useRef(state);
  ref.current = state;
  const dispatch = (action: Action) => {
    ref.current = reduce(ref.current, action);
    rawDispatch(action);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const api: StoreValue = {
      state,
      busyZoneId,
      dispatch,
      reset() {
        dispatch({ type: "replace", state: seed() });
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
        setBusyZoneId(zoneId);
        const result = await generateImage({
          zoneName: zone.name,
          style: link.style,
          styleNote: link.styleNote,
          budget: link.budget,
          keep: link.keep,
          replace: link.replace,
          answers: zone.answers.map((answer) => answer.text),
          drift: Boolean(options?.drift),
          attemptsUsed: link.attempts,
          beforePhotoId: photo.id,
          imageUrl: photo.url,
        });
        setBusyZoneId(null);
        if (!result.ok) {
          dispatch({ type: "generate-failed", planId: plan.id, zoneId });
          return { ok: false };
        }
        dispatch({
          type: "generate-ok",
          proposal: {
            id: `proposal_${crypto.randomUUID()}`,
            planId: plan.id,
            zoneId,
            beforePhotoId: photo.id,
            imageUrl: result.imageUrl,
            createdAt: new Date().toISOString(),
          },
        });
        return { ok: true };
      },
      async pushProject() {
        const current = ref.current;
        const plan = activePlan(current);
        if (!plan) return { ok: false };
        const total = budgetTotal(budgetLines(current, plan));
        try {
          const created = await sampleProjectSource.createRenovationProject({
            propertyId: plan.propertyId,
            planId: plan.id,
            name: plan.name,
            phases: plan.phases
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((phase) => ({ name: phase.name, days: phase.days, startsAfter: phase.startsAfter })),
            estimate: total ? { low: total.low, high: total.high, currency: "ZAR" } : null,
          });
          dispatch({ type: "pushed", planId: plan.id, projectId: created.projectId });
          return { ok: true };
        } catch {
          return { ok: false };
        }
      },
      async sendCallouts(zoneIds) {
        const current = ref.current;
        const plan = activePlan(current);
        if (!plan) return { ok: false, blocked: false };
        const drafts: CalloutRequest[] = [];
        for (const zoneId of zoneIds) {
          const zone = current.zones.find((item) => item.id === zoneId);
          const link = linkFor(current, plan.id, zoneId);
          if (!zone || !link?.approvedProposalId) continue;
          const proposal = proposalsFor(current, plan.id, zoneId).find((item) => item.id === link.approvedProposalId);
          const before = proposal ? current.photos.find((photo) => photo.id === proposal.beforePhotoId) : undefined;
          if (!proposal || !before) continue;
          const scope = scopeFor(current, plan, zone);
          if (!scopeIsClean(scope)) return { ok: false, blocked: true };
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
        if (!drafts.length) return { ok: false, blocked: false };
        try {
          const requests: CalloutRequest[] = [];
          for (const draft of drafts) {
            const sent = await sampleCalloutSource.sendRequest({
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
          return { ok: true, blocked: false };
        } catch {
          return { ok: false, blocked: true };
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
