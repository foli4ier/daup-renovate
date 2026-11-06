import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copy } from "../src/copy.ts";
import { seed } from "../src/data/seed.ts";
import { propertyZones } from "../src/state/select.ts";
import { answersForSkip } from "../src/data/questions.ts";
import { assessTotal, linesForZone } from "../src/lib/budget.ts";
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
    assert.equal(findLeak("R  250"), "amount");
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
  it("withholds the plan total while a size is missing", () => {
    const lines = [
      ...linesForZone({ key: "living" }),
      ...linesForZone({ key: "kitchen" }),
      ...linesForZone({ key: "front" }),
    ];
    const report = assessTotal(lines);
    assert.equal(report.ready, false);
    assert.ok(report.needsSize > 0);
    assert.ok(report.quoteOnly > 0);
  });

  it("adds up only after every sized line has a size, and leaves quote-only out", () => {
    const lines = [
      ...linesForZone({ key: "living", sizeM2: 10 }),
      ...linesForZone({ key: "kitchen" }),
      ...linesForZone({ key: "front", sizeM2: 20 }),
    ];
    const report = assessTotal(lines);
    assert.equal(report.ready, true);
    assert.equal(report.quoteOnly, 1);
    assert.equal(report.low, 30 * 10 + 250 * 10 + 1500 + 45000 + 40 * 20);
    assert.equal(report.high, 60 * 10 + 450 * 10 + 6000 + 150000 + 100 * 20);
  });

  it("does not use the small-bathroom guide above 5 m²", () => {
    const lines = linesForZone({ key: "bath", sizeM2: 8 });
    assert.equal(lines[0]?.quoteOnly, true);
    assert.equal(assessTotal(lines).ready, false);
  });
});

describe("questions", () => {
  it("keeps answers already given and guesses only blanks", () => {
    const answers = answersForSkip(
      "back",
      [{ id: "ground" }, { id: "wall" }],
      [{ questionId: "ground", text: "Concrete." }],
      null,
    );
    assert.equal(answers[0]?.text, "Concrete.");
    assert.equal(answers[1]?.text, "Repaint it.");
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

  it("keeps outside zones first after a kind change", () => {
    const state = seed();
    const changed = reduce(state, { type: "set-zone-kind", zoneId: "zone_sun", kind: "outside" });
    const names = propertyZones(changed, "prop_esseboom")
      .filter((zone) => !zone.hidden)
      .map((zone) => zone.name);
    assert.deepEqual(names.slice(0, 4), ["Front yard", "Back yard", "Side yard", "Sun room (stoep)"]);
  });

  it("pairs the kitchen proposal with the starred cabinet wall", () => {
    const state = seed();
    const proposal = state.proposals.find((item) => item.zoneId === "zone_kitchen");
    const starred = state.photos.find((photo) => photo.zoneId === "zone_kitchen" && photo.starred);
    assert.equal(proposal?.beforePhotoId, starred?.id);
    assert.equal(starred?.sourceName, "Kombuis__kitchen_3.jpeg");
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
    copy.tryAgain,
    "Budget refresh.",
    "Modern.",
    "Keep character.",
    "Low.",
    "Mid.",
    "High.",
  ];
  it("ends buttons with a full stop", () => {
    for (const label of buttons) assert.match(label, /\.$/);
  });
  it("never says CAPEX", () => {
    assert.equal(JSON.stringify(copy).toLowerCase().includes("capex"), false);
  });
  it("uses the locked impression line", () => {
    assert.equal(copy.impression, "After-images are AI impressions, not designs; proportions and details may differ.");
  });
});
