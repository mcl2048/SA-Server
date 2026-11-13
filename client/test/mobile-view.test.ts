import test from "node:test";
import assert from "node:assert/strict";

// Minimal DOM fixture tests real module event handlers; no game/assets are fabricated.
class Element extends EventTarget {
  parentNode: Element | null = null;
  children: Element[] = [];
  dataset: Record<string, string> = {};
  style: Record<string, any> = { setProperty(k: string, v: string) { this[k] = v; }, removeProperty(k: string) { delete this[k]; } };
  captured = new Set<number>();
  width = 800; height = 600;
  rect = { left: 0, top: 0, width: 390, height: 500 };
  classList = { toggle: (_name: string, _on: boolean) => {} };
  get parentElement() { return this.parentNode; }
  get nextSibling() { const siblings = this.parentNode?.children ?? []; return siblings[siblings.indexOf(this) + 1] ?? null; }
  append(child: Element) { child.remove(); child.parentNode = this; this.children.push(child); }
  insertBefore(child: Element, next: Element | null) { child.remove(); child.parentNode = this; const i = next ? this.children.indexOf(next) : -1; this.children.splice(i < 0 ? this.children.length : i, 0, child); }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  getBoundingClientRect() { return this.rect; }
  setPointerCapture(id: number) { this.captured.add(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
}
const body = new Element(), stage = new Element(), after = new Element();
const root = new Element(), viewport = new Element(), chrome = new Element(), canvas = new Element();
body.append(stage); body.append(after); stage.append(canvas); root.append(viewport); root.append(chrome);
const doc = Object.assign(new EventTarget(), {
  documentElement: new Element(), hidden: false,
  querySelector: () => stage,
  getElementById: (id: string) => ({ "mobile-root": root, "mobile-viewport": viewport, "mobile-chrome": chrome }[id]),
  createElement: () => new Element(),
});
const win = new EventTarget();
const frames: FrameRequestCallback[] = [];
let coarse = false;
const resizeObservers: ((entries: any[]) => void)[] = [];
Object.assign(globalThis, {
  document: doc, window: win, location: { search: "" }, innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
  localStorage: { getItem: () => null, setItem: () => {} },
  matchMedia: () => ({ get matches() { return coarse; }, addEventListener: () => {} }),
  requestAnimationFrame: (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; },
  addEventListener: win.addEventListener.bind(win),
  ResizeObserver: class { constructor(cb: (entries: any[]) => void) { resizeObservers.push(cb); } observe() {} },
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { maxTouchPoints: 1 } });
const view = await import("../src/mobile-view.ts");
const { Mouse, Ui, InputBox, fitView, fitOverlay } = await import("../src/ui.ts");
const flush = () => { while (frames.length) frames.shift()!(0); };
const fire = (target: EventTarget, type: string, values: Record<string, any> = {}) => {
  const event = Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, clientX: 50, clientY: 60, button: 0, pointerType: "touch", ...values });
  target.dispatchEvent(event);
  return event;
};

test("narrow desktop remains desktop; modes move and restore the original stage", () => {
  assert.equal(view.isMobile(), false);
  assert.equal(stage.parentNode, body);
  let changes = 0;
  doc.addEventListener("sa-device-change", () => changes++);
  view.setDeviceMode("mobile"); flush();
  assert.equal(view.isMobile(), true);
  assert.equal(stage.parentNode, viewport);
  assert.equal(stage.style["--mobile-scale"], String(390 / 800));
  view.setMobileScene(true); flush();
  assert.equal(stage.style["--mobile-scale"], String(390 / 800));
  assert.equal(stage.style["--mobile-top"], "0px");
  view.setSceneZoom(4); flush(); assert.equal(stage.style["--mobile-scale"], String(4 * 390 / 800));
  view.setSceneZoom(-1); flush(); assert.equal(stage.style["--mobile-scale"], String(.5 * 390 / 800));
  view.resetSceneView(); flush(); assert.equal(stage.style["--mobile-scale"], String(390 / 800));
  view.setDeviceMode("desktop"); flush();
  assert.deepEqual(body.children, [stage, after]);
  assert.equal(stage.style["--mobile-scale"], undefined);
  coarse = true;
  view.setDeviceMode("auto"); flush(); assert.equal(view.isMobile(), true);
  assert.equal(changes, 3);
});

test("IME confirmation never reaches native submit handlers or prevents composition", () => {
  const box = new InputBox(canvas as any, 10, 10, 100, 20);
  let submits = 0;
  box.el.addEventListener("keydown", e => { if (e.key === "Enter") submits++; });
  const key = (values: Record<string, any> = {}) => fire(box.el, "keydown", { key: "Enter", ...values });
  assert.equal(key({ isComposing: true }).defaultPrevented, false);
  key({ keyCode: 229 });
  fire(box.el, "compositionstart"); key();
  assert.equal(submits, 0);
  fire(box.el, "compositionend"); key(); assert.equal(submits, 1);
  fire(box.el, "compositionstart"); fire(box.el, "blur"); key(); assert.equal(submits, 2);
  box.remove();
});

