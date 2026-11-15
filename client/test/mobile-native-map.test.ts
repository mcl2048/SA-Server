import test from "node:test";
import assert from "node:assert/strict";
import { MobileNativeMap } from "../src/mobile-native-map.ts";

class Canvas extends EventTarget {
  hidden = false; width = 0; height = 0; className = ""; dataset = {};
  captured = new Set<number>();
  setAttribute() {}
  setPointerCapture(id: number) { this.captured.add(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
  getBoundingClientRect() { return { left: 10, top: 20, width: 300, height: 200 }; }
}
const doc = Object.assign(new EventTarget(), { createElement: () => new Canvas(), hidden: false });
Object.assign(globalThis, { document: doc, addEventListener() {} });
function fixture() {
  let canvas: Canvas;
  const routes: unknown[] = [], gestures: unknown[] = [];
  const content = { firstChild: null, insertBefore(node: Canvas) { canvas = node; } };
  const map = new MobileNativeMap(content as any, (...args) => routes.push(args), (...args) => gestures.push(args));
  map.sync({ pics: [] } as any, [{ id: "map-area", x1: 100, y1: 50, x2: 400, y2: 250 }], true);
  const fire = (type: string, data = {}) => canvas!.dispatchEvent(Object.assign(new Event(type), {
    pointerId: 1, isPrimary: true, pointerType: "mouse", button: 0, clientX: 160, clientY: 120, ...data,
  }));
  return { routes, gestures, fire };
}

test("secondary mouse and stylus buttons never become native map destinations or pans", () => {
  for (const pointerType of ["mouse", "pen"]) for (const button of [1, 2, 5]) {
    const h = fixture();
    h.fire("pointerdown", { pointerType, button });
    h.fire("pointermove", { pointerType, button, clientX: 190 });
    h.fire("pointerup", { pointerType, button, clientX: 190 });
    assert.deepEqual(h.routes, [], `${pointerType} button ${button} must not navigate`);
    assert.deepEqual(h.gestures, [], `${pointerType} button ${button} must not pan`);
    h.fire("pointerdown", { pointerType, button }); h.fire("pointerup", { pointerType, button });
    assert.deepEqual(h.routes, [], `${pointerType} button ${button} must not navigate on a stationary click`);
  }
});

test("primary touch, pen and mouse taps retain exact native destination coordinates", () => {
  for (const pointerType of ["mouse", "touch", "pen"]) {
    const h = fixture(); h.fire("pointerdown", { pointerType }); h.fire("pointerup", { pointerType });
    assert.deepEqual(h.routes, [["map-area", 250, 150]]); assert.deepEqual(h.gestures, []);
  }
});

test("cancelled native map pointer never routes, while a later primary tap still works", () => {
  const h = fixture(); h.fire("pointerdown"); h.fire("pointercancel"); h.fire("pointerup");
  assert.deepEqual(h.routes, []);
  h.fire("pointerdown"); h.fire("pointerup"); assert.equal(h.routes.length, 1);
});
