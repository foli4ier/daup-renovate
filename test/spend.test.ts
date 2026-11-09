import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copy } from "../src/copy.ts";
import { seed } from "../src/data/seed.ts";
import { assessTotal, linesForZone } from "../src/lib/budget.ts";
import { findLeak } from "../src/lib/leak.ts";
import {
  ceilingNote,
  nextReaction,
  phaseSlice,
  phasesAddUpOver,
  placePhaseZones,
  reactionLines,
  type SpendZone,
} from "../src/lib/spend.ts";
import { readOwnerDocument } from "../src/state/persist.ts";
import { reduce } from "../src/state/reducer.ts";
import { scopeFor } from "../src/state/select.ts";
import type { SpendPhase, State } from "../src/state/types.ts";

function spendZones(state: State): SpendZone[] {
  const plan = state.plans[0];
  if (!plan) throw new Error("plan");
  return state.zones
    .filter((zone) => zone.propertyId === plan.propertyId)
    .map((zone) => ({
      id: zone.id,
      name: zone.name,
      key: zone.key,
      sizeM2: zone.sizeM2,
      hidden: zone.hidden,
      skipped: state.links.some((link) => link.planId === plan.id && link.zoneId === zone.id && link.skipped),
    }));
}

describe("available to spend", () => {
  const ready = { ready: true, low: 15000, high: 45000 };

  it("stays quiet until there is a figure, then names which end is past it", () => {
    assert.equal(ceilingNote(ready, undefined), null);
    assert.equal(ceilingNote({ ready: false, low: 0, high: 0 }, 1), null);
    assert.equal(ceilingNote(ready, 45000), null);
    assert.equal(ceilingNote(ready, 50000), null);
    assert.equal(ceilingNote(ready, 15000), copy.highEstimateOver);
    assert.equal(ceilingNote(ready, 20000), copy.highEstimateOver);
    assert.equal(ceilingNote(ready, 14999), copy.estimateOver);
    assert.equal(ceilingNote(ready, 0), copy.estimateOver);
  });

  it("stores a whole-rand ceiling on the plan and clears it without touching tries", () => {
    const state = seed();
    const before = state.links.find((link) => link.zoneId === "zone_front")?.attempts;
    const work = state.plans[0]?.phases.map((phase) => phase.id);
    const set = reduce(state, { type: "set-available", planId: "plan_refresh", amount: 50000 });
    assert.equal(set.plans[0]?.availableToSpend, 50000);
    assert.deepEqual(set.plans[0]?.phases.map((phase) => phase.id), work);
    assert.equal(set.links.find((link) => link.zoneId === "zone_front")?.attempts, before);
    const same = reduce(set, { type: "set-available", planId: "plan_refresh", amount: 50000 });
    assert.equal(same.plans[0], set.plans[0]);
    const cleared = reduce(set, { type: "set-available", planId: "plan_refresh", amount: undefined });
    assert.equal(cleared.plans[0]?.availableToSpend, undefined);
    assert.equal(Object.hasOwn(cleared.plans[0] ?? {}, "availableToSpend"), false);
    const refused = reduce(state, { type: "set-available", planId: "plan_refresh", amount: 1.5 });
    assert.equal(refused.plans[0]?.availableToSpend, undefined);
  });

  it("never puts the ceiling into a zone scope", () => {
    const state = seed();
    const plan = state.plans[0];
    if (!plan) throw new Error("plan");
    plan.availableToSpend = 50000;
    for (const zone of state.zones) {
      const scope = scopeFor(state, plan, zone);
      assert.equal(findLeak(scope), null);
      assert.equal(scope.includes("50,000"), false);
      assert.equal(/available to spend/i.test(scope), false);
    }
  });
});

