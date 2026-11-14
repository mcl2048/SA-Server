import test from "node:test";
import assert from "node:assert/strict";

// Only DOM text measurement and asset storage are replaced. Native Ui hit
// registration, PetWindow page changes and Menus statUp dispatch run unchanged.
const doc = Object.assign(new EventTarget(), {
  documentElement: {classList: {toggle() {}}}, hidden: false,
  querySelector: () => null, getElementById: () => null,
  createElement: () => ({getContext: () => ({font: "", measureText: (s: string) => ({width: s.length * 7})})}),
});
Object.assign(globalThis, {document: doc, window: {}, location: {search: "?device=mobile&view=immersive"},
  localStorage: {getItem: () => null, setItem() {}}, requestAnimationFrame: () => 1,
  addEventListener() {}, matchMedia: () => ({matches: false, addEventListener() {}})});
const {Ui, Mouse} = await import("../src/ui.ts");
const {PetWindow} = await import("../src/pets.ts");
const {Menus} = await import("../src/menus.ts");
const view = await import("../src/mobile-view.ts");
const frames: [number, number, number, number][] = [[900001, 0, 0, 0], [900002, 2, -3, 0]];
const assets = {
  tile: (id: number) => id, page: () => null,
  image: () => ({page: 0, set: 0, x: 0, y: 0, w: 16, h: 16, ox: -8, oy: -8}),
  anim: (id: number) => ({id, pages: [], actions: [{dir: 1, type: 3, ticks: 6, frames}]}),
};
const pet = {slot: 0, sprite: 199100, name: "伙伴", freeName: "", level: 12, trans: 0, state: "rest", hp: 80, maxHp: 100,
  loyalty: 100, attrs: [10, 20, 30, 40], atk: 20, def: 21, agi: 22, exp: 150, nextExp: 300, rideable: false,
  ext: {rank: 100, getLevel: 1, enemyId: 29001, alloc: [1, 2, 3, 4], std: [], grow: [], real: [], init: [], resist: [], critical: 0, counter: 0, rare: 0, vai: 0, magic: []}};
function at(ui: InstanceType<typeof Ui>, mouse: InstanceType<typeof Mouse>, id: string) {
  const hit = ui.getMobileActions().find(hit => hit.id === id)!;
  assert.ok(hit, `${id} is an original live action`);
  mouse.x = (hit.x1 + hit.x2) / 2; mouse.y = (hit.y1 + hit.y2) / 2;
}

test("immersive pet list stays basic on hover and the native name opens animated details", () => {
  view.setDeviceMode("mobile"); view.setMobileDisplayMode("immersive");
  const mouse = new Mouse(), ui = new Ui(assets as any, mouse);
  const wnd = new PetWindow({ui, pets: () => ({pets: [pet], ride: -1}), mailPet: () => -1} as any); wnd.toggle();
  const draw = () => {ui.begin(); const rects: number[][] = []; wnd.frame(rects as any); ui.end(); return rects;};
  draw(); at(ui, mouse, "pet-name0"); ui.end();
  assert.equal(draw().length, 1, "touch focus on a name cannot append extended details to the basic list");
  assert.equal(ui.cards[0]?.title, "伙伴"); assert.equal(ui.panelInfo, null); assert.deepEqual(ui.portraits, []);
  mouse.clicked = true; draw(); draw();
  assert.ok(ui.panelInfo?.lines.some(line => line.includes("HP 80/100")));
  assert.deepEqual(ui.portraits[0]?.animation, {key: "pet:199100:1:3", ticks: 6, frames});
  const metadata = JSON.stringify(ui.portraits); draw(); assert.equal(JSON.stringify(ui.portraits), metadata, "native animation ticks cannot churn retained metadata");
  wnd.close(); wnd.toggle(); mouse.cancel(); draw(); assert.equal(ui.panelInfo, null, "reopening always returns to the native basic list");
  view.setDeviceMode("desktop"); draw(); at(ui, mouse, "pet-name0"); ui.end();
  assert.equal(draw().length, 2, "desktop retains its native hover detail window");
});

test("status exposes the original face and adjacent attributes with only live native point actions", () => {
  view.setDeviceMode("mobile");
  const mouse = new Mouse(), ui = new Ui(assets as any, mouse), sent: number[] = [];
  const status = {name: "旅人", face: 28001, level: 20, trans: 0, dp: 5, hp: 90, maxHp: 120, mp: 80, maxMp: 110, exp: 30, nextExp: 400,
    atk: 45, def: 46, agi: 47, charm: 60, vital: 31, str: 32, tgh: 33, dex: 34, attrs: [10, 20, 30, 40], points: 2, detail: ["攻击来源"]};
  const menus: any = new Menus(ui, {status, statUp: (i: number) => sent.push(i), party: () => [], selfId: () => 1} as any);
  const draw = () => {ui.begin(); menus.statusWindow(); ui.end();}; draw();
  assert.deepEqual(ui.portraits, [{image: 28001, rawIndex: false}]);
  assert.ok(ui.panelInfo?.lines.includes("HP 90/120 · MP 80/110"), "HP and MP both retain their native maximums");
  assert.deepEqual(ui.panelInfo?.stats, [
    {label: "体力", value: "31", action: "st-up0"}, {label: "腕力", value: "32", action: "st-up1"},
    {label: "耐力", value: "33", action: "st-up2"}, {label: "敏捷", value: "34", action: "st-up3"},
  ]);
  at(ui, mouse, "st-up2"); mouse.clicked = true; draw(); assert.deepEqual(sent, [2], "mobile actions retain the original statUp index");
  status.points = 0; draw();
  assert.ok(ui.panelInfo?.stats?.every(stat => stat.action === undefined));
  assert.ok(!ui.getMobileActions().some(hit => /^st-up/.test(hit.id)), "exhausted points cannot retain a live allocation action");
});

test("native party status shows current party rows without carrying a character portrait or allocation controls", () => {
  view.setDeviceMode("mobile");
  const ui = new Ui(assets as any, new Mouse());
  const menus: any = new Menus(ui, {status: {name: "旅人", hp: 80, maxHp: 100, mp: 25},
    party: () => [{id: 1, name: "旅人"}, {id: 2, name: "同伴", hp: 60, maxHp: 90, mp: 15}], selfId: () => 1} as any);
  menus.statusPage = 1; ui.begin(); menus.statusWindow(); ui.end();
  assert.deepEqual(ui.panelInfo?.lines, ["队伍", "旅人 · MP 25 · HP 80/100", "同伴 · MP 15 · HP 60/90"]);
  assert.equal(ui.panelInfo?.stats, undefined); assert.deepEqual(ui.portraits, []);
});
