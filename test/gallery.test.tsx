import "./dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useState } from "react";
import Budget from "../src/pages/Budget.tsx";
import Decisions from "../src/pages/Decisions.tsx";
import Capture from "../src/pages/Capture.tsx";
import Gallery from "../src/pages/Gallery.tsx";
import Home from "../src/pages/Home.tsx";
import Zones from "../src/pages/Zones.tsx";
import { copy } from "../src/copy.ts";
import { seed } from "../src/data/seed.ts";
import { formatRand, formatRange } from "../src/lib/money.ts";
import { ProvideRenovate, type StoreValue } from "../src/state/store.tsx";
import { reduce } from "../src/state/reducer.ts";
import type { Proposal, State } from "../src/state/types.ts";

const HUB = "https://apps.daup.co.za";

type Mounted = {
  spent: { n: number };
  latest: { state: State };
  unmount: () => Promise<void>;
};

let mounted: Mounted | null = null;

function proposal(id: string, imageUrl: string, source: "generated" | "uploaded", createdAt: string): Proposal {
  return {
    id,
    planId: "plan_refresh",
    zoneId: "zone_front",
    beforePhotoId: "photo_front",
    imageUrl,
    createdAt,
    source,
  };
}

function threeAfters(): State {
  const state = structuredClone(seed());
  const link = state.links.find((item) => item.zoneId === "zone_front");
  if (!link) throw new Error("front");
  link.proposalIds = ["prop_front", "prop_front_b", "prop_front_c"];
  link.attempts = 1;
  state.proposals = [
    ...state.proposals.filter((item) => item.zoneId !== "zone_front"),
    proposal("prop_front", "/esseboom/front-yard-after.svg", "generated", "2026-11-06T05:15:00.000Z"),
    proposal("prop_front_b", "/esseboom/living-area-after.svg", "uploaded", "2026-11-06T05:16:00.000Z"),
    proposal("prop_front_c", "/esseboom/kitchen-after.svg", "generated", "2026-11-06T05:17:00.000Z"),
  ];
  return state;
}

function beforeOnly(): State {
  const state = structuredClone(seed());
  const link = state.links.find((item) => item.zoneId === "zone_front");
  if (!link) throw new Error("front");
  link.proposalIds = [];
  link.attempts = 1;
  state.proposals = state.proposals.filter((item) => item.id !== "prop_front");
  return state;
}

function attempts(state: State, zoneId = "zone_front"): number | undefined {
  return state.links.find((link) => link.zoneId === zoneId)?.attempts;
}

function sixBefores(): State {
  const state = structuredClone(seed());
  const index = state.photos.findIndex((photo) => photo.id === "photo_front");
  const extra = [1, 2, 3, 4, 5].map((n) => ({
    id: `photo_front_${n}`,
    zoneId: "zone_front",
    url: `/esseboom/front-yard-before.svg?n=${n}`,
    width: 1200,
    height: 900,
    starred: false,
  }));
  state.photos.splice(index + 1, 0, ...extra);
  return state;
}

function reactedAfters(): State {
  const state = threeAfters();
  const first = state.proposals.find((item) => item.id === "prop_front");
  if (!first) throw new Error("front after");
  first.reactions = [
    { personId: "sam", name: "Sam", kind: "like" },
    { personId: "lebo", name: "Lebo", kind: "like" },
    { personId: "alex", name: "Alex", kind: "dislike" },
  ];
  return state;
}

function approvedBath(): State {
  const state = structuredClone(seed());
  const link = state.links.find((item) => item.zoneId === "zone_bath");
  if (!link) throw new Error("bath");
  link.approvedProposalId = "prop_bath";
  return state;
}

