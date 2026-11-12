import "./dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Zones from "../src/pages/Zones.tsx";
import { seed } from "../src/data/seed.ts";
import { ProvideRenovate, type StoreValue } from "../src/state/store.tsx";
import { reduce } from "../src/state/reducer.ts";
import type { State } from "../src/state/types.ts";

let mounted: { unmount: () => Promise<void> } | null = null;

function Harness({ initial, latest }: { initial: State; latest: { state: State } }) {
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
          <Route path="/plan" element={<Zones />} />
        </Routes>
      </BrowserRouter>
    </ProvideRenovate>
  );
}

async function mount(): Promise<{ state: State }> {
  if (mounted) await mounted.unmount();
  window.history.replaceState(null, "", "/plan");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  const latest = { state: seed() };
  await act(async () => {
    root.render(<Harness initial={seed()} latest={latest} />);
  });
  const session = {
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      if (mounted === session) mounted = null;
    },
  };
  mounted = session;
  return latest;
}

afterEach(async () => {
  if (mounted) await mounted.unmount();
  document.body.replaceChildren();
});

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === name);
}

function zoneRow(name: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button.zone-row")].find((item) => item.querySelector("span")?.textContent === name);
  if (!(button instanceof HTMLButtonElement)) throw new Error(name);
  return button;
}

function fieldInput(label: string): HTMLInputElement {
  const match = [...document.querySelectorAll("label.field")].find((item) => item.childNodes[0]?.textContent?.trim() === label);
  const input = match?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) throw new Error(label);
  return input;
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
}

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    input.focus();
    const tracker = (input as HTMLInputElement & { _valueTracker?: { setValue: (next: string) => void } })._valueTracker;
    tracker?.setValue(value === "" ? "x" : "");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function kitchen(state: State) {
  return state.zones.find((zone) => zone.id === "zone_kitchen");
}

describe("edit zones", () => {
  it("keeps the size field while a decimal is typed, and still clears or rejects", async () => {
    const latest = await mount();
    const edit = buttonNamed("Edit zones.");
    if (!edit) throw new Error("Edit zones.");
    await click(edit);
    const sheet = document.querySelector(".sheet");
    assert.ok(sheet);
    assert.equal(sheet.getAttribute("aria-label"), "Edit zones");
    const first = zoneRow("Front yard");
    assert.equal(document.activeElement === first, true);

    await click(zoneRow("Kitchen"));
    const size = fieldInput("Size in m²");
    assert.equal(size.value, "");

    await typeInto(size, "1");
    assert.equal(document.activeElement === size, true);
    assert.equal(size.value, "1");
    assert.equal(kitchen(latest.state)?.sizeM2, 1);

    await typeInto(size, "12");
    assert.equal(document.activeElement === size, true);
    assert.equal(size.value, "12");

    await typeInto(size, "12.");
    assert.equal(document.activeElement === size, true);
    assert.equal(size.value, "12.");
    assert.equal(kitchen(latest.state)?.sizeM2, 12);

    await typeInto(size, "12.5");
    assert.equal(document.activeElement === size, true);
    assert.equal(size.value, "12.5");
    assert.equal(kitchen(latest.state)?.sizeM2, 12.5);
    assert.equal(document.activeElement === first, false);

    await typeInto(size, "12.");
    await typeInto(size, "12.0");
    assert.equal(document.activeElement === size, true);
    assert.equal(size.value, "12.0");
    assert.equal(kitchen(latest.state)?.sizeM2, 12);
    await typeInto(size, "12.05");
    assert.equal(size.value, "12.05");
    assert.equal(kitchen(latest.state)?.sizeM2, 12.05);
    await typeInto(size, "12.5");
    assert.equal(size.value, "12.5");
    assert.equal(kitchen(latest.state)?.sizeM2, 12.5);

    await typeInto(size, "12.5a");
    assert.equal(document.activeElement === size, true);
    assert.equal(size.value, "12.5");
    assert.equal(kitchen(latest.state)?.sizeM2, 12.5);

    await typeInto(size, "0");
    assert.equal(size.value, "12.5");
    assert.equal(kitchen(latest.state)?.sizeM2, 12.5);

    await typeInto(size, "");
    assert.equal(document.activeElement === size, true);
    assert.equal(size.value, "");
    assert.equal(kitchen(latest.state)?.sizeM2, undefined);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(document.querySelector(".sheet"), null);
    assert.equal(window.location.pathname, "/plan");
    assert.equal(window.location.search, "");
  });

  it("keeps the name field while the zone is renamed", async () => {
    const latest = await mount();
    const edit = buttonNamed("Edit zones.");
    if (!edit) throw new Error("Edit zones.");
    await click(edit);
    await click(zoneRow("Kitchen"));
    const name = fieldInput("Name");
    assert.equal(name.value, "Kitchen");
    const first = zoneRow("Front yard");

    await typeInto(name, "K");
    assert.equal(document.activeElement === name, true);
    assert.equal(name.value, "K");
    assert.equal(kitchen(latest.state)?.name, "K");
    assert.equal(document.activeElement === first, false);

    await typeInto(name, "Kitchen nook");
    assert.equal(document.activeElement === name, true);
    assert.equal(name.value, "Kitchen nook");
    assert.equal(kitchen(latest.state)?.name, "Kitchen nook");
    assert.equal(zoneRow("Kitchen nook").getAttribute("aria-expanded"), "true");
  });
});
