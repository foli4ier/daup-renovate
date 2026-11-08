import { Window } from "happy-dom";

const dom = new Window({
  url: "http://localhost:5173/gallery/zone_front",
  width: 390,
  height: 844,
});

const names = [
  "HTMLElement",
  "HTMLInputElement",
  "HTMLButtonElement",
  "HTMLImageElement",
  "HTMLAnchorElement",
  "Element",
  "Node",
  "DocumentFragment",
  "Text",
  "Comment",
  "Document",
  "Event",
  "UIEvent",
  "MouseEvent",
  "PointerEvent",
  "KeyboardEvent",
  "PopStateEvent",
  "InputEvent",
  "FocusEvent",
  "CustomEvent",
  "MutationObserver",
  "DOMRect",
  "Image",
  "SVGElement",
  "NodeFilter",
  "Range",
  "getComputedStyle",
  "navigator",
] as const;

for (const name of names) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: (dom as unknown as Record<string, unknown>)[name],
  });
}

Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: dom });
Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: dom.document });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, writable: true, value: true });

if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 0)) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
}