async function setInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    const tracker = (input as HTMLInputElement & { _valueTracker?: { setValue: (next: string) => void } })._valueTracker;
    tracker?.setValue(value === "" ? "x" : "");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function blur(input: HTMLInputElement) {
  await act(async () => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

function Harness({ initial, spent, latest }: { initial: State; spent: { n: number }; latest: { state: State } }) {
  const [current, setCurrent] = useState(initial);
  latest.state = current;
  const value: StoreValue = {
    state: current,
    propertyLoad: "ready",
    unmatchedHouse: "",
    busyZoneId: null,
    busyMode: null,
    saveFailed: false,
    houseSaveFailed: false,
    dispatch(action) {
      setCurrent((prev) => reduce(prev, action));
    },
    reloadProperties() {},
    chooseProperty() {},
    startPlan() {},
    addPhoto() {},
    saveGuides() {},
    async uploadAfter() {
      return { ok: false };
    },
    async generate() {
      spent.n += 1;
      return { ok: false };
    },
    async pushProject() {
      return { ok: false };
    },
    async sendCallouts() {
      return { ok: false, blocked: false, spots: [] };
    },
  };
  return (
    <ProvideRenovate value={value}>
      <BrowserRouter window={window} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/plan" element={<Zones />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/decisions" element={<Decisions />} />
          <Route path="/gallery/:zoneId" element={<Gallery />} />
          <Route path="/zone/:zoneId" element={<Capture />} />
        </Routes>
      </BrowserRouter>
    </ProvideRenovate>
  );
}

async function mount(path: string, initial: State = seed()): Promise<Mounted> {
  if (mounted) await mounted.unmount();
  window.history.replaceState(null, "", path);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  const spent = { n: 0 };
  const latest = { state: initial };
  await act(async () => {
    root.render(<Harness initial={initial} spent={spent} latest={latest} />);
  });
  const session: Mounted = {
    spent,
    latest,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      if (mounted === session) mounted = null;
    },
  };
  mounted = session;
  return session;
}

afterEach(async () => {
  if (mounted) await mounted.unmount();
  document.body.replaceChildren();
});

function slider(): HTMLElement {
  const node = document.querySelector(".slider");
  if (!(node instanceof HTMLElement)) throw new Error("slider");
  node.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 320,
      bottom: 132,
      width: 320,
      height: 132,
      toJSON() {
        return {};
      },
    }) as DOMRect;
  return node;
}

async function click(el: Element, x = 0, y = 0) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
  });
}

async function swipe(el: Element, fromX: number, toX: number, fromY = 160, toY = 160) {
  await act(async () => {
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: fromX,
        clientY: fromY,
        pointerId: 1,
        pointerType: "touch",
      }),
    );
    el.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        clientX: toX,
        clientY: toY,
        pointerId: 1,
        pointerType: "touch",
      }),
    );
  });
}

function buttonNamed(name: string, root: ParentNode = document): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find((button) => button.textContent?.trim() === name);
}

function viewer(): HTMLElement | null {
  const node = document.querySelector(".after-viewer");
  return node instanceof HTMLElement ? node : null;
}

function afterImage(): string {
  return document.querySelector<HTMLImageElement>(".slider img[alt='After']")?.getAttribute("src") ?? "";
}

