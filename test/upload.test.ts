import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copy, galleryRetryLabel } from "../src/copy.ts";
import { styleLabel } from "../src/data/guides.ts";
import { seed } from "../src/data/seed.ts";
import { whatChanges } from "../src/lib/changes.ts";
import { findLeak } from "../src/lib/leak.ts";
import { canFollowSharedLook } from "../src/lib/look.ts";
import { ABOUT_ONE_MEGAPIXEL, buildEditPrompt, triesLeft, withStyleReference } from "../src/lib/prompt.ts";
import { alignChips, canOfferAfterUpload, describePrompt, parseReading, READ_FALLBACK, usableRead } from "../src/lib/reading.ts";
import { buildZoneScope } from "../src/lib/scope.ts";
import { pillOf } from "../src/lib/status.ts";
import { reduce } from "../src/state/reducer.ts";
import type { Proposal } from "../src/state/types.ts";

const PLAN = "plan_refresh";
const READ = "White paint, lighter stone, pale timber, and a planted front garden. Keeps the house shape and the chimney.";

function upload(zoneId: string, id: string, width = 512, height = 382): Proposal {
  return {
    id,
    planId: PLAN,
    zoneId,
    beforePhotoId: "photo_front",
    imageUrl: `data:image/jpeg;base64,${id}`,
    createdAt: "2026-11-07T05:00:00.000Z",
    source: "uploaded",
    width,
    height,
  };
}

