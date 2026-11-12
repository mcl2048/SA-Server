import test from "node:test";
import assert from "node:assert/strict";

// Exercise the real preview copy and throttle without requiring game assets or WebGL.
let now = 0;
const doc = Object.assign(new EventTarget(), {
  documentElement: { classList: { toggle() {} } },
  querySelector: () => null,
  getElementById: () => null,
  querySelectorAll: () => previews,
});
Object.assign(globalThis, {
  document: doc, window: {}, location: { search: "?device=mobile" },
  localStorage: { getItem: () => null, setItem() {} },
  performance: { now: () => now }, devicePixelRatio: 3,
  requestAnimationFrame: () => 1, addEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
});
const { setDeviceMode } = await import("../src/mobile-view.ts");
const { drawMobilePreview } = await import("../src/mobile-preview.ts");
const source = { width: 1600, height: 1200 } as HTMLCanvasElement;
const overlay = { width: 1600, height: 1200 } as HTMLCanvasElement;
const draws: any[][] = [];
const ctx = { clearRect() {}, imageSmoothingEnabled: true, drawImage: (...args: any[]) => draws.push(args) };
let hidden = false, visible = true;
const preview = {
  width: 800, height: 600, style: { pointerEvents: "" },
  closest: () => hidden ? {} : null,
  getClientRects: () => visible ? [{}] : [],
  getBoundingClientRect: () => ({ width: 390, height: 292.5 }),
  getContext: () => ctx,
} as unknown as HTMLCanvasElement;
const previews = [preview];

test("preview caps high-DPR copies, composites overlay and throttles to 15fps", () => {
  drawMobilePreview(source, overlay);
  assert.deepEqual([preview.width, preview.height], [400, 300]);
  assert.equal(preview.style.pointerEvents, "none");
  assert.deepEqual(draws, [[source, 0, 0, 400, 300], [overlay, 0, 0, 400, 300]]);
  assert.equal(ctx.imageSmoothingEnabled, false);
  now = 30; drawMobilePreview(source, overlay); assert.equal(draws.length, 2);
  now = 70; drawMobilePreview(source, overlay); assert.equal(draws.length, 4);
});

test("hidden sheets, CSS-hidden previews and desktop mode do not copy frames", () => {
  const count = draws.length;
  now = 200; hidden = true; drawMobilePreview(source); assert.equal(draws.length, count);
  hidden = false; visible = false; drawMobilePreview(source); assert.equal(draws.length, count);
  visible = true; setDeviceMode("desktop"); drawMobilePreview(source); assert.equal(draws.length, count);
  setDeviceMode("mobile"); drawMobilePreview(source); assert.equal(draws.length, count + 1);
});