describe("full-screen afters", () => {
  it("opens the after from the after half and the before from the before half", async () => {
    const session = await mount("/gallery/zone_front");
    const stage = slider();
    await click(stage, 160, 20);
    assert.equal(viewer(), null);
    await click(stage, 40, 20);
    const beforeOpen = viewer();
    assert.ok(beforeOpen);
    assert.equal(beforeOpen.getAttribute("aria-label"), "Before");
    assert.equal(buttonNamed("Like.", beforeOpen), undefined);
    assert.equal(buttonNamed("Dislike.", beforeOpen), undefined);
    assert.equal(buttonNamed("Chat.", beforeOpen)?.textContent?.trim(), "Chat.");
    assert.equal(beforeOpen.querySelector(".after-count"), null);
    for (const label of ["Approve.", "Remove.", "Edit.", "Generate.", "Hub."]) {
      assert.equal(beforeOpen.textContent?.includes(label), false, label);
    }
    const beforeClose = buttonNamed("Close.", beforeOpen);
    if (!beforeClose) throw new Error("Close.");
    await click(beforeClose);
    assert.equal(viewer(), null);

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Before and after"]');
    if (!input) throw new Error("range");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "80");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.match(document.querySelector<HTMLElement>(".before-shot")?.style.clipPath ?? "", /20%/);
    assert.equal(viewer(), null);
    await click(input, 300, 100);
    assert.equal(viewer(), null);
    await click(slider(), 200, 20);
    assert.equal(viewer()?.getAttribute("aria-label"), "Before");
    const movedClose = buttonNamed("Close.");
    if (!movedClose) throw new Error("Close.");
    await click(movedClose);
    assert.equal(viewer(), null);
    await click(slider(), 300, 20);
    const open = viewer();
    assert.ok(open);
    assert.equal(open.getAttribute("aria-label"), "After");
    assert.equal(buttonNamed("Close.", open)?.textContent?.trim(), "Close.");
    assert.equal(buttonNamed("Like.", open)?.textContent?.trim(), "Like.");
    assert.equal(buttonNamed("Dislike.", open)?.textContent?.trim(), "Dislike.");
    assert.equal(buttonNamed("Chat.", open)?.textContent?.trim(), "Chat.");
    assert.equal(open.querySelector(".after-count"), null);
    assert.equal(open.querySelector("img")?.getAttribute("src"), "/esseboom/front-yard-after.svg");
    for (const label of ["Approve.", "Remove.", "Edit.", "Generate.", "Hub."]) {
      assert.equal(open.textContent?.includes(label), false, label);
    }
    assert.equal(session.spent.n, 0);
    assert.equal(attempts(session.latest.state), 1);
    assert.equal(window.location.pathname, "/gallery/zone_front");

    const quiet = await mount("/gallery/zone_front", beforeOnly());
    assert.equal(document.querySelector(".slider"), null);
    const before = document.querySelector(".before-only");
    if (!before) throw new Error("before");
    await click(before, 200, 20);
    const only = viewer();
    assert.ok(only);
    assert.equal(only.getAttribute("aria-label"), "Before");
    assert.equal(buttonNamed("Like.", only), undefined);
    assert.equal(only.querySelector("img")?.getAttribute("src"), "/esseboom/front-yard-before.svg");
    assert.equal(quiet.spent.n, 0);
    assert.equal(attempts(quiet.latest.state), 1);
  });

  it("closes with Close. and system back and stays on the gallery", async () => {
    const session = await mount("/gallery/zone_front?picture=prop_front");
    await click(slider(), 280, 20);
    assert.ok(viewer());
    const close = buttonNamed("Close.");
    if (!close) throw new Error("Close.");
    await click(close);
    assert.equal(viewer(), null);
    assert.ok(buttonNamed("Approve."));
    assert.ok(buttonNamed("Back."));
    assert.equal(document.querySelector("a.hub"), null);
    assert.equal(window.location.pathname, "/gallery/zone_front");

    await click(slider(), 280, 20);
    assert.ok(viewer());
    await swipe(viewer() ?? document.body, 40, 40, 80, 200);
    assert.equal(viewer(), null);
    assert.ok(buttonNamed("Approve."));
    assert.equal(window.location.pathname, "/gallery/zone_front");

    await click(slider(), 280, 20);
    assert.ok(viewer());
    await act(async () => {
      window.history.back();
    });
    assert.equal(viewer(), null);
    assert.ok(buttonNamed("Approve."));
    assert.ok(buttonNamed("Back."));
    assert.equal(window.location.pathname, "/gallery/zone_front");
    assert.equal(window.location.search, "?picture=prop_front");
    assert.equal(session.spent.n, 0);
    assert.equal(attempts(session.latest.state), 1);
  });

  it("swipes to the next and previous after without looping, then leaves that after selected", async () => {
    const session = await mount("/gallery/zone_front?picture=prop_front", threeAfters());
    await click(slider(), 280, 20);
    const open = viewer();
    assert.ok(open);
    assert.equal(open.querySelector(".after-count")?.textContent, "1 of 3");
    await swipe(open, 220, 20);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "2 of 3");
    assert.equal(viewer()?.querySelector("img")?.getAttribute("src"), "/esseboom/living-area-after.svg");
    await swipe(viewer() ?? open, 220, 20);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "3 of 3");
    await swipe(viewer() ?? open, 220, 20);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "3 of 3");
    assert.equal(viewer()?.querySelector("img")?.getAttribute("src"), "/esseboom/kitchen-after.svg");
    await swipe(viewer() ?? open, 20, 220);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "2 of 3");
    await swipe(viewer() ?? open, 20, 220);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "1 of 3");
    await swipe(viewer() ?? open, 20, 220);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "1 of 3");
    await swipe(viewer() ?? open, 220, 20);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "2 of 3");
    const close = buttonNamed("Close.");
    if (!close) throw new Error("Close.");
    await click(close);
    assert.equal(viewer(), null);
    assert.equal(afterImage(), "/esseboom/living-area-after.svg");
    const pressed = [...document.querySelectorAll<HTMLButtonElement>(".thumb-pick")].filter(
      (button) => button.getAttribute("aria-pressed") === "true",
    );
    assert.equal(pressed.length, 1);
    assert.equal(pressed[0]?.querySelector("img")?.getAttribute("src"), "/esseboom/living-area-after.svg");
    assert.equal(window.location.pathname, "/gallery/zone_front");
    assert.ok(buttonNamed("Approve."));
    assert.equal(session.spent.n, 0);
    assert.equal(attempts(session.latest.state), 1);
  });

  it("lets a thumbnail select or remove an after without opening the viewer", async () => {
    const session = await mount("/gallery/zone_front?picture=prop_front", threeAfters());
    const thumbs = () => [...document.querySelectorAll<HTMLButtonElement>(".thumb-pick")];
    assert.equal(thumbs()[0]?.getAttribute("aria-pressed"), "true");
    const second = thumbs()[1];
    if (!second) throw new Error("thumb");
    await click(second);
    assert.equal(viewer(), null);
    assert.equal(second.getAttribute("aria-pressed"), "true");
    assert.equal(afterImage(), "/esseboom/living-area-after.svg");
    const remove = buttonNamed("Remove.");
    if (!remove) throw new Error("Remove.");
    await click(remove);
    assert.equal(viewer(), null);
    assert.equal(thumbs().some((button) => button.querySelector("img")?.getAttribute("src") === "/esseboom/living-area-after.svg"), false);
    assert.equal(session.spent.n, 0);
    assert.equal(attempts(session.latest.state), 1);
    assert.ok(buttonNamed("Approve."));
  });

  it("does not open a viewer from capture", async () => {
    const session = await mount("/zone/zone_front");
    assert.equal(document.querySelector(".slider"), null);
    assert.equal(viewer(), null);
    const photo = document.querySelector(".photo-stage img");
    if (!photo) throw new Error("photo");
    await click(photo, 200, 40);
    assert.equal(viewer(), null);
    assert.equal(session.spent.n, 0);
    assert.equal(attempts(session.latest.state), 1);
    assert.equal(window.location.pathname, "/zone/zone_front");
  });
});

