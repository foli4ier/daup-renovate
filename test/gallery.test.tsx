import "./dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useState } from "react";
import Budget from "../src/pages/Budget.tsx";
import Capture from "../src/pages/Capture.tsx";
import Gallery from "../src/pages/Gallery.tsx";
import Home from "../src/pages/Home.tsx";
import Zones from "../src/pages/Zones.tsx";
import { seed } from "../src/data/seed.ts";
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
  it("opens from the after half and stays shut for the before half, the range, and a missing after", async () => {
    const session = await mount("/gallery/zone_front");
    const stage = slider();
    await click(stage, 40, 20);
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
    slider();
    await click(stage, 200, 20);
    assert.equal(viewer(), null);
    await click(stage, 300, 20);
    const open = viewer();
    assert.ok(open);
    assert.equal(buttonNamed("Close.", open)?.textContent?.trim(), "Close.");
    assert.equal(open.querySelector(".after-count"), null);
    assert.equal(open.querySelector("img")?.getAttribute("src"), "/esseboom/front-yard-after.svg");
    for (const label of ["Approve.", "Remove.", "Edit.", "Generate.", "Hub.", "Chat."]) {
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
    assert.equal(viewer(), null);
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

describe("Hub. on the wordmark row", () => {
  it("opens https://apps.daup.co.za from Home, Zones, and Budget", async () => {
    for (const path of ["/", "/plan", "/budget"]) {
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