describe("spend phases", () => {
  it("moves a zone into the phase being saved so the slices do not double-count", () => {
    const state = seed();
    const zones = spendZones(state);
    const first = reduce(state, {
      type: "save-spend-phase",
      planId: "plan_refresh",
      phase: { id: "sp1", name: "Phase 1", order: 1, zoneIds: ["zone_kitchen", "zone_bath"] },
    });
    const second = reduce(first, {
      type: "save-spend-phase",
      planId: "plan_refresh",
      phase: { id: "sp2", name: "Phase 2", order: 2, zoneIds: ["zone_kitchen"] },
    });
    const phases = second.plans[0]?.spendPhases ?? [];
    assert.deepEqual(
      phases.find((phase) => phase.id === "sp1")?.zoneIds,
      ["zone_bath"],
    );
    assert.deepEqual(
      phases.find((phase) => phase.id === "sp2")?.zoneIds,
      ["zone_kitchen"],
    );
    const slices = phases.map((phase) => phaseSlice(zones, phase.zoneIds));
    const once = assessTotal([...linesForZone({ key: "kitchen" }), ...linesForZone({ key: "bath" })]);
    const summed = assessTotal(
      phases.flatMap((phase) => {
        const ids = new Set(phase.zoneIds);
        return zones.filter((zone) => ids.has(zone.id)).flatMap((zone) => linesForZone({ key: zone.key, sizeM2: zone.sizeM2 }));
      }),
    );
    assert.equal(summed.low, once.low);
    assert.equal(summed.high, once.high);
    assert.equal(slices.every((slice) => slice.ready), true);
    assert.equal(phasesAddUpOver(slices, once.high), false);
    assert.equal(phasesAddUpOver(slices, once.high - 1), true);
    assert.equal(phasesAddUpOver(slices, undefined), false);
    assert.equal(second.plans[0]?.phases.some((phase) => phase.name === "Prep"), true);
    assert.equal(second.plans[0]?.phases.some((phase) => phase.name === "Phase 1"), false);
  });

  it("drops an emptied phase and refuses hidden or skipped zones", () => {
    const state = seed();
    const saved = reduce(state, {
      type: "save-spend-phase",
      planId: "plan_refresh",
      phase: { id: "sp1", name: "  Wet areas  ", order: 1, zoneIds: ["zone_bath", "zone_bed1"] },
    });
    assert.equal(saved.plans[0]?.spendPhases?.[0]?.name, "Wet areas");
    assert.deepEqual(saved.plans[0]?.spendPhases?.[0]?.zoneIds, ["zone_bath"]);
    const skipped = reduce(state, { type: "skip-zone", planId: "plan_refresh", zoneId: "zone_kitchen" });
    const refused = reduce(skipped, {
      type: "save-spend-phase",
      planId: "plan_refresh",
      phase: { id: "sp2", name: "Phase 2", order: 2, zoneIds: ["zone_kitchen"] },
    });
    assert.equal(refused.plans[0]?.spendPhases, undefined);
    const both = reduce(saved, {
      type: "save-spend-phase",
      planId: "plan_refresh",
      phase: { id: "sp2", name: "Phase 2", order: 2, zoneIds: ["zone_bath"] },
    });
    assert.deepEqual(
      (both.plans[0]?.spendPhases ?? []).map((phase) => phase.id),
      ["sp2"],
    );
  });

  it("withholds a phase total while a size is missing", () => {
    const zones = spendZones(seed());
    const slice = phaseSlice(zones, ["zone_living"]);
    assert.equal(slice.names.join(" · "), "Living area");
    assert.equal(slice.ready, false);
    assert.equal(slice.needsSize, true);
    const sized = phaseSlice(
      zones.map((zone) => (zone.id === "zone_living" ? { ...zone, sizeM2: 10 } : zone)),
      ["zone_living"],
    );
    assert.equal(sized.ready, true);
    assert.equal(sized.needsSize, false);
    const blocked = [{ ...sized, needsSize: true, ready: false, high: 999 }];
    assert.equal(phasesAddUpOver([...blocked, sized], 1), false);
  });

  it("reorders spend phases without becoming the work list", () => {
    let state = seed();
    const make = (phase: SpendPhase) => reduce(state, { type: "save-spend-phase", planId: "plan_refresh", phase });
    state = make({ id: "sp1", name: "Phase 1", order: 1, zoneIds: ["zone_bath"] });
    state = make({ id: "sp2", name: "Phase 2", order: 2, zoneIds: ["zone_kitchen"] });
    const moved = reduce(state, { type: "move-spend-phase", planId: "plan_refresh", phaseId: "sp2", direction: "up" });
    const names = (moved.plans[0]?.spendPhases ?? []).slice().sort((a, b) => a.order - b.order).map((phase) => phase.name);
    assert.deepEqual(names, ["Phase 2", "Phase 1"]);
    const stuck = reduce(moved, { type: "move-spend-phase", planId: "plan_refresh", phaseId: "sp2", direction: "up" });
    assert.equal(stuck.plans[0]?.spendPhases, moved.plans[0]?.spendPhases);
    assert.equal(placePhaseZones([], { id: "sp", name: " ", order: 1, zoneIds: ["zone_bath"] }).length, 0);
  });
});