describe("full-screen befores", () => {
  it("swipes that zone's befores without looping and keeps the landed before", async () => {
    const session = await mount("/gallery/zone_front", sixBefores());
    await click(slider(), 40, 20);
    const open = viewer();
    assert.ok(open);
    assert.equal(open.getAttribute("aria-label"), "Before");
    assert.equal(open.querySelector(".after-count")?.textContent, "1 of 6");
    assert.equal(buttonNamed("Like.", open), undefined);
    await swipe(open, 220, 20);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "2 of 6");
    assert.equal(viewer()?.querySelector("img")?.getAttribute("src"), "/esseboom/front-yard-before.svg?n=1");
    await swipe(viewer() ?? open, 20, 220);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "1 of 6");
    await swipe(viewer() ?? open, 20, 220);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "1 of 6");
    for (let step = 0; step < 5; step += 1) await swipe(viewer() ?? open, 220, 20);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "6 of 6");
    await swipe(viewer() ?? open, 220, 20);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "6 of 6");
    await swipe(viewer() ?? open, 20, 220);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "5 of 6");
    const close = buttonNamed("Close.");
    if (!close) throw new Error("Close.");
    await click(close);
    assert.equal(viewer(), null);
    assert.equal(document.querySelector<HTMLImageElement>(".before-shot")?.getAttribute("src"), "/esseboom/front-yard-before.svg?n=4");
    assert.equal(afterImage(), "/esseboom/front-yard-after.svg");
    assert.equal(session.spent.n, 0);
    assert.equal(attempts(session.latest.state), 1);
    assert.equal(window.location.pathname, "/gallery/zone_front");
  });

  it("does not open a viewer from the zones grid", async () => {
    await mount("/plan");
    assert.equal(viewer(), null);
    assert.equal(buttonNamed("Add a phase."), undefined);
    const tile = document.querySelector(".zone-tile");
    if (!tile) throw new Error("tile");
    await click(tile);
    assert.equal(viewer(), null);
  });
});

