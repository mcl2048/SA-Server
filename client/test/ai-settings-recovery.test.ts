import test from "node:test";
import assert from "node:assert/strict";

const values = new Map<string, string>();
const doc = Object.assign(new EventTarget(), {
  documentElement: {classList: {toggle() {}}}, querySelector: () => null, getElementById: () => null,
  createElement: () => ({getContext: () => ({font: "", measureText: (text: string) => ({width: text.length * 7})})}),
});
Object.assign(globalThis, {document: doc, window: {}, location: {search: ""},
  localStorage: {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value)},
  addEventListener() {}, requestAnimationFrame: () => 1, matchMedia: () => ({matches: false, addEventListener() {}})});
const {Ui, Mouse} = await import("../src/ui.ts");
const {AiWindow} = await import("../src/aisetting.ts");
const {defaultAi, loadAi} = await import("../src/ai.ts");
const {setDeviceMode} = await import("../src/mobile-view.ts");

test("desktop and mobile native settings show the authoritative recovery policy and persist the same threshold", () => {
  for (const mode of ["desktop", "mobile"] as const) {
    setDeviceMode(mode);
    const name = `recovery-${mode}`; values.set(`sa.ai.${name}`, JSON.stringify({...defaultAi(), healAt: 35}));
    const mouse = new Mouse(), ui = new Ui({tile: () => undefined} as any, mouse);
    const ai = new AiWindow({ui, inv: () => [], petSkills: () => null, autoBattle: () => true, quickBattle: () => false,
      autoEncount: () => false, toggleAuto() {}, toggleQuick() {}, setAutoEncount() {}});
    ai.show(name);
    const draw = () => {ui.begin(); ai.frame([], false); ui.end();}; draw();
    assert.ok(ui.texts.some(text => text.text === "耐久力低于 35％"));
    const rendered = ui.texts.map(text => text.text).join("");
    assert.ok(rendered.includes("可用的恢复精灵") && rendered.includes("肉等恢复道具"));
    assert.ok(rendered.includes("气力不足") && rendered.includes("气力恢复道具"));
    assert.ok(!rendered.includes("肉优先") && !rendered.includes("预计会被打死"), "the native UI must not promise a server policy it does not implement");
    const hit = ui.getMobileActions().find(hit => hit.id === "ai-heal-next")!; assert.ok(hit);
    mouse.x = (hit.x1 + hit.x2) / 2; mouse.y = (hit.y1 + hit.y2) / 2; mouse.clicked = true; draw(); draw();
    assert.equal(loadAi(name).healAt, 40, "the policy sent by main.loadAi must match the native UI value");
    assert.ok(ui.texts.some(text => text.text === "耐久力低于 40％"));
    ai.close();
  }
  setDeviceMode("desktop");
});
