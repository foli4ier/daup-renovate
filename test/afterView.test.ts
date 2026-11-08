import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { copy } from "../src/copy.ts";
import { afterHalf, pointerGesture, stepIndex } from "../src/lib/afterView.ts";

describe("after viewer", () => {
  it("treats only the open side of the divider as the after", () => {
    assert.equal(afterHalf(160, 320, 50), false);
    assert.equal(afterHalf(161, 320, 50), true);
    assert.equal(afterHalf(40, 320, 50), false);
    assert.equal(afterHalf(200, 320, 80), false);
    assert.equal(afterHalf(300, 320, 80), true);
    assert.equal(afterHalf(10, 0, 50), false);
  });

  it("does not loop past the ends", () => {
    assert.equal(stepIndex(0, 3, -1), 0);
    assert.equal(stepIndex(0, 3, 1), 1);
    assert.equal(stepIndex(2, 3, 1), 2);
    assert.equal(stepIndex(2, 3, -1), 1);
  });

  it("reads a sideways swipe as next or previous and a downward swipe as close", () => {
    assert.equal(pointerGesture(-80, 4), "next");
    assert.equal(pointerGesture(80, 10), "prev");
    assert.equal(pointerGesture(10, 80), "close");
    assert.equal(pointerGesture(4, 4), null);
    assert.equal(pointerGesture(0, -80), null);
    assert.equal(copy.afterCount(2, 3), "2 of 3");
    assert.equal(copy.afterCount(1, 3), "1 of 3");
  });

  it("letters the after on a dark full-screen field with a 48px Close.", () => {
    const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
    assert.match(css, /\.after-viewer \{[\s\S]*?background:\s*#0f1311/);
    assert.match(css, /\.after-viewer \{[\s\S]*?z-index:\s*40/);
    assert.match(css, /\.after-viewer-photo \{[\s\S]*?object-fit:\s*contain/);
    assert.match(css, /\.after-close \{[\s\S]*?min-width:\s*48px;[\s\S]*?min-height:\s*48px;/);
  });
});
