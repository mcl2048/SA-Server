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
const layoutCallbacks = [];
Object.assign(globalThis, { document: doc, HTMLElement: Element, window: win, location: { search: "" }, innerWidth: 390, innerHeight: 844,
  localStorage: { getItem: () => null, setItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {} }),
  requestAnimationFrame: callback => { layoutCallbacks.push(callback); return layoutCallbacks.length; }, addEventListener: win.addEventListener.bind(win), ResizeObserver: class { observe() {} },
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

test("quick battle over the field renders its two live toggles as visible DOM actions with movement controls hidden", async () => {
  const { drawAutoPlayToggles } = await import("../src/autoplay-sync.ts");
  setDeviceMode("mobile");
  // These are the exact hits emitted by the shared quick/normal battle renderer.
  const controls = [];
  drawAutoPlayToggles({ textButton(x, y, text, _color, id) {
    controls.push({ id, label: text, x1: x, y1: y, x2: x + 90, y2: y + 18 });return false;
  } }, true, true, () => {}, () => {});
  hits = controls;
  frame("field"); // Reproduce the previous consumer: valid hits, hidden sheet.
  assert.equal(shell.sheet.hidden, true);
  assert.equal(allButtons().some(b => b.dataset.action === "battle-quick-toggle"), false);
  frame("battle"); // Quick mode keeps the actual map but reports battle phase.
  assert.equal(chrome.firstChild.dataset.layout, "battle");
  assert.equal(shell.sheet.hidden, false);assert.equal(shell.field.hidden, true);assert.equal(shell.toolbar.hidden, true);
  for (const id of ["battle-auto-toggle", "battle-quick-toggle"]) {
    const matches = allButtons().filter(b => b.dataset.action === id);
    assert.equal(matches.length, 1);assert.equal(matches[0].closest("[hidden]"), null);
    const before = fired.length;fire(matches[0], "click");
    assert.deepEqual(fired.slice(before), [["cancel"], ["action", id]]);
  }
  hits = [];frame("field");
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


test("movement precedes long option panels and encounter uses server capability and ack", () => {
  setDeviceMode("mobile"); hits = Array.from({length:40}, (_,i)=>({id:`option${i}`,label:`长选项 ${i}`,x1:1,y1:i*10,x2:60,y2:i*10+9}));
  shell.frame({phase:"field",panel:false,canEncounter:false,encounter:false});
  const control = allButtons().find(b=>b.dataset.mobileControl==="auto-encounter");
  assert.equal(control.hidden,true);
  shell.frame({phase:"field",panel:false,canEncounter:true,encounter:false});
  assert.equal(control.hidden,false); assert.equal(control.getAttribute("aria-pressed"),"false");
  fire(control,"click"); assert.deepEqual(fired.at(-1),["command","auto-encounter"]);
  assert.equal(control.getAttribute("aria-pressed"),"false","tap cannot invent a server acknowledgement");
  shell.frame({phase:"field",panel:true,canEncounter:true,encounter:true});
  assert.equal(control.getAttribute("aria-pressed"),"true"); assert.equal(control.disabled,true);
  const left=chrome.firstChild.children[0];
  assert.equal(left.children[0].className,"mobile-shell-field","stick is first in DOM, before options");
  shell.frame({phase:"battle",panel:false,canEncounter:true});
  assert.equal(left.children[0].hidden,true,"battle cannot expose the movement shortcut");
});

test("native column registration is presented in visual row order and keeps action identity", () => {
  setDeviceMode("mobile");
  // Native renderers may register one whole column before the next. On a phone,
  // the increase button must remain next to its own statistic, not the next row.
  hits = [
    {id:"earth",label:"地属性",x1:100,y1:100,x2:150,y2:120},
    {id:"water",label:"水属性",x1:100,y1:150,x2:150,y2:170},
    {id:"earth-plus",label:"增加地属性",x1:250,y1:102,x2:290,y2:122},
    {id:"water-plus",label:"增加水属性",x1:250,y1:152,x2:290,y2:172},
  ];
  frame("make");
  const rendered = allButtons().filter(b => b.dataset.action);
  assert.deepEqual(rendered.map(b => b.dataset.action), ["earth","earth-plus","water","water-plus"]);
  const plus = rendered[1]; plus.focus();
  hits[2] = {...hits[2],label:"增加地属性（剩余 3）"}; frame("make");
  assert.equal(allButtons().find(b => b.dataset.action === "earth-plus"), plus);
  assert.equal(document.activeElement, plus);
  assert.equal(plus.textContent, "增加地属性（剩余 3）");
  fire(plus,"click"); assert.deepEqual(fired.at(-1), ["action","earth-plus"]);
  hits = []; frame("field");
});

test("immersive scene exposes a cancellable menu tray and restores classic panels", async () => {
  const view = await import("../src/mobile-view.ts");
  setDeviceMode("mobile"); view.setMobileDisplayMode("immersive"); view.setMobileContext("field");
  hits=[]; frame("field");
  const toggle=allButtons().find(b=>b.dataset.mobileControl==="menu-tray");
  assert.ok(toggle,"fullscreen play needs a discoverable menu");
  assert.equal(toggle.hidden,false); assert.equal(toggle.getAttribute("aria-expanded"),"false");
  const toolbar=body.querySelectorAll("*").find(e=>e.className==="mobile-shell-toolbar");
  assert.equal(toolbar.hidden,true,"scene remains clear until the player opens its menu");
  const before=fired.length;fire(toggle,"click");
  assert.equal(toggle.getAttribute("aria-expanded"),"true");assert.equal(toolbar.hidden,false);
  assert.ok(fired.slice(before).some(e=>e[0]==="cancel"),"opening a tray must release movement");
  fire(allButtons().find(b=>b.dataset.mobileControl==="menu-status"),"click");frame("field");
  assert.deepEqual(fired.at(-1),["command","status"]);
  assert.equal(toggle.getAttribute("aria-expanded"),"false");
  view.setMobileContext("panel");frame("field",true);
  assert.equal(toggle.hidden,true);assert.equal(shell.sheet.hidden,false);
  view.setMobileDisplayMode("classic");view.setMobileContext("field");frame("field");
  assert.equal(toggle.hidden,true);assert.equal(toolbar.hidden,false);
});

test("immersive battle camera stays a view command and native targets keep their real IDs", async () => {
  const view=await import("../src/mobile-view.ts");
  setDeviceMode("mobile");view.setMobileDisplayMode("immersive");view.setMobileContext("battle");
  hits=[{id:"pt-12",x1:200,y1:150,x2:250,y2:200}];
  shell.frame({phase:"battle",panel:false,actionLabels:{"pt-12":"目标 · 乌力 Lv.5 · HP 120/160"}});
  const camera=allButtons().find(b=>b.dataset.mobileControl==="camera-enemy");
  assert.ok(camera);fire(camera,"click");assert.deepEqual(fired.at(-1),["command","camera-enemy"]);
  const target=allButtons().find(b=>b.dataset.action==="pt-12");
  assert.match(target.textContent,/乌力/);fire(target,"click");assert.deepEqual(fired.at(-1),["action","pt-12"]);
  hits=[];frame("battle");const count=fired.length;fire(target,"click");assert.equal(fired.length,count);
  view.setMobileDisplayMode("classic");view.setMobileContext("field");frame("field");
});

test("switching to desktop during browser fullscreen retains the explicit exit control", () => {
  // The platform may retain fullscreen after the player switches presentation.
  // Touchscreen users must still be able to exit without a physical Escape key.
  document.fullscreenElement = stage;
  setDeviceMode("desktop"); frame("desktop");
  const exit = allButtons().find(b=>b.dataset.mobileControl==="fullscreen");
  assert.equal(exit.hidden,false);assert.equal(exit.textContent,"退出全屏");
  document.fullscreenElement = null;setDeviceMode("mobile");frame("field");
});

test("quick battle preserves its field context and native battle panels restore the complete layout", async () => {
  const view=await import("../src/mobile-view.ts");
  const layout=()=>{for(let i=0;layoutCallbacks.length&&i<20;i++)layoutCallbacks.shift()(0);};
  setDeviceMode("mobile");view.setMobileDisplayMode("immersive");view.setMobileContext("field");layout();
  hits=[{id:"battle-quick-toggle",label:"快速战斗 开",x1:20,y1:20,x2:120,y2:40}];
  shell.frame({phase:"battle",panel:false,context:"field",cameraAvailable:false});layout();
  assert.equal(root.dataset.context,"field","quick combat displays the map at full size");
  const camera=body.querySelectorAll("*").find(e=>e.className==="mobile-shell-camera");
  assert.equal(camera.hidden,true,"quick battle has no visible battle actors to focus");
  shell.frame({phase:"battle",panel:true,context:"panel",cameraAvailable:true});layout();
  assert.equal(chrome.firstChild.dataset.layout,"full");assert.equal(camera.hidden,true);
  assert.equal(root.dataset.context,"panel");
  hits=[];view.setMobileDisplayMode("classic");frame("field");layout();
});

test("immersive battle starts with clear actors and native toggles, then exposes and closes commands", async () => {
  const view=await import("../src/mobile-view.ts");
  setDeviceMode("mobile");view.setMobileDisplayMode("classic");frame("field");
  hits=[{id:"battle-auto-toggle",label:"自动：关",x1:20,y1:20,x2:100,y2:40},
    {id:"battle-quick-toggle",label:"快速：关",x1:150,y1:20,x2:230,y2:40},
    {id:"b-guard",x1:600,y1:200,x2:650,y2:240},
    {id:"t-15",x1:120,y1:100,x2:150,y2:150}];
  shell.frame({phase:"battle",panel:false,context:"battle"});
  const originalAuto=allButtons().find(b=>b.dataset.action==="battle-auto-toggle");
  view.setMobileDisplayMode("immersive");shell.frame({phase:"battle",panel:false,context:"battle"});
  assert.equal(shell.sheet.hidden,true,"legacy remembered attack targets cannot cover the default actor view");
  const auto=allButtons().filter(b=>b.dataset.action==="battle-auto-toggle");
  assert.equal(auto.length,1);assert.equal(auto[0],originalAuto);assert.equal(auto[0].closest("[hidden]"),null);
  const toggle=allButtons().find(b=>b.dataset.mobileControl==="battle-commands");assert.ok(toggle);assert.equal(toggle.hidden,false);
  fire(toggle,"click");assert.equal(shell.sheet.hidden,false);assert.equal(toggle.getAttribute("aria-expanded"),"true");
  fire(allButtons().find(b=>b.dataset.action==="t-15"),"click");assert.deepEqual(fired.at(-1),["action","t-15"]);
  hits=hits.slice(0,2);shell.frame({phase:"battle",panel:false,context:"battle"});assert.equal(shell.sheet.hidden,true);
  hits=[{id:"bitem-9",label:"回复药",x1:520,y1:120,x2:650,y2:160}];
  shell.frame({phase:"battle",panel:true,context:"panel"});
  hits=[{id:"mt-0",x1:600,y1:450,x2:650,y2:500}];
  shell.frame({phase:"battle",panel:false,context:"battle"});assert.equal(shell.sheet.hidden,false,"returning from a native item menu must expose its required target");
  hits=[];view.setMobileDisplayMode("classic");frame("field");
});

test("immersive field tray exposes reachable native social controls without duplicating toolbar menus", async () => {
  const view=await import("../src/mobile-view.ts");setDeviceMode("mobile");view.setMobileDisplayMode("immersive");
  hits=[{id:"tb-status",x1:20,y1:550,x2:50,y2:585},
    {id:"tb-mail",x1:60,y1:550,x2:90,y2:585},
    {id:"fp-party",x1:10,y1:20,x2:40,y2:50},
    {id:"fp-trade",x1:50,y1:20,x2:80,y2:50}];
  shell.frame({phase:"field",panel:false,context:"field"});
  const extra=allButtons().find(b=>b.dataset.action==="fp-party");assert.ok(extra);
  assert.equal(allButtons().some(b=>b.dataset.action==="tb-status"),false);
  assert.equal(allButtons().some(b=>b.dataset.action==="tb-mail"),true);
  fire(allButtons().find(b=>b.dataset.mobileControl==="menu-tray"),"click");assert.equal(extra.closest("[hidden]"),null);
  fire(extra,"click");assert.deepEqual(fired.at(-1),["action","fp-party"]);
  hits=[];frame("field");const before=fired.length;fire(extra,"click");assert.equal(fired.length,before);
  view.setMobileDisplayMode("classic");frame("field");
});

test("immersive native panels remain in the game viewport and hide movement behind the dialog", async () => {
  const view=await import("../src/mobile-view.ts");
  setDeviceMode("mobile");view.setMobileDisplayMode("immersive");
  hits=[{id:"npc-btn0",label:"继续冒险",x1:200,y1:400,x2:300,y2:440}];
  ui.texts=[{x:180,y:180,text:"村长：欢迎来到萨姆吉尔。"}];
  shell.frame({phase:"field",panel:true,context:"panel"});
  assert.equal(chrome.firstChild.dataset.immersive,"true", "dialogs share the fullscreen in-game presentation");
  assert.equal(shell.sheet.hidden,false);assert.equal(shell.field.hidden,true);
  assert.equal(shell.sheet.getAttribute("role"),"dialog");
  assert.equal(shell.sheet.getAttribute("aria-modal"),"true");
  fire(allButtons().find(b=>b.dataset.action==="npc-btn0"),"click");
  assert.deepEqual(fired.at(-1),["action","npc-btn0"]);
  hits=[{id:"bitem-9",label:"回复药",x1:520,y1:120,x2:650,y2:160}];
  shell.frame({phase:"battle",panel:true,context:"panel"});
  assert.equal(chrome.firstChild.dataset.immersive,"true");
  assert.equal(allButtons().find(b=>b.dataset.action==="bitem-9").textContent,"回复药");
  hits=[];ui.texts=[];view.setMobileDisplayMode("classic");frame("field");
});

test("fullscreen map paints native map layers and maps taps back to the original hit coordinates", async () => {
  const view=await import("../src/mobile-view.ts");setDeviceMode("mobile");view.setMobileDisplayMode("immersive");
  const drawn=[];Element.prototype.getContext=()=>({clearRect(){},drawImage(...args){drawn.push(args);}});
  const calls=[];shell.hooks.point=(...args)=>calls.push(args);
  const base={width:430,height:356},marks={width:430,height:356};
  ui.pics=[{canvas:base,x:264,y:106},{canvas:marks,x:264,y:106}];
  hits=[{id:"map-area",x1:264,y1:106,x2:694,y2:462}];
  shell.frame({phase:"field",panel:true,context:"panel"});
  const surface=body.querySelectorAll("canvas").find(el=>el.dataset.mobileMap==="true");
  assert.ok(surface);assert.equal(drawn.length,2);assert.equal(drawn[0][0],base);assert.equal(drawn[1][0],marks);
  surface.getBoundingClientRect=()=>({left:20,top:30,width:215,height:178});
  fire(surface,"pointerdown",{pointerId:71,isPrimary:true,clientX:127.5,clientY:119});
  fire(surface,"pointerup",{pointerId:71,clientX:127.5,clientY:119});
  assert.deepEqual(calls,[["map-area",479,284]]);
  fire(surface,"pointerdown",{pointerId:72,isPrimary:true,clientX:80,clientY:80});
  fire(surface,"pointerup",{pointerId:72,clientX:120,clientY:80});
  assert.equal(calls.length,1,"scrolling across the map cannot start navigation");
  hits=[];ui.pics=[];frame("field");assert.equal(surface.hidden,true);
  delete shell.hooks.point;delete Element.prototype.getContext;view.setMobileDisplayMode("classic");frame("field");
});

test("immersive native collections keep slot art, details and real controls together without duplicate summaries", async () => {
  const view=await import("../src/mobile-view.ts");setDeviceMode("mobile");view.setMobileDisplayMode("immersive");
  hits=[{id:"inv-9",x1:10,y1:10,x2:60,y2:57},{id:"inv-page1",x1:10,y1:60,x2:30,y2:110}];
  ui.cards=[{id:"inv-9",kind:"item",title:"回复药",detail:"背包 1 · 回复耐久",image:24001,actions:["inv-9"]},
    {id:"inv-10",kind:"item",title:"旧道具",detail:"已被新窗口遮住",image:24002,actions:["inv-10"]}];
  ui.texts=[{x:20,y:20,text:"原始数字 123"}];
  shell.frame({phase:"field",panel:true,title:"背包",summary:["重复的全部道具摘要"]});
  const grid=body.querySelectorAll("*").find(e=>e.className==="mobile-native-cards");
  assert.ok(grid,"native slots need a screen-internal collection");
  assert.equal(grid.hidden,false);assert.equal(grid.children.length,1,"occluded slots cannot become mobile actions");
  const item=allButtons().find(b=>b.dataset.action==="inv-9");
  assert.equal(grid.contains(item),true);assert.equal(item.textContent,"回复药");assert.equal(item.dataset.nativeImage,"24001");
  assert.equal(grid.querySelectorAll("*").some(e=>e.textContent==="背包 1 · 回复耐久"),true);
  assert.equal(body.querySelectorAll("p").some(p=>p.textContent==="重复的全部道具摘要"),false);
  fire(item,"click");assert.deepEqual(fired.at(-1),["action","inv-9"]);
  hits=[];ui.cards=[];ui.texts=[];frame("field");const before=fired.length;fire(item,"click");assert.equal(fired.length,before);
  view.setMobileDisplayMode("classic");frame("field");
});

test("fullscreen map drags emit native pointer phases and cancellation never emits a route tap", async()=>{
  const view=await import("../src/mobile-view.ts");setDeviceMode("mobile");view.setMobileDisplayMode("immersive");
  Element.prototype.getContext=()=>({clearRect(){},drawImage(){}});
  const moves=[],taps=[];shell.hooks.pointer=(...args)=>moves.push(args);shell.hooks.point=(...args)=>taps.push(args);
  ui.pics=[{canvas:{width:430,height:356},x:264,y:106}];
  hits=[{id:"map-area",x1:264,y1:106,x2:694,y2:462}];shell.frame({phase:"field",panel:true,context:"panel"});
  const surface=body.querySelectorAll("canvas").find(el=>el.dataset.mobileMap==="true");
  surface.getBoundingClientRect=()=>({left:20,top:30,width:215,height:178});
  fire(surface,"pointerdown",{pointerId:81,isPrimary:true,clientX:100,clientY:100});
  fire(surface,"pointermove",{pointerId:81,clientX:130,clientY:110});
  fire(surface,"pointerup",{pointerId:81,clientX:140,clientY:110});
  assert.deepEqual(moves,[["map-area",424,246,"start"],["map-area",484,266,"move"],["map-area",504,266,"move"],["map-area",504,266,"end"]]);
  assert.deepEqual(taps,[]);
  for(const cancel of ["pointercancel","lostpointercapture","context","hidden","gesture","second","blur"]){
    fire(surface,"pointerdown",{pointerId:82,isPrimary:true,clientX:100,clientY:100});
    fire(surface,"pointermove",{pointerId:82,clientX:130,clientY:110});
    if(cancel==="context"){hits=[];frame("field");}
    else if(cancel==="hidden"){doc.hidden=true;fire(doc,"visibilitychange");doc.hidden=false;}
    else if(cancel==="gesture")fire(doc,"sa-mobile-gesture");
    else if(cancel==="second")fire(doc,"pointerdown",{pointerId:83});
    else if(cancel==="blur")fire(win,"blur");
    else fire(surface,cancel,{pointerId:82});
    assert.equal(moves.at(-1)[3],"cancel",cancel);
    const count=moves.length;fire(surface,"pointerup",{pointerId:82,clientX:130,clientY:110});
    assert.equal(moves.length,count);assert.deepEqual(taps,[]);
    hits=[{id:"map-area",x1:264,y1:106,x2:694,y2:462}];shell.frame({phase:"field",panel:true,context:"panel"});
  }
  hits=[];ui.pics=[];delete shell.hooks.pointer;delete shell.hooks.point;delete Element.prototype.getContext;
  view.setMobileDisplayMode("classic");frame("field");
});

test("native pet detail replaces whole-list summaries and changing game windows resets retained scroll", async () => {
  const view=await import("../src/mobile-view.ts");setDeviceMode("mobile");view.setMobileDisplayMode("immersive");
  hits=[{id:"pet-rename",x1:30,y1:70,x2:90,y2:100}];
  ui.panelInfo={lines:["奥普埃 · Lv.41","HP 574/574","攻击 80 · 防御 90"],nativeTextX:298};
  ui.texts=[{x:74,y:86,text:"41"},{x:298,y:80,text:"预计 攻1.2 防1.3"}];
  shell.frame({phase:"field",panel:true,title:"宠物",summary:["其他宠物的无关简介"]});
  let texts=body.querySelectorAll("p").map(p=>p.textContent);
  assert.ok(texts.includes("HP 574/574"));assert.ok(texts.includes("预计 攻1.2 防1.3"));assert.equal(texts.includes("其他宠物的无关简介"),false);assert.equal(texts.includes("41"),false);
  shell.sheet.scrollTop=700;shell.content.scrollTop=300;
  hits=[{id:"map-in",x1:20,y1:20,x2:80,y2:50}];ui.panelInfo=null;ui.texts=[];
  shell.frame({phase:"field",panel:true,title:"地图"});
  assert.equal(shell.sheet.scrollTop,0);assert.equal(shell.content.scrollTop,0);
  hits=[];frame("field");view.setMobileDisplayMode("classic");frame("field");
});
