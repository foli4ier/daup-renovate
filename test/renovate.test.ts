import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copy } from "../src/copy.ts";
import { seed } from "../src/data/seed.ts";
import { linesForZone, totalRange } from "../src/lib/budget.ts";
import { findLeak } from "../src/lib/leak.ts";
import { buildEditPrompt } from "../src/lib/prompt.ts";
import { buildZoneScope } from "../src/lib/scope.ts";
import { nextStep, pillOf } from "../src/lib/status.ts";
import { reduce } from "../src/state/reducer.ts";
import { scopeFor } from "../src/state/select.ts";

describe("callout leak check", () => {
  it("blocks amounts, ranges, and budget words", () => {
    assert.equal(findLeak("Paint the walls."), null);
    assert.equal(findLeak("Keep the low border and the roof line."), null);
    assert.equal(findLeak("House number 17 stays."), null);
    assert.equal(findLeak("R250"), "amount");
    assert.equal(findLeak("about R 1,500 for paint"), "amount");
    assert.equal(findLeak("250–450"), "range");
    assert.equal(findLeak("250-450"), "range");
    assert.equal(findLeak("a tight budget"), "budget-word");
    assert.equal(findLeak("this estimate"), "budget-word");
    assert.equal(findLeak("no price here"), "budget-word");
    assert.equal(findLeak("CAPEX project"), "budget-word");
    assert.equal(findLeak("Quote only"), "budget-word");
  });

  it("keeps seeded zone scopes free of amounts", () => {
    const state = seed();
    const plan = state.plans[0];
    assert.ok(plan);
    for (const zone of state.zones) {
      const scope = scopeFor(state, plan, zone);
      assert.equal(findLeak(scope), null, scope);
      assert.equal(/budget|price|estimate|quote|R\d|CAPEX/i.test(scope), false, scope);
    }
  });

  it("does not put the style name Budget refresh into a request", () => {
    const scope = buildZoneScope({
      zoneName: "Bathroom 1",
      style: "budget-refresh",
      keep: ["The bath"],
      replace: ["Old tiles"],
      answers: [],
    });
    assert.equal(scope.includes("Budget"), false);
    assert.equal(findLeak(scope), null);
  });
});

describe("image prompt", () => {
  it("asks klein to keep the camera view without money words", () => {
    const prompt = buildEditPrompt({
      zoneName: "Kitchen",
      style: "modern",
      budget: "high",
      keep: ["Floor tiles"],
      replace: ["Dark cabinets"],
      answers: ["Home kitchen."],
      drift: true,
    });
    assert.match(prompt, /camera/i);
    assert.equal(findLeak(prompt), null);
  });
});

describe("estimate", () => {
  it("leaves per-m² lines out of the total until there is a size", () => {
    const lines = [
      ...linesForZone({ key: "living" }),
      ...linesForZone({ key: "kitchen" }),
      ...linesForZone({ key: "front" }),
    ];
    const total = totalRange(lines);
    assert.deepEqual(total, { low: 1500 + 45000, high: 6000 + 150000 });
    assert.equal(lines.some((line) => line.needsSize), true);
    assert.equal(lines.some((line) => line.quoteOnly), true);
  });

  it("uses the size once the owner adds it", () => {
    const lines = linesForZone({ key: "living", sizeM2: 10 });
    const total = totalRange(lines);
    assert.deepEqual(total, {
      low: 30 * 10 + 250 * 10 + 1500,
      high: 60 * 10 + 450 * 10 + 6000,
    });
  });

  it("does not use the small-bathroom guide above 5 m²", () => {
    const lines = linesForZone({ key: "bath", sizeM2: 8 });
    assert.equal(lines[0]?.quoteOnly, true);
    assert.equal(totalRange(lines), null);
  });
});

describe("next step", () => {
  it("reviews the first open zone, then the budget", () => {
    const link = { skipped: false, questionsPending: false, proposalIds: ["p"], attempts: 1 };
    const step = nextStep({
      hasPlan: true,
      status: "draft",
      phasesApproved: false,
      approvedSent: false,
      zones: [
        { id: "front", name: "Front yard", hidden: false, order: 1, beforeCount: 1, link },
        { id: "back", name: "Back yard", hidden: false, order: 2, beforeCount: 0, link: { ...link, proposalIds: [] } },
      ],
    });
    assert.equal(step.label, "Review Front yard.");
    const done = nextStep({
      hasPlan: true,
      status: "draft",
      phasesApproved: false,
      approvedSent: false,
      zones: [
        { id: "front", name: "Front yard", hidden: false, order: 1, beforeCount: 1, link: { ...link, approvedProposalId: "p" } },
        { id: "back", name: "Back yard", hidden: false, order: 2, beforeCount: 0, link: { ...link, skipped: true, proposalIds: [] } },
      ],
    });
    assert.equal(done.label, copy.seeBudget);
  });

  it("sends to CallOut only after the plan is in Project", () => {
    const step = nextStep({
      hasPlan: true,
      status: "in-project",
      phasesApproved: true,
      approvedSent: false,
      zones: [],
    });
    assert.equal(step.label, copy.sendNext);
  });
});

describe("zone changes", () => {
  it("keeps photos when two zones merge", () => {
    const state = seed();
    const next = reduce(state, { type: "merge-zones", sourceId: "zone_kitchen", targetId: "zone_living" });
    const photos = next.photos.filter((photo) => photo.zoneId === "zone_living").map((photo) => photo.sourceName);
    assert.ok(photos.includes("Kombuis__kitchen_3.jpeg"));
    assert.ok(photos.includes("Kombuis__kitchen_1.jpeg"));
    assert.equal(next.zones.some((zone) => zone.id === "zone_kitchen"), false);
  });

  it("hides a zone without deleting its photos", () => {
    const state = seed();
    const next = reduce(state, { type: "hide-zone", zoneId: "zone_kitchen", hidden: true });
    assert.equal(next.zones.find((zone) => zone.id === "zone_kitchen")?.hidden, true);
    assert.equal(next.photos.filter((photo) => photo.zoneId === "zone_kitchen").length, 2);
  });

  it("does not count a failed picture toward the cap", () => {
    const state = seed();
    const before = state.links.find((link) => link.zoneId === "zone_front");
    const failed = reduce(state, { type: "generate-failed", planId: "plan_refresh", zoneId: "zone_front" });
    const after = failed.links.find((link) => link.zoneId === "zone_front");
    assert.equal(after?.attempts, before?.attempts);
    assert.equal(after?.lastFailed, true);
    assert.equal(pillOf({ skipped: false, questionsPending: false, proposalIds: [], attempts: 0 }, 1), "ready");
  });
});

describe("owner copy", () => {
  const buttons = [
    copy.continue,
    copy.startPlan,
    copy.generate,
    copy.approve,
    copy.seePlan,
    copy.approvePlan,
    copy.push,
    copy.send,
    copy.preview,
    copy.skipZone,
    copy.answer,
    copy.openHub,
    copy.openProperty,
    copy.done,
    copy.back,
  ];
  it("ends buttons with a full stop", () => {
    for (const label of buttons) assert.match(label, /\.$/);
  });
  it("never says CAPEX", () => {
    assert.equal(JSON.stringify(copy).toLowerCase().includes("capex"), false);
  });
});
