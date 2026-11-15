import test from "node:test";
import assert from "node:assert/strict";
import { MapWindow } from "../src/worldmap.ts";
import { InputBox } from "../src/ui.ts";

class Element extends EventTarget {
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; value = ""; type = "";
  parentElement: any = null; width = 0; height = 0;
  setAttribute() {} remove() {} focus() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
}
Object.assign(globalThis, { document: { createElement: () => new Element() } });

function fixture() {
  const field: any = { floor: 1, self: { x: 4, y: 6 }, navigationStatus: "", target: null,
    navigateTo(x: number, y: number) { this.target = Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < 100 && y < 100 ? [x, y] : null; } };
  const parent = { append(element: Element) { element.parentElement = this; }, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const canvas = new Element(); canvas.parentElement = parent;
  let closed = 0;
  const map: any = new MapWindow({ canvas, ui: {}, assets: {}, root: "/assets/", field: () => field, closeMap: () => closed++ } as any);
  return { field, map, closed: () => closed };
}

test("coordinate form routes to exact integers and removes native inputs on close", () => {
  const { field, map, closed } = fixture();
  map.syncVisibility?.(true);
  const boxes = [...InputBox.live];
  assert.equal(boxes.length, 2, "map exposes two original native input fields");
  boxes[0].value = " 42 "; boxes[1].value = "17";
  map.submitCoordinates?.();
  assert.deepEqual(field.target, [42, 17]); assert.equal(closed(), 1);
  map.syncVisibility(false); assert.equal(InputBox.live.size, 0);
});

test("coordinate form rejects decimals and incomplete numbers without partial parsing", () => {
  const { field, map } = fixture();
  map.syncVisibility?.(true);
  const boxes = [...InputBox.live];
  assert.equal(boxes.length, 2);
  for (const bad of ["42.5", "42abc", "", "1e2"]) {
    boxes[0].value = bad; boxes[1].value = "17"; map.submitCoordinates();
    assert.equal(field.target, null); assert.match(field.navigationStatus, /整数/);
  }
  map.syncVisibility(false);
});

test("a floor transition invalidates an old coordinate form before it can move the player", () => {
  const { field, map } = fixture();
  map.syncVisibility?.(true);
  const boxes = [...InputBox.live]; assert.equal(boxes.length, 2);
  boxes[0].value = "42"; boxes[1].value = "17"; field.floor = 2; map.submitCoordinates();
  assert.equal(field.target, null); assert.match(field.navigationStatus, /地图已改变/);
  map.syncVisibility(false);
});
