import test from "node:test";
import assert from "node:assert/strict";

// DOM contract checks only; end-to-end game/browser acceptance is performed by the host.
class Element extends EventTarget {
  children = []; parentNode = null; dataset = {}; attrs = new Map(); hidden = false; textContent = "";
  style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } };
  classList = { toggle() {} }; captured = new Set(); value = ""; type = "";
  constructor(tag = "div") { super(); this.tagName = tag.toUpperCase(); }
  get parentElement() { return this.parentNode; }
  get firstChild() { return this.children[0] ?? null; }
  get firstElementChild() { return this.firstChild; }
  get lastElementChild() { return this.children.at(-1) ?? null; }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] ?? null; }
  get isConnected() { return !!this.parentNode; }
  append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); } }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  insertBefore(child, next) { child.remove(); const i = this.children.indexOf(next); child.parentNode = this; this.children.splice(i < 0 ? this.children.length : i, 0, child); }
  setAttribute(k, v) { this.attrs.set(k, v); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  removeAttribute(k) { this.attrs.delete(k); }
  hasAttribute(k) { return this.attrs.has(k); }
  contains(el) { return this === el || this.children.some(c => c.contains(el)); }
  focus() { document.activeElement = this; }
  setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 500 }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  closest(selector) { if (selector === "[hidden]" && this.hidden) return this; return this.parentNode?.closest(selector) ?? null; }
  querySelectorAll(selector) {
    const all = this.children.flatMap(c => [c, ...c.querySelectorAll("*")]);
    if (selector === "*") return all;
    return all.filter(c => selector.split(",").some(s => c.tagName === s.replace(/\[.*$/, "").toUpperCase()));
  }
  querySelector(s) { return this.querySelectorAll(s)[0] ?? null; }
}
const body = new Element("body"), head = new Element("head"), root = new Element(), viewport = new Element(), chrome = new Element(), stage = new Element(), canvas = new Element("canvas");
body.append(stage, root); stage.append(canvas); root.append(viewport, chrome);
const doc = Object.assign(new EventTarget(), { body, head, documentElement: new Element(), activeElement: body, hidden: false,
  createElement: tag => new Element(tag),
  querySelector: () => stage,
  getElementById: id => ({ "mobile-root": root, "mobile-viewport": viewport, "mobile-chrome": chrome })[id] ?? [...body.querySelectorAll("*"), ...head.querySelectorAll("*")].find(e => e.id === id),
});
const win = new EventTarget();
Object.assign(globalThis, { document: doc, HTMLElement: Element, window: win, location: { search: "" }, innerWidth: 390, innerHeight: 844,
  localStorage: { getItem: () => null, setItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {} }),
  requestAnimationFrame: () => 1, addEventListener: win.addEventListener.bind(win), ResizeObserver: class { observe() {} },
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { maxTouchPoints: 0 } });
const { MobileShell } = await import("../src/mobile-shell.ts");
const { InputBox } = await import("../src/ui.ts");
const { setDeviceMode } = await import("../src/mobile-view.ts");
const fired = [];
let hits = [];
const ui = { texts: [], bottomLine: "", getMobileActions: () => hits };
const shell = new MobileShell(ui, { action: id => fired.push(["action", id]), command: name => fired.push(["command", name]), direction: dir => fired.push(["direction", dir]), cancel: () => fired.push(["cancel"]), navigate: dir => fired.push(["navigate", dir]), click: button => fired.push(["click", button]) });
const frame = (phase = "login", panel = false) => shell.frame({ phase, panel });
const fire = (el, type, props = {}) => el.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), props));
const allButtons = () => body.querySelectorAll("button");

test("desktop shell stays hidden; original inputs retain identity, focus and edits across mobile frames", () => {
  frame(); assert.equal(chrome.firstChild.hidden, true);
  const box = new InputBox(canvas, 456, 154, 92, 16); box.value = "player"; box.focus();
  setDeviceMode("mobile"); frame();
  const parent = box.el.parentNode;
  assert.notEqual(parent, stage); assert.equal(document.activeElement, box.el);
  box.value = "输入中"; box.el.selectionStart = 2;
  for (let i = 0; i < 30; i++) frame();
  assert.equal(box.el.parentNode, parent); assert.equal(box.value, "输入中"); assert.equal(box.el.selectionStart, 2);
  assert.equal(document.activeElement, box.el);
  setDeviceMode("desktop"); frame();
  assert.equal(box.el.parentNode, stage); assert.equal(box.el.dataset.mobileManaged, undefined);
  box.remove();
});