describe("after reactions", () => {
  it("toggles like and dislike by name without using a try", async () => {
    const session = await mount("/gallery/zone_front?picture=prop_front", reactedAfters());
    await click(slider(), 280, 20);
    const open = viewer();
    assert.ok(open);
    assert.equal(open.querySelector(".after-count")?.textContent, "1 of 3");
    assert.equal(open.textContent?.includes("Nobody yet."), false);
    assert.equal(open.textContent?.includes("Liked by Sam and Lebo."), true);
    assert.equal(open.textContent?.includes("Disliked by Alex."), true);
    assert.equal(document.querySelector("#proposal-thumbs")?.textContent?.includes("Like."), false);
    const like = buttonNamed("Like.", open);
    const dislike = buttonNamed("Dislike.", open);
    if (!like || !dislike) throw new Error("reactions");
    await click(like);
    assert.equal(viewer()?.textContent?.includes("Liked by you, Sam, and Lebo."), true);
    assert.equal(like.getAttribute("aria-pressed"), "true");
    assert.equal(attempts(session.latest.state), 1);
    await click(like);
    assert.equal(viewer()?.textContent?.includes("Liked by you"), false);
    assert.equal(viewer()?.textContent?.includes("Liked by Sam and Lebo."), true);
    assert.equal(like.getAttribute("aria-pressed"), "false");
    await click(dislike);
    assert.equal(viewer()?.textContent?.includes("Disliked by you and Alex."), true);
    assert.equal(dislike.getAttribute("aria-pressed"), "true");
    assert.equal(like.getAttribute("aria-pressed"), "false");
    await swipe(viewer() ?? open, 220, 20);
    assert.equal(viewer()?.querySelector(".after-count")?.textContent, "2 of 3");
    assert.equal(viewer()?.querySelector("img")?.getAttribute("src"), "/esseboom/living-area-after.svg");
    const uploadedLike = buttonNamed("Like.", viewer() ?? open);
    if (!uploadedLike) throw new Error("uploaded like");
    await click(uploadedLike);
    const uploaded = session.latest.state.proposals.find((item) => item.id === "prop_front_b");
    assert.equal(uploaded?.source, "uploaded");
    assert.equal(uploaded?.reactions?.some((item) => item.personId === "owner_you" && item.kind === "like"), true);
    assert.equal(/budget|price|quote|R\d/i.test(viewer()?.textContent ?? ""), false);
    assert.equal(session.spent.n, 0);
    assert.equal(attempts(session.latest.state), 1);
  });
});

