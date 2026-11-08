import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copy } from "../src/copy.ts";
import { seed } from "../src/data/seed.ts";
import { continuePath, propertyZones, visibleZones, zoneListLabel, zonePath } from "../src/state/select.ts";
import { answersForSkip, needsQuestions, questionsFor } from "../src/data/questions.ts";
import { assessTotal, linesForZone } from "../src/lib/budget.ts";
import { findLeak, threadLeak } from "../src/lib/leak.ts";
import { buildEditPrompt } from "../src/lib/prompt.ts";
import { buildZoneScope } from "../src/lib/scope.ts";
import { nextStep, pillOf, stepRail } from "../src/lib/status.ts";
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

  it("asks on the first generate only, then uses the saved answers", () => {
    assert.equal(needsQuestions("front", []), true);
    assert.equal(needsQuestions("kitchen", [{ questionId: "use", text: "Home kitchen." }]), false);
    assert.equal(needsQuestions("kitchen", []), true);
  });

  it("keeps question prompts free of prices", () => {
    for (const key of ["living", "kitchen", "front", "bath", "back", "side", "sun", "bed1", "custom"]) {
      for (const question of questionsFor(key)) {
        assert.equal(threadLeak(question.prompt), null, question.prompt);
        for (const option of question.options) assert.equal(threadLeak(option), null, option);
      }
    }
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

  it("puts a named zone in its group, or at the end when inside or outside was not picked", () => {
    const state = seed();
    const outside = reduce(state, {
      type: "add-zone",
      zone: {
        id: "zone_patio",
        propertyId: "prop_esseboom",
        key: "custom_patio",
        name: "Patio",
        kind: "outside",
        order: 20,
        hidden: false,
        answers: [],
      },
    });
    const outsideNames = propertyZones(outside, "prop_esseboom")
      .filter((zone) => !zone.hidden)
      .map((zone) => zone.name);
    assert.ok(outsideNames.indexOf("Patio") > outsideNames.indexOf("Side yard"));
    assert.ok(outsideNames.indexOf("Patio") < outsideNames.indexOf("Living area"));
    const unnamed = reduce(state, {
      type: "add-zone",
      zone: {
        id: "zone_loft",
        propertyId: "prop_esseboom",
        key: "custom_loft",
        name: "Loft",
        order: 21,
        hidden: false,
        answers: [],
      },
    });
    const end = propertyZones(unnamed, "prop_esseboom")
      .filter((zone) => !zone.hidden)
      .map((zone) => zone.name);
    assert.equal(end.at(-1), "Loft");
  });

  it("keeps the last before once an after exists", () => {
    const state = seed();
    const blocked = reduce(state, { type: "remove-photo", photoId: "photo_front" });
    assert.equal(blocked.photos.some((photo) => photo.id === "photo_front"), true);
    const one = reduce(state, { type: "remove-photo", photoId: "photo_sink" });
    assert.equal(one.photos.some((photo) => photo.id === "photo_sink"), false);
    const last = reduce(one, { type: "remove-photo", photoId: "photo_cabinets" });
    assert.equal(last.photos.some((photo) => photo.id === "photo_cabinets"), true);
  });

  it("continues the last zone, and opens the plan before any zone is opened", () => {
    const state = seed();
    assert.equal(continuePath(state), "/gallery/zone_kitchen");
    assert.equal(zonePath(state, "plan_refresh", "zone_back"), "/zone/zone_back");
    const fresh = reduce(state, { type: "visit-zone", planId: "plan_refresh", zoneId: "" });
    const cleared = {
      ...fresh,
      plans: fresh.plans.map((plan) => (plan.id === "plan_refresh" ? { ...plan, lastZoneId: undefined } : plan)),
    };
    assert.equal(continuePath(cleared), "/plan");
  });

  it("shows See budget only when every visible zone is approved or skipped", () => {
    const state = seed();
    assert.equal(zoneListLabel(state), null);
    let next = state;
    for (const zone of visibleZones(state, "prop_esseboom")) {
      next = reduce(next, { type: "skip-zone", planId: "plan_refresh", zoneId: zone.id });
    }
    assert.equal(zoneListLabel(next), copy.seeBudget);
    assert.equal(next.zones.some((zone) => zone.hidden && !next.links.find((link) => link.zoneId === zone.id)?.skipped), true);
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

  it("rails Photos, After, and Approved", () => {
    const states = (pill: Parameters<typeof stepRail>[0]) => stepRail(pill).map((step) => step.state);
    assert.deepEqual(stepRail("review").map((step) => step.label), ["Photos", "After", "Approved"]);
    assert.deepEqual(states("needs-photos"), ["active", "future", "future"]);
    assert.deepEqual(states("ready"), ["done", "active", "future"]);
    assert.deepEqual(states("questions"), ["done", "active", "future"]);
    assert.deepEqual(states("review"), ["done", "done", "active"]);
    assert.deepEqual(states("approved"), ["done", "done", "done"]);
    assert.deepEqual(states("skipped"), ["quiet", "quiet", "quiet"]);
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
    copy.edit,
    copy.addAfter,
    copy.remove,
    copy.hub,
    copy.chat,
    copy.sendMessage,
    copy.addPhotos,
    copy.addZone,
    copy.seeAfters,
    copy.seeBudget,
    copy.approved,
    copy.wereOn("Kitchen"),
    copy.uploadAfter,
    copy.generateAfter,
    copy.fromYourAfter,
    copy.fromZone("Front yard"),
    copy.useLook,
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
  it("uses the workspace labels", () => {
    assert.equal(copy.addZone, "Add a zone.");
    assert.equal(copy.addPhotos, "Add photos.");
    assert.equal(copy.seeAfters, "See afters.");
    assert.equal(copy.seeBudget, "See budget.");
    assert.equal(copy.tryAgain, "Try again.");
    assert.equal(copy.edit, "Edit.");
    assert.equal(copy.addAfter, "Add an after.");
    assert.equal(copy.hub, "Hub.");
    assert.equal(copy.chat, "Chat.");
    assert.equal(copy.sendMessage, "Send.");
    assert.equal(copy.approved, "Approved.");
    assert.equal(copy.wereOn("Kitchen"), "You were on Kitchen.");
    assert.equal(copy.sixLimit, "You already have six photos. Remove one to add another.");
    assert.equal(copy.keepBefore, "Keep at least one before — CallOut needs it.");
  });
});

describe("zone thread", () => {
  it("asks the zone questions as messages and keeps a saved answer", () => {
    const seeded = reduce(seed(), {
      type: "seed-thread",
      zoneId: "zone_sun",
      ownerId: "owner_you",
      now: "2026-11-08T06:05:00.000Z",
    });
    const sun = seeded.messages.filter((message) => message.zoneId === "zone_sun");
    assert.equal(sun[0]?.text, "What should the floor become?");
    assert.deepEqual(sun[0]?.chips, ["Vinyl plank.", "Keep the carpet.", "Not sure."]);
    assert.equal(sun[1]?.text, "Keep the wooden frames?");
    const again = reduce(seeded, {
      type: "seed-thread",
      zoneId: "zone_sun",
      ownerId: "owner_you",
      now: "2026-11-08T06:06:00.000Z",
    });
    assert.equal(again, seeded);

    const kitchen = reduce(seed(), {
      type: "seed-thread",
      zoneId: "zone_kitchen",
      ownerId: "owner_you",
      now: "2026-11-08T06:05:00.000Z",
    }).messages.filter((message) => message.zoneId === "zone_kitchen");
    assert.equal(kitchen[0]?.questionId, "use");
    assert.equal(kitchen[1]?.text, "Home kitchen.");
    assert.equal(kitchen[1]?.authorId, "owner_you");
    assert.equal(kitchen[2]?.questionId, "tiles");
  });

  it("refuses a price in the thread and does not save it as an answer", () => {
    const seeded = reduce(seed(), {
      type: "seed-thread",
      zoneId: "zone_sun",
      ownerId: "owner_you",
      now: "2026-11-08T06:05:00.000Z",
    });
    const blocked = reduce(seeded, {
      type: "post-message",
      id: "msg_leak",
      zoneId: "zone_sun",
      authorId: "owner_you",
      text: "About R250 for the floor",
      createdAt: "2026-11-08T06:06:00.000Z",
      questionId: "floor",
    });
    assert.equal(blocked, seeded);
    assert.equal(findLeak("a tight budget"), "budget-word");
    const posted = reduce(seeded, {
      type: "post-message",
      id: "msg_floor",
      zoneId: "zone_sun",
      authorId: "owner_you",
      text: "Vinyl plank.",
      createdAt: "2026-11-08T06:06:00.000Z",
      questionId: "floor",
    });
    const sun = posted.zones.find((zone) => zone.id === "zone_sun");
    assert.equal(sun?.answers.find((answer) => answer.questionId === "floor")?.text, "Vinyl plank.");
    const reply = posted.messages.find((message) => message.id === "msg_floor");
    assert.equal(reply?.authorId, "owner_you");
    assert.equal(reply?.text, "Vinyl plank.");
  });
});

describe("remove an after", () => {
  it("gives back a generated try and clears approval", () => {
    let state = reduce(seed(), { type: "approve", planId: "plan_refresh", zoneId: "zone_front", proposalId: "prop_front" });
    state = reduce(state, { type: "remove-proposal", planId: "plan_refresh", zoneId: "zone_front", proposalId: "prop_front" });
    const link = state.links.find((item) => item.zoneId === "zone_front");
    assert.equal(link?.attempts, 0);
    assert.equal(link?.approvedProposalId, undefined);
    assert.equal(link?.proposalIds.includes("prop_front"), false);
    assert.equal(state.proposals.some((item) => item.id === "prop_front"), false);
    assert.equal(state.photos.some((item) => item.id === "photo_front"), true);
  });
});