describe("uploaded after", () => {
  it("does not offer an upload without a before", () => {
    assert.equal(canOfferAfterUpload(0), false);
    assert.equal(canOfferAfterUpload(1), true);
    const state = seed();
    const next = reduce(state, {
      type: "upload-ok",
      proposal: upload("zone_back", "up_back"),
      description: READ,
      keep: ["House shape"],
      replace: ["Patchy lawn"],
    });
    assert.equal(next.proposals.some((item) => item.id === "up_back"), false);
    assert.equal(next, state);
  });

  it("warns on a small after and still keeps the picture", () => {
    assert.ok(512 * 382 < ABOUT_ONE_MEGAPIXEL);
    assert.equal(
      copy.smallAfter(512, 382),
      "This picture is small (512 × 382). It will look soft – use it anyway if that is what you have.",
    );
    const state = seed();
    const next = reduce(state, {
      type: "upload-ok",
      proposal: upload("zone_front", "up_front", 512, 382),
      description: READ,
      keep: ["House shape", "Chimney"],
      replace: ["Beige paint"],
    });
    const picture = next.proposals.find((item) => item.id === "up_front");
    assert.equal(picture?.source, "uploaded");
    assert.equal(picture?.width, 512);
    assert.equal(picture?.height, 382);
    assert.ok(picture && picture.width * picture.height < ABOUT_ONE_MEGAPIXEL);
  });

  it("does not spend a generated try", () => {
    const state = seed();
    const before = state.links.find((link) => link.zoneId === "zone_front");
    assert.ok(before);
    const next = reduce(state, {
      type: "upload-ok",
      proposal: upload("zone_front", "up_front"),
      description: READ,
      keep: [],
      replace: [],
    });
    const after = next.links.find((link) => link.zoneId === "zone_front");
    assert.equal(after?.attempts, before.attempts);
    assert.equal(triesLeft(after?.attempts ?? 0), triesLeft(before.attempts));
    assert.ok(after?.proposalIds.includes("up_front"));
    assert.equal(galleryRetryLabel(after?.attempts ?? 0, true), copy.edit);
    assert.equal(galleryRetryLabel(0, true), copy.edit);
    assert.equal(copy.edit, "Edit.");
  });

  it("removes an uploaded after without giving back or spending a try", () => {
    const state = seed();
    const withUpload = reduce(state, {
      type: "upload-ok",
      proposal: upload("zone_front", "up_front"),
      description: READ,
      keep: [],
      replace: [],
    });
    const attempts = withUpload.links.find((link) => link.zoneId === "zone_front")?.attempts;
    const removed = reduce(withUpload, { type: "remove-proposal", planId: PLAN, zoneId: "zone_front", proposalId: "up_front" });
    const link = removed.links.find((item) => item.zoneId === "zone_front");
    assert.equal(link?.attempts, attempts);
    assert.equal(removed.proposals.some((item) => item.id === "up_front"), false);
    assert.equal(removed.proposals.some((item) => item.id === "prop_front"), true);
  });

  it("can be approved without a generated picture", () => {
    const state = seed();
    const withUpload = reduce(state, {
      type: "upload-ok",
      proposal: upload("zone_front", "up_front"),
      description: READ,
      keep: [],
      replace: [],
    });
    const approved = reduce(withUpload, { type: "approve", planId: PLAN, zoneId: "zone_front", proposalId: "up_front" });
    const link = approved.links.find((item) => item.zoneId === "zone_front");
    assert.equal(link?.approvedProposalId, "up_front");
    assert.equal(link?.attempts, 1);
    assert.equal(pillOf({ skipped: false, questionsPending: false, proposalIds: link?.proposalIds ?? [], attempts: link?.attempts ?? 0, approvedProposalId: "up_front" }, 1), "approved");
  });

  it("copies the look, not the budget or the keep and replace list", () => {
    const state = seed();
    const next = reduce(state, {
      type: "upload-ok",
      proposal: upload("zone_front", "up_front"),
      description: READ,
      keep: ["House shape", "Chimney"],
      replace: ["Patchy lawn"],
    });
    const source = next.links.find((link) => link.zoneId === "zone_front");
    const back = next.links.find((link) => link.zoneId === "zone_back");
    const kitchen = next.links.find((link) => link.zoneId === "zone_kitchen");
    assert.equal(source?.shareLook, true);
    assert.equal(source?.style, "from-after");
    assert.equal(source?.budget, "mid");
    assert.equal(styleLabel("from-after"), "From your after.");
    assert.ok(source?.keep.includes("House shape"));
    assert.ok(source?.replace.includes("Patchy lawn"));
    assert.equal(back?.style, "from-after");
    assert.equal(back?.styleFromZoneId, "zone_front");
    assert.equal(back?.styleNote, READ);
    assert.equal(back?.styleReferenceProposalId, "up_front");
    assert.equal(back?.budget, undefined);
    assert.deepEqual(back?.keep, []);
    assert.deepEqual(back?.replace, []);
    assert.equal(styleLabel("from-after", READ, "Front yard"), "From Front yard.");
    assert.equal(kitchen?.style, "modern");
    assert.equal(kitchen?.budget, "high");
    assert.deepEqual(kitchen?.keep, ["Floor tiles", "Window frames"]);
    assert.deepEqual(kitchen?.replace, ["Dark cabinets", "Cluttered worktops"]);
    assert.equal(canFollowSharedLook(kitchen!, "zone_side"), false);
  });

  it("keeps the upload when a later picture is generated", () => {
    const state = seed();
    const withUpload = reduce(state, {
      type: "upload-ok",
      proposal: upload("zone_front", "up_front"),
      description: READ,
      keep: [],
      replace: [],
    });
    const generated = reduce(withUpload, {
      type: "generate-ok",
      proposal: {
        id: "gen_front",
        planId: PLAN,
        zoneId: "zone_front",
        beforePhotoId: "photo_front",
        imageUrl: "/esseboom/front-yard-after.svg",
        createdAt: "2026-11-07T05:05:00.000Z",
        source: "generated",
      },
    });
    const link = generated.links.find((item) => item.zoneId === "zone_front");
    assert.deepEqual(link?.proposalIds.slice(-2), ["up_front", "gen_front"]);
    assert.equal(link?.attempts, 2);
    assert.equal(generated.proposals.filter((item) => item.zoneId === "zone_front" && item.source === "uploaded").length, 1);
    const approved = reduce(generated, { type: "approve", planId: PLAN, zoneId: "zone_front", proposalId: "gen_front" });
    const chosen = approved.links.find((item) => item.zoneId === "zone_front");
    assert.equal(chosen?.approvedProposalId, "gen_front");
    assert.ok(chosen?.proposalIds.includes("up_front"));
    assert.ok(chosen?.proposalIds.includes("gen_front"));
  });

  it("does not overwrite a zone that picked its own style chip", () => {
    let state = seed();
    state = reduce(state, {
      type: "upload-ok",
      proposal: upload("zone_front", "up_front"),
      description: READ,
      keep: ["House shape"],
      replace: ["Patchy lawn"],
    });
    state = reduce(state, {
      type: "set-guides",
      planId: PLAN,
      zoneId: "zone_back",
      style: "modern",
      styleNote: "",
      budget: "low",
      keep: [],
      replace: [],
    });
    state = reduce(state, {
      type: "add-photo",
      photo: {
        id: "photo_side",
        zoneId: "zone_side",
        url: "/esseboom/front-yard-before.svg",
        width: 1200,
        height: 900,
        starred: true,
      },
    });
    state = reduce(state, {
      type: "upload-ok",
      proposal: { ...upload("zone_side", "up_side", 1200, 900), beforePhotoId: "photo_side" },
      description: "Pale walls and a timber door.",
      keep: ["The path"],
      replace: ["The old gate"],
    });
    const back = state.links.find((link) => link.zoneId === "zone_back");
    const kitchen = state.links.find((link) => link.zoneId === "zone_kitchen");
    const sun = state.links.find((link) => link.zoneId === "zone_sun");
    const front = state.links.find((link) => link.zoneId === "zone_front");
    const side = state.links.find((link) => link.zoneId === "zone_side");
    assert.equal(side?.shareLook, true);
    assert.equal(front?.shareLook, false);
    assert.equal(front?.style, "from-after");
    assert.equal(front?.readLine, READ);
    assert.equal(back?.style, "modern");
    assert.equal(back?.budget, "low");
    assert.deepEqual(back?.keep, []);
    assert.equal(kitchen?.style, "modern");
    assert.equal(kitchen?.budget, "high");
    assert.equal(sun?.style, "from-after");
    assert.equal(sun?.styleFromZoneId, "zone_side");
    assert.equal(sun?.styleNote, "Pale walls and a timber door.");
    assert.equal(sun?.budget, undefined);
    assert.deepEqual(sun?.keep, []);
    assert.deepEqual(sun?.replace, []);
    assert.equal(styleLabel("from-after", sun?.styleNote, "Side yard"), "From Side yard.");
  });
});

