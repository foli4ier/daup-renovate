import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copy } from "../src/copy.ts";
import { seed } from "../src/data/seed.ts";
import { decisionDate, decisionSheetMoves, summarizePictureChat } from "../src/lib/decisions.ts";
import { messageAuthorLabel, PROMPT_AUTHOR } from "../src/lib/thread.ts";
import { findLeak } from "../src/lib/leak.ts";
import { readOwnerDocument } from "../src/state/persist.ts";
import { reduce } from "../src/state/reducer.ts";
import { calloutJson } from "../src/api/callout.ts";

describe("picture chat decisions", () => {
  it("sums picture messages into one backlog card and leaves prices out", () => {
    let state = seed();
    const before = state.links.find((link) => link.zoneId === "zone_front")?.approvedProposalId;
    state = reduce(state, {
      type: "post-message",
      id: "msg_brick",
      zoneId: "zone_front",
      authorId: "owner_you",
      text: "Keep the brick edging.",
      createdAt: "2026-11-11T08:00:00.000Z",
      pictureId: "prop_front",
    });
    state = reduce(state, {
      type: "post-message",
      id: "msg_sage",
      zoneId: "zone_front",
      authorId: "owner_you",
      text: "Paint the wall sage.",
      createdAt: "2026-11-11T08:05:00.000Z",
      pictureId: "prop_front",
    });
    state = reduce(state, {
      type: "post-message",
      id: "msg_price",
      zoneId: "zone_front",
      authorId: "owner_you",
      text: "About R250 for paint.",
      createdAt: "2026-11-11T08:06:00.000Z",
      pictureId: "prop_front",
    });
    const tagged = state.messages.filter((message) => message.pictureId === "prop_front");
    assert.equal(tagged.length, 2);
    assert.equal(tagged.some((message) => message.text.includes("R250")), false);
    const cards = state.plans[0]?.decisions ?? [];
    assert.equal(cards.length, 1);
    assert.equal(cards[0]?.column, "backlog");
    assert.equal(cards[0]?.suggested, true);
    assert.equal(cards[0]?.line, "Keep the brick edging, paint the wall sage.");
    assert.equal(findLeak(cards[0]?.line ?? ""), null);
    assert.deepEqual(cards[0]?.messageIds, ["msg_brick", "msg_sage"]);
    assert.equal(state.links.find((link) => link.zoneId === "zone_front")?.approvedProposalId, before);
    assert.equal(decisionDate("2026-11-11T08:00:00.000Z"), "11 Nov 2026");
    assert.equal(copy.fromChat("11 Nov 2026"), "From chat · You · 11 Nov 2026");
    assert.equal(summarizePictureChat(["About R250 for paint."]), "");
  });

  it("moves a decision without approving the picture", () => {
    let state = reduce(seed(), {
      type: "post-message",
      id: "msg_keep",
      zoneId: "zone_front",
      authorId: "owner_you",
      text: "Keep the window frames.",
      createdAt: "2026-11-11T08:00:00.000Z",
      pictureId: "photo_front",
    });
    const id = state.plans[0]?.decisions?.[0]?.id ?? "";
    state = reduce(state, { type: "move-decision", planId: "plan_refresh", decisionId: id, column: "approved" });
    const card = state.plans[0]?.decisions?.[0];
    assert.equal(card?.column, "approved");
    assert.equal(card?.suggested, false);
    assert.equal(state.links.find((link) => link.zoneId === "zone_front")?.approvedProposalId, undefined);
    assert.deepEqual(decisionSheetMoves("backlog"), [
      { column: "approved", role: "primary" },
      { column: "rejected", role: "outline" },
      { column: "archived", role: "quiet" },
    ]);
    assert.deepEqual(decisionSheetMoves("approved"), [
      { column: "backlog", role: "outline" },
      { column: "rejected", role: "outline" },
      { column: "archived", role: "quiet" },
    ]);
    assert.deepEqual(decisionSheetMoves("rejected"), [
      { column: "approved", role: "primary" },
      { column: "backlog", role: "outline" },
      { column: "archived", role: "quiet" },
    ]);
    assert.deepEqual(decisionSheetMoves("archived"), [
      { column: "approved", role: "primary" },
      { column: "rejected", role: "outline" },
      { column: "backlog", role: "outline" },
    ]);
    assert.equal(messageAuthorLabel("owner_you", "owner_you"), "You");
    assert.equal(messageAuthorLabel(PROMPT_AUTHOR, "owner_you"), "Renovate");
    const priced = reduce(state, { type: "set-decision-line", planId: "plan_refresh", decisionId: id, line: "Budget R500." });
    assert.equal(priced.plans[0]?.decisions?.[0]?.line, card?.line);
  });

  it("keeps an old owner document valid with or without decisions", () => {
    const state = seed();
    state.sample = false;
    const opened = readOwnerDocument(JSON.parse(JSON.stringify(state)));
    assert.ok(opened);
    assert.equal(opened.plans[0]?.decisions, undefined);
    const plan = state.plans[0];
    if (!plan) throw new Error("plan");
    plan.decisions = [
      {
        id: "decision_msg",
        zoneId: "zone_front",
        pictureId: "prop_front",
        line: "Keep the brick edging.",
        column: "backlog",
        suggested: true,
        createdAt: "2026-11-11T08:00:00.000Z",
        messageIds: ["msg"],
      },
    ];
    const withCards = readOwnerDocument(JSON.parse(JSON.stringify(state)));
    assert.equal(withCards?.version, 2);
    assert.equal(withCards?.plans[0]?.decisions?.[0]?.line, "Keep the brick edging.");
    const body = calloutJson({
      planId: "plan_refresh",
      zoneId: "zone_front",
      zoneName: "Front yard",
      scope: "Paint the front.",
      beforeUrl: "/before",
      afterUrl: "/after",
    });
    assert.equal(body.includes("decision"), false);
    assert.equal(body.includes("brick"), false);
  });
});