describe("available to spend", () => {
  it("keeps the ceiling beside the estimate and shows an over line only when a figure is past it", async () => {
    const session = await mount("/budget", approvedBath());
    const input = document.querySelector<HTMLInputElement>("#available-to-spend");
    const total = document.querySelector(".total");
    const field = document.querySelector(".available-spend");
    if (!input || !total || !field) throw new Error("budget");
    assert.equal(total.textContent, formatRange(15000, 45000));
    assert.equal(field.textContent?.includes(copy.addAmount), true);
    assert.equal(document.body.textContent?.includes(copy.estimateOver), false);
    assert.equal(document.body.textContent?.includes(copy.highEstimateOver), false);
    assert.equal(field.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING, Node.DOCUMENT_POSITION_FOLLOWING);
    const privacy = [...document.querySelectorAll("p")].find((node) => node.textContent === copy.youOnly);
    assert.ok(privacy);
    assert.equal(privacy.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING, Node.DOCUMENT_POSITION_FOLLOWING);

    await setInput(input, "50000");
    assert.equal(session.latest.state.plans[0]?.availableToSpend, undefined);
    await blur(input);
    assert.equal(session.latest.state.plans[0]?.availableToSpend, 50000);
    assert.equal(input.value, "50,000");
    assert.equal(document.body.textContent?.includes(copy.addAmount), false);
    assert.equal(document.body.textContent?.includes(copy.estimateOver), false);
    assert.equal(document.body.textContent?.includes(copy.highEstimateOver), false);
    assert.equal(document.querySelector(".total")?.textContent, formatRange(15000, 45000));

    await setInput(input, "20000");
    await blur(input);
    assert.equal(document.body.textContent?.includes(copy.highEstimateOver), true);
    assert.equal(document.body.textContent?.includes(copy.estimateOver), false);

    await setInput(input, "10000");
    await blur(input);
    assert.equal(document.body.textContent?.includes(copy.estimateOver), true);
    assert.equal(document.body.textContent?.includes(copy.highEstimateOver), false);
    assert.equal(document.querySelector("#approve"), null);

    await setInput(input, "");
    await blur(input);
    assert.equal(session.latest.state.plans[0]?.availableToSpend, undefined);
    assert.equal(document.body.textContent?.includes(copy.addAmount), true);
    assert.equal(document.body.textContent?.includes(copy.estimateOver), false);
    assert.equal(document.body.textContent?.includes(copy.highEstimateOver), false);
    assert.equal(buttonNamed("Add a phase."), undefined);
  });
});