test("unchanged presentation skips DOM synchronization but same-position replacement inputs are adopted", () => {
  setDeviceMode("mobile"); hits = []; frame();
  const original = shell.syncInputs;
  let calls = 0;
  shell.syncInputs = function(...args) { calls++; return original.apply(this, args); };
  for (let i = 0; i < 60; i++) frame();
  assert.equal(calls, 0);
  const first = new InputBox(canvas, 456, 154, 92, 16); frame();
  assert.equal(calls, 1); assert.equal(first.el.dataset.mobileManaged, "true");
  first.remove(); const second = new InputBox(canvas, 456, 154, 92, 16); frame();
  assert.equal(calls, 2); assert.equal(second.el.dataset.mobileManaged, "true");
  second.remove(); frame();
  shell.syncInputs = original;
});

test("only reachable controls render; removed controls cannot dispatch stale queued actions", () => {
  setDeviceMode("mobile");
  hits = [{ id: "ok", x1: 400, y1: 296, x2: 480, y2: 395 }, { id: "modal-block", x1: 0, y1: 0, x2: 800, y2: 600 }]; frame();
  const ok = allButtons().find(b => b.dataset.action === "ok");
  assert.equal(ok.textContent, "进入游戏"); assert.equal(allButtons().some(b => b.dataset.action === "modal-block"), false);
  fire(ok, "click"); assert.deepEqual(fired.at(-1), ["action", "ok"]);
  hits = []; frame(); const n = fired.length; fire(ok, "click"); assert.equal(fired.length, n);
});

test("joystick uses eight original directions, center dead zone and all cancellation paths", () => {
  frame("field"); const joy = body.querySelectorAll("*").find(e => e.dataset.mobileControl === "joystick");
  joy.getBoundingClientRect = () => ({ left: 0, top: 0, width: 112, height: 112 });
  const point = (type, x, y, id = 1) => fire(joy, type, { clientX: x, clientY: y, pointerId: id, isPrimary: true });
  point("pointerdown", 56, 56); assert.notDeepEqual(fired.at(-1), ["direction", 0]);
  for (const [x, y, dir] of [[100,56,6],[100,100,7],[56,100,0],[12,100,1],[12,56,2],[12,12,3],[56,12,4],[100,12,5]]) {
    point("pointermove", x, y); assert.deepEqual(fired.at(-1), ["direction", dir]);
  }
  point("pointermove",56,56); assert.deepEqual(fired.at(-1), ["direction", -1]);
  for (const end of ["pointerup", "pointercancel", "lostpointercapture"]) {
    point("pointermove",56,12); point(end,56,12); assert.deepEqual(fired.at(-2), ["direction",-1]); assert.deepEqual(fired.at(-1),["cancel"]);
    point("pointerdown",56,12);
  }
  fire(doc,"sa-controls-drag"); assert.deepEqual(fired.at(-2), ["direction",-1]);
  point("pointerdown",56,12); frame("field",true); assert.deepEqual(fired.at(-1),["cancel"]);
  const count=fired.length; point("pointerdown",56,12); assert.equal(fired.length,count);
  frame("field"); point("pointerdown",56,12); setDeviceMode("desktop"); assert.deepEqual(fired.at(-1),["cancel"]);
});

test("navigation and mouse controls dispatch semantic hooks without clearing cursor", () => {
  setDeviceMode("mobile"); shell.frame({phase:"login",panel:false,selectedLabel:"进入游戏",selectedId:"ok"});
  for (const [label,expected] of [["上一个选项",["navigate",-1]],["下一个选项",["navigate",1]],["鼠标左键",["click",0]],["鼠标右键",["click",2]]]) {
    const before=fired.length;fire(allButtons().find(b=>b.getAttribute("aria-label")===label),"click");
    assert.equal(fired.length,before+1);assert.deepEqual(fired.at(-1),expected);
  }
  assert.equal(body.querySelectorAll("*").find(e=>e.className==="mobile-shell-selected").textContent,"进入游戏");
});