describe("after reactions", () => {
  it("switches, clears, and lists more than one name without using a try", () => {
    const state = seed();
    const attempts = state.links.find((link) => link.zoneId === "zone_front")?.attempts;
    const like = {
      type: "set-reaction" as const,
      planId: "plan_refresh",
      zoneId: "zone_front",
      proposalId: "prop_front",
      personId: "owner_you",
      name: "",
      kind: "like" as const,
    };
    const liked = reduce(state, like);
    const withSam = reduce(liked, { ...like, personId: "sam", name: "Sam", kind: "like" });
    const withLebo = reduce(withSam, { ...like, personId: "lebo", name: "Lebo", kind: "like" });
    const withAlex = reduce(withLebo, { ...like, personId: "alex", name: "Alex", kind: "dislike" });
    assert.deepEqual(reactionLines(withAlex.proposals.find((item) => item.id === "prop_front")?.reactions, "owner_you"), {
      liked: "Liked by you, Sam, and Lebo.",
      disliked: "Disliked by Alex.",
    });
    const switched = reduce(withAlex, { ...like, kind: "dislike" });
    const afterSwitch = switched.proposals.find((item) => item.id === "prop_front")?.reactions ?? [];
    assert.equal(afterSwitch.filter((item) => item.personId === "owner_you").length, 1);
    assert.equal(afterSwitch.find((item) => item.personId === "owner_you")?.kind, "dislike");
    assert.equal(reactionLines(afterSwitch, "owner_you").disliked, "Disliked by you and Alex.");
    const cleared = reduce(switched, { ...like, kind: null });
    const rest = cleared.proposals.find((item) => item.id === "prop_front")?.reactions ?? [];
    assert.equal(rest.some((item) => item.personId === "owner_you"), false);
    assert.equal(reactionLines(rest, "owner_you").liked, "Liked by Sam and Lebo.");
    assert.equal(reactionLines(undefined, "owner_you").liked, null);
    assert.equal(reactionLines([], "owner_you").disliked, null);
    assert.equal(nextReaction("like", "like"), null);
    assert.equal(nextReaction("like", "dislike"), "dislike");
    assert.equal(nextReaction(undefined, "like"), "like");
    assert.equal(cleared.links.find((link) => link.zoneId === "zone_front")?.attempts, attempts);
    const uploaded = reduce(state, {
      type: "set-reaction",
      planId: "plan_refresh",
      zoneId: "zone_front",
      proposalId: "prop_front",
      personId: "owner_you",
      name: "",
      kind: "like",
    });
    const picture = uploaded.proposals.find((item) => item.id === "prop_front");
    picture && (picture.source = "uploaded");
    const again = reduce(uploaded, { ...like, kind: null });
    assert.equal(again.proposals.find((item) => item.id === "prop_front")?.reactions, undefined);
    assert.equal(again.links.find((link) => link.zoneId === "zone_front")?.attempts, attempts);
  });

  it("round-trips on a version 2 owner document and ignores a sample session", () => {
    const state = seed();
    state.sample = false;
    const plan = state.plans[0];
    const picture = state.proposals[0];
    if (!plan || !picture) throw new Error("seed");
    plan.availableToSpend = 50000;
    plan.spendPhases = [{ id: "sp1", name: "Phase 1", order: 1, zoneIds: ["zone_bath"] }];
    picture.reactions = [{ personId: "owner_you", name: "", kind: "like" }];
    const opened = readOwnerDocument(JSON.parse(JSON.stringify(state)));
    assert.ok(opened);
    assert.equal(opened.version, 2);
    assert.equal(opened.plans[0]?.availableToSpend, 50000);
    assert.equal(opened.plans[0]?.spendPhases?.[0]?.name, "Phase 1");
    assert.equal(opened.plans[0]?.phases.some((phase) => phase.name === "Prep"), true);
    assert.equal(opened.proposals[0]?.reactions?.[0]?.kind, "like");
    assert.equal(readOwnerDocument({ ...state, sample: true }), null);
  });
});