describe("spend phases", () => {
  it("adds a phase under the current plan and does not double-count a zone", async () => {
    const session = await mount("/");
    const spend = document.querySelector(".spend-phases");
    const add = buttonNamed("Add a phase.");
    const start = buttonNamed("Start a plan.");
    const home = document.querySelector(".home-card");
    if (!spend || !add || !start || !home) throw new Error("home");
    assert.equal(home.compareDocumentPosition(spend) & Node.DOCUMENT_POSITION_FOLLOWING, Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(spend.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING, Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(spend.textContent?.includes("Prep"), false);
    assert.equal(spend.textContent?.includes("Plumbing"), false);
    assert.equal(buttonNamed("Bedroom 1"), undefined);

    await click(add);
    assert.equal(buttonNamed("Add this phase.")?.hasAttribute("disabled"), true);
    assert.equal(buttonNamed("Bedroom 1"), undefined);
    await click(buttonNamed("Close.") ?? add);
    assert.equal(document.querySelector(".spend-card"), null);

    await click(buttonNamed("Add a phase.") ?? add);
    const kitchen = buttonNamed("Kitchen");
    const bath = buttonNamed("Bathroom 1");
    if (!kitchen || !bath) throw new Error("zones");
    await click(kitchen);
    await click(bath);
    const save = buttonNamed("Add this phase.");
    if (!save) throw new Error("save");
    await click(save);
    const first = document.querySelector(".spend-open");
    assert.equal(first?.textContent?.includes("Kitchen · Bathroom 1"), true);
    assert.equal(first?.textContent?.includes(formatRange(60000, 195000)), true);
    assert.equal(buttonNamed("Move up."), undefined);
    assert.equal(buttonNamed("Move down."), undefined);
    assert.equal(document.body.textContent?.includes(copy.addSpendOnBudget), true);
    assert.equal(document.body.textContent?.includes("of R"), false);

    await click(buttonNamed("Add a phase.") ?? add);
    const kitchenAgain = buttonNamed("Kitchen");
    if (!kitchenAgain) throw new Error("kitchen");
    await click(kitchenAgain);
    await click(buttonNamed("Add this phase.") ?? save);
    const cards = [...document.querySelectorAll(".spend-open")];
    assert.equal(cards.length, 2);
    assert.equal(cards[0]?.textContent?.includes("Bathroom 1"), true);
    assert.equal(cards[0]?.textContent?.includes("Kitchen"), false);
    assert.equal(cards[0]?.textContent?.includes(formatRange(15000, 45000)), true);
    assert.equal(cards[1]?.textContent?.includes("Kitchen"), true);
    assert.equal(cards[1]?.textContent?.includes(formatRange(45000, 150000)), true);
    const phaseCards = [...document.querySelectorAll(".spend-card")];
    const firstCard = phaseCards[0];
    const lastCard = phaseCards[1];
    if (!firstCard || !lastCard) throw new Error("cards");
    assert.equal(buttonNamed("Move up.", firstCard), undefined);
    assert.ok(buttonNamed("Move down.", firstCard));
    assert.ok(buttonNamed("Move up.", lastCard));
    assert.equal(buttonNamed("Move down.", lastCard), undefined);
    const phases = session.latest.state.plans[0]?.spendPhases ?? [];
    const membership = phases.flatMap((phase) => phase.zoneIds);
    assert.equal(membership.filter((id) => id === "zone_kitchen").length, 1);
    assert.equal(membership.filter((id) => id === "zone_bath").length, 1);
    assert.equal(session.latest.state.plans[0]?.phases.some((phase) => phase.name === "Prep"), true);

    const down = buttonNamed("Move down.");
    if (!down) throw new Error("move");
    await click(down);
    const moved = [...document.querySelectorAll(".spend-open")];
    assert.equal(moved[0]?.textContent?.includes("Kitchen"), true);
    assert.equal(moved[1]?.textContent?.includes("Bathroom 1"), true);
    await mount("/budget");
    assert.equal(buttonNamed("Add a phase."), undefined);
    await mount("/plan");
    assert.equal(buttonNamed("Add a phase."), undefined);
  });

  it("shows a phase slice against the ceiling and one over line", async () => {
    const state = approvedBath();
    const plan = state.plans[0];
    if (!plan) throw new Error("plan");
    plan.availableToSpend = 50000;
    plan.spendPhases = [{ id: "sp1", name: "Phase 1", order: 1, zoneIds: ["zone_bath"] }];
    await mount("/", state);
    const card = document.querySelector(".spend-open");
    assert.equal(buttonNamed("Move up."), undefined);
    assert.equal(buttonNamed("Move down."), undefined);
    assert.equal(card?.textContent?.includes("Bathroom 1"), true);
    assert.equal(card?.textContent?.includes(`${formatRange(15000, 45000)} of ${formatRand(50000)}`), true);
    assert.equal(document.body.textContent?.includes(copy.phasesOver), false);
    assert.equal(document.body.textContent?.includes(copy.addSpendOnBudget), false);

    plan.availableToSpend = 10000;
    await mount("/", state);
    assert.equal(document.body.textContent?.includes(copy.phasesOver), true);
    assert.equal(document.querySelector(".available-spend"), null);
  });

  it("hides spend phases when there is no current plan", async () => {
    const state = structuredClone(seed());
    state.plans = [];
    state.links = [];
    state.proposals = [];
    state.activePlanId = null;
    await mount("/", state);
    assert.equal(buttonNamed("Add a phase."), undefined);
    assert.equal(document.querySelector(".spend-phases"), null);
  });
});

describe("Hub. on the wordmark row", () => {
  it("opens https://apps.daup.co.za from Home, Zones, and Budget", async () => {
    for (const path of ["/", "/plan", "/budget", "/decisions"]) {
      await mount(path);
      const link = document.querySelector("a.hub");
      assert.ok(link, path);
      assert.equal(link.getAttribute("href"), HUB);
      assert.equal(link.textContent?.trim(), "Hub.");
      assert.ok(link.closest(".wordmark-row"), path);
      assert.equal(document.querySelectorAll("a.hub").length, 1);
    }
    await mount("/gallery/zone_front");
    assert.equal(document.querySelector("a.hub"), null);
    assert.equal(buttonNamed("Back.")?.textContent?.trim(), "Back.");
  });
});