test("mobile taps release once; drag, multitouch, cancel, lost capture and blur never click", () => {
  view.setDeviceMode("mobile");
  const mouse = new Mouse(); mouse.attach(canvas as any);
  canvas.rect = { left: -145, top: -20, width: 680, height: 510 };
  fire(canvas, "pointerdown"); assert.equal(mouse.down, true); assert.equal(mouse.clicked, false);
  fire(canvas, "pointerup"); assert.equal(mouse.down, false); assert.equal(mouse.clicked, true);
  assert.equal(mouse.x, 195 * 800 / 680); assert.equal(mouse.y, 80 * 600 / 510);
  mouse.cancel(); fire(canvas, "mousedown"); assert.equal(mouse.clicked, false);
  for (const cancel of ["pointercancel", "lostpointercapture"]) {
    fire(canvas, "pointerdown"); fire(canvas, cancel); fire(canvas, "pointerup");
    assert.equal(mouse.down, false); assert.equal(mouse.clicked, false);
  }
  fire(canvas, "pointerdown"); fire(canvas, "pointermove", { clientX: 100 }); fire(canvas, "pointerup", { clientX: 100 });
  assert.equal(mouse.clicked, false);
  fire(canvas, "pointerdown"); fire(canvas, "pointerdown", { pointerId: 2 });
  fire(canvas, "pointerup"); fire(canvas, "pointerup", { pointerId: 2 });
  assert.equal(mouse.clicked, false); assert.equal(mouse.down, false);
  fire(canvas, "pointerdown"); fire(win, "blur"); fire(canvas, "pointerup");
  assert.equal(mouse.clicked, false); assert.equal(mouse.down, false);
  view.setDeviceMode("desktop");
  fire(canvas, "mousedown"); assert.equal(mouse.clicked, true); assert.equal(mouse.down, true);
  fire(win, "mouseup"); assert.equal(mouse.down, false);
  mouse.cancel(); fire(canvas, "mousedown", { button: 2 }); assert.equal(mouse.rightClicked, true);
});

test("two-finger scene pinch cancels game hold, clamps zoom and resets view", () => {
  view.setDeviceMode("mobile"); view.setMobileScene(true); view.resetSceneView(); flush();
  const mouse = new Mouse(); mouse.attach(canvas as any);
  fire(canvas, "pointerdown"); assert.equal(mouse.down, true);
  fire(viewport, "pointerdown", { clientX: 100, clientY: 200 });
  fire(viewport, "pointerdown", { pointerId: 2, clientX: 200, clientY: 200 });
  assert.equal(mouse.down, false);
  fire(viewport, "pointermove", { pointerId: 2, clientX: 700, clientY: 200 }); flush();
  assert.equal(view.getSceneZoom(), 4);
  fire(viewport, "pointerup", { pointerId: 2 });
  fire(viewport, "pointerup"); fire(canvas, "pointerup");
  assert.equal(mouse.clicked, false);
  view.resetSceneView(); flush(); assert.equal(view.getSceneZoom(), 1);
});

test("mobile action snapshots respect topmost modal blockers and retain non-highlight actions", () => {
  const ui = new Ui({} as any, new Mouse());
  ui.hitBox(0, 0, 100, 100, "underlying");
  ui.hitBox(0, 0, 800, 600, "modal-block", false);
  ui.hitBox(20, 20, 60, 60, "login", false);
  ui.text(24, 24, "登录", "#fff");
  assert.deepEqual(ui.getMobileActions().map(h => [h.id, h.label]), [["login", "登录"]]);
});

test("mobile backing budgets and managed input layout do not change desktop sizing", () => {
  view.setDeviceMode("desktop");
  fitView(canvas as any);
  resizeObservers.at(-1)!([{ devicePixelContentBoxSize: [{ inlineSize: 3600, blockSize: 2700 }] }]);
  fitView(canvas as any); assert.deepEqual([canvas.width, canvas.height], [3600, 2700]);
  view.setDeviceMode("mobile"); fitView(canvas as any);
  assert.deepEqual([canvas.width, canvas.height], [2048, 1536]);
  fitOverlay(canvas as any, { setTransform() {} } as any);
  assert.ok(canvas.width <= 2048 && canvas.height <= 1536);
  const box = new InputBox(canvas as any, 10, 20, 200, 24);
  assert.equal(box.el.dataset.logicalX, "10");
  assert.ok(parseFloat(box.el.style.fontSize) >= 16);
  assert.equal(box.el.style.left, "10px"); // Parent transform applies the mobile scale once.
  assert.equal(box.el.style.top, "20px");
  box.el.dataset.mobileManaged = "true";
  box.el.style.left = "77px"; box.layout(); assert.equal(box.el.style.left, "77px");
  view.setDeviceMode("desktop"); box.layout(); assert.notEqual(box.el.style.left, "77px");
  box.remove();
});