describe("reading an after", () => {
  it("parses a model reading and drops a leak", () => {
    const reading = parseReading(`{"description":"${READ}","keep":["House shape","Chimney"],"replace":["beige paint"]}`);
    assert.equal(reading?.description, READ);
    assert.deepEqual(alignChips(reading?.replace ?? [], ["Beige paint", "Patchy lawn"]), ["Beige paint"]);
    assert.equal(parseReading("no json here"), null);
    assert.equal(parseReading('{"description":"About R250 of paint.","keep":[],"replace":[]}'), null);
    assert.equal(usableRead(READ_FALLBACK), "");
    assert.equal(findLeak(describePrompt("Front yard")), null);
    assert.equal(describePrompt("Front yard").includes("houseRedeem"), false);
  });

  it("lists the read line with keep and replace, and leaves the fallback out", () => {
    const lines = whatChanges({ read: READ, keep: ["House shape"], replace: ["Beige paint"] });
    assert.equal(lines[0], READ);
    assert.ok(lines.includes("Repaint the beige walls."));
    assert.ok(lines.includes("Keep House shape."));
    assert.deepEqual(whatChanges({ read: READ_FALLBACK, keep: [], replace: [] }), []);
  });

  it("keeps the uploaded note off money words in the scope and the edit prompt", () => {
    const scope = buildZoneScope({
      zoneName: "Front yard",
      style: "from-after",
      styleNote: READ,
      keep: ["House shape"],
      replace: ["Beige paint"],
      answers: [],
    });
    assert.equal(findLeak(scope), null);
    assert.match(scope, /White paint/);
    const base = buildEditPrompt({
      zoneName: "Back yard",
      style: "from-after",
      styleNote: READ,
      budget: "low",
      keep: ["The tree"],
      replace: [],
      answers: [],
      drift: false,
    });
    assert.equal(withStyleReference(base, false), base);
    const prompt = withStyleReference(base, true);
    assert.match(prompt, /Image 0/);
    assert.match(prompt, /Image 1 is a style reference only/);
    assert.match(prompt, /White paint/);
    assert.equal(findLeak(prompt), null);
  });
});
