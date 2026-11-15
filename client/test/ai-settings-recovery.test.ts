import test from "node:test";
import assert from "node:assert/strict";

const values = new Map<string, string>();
const doc = Object.assign(new EventTarget(), {
  documentElement: {classList: {toggle() {}}}, querySelector: () => null, getElementById: () => null,
  createElement: () => Object.assign(new EventTarget(), {dataset: {}, style: {}, value: "", setAttribute() {}, remove() {}, getContext: () => ({font: "", measureText: (text: string) => ({width: text.length * 7})})}),
});
Object.assign(globalThis, {document: doc, window: {}, location: {search: ""},
  localStorage: {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value)},
  addEventListener() {}, requestAnimationFrame: () => 1, matchMedia: () => ({matches: false, addEventListener() {}})});
const {Ui, Mouse, InputBox} = await import("../src/ui.ts");
const {Menus} = await import("../src/menus.ts");
const {AiWindow} = await import("../src/aisetting.ts");
const {defaultAi, loadAi} = await import("../src/ai.ts");
const awaitInputs = () => InputBox.live;
const canvas = {parentElement: {append() {}, getBoundingClientRect: () => ({left:0,top:0})}, getBoundingClientRect: () => ({left:0,top:0,width:800})} as any;
const {setDeviceMode} = await import("../src/mobile-view.ts");

test("desktop and mobile native settings show the authoritative recovery policy and persist the same threshold", () => {
  for (const mode of ["desktop", "mobile"] as const) {
    setDeviceMode(mode);
    const name = `recovery-${mode}`; values.set(`sa.ai.${name}`, JSON.stringify({...defaultAi(), healAt: 35}));
    const mouse = new Mouse(), ui = new Ui({tile: () => undefined} as any, mouse);
    const ai = new AiWindow({ui, canvas, inv: () => [], petSkills: () => null, autoBattle: () => true, quickBattle: () => false,
      autoEncount: () => false, toggleAuto() {}, toggleQuick() {}, setAutoEncount() {}});
    ai.show(name);
    const draw = () => {ui.begin(); ai.frame([], false); ui.end();}; draw();
    assert.ok(ui.texts.some(text => text.text === "耐久力／气力低于 35％"));
    const rendered = ui.texts.map(text => text.text).join("");
    assert.ok(rendered.includes("肉优先") && rendered.includes("气力"));
    const actions = ui.getMobileActions().map(hit => hit.id);
    assert.ok(actions.indexOf("ai-auto-escape-val") > actions.indexOf("ai-quick-val"));
    assert.ok(actions.indexOf("ai-drop-val") > actions.indexOf("ai-enc-val"));
    assert.ok(![...((awaitInputs()) as any[])].some(box=>box.el.dataset.inputLabel === "自动丢弃关键字"));
    const hit = ui.getMobileActions().find(hit => hit.id === "ai-heal-next")!; assert.ok(hit);
    mouse.x = (hit.x1 + hit.x2) / 2; mouse.y = (hit.y1 + hit.y2) / 2; mouse.clicked = true; draw(); draw();
    assert.equal(loadAi(name).healAt, 40, "the policy sent by main.loadAi must match the native UI value");
    assert.ok(ui.texts.some(text => text.text === "耐久力／气力低于 40％"));
    const drop = ui.getMobileActions().find(hit => hit.id === "ai-drop-val")!;
    mouse.x=(drop.x1+drop.x2)/2;mouse.y=(drop.y1+drop.y2)/2;mouse.clicked=true;draw();draw();
    const box=[...InputBox.live].find(box=>box.el.dataset.inputLabel === "自动丢弃关键字")!;assert.ok(box);
    box.value="石龟 | 蕨";box.el.dispatchEvent(new Event("input"));
    assert.equal(loadAi(name).autoDrop,true);assert.equal(loadAi(name).dropKeywords,"石龟 | 蕨");
    assert.ok(ui.texts.filter(text=>text.text!=="关　闭").every(text=>text.y<456),"basic rows and input remain above Close");
    const menus = Object.assign(Object.create(Menus.prototype), {ai, mapWnd: {syncVisibility() {}}, petWnd: {leave() {}}, gm: {leave() {}}, vendor: {close() {}}, removeAccountBoxes() {}});
    menus.leave();assert.equal(InputBox.live.size,0,"scene leave must remove native keyword inputs");assert.equal(ai.open,false);
  }
  setDeviceMode("desktop");
});