test("selection labels resolve native IDs and layout events never interrupt unchanged holds", () => {
  setDeviceMode("mobile"); hits = [{id:"ok",x1:400,y1:296,x2:480,y2:395}];
  let events = 0; const listen = () => events++; doc.addEventListener("sa-controls-layout", listen);
  shell.frame({phase:"login",panel:false,selectedId:"ok",selectedLabel:"ok"});
  assert.equal(body.querySelectorAll("*").find(e=>e.className==="mobile-shell-selected").textContent,"进入游戏");
  const unchanged = events;
  for (let i=0;i<20;i++) shell.frame({phase:"login",panel:false,selectedId:"ok",selectedLabel:"ok"});
  assert.equal(events,unchanged);
  shell.frame({phase:"field",panel:false}); assert.equal(events,unchanged+1);
  shell.frame({phase:"field",panel:false,status:"changed HP"}); assert.equal(events,unchanged+1);
  shell.frame({phase:"field",panel:true}); assert.equal(events,unchanged+2);
  doc.removeEventListener("sa-controls-layout",listen); hits=[];
});

test("battle commands and targets remain human readable in a bounded sheet", () => {
  setDeviceMode("mobile");
  ui.texts = [{ x: 120, y: 120, text: "乌力 LV5" }];
  hits = [{ id: "b-attack", x1: 600, y1: 300, x2: 650, y2: 350 }, { id: "t-10", x1: 100, y1: 150, x2: 140, y2: 210 }];
  frame("battle");
  assert.equal(chrome.firstChild.dataset.layout, "battle");
  assert.equal(allButtons().find(b => b.dataset.action === "b-attack").textContent, "攻击");
  assert.match(allButtons().find(b => b.dataset.action === "t-10").textContent, /乌力/);
  assert.match(head.firstChild.textContent, /data-orientation='landscape'/);
  assert.equal(chrome.querySelector("canvas"), null); // The real game viewport replaces previews.
  ui.texts = []; hits = [];
});

test("native panels hide background controls and actor names, and accept contextual labels", () => {
  setDeviceMode("mobile");
  ui.texts = [{ x: 400, y: 200, text: "无关 NPC", align: "center" }, { x: 100, y: 100, text: "道具说明" }];
  hits = [{ id: "tb-map", x1: 20, y1: 580, x2: 40, y2: 600 }, { id: "chat-all", x1: 778, y1: 473, x2: 795, y2: 490 }, { id: "inv-side0", label: "壹", x1: 500, y1: 100, x2: 530, y2: 140 }, { id: "inv-9", x1: 500, y1: 200, x2: 550, y2: 250 }];
  shell.frame({ phase: "field", panel: true, actionLabels: { "inv-9": "回复药 × 2" } });
  assert.equal(allButtons().some(b => b.dataset.action === "tb-map" || b.dataset.action === "chat-all"), false);
  assert.equal(allButtons().find(b => b.dataset.action === "inv-side0").textContent, "人物道具");
  assert.equal(allButtons().find(b => b.dataset.action === "inv-9").textContent, "回复药 × 2");
  const paragraphs = chrome.querySelectorAll("p").map(p => p.textContent);
  assert.equal(paragraphs.includes("无关 NPC"), false); assert.equal(paragraphs.includes("道具说明"), true);
  assert.equal(chrome.querySelector("canvas"), null);
  frame("make"); assert.equal(chrome.querySelector("canvas"), null);
  ui.texts = []; hits = [];
});

test("chat panel keeps real chat input visible and dispatches send-chat", () => {
  setDeviceMode("mobile"); const box = new InputBox(canvas, 70, 554, 600, 16); box.value = "你好";
  frame("field", true);
  assert.equal(box.el.parentNode.hidden, false);
  const send = allButtons().find(b => b.textContent === "发送聊天"); assert.equal(send.hidden, false);
  fire(send, "click"); assert.deepEqual(fired.at(-1), ["command", "send-chat"]);
  hits = [{ id: "npc-btn0", label: "确定", x1: 300, y1: 400, x2: 350, y2: 420 }];
  frame("field", true); assert.equal(box.el.parentNode.hidden, true);
  const dismiss = allButtons().find(b => b.textContent === "返回 / 取消对话");
  assert.equal(dismiss.hidden, false); fire(dismiss, "click");
  assert.deepEqual(fired.at(-1), ["command", "back"]);
  box.remove(); hits = []; frame("field"); assert.equal(dismiss.hidden, true);
});
