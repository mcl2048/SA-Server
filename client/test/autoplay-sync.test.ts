import assert from "node:assert/strict";
import test from "node:test";
import { AutoPlayIntent, BATTLE_AUTO_ACTIONS, drawAutoPlayToggles, serverOwnsAutoTurn, type AutoPlayFlags } from "../src/autoplay-sync.ts";
import { Ui } from "../src/ui.ts";
import { Menus, settings } from "../src/menus.ts";
import { AiWindow } from "../src/aisetting.ts";

const baseline = { encounter: false, autoBattle: true, quick: true };
// Use the real Ui hit calculation, AiWindow row, Menus toggles and changed callback.
// Only drawing assets and text metrics are stubbed; no WebGL/socket is required.
Object.assign(globalThis, {
  location: { search: "" },
  localStorage: { getItem: () => null, setItem() {} },
  document: { createElement: () => ({ getContext: () => ({ measureText: (s: string) => ({ width: s.length * 14 }) }) }) },
});
function fixture(immediate = true) {
  const intent = new AutoPlayIntent(), sent: AutoPlayFlags[] = [];
  let encounter = false;
  const wanted = () => ({ encounter, autoBattle: settings.autoBattle, quick: settings.quickBattle });
  function receive(state: AutoPlayFlags & { reason?: string }, fresh = false) {
    if (!fresh) intent.local(wanted());
    const desired = intent.receive(state);
    encounter = desired.encounter;settings.autoBattle = desired.autoBattle;settings.quickBattle = desired.quick;
  }
  receive(baseline, true);
  const sync = () => { const state = wanted();intent.sent(state);sent.push({ ...state }); };
  const menu: any = Object.create(Menus.prototype);
  menu.host = { chat() {}, settingsChanged() { if (immediate) sync(); } };
  const mouse: any = { x: -1, y: -1, clicked: false, rightClicked: false, down: false };
  const ui = new Ui({ tile: () => undefined } as any, mouse);
  const ai = new AiWindow({ ui, inv: () => [], petSkills: () => null, autoBattle: () => settings.autoBattle, quickBattle: () => settings.quickBattle,
    toggleAuto: () => menu.toggleAuto(), toggleQuick: () => menu.toggleQuick(), autoEncount: () => encounter, setAutoEncount: (on) => { encounter = on;sync(); } });
  ai.show("race-test");
  const draw = () => { ui.begin();ai.frame([], false);ui.end(); };
  draw();
  function tap(id: string) {
    const hit = ui.getMobileActions().find(h => h.id === id);assert.ok(hit, `${id} must be reachable`);
    mouse.x = (hit.x1 + hit.x2) / 2;mouse.y = (hit.y1 + hit.y2) / 2;mouse.clicked = true;
    draw();
  }
  return { intent, sent, sync, receive, tap, wanted, ui, mouse, menu };
}

test("actual AI quick and auto clicks send immediately and survive an older paused lease ACK", () => {
  for (const [id, key] of [["ai-quick-val", "quick"], ["ai-auto-val", "autoBattle"]] as const) {
    const f = fixture();f.sync(); // Old paused heartbeat still in flight.
    f.tap(id);
    assert.equal(f.sent.length, 2);assert.equal(f.sent[1][key], false);
    f.receive({ ...baseline, paused: true } as any);
    assert.equal(f.wanted()[key], false, "older state must not undo the click");
    f.receive(f.sent[1]);assert.equal(f.wanted()[key], false);
  }
});

test("an old ACK between actual menu click and next frame cannot overwrite unsent intent", () => {
  for (const [id, key] of [["ai-quick-val", "quick"], ["ai-auto-val", "autoBattle"]] as const) {
    const f = fixture(false);f.sync();f.tap(id);
    assert.equal(f.sent.length, 1);assert.equal(f.wanted()[key], false);
    f.receive(baseline); // main captures current settings before reconciling ACK.
    assert.equal(f.wanted()[key], false);
    f.sync();assert.equal(f.sent[1][key], false);
  }
});

test("two real quick clicks before either ACK retain the newest intent, including a return to the original value", () => {
  const f = fixture();f.sync();f.tap("ai-quick-val");f.tap("ai-quick-val");f.tap("ai-auto-val");
  assert.deepEqual(f.sent.map(s => [s.autoBattle, s.quick]), [[true, true], [true, false], [true, true], [false, true]]);
  for (const ack of f.sent) { f.receive(ack);assert.deepEqual(f.wanted(), { ...baseline, autoBattle: false }); }
});

test("authoritative encounter-only and safety stops preserve actual flags and stale ACKs cannot re-enable stopped modes", () => {
  const f = fixture();f.sync();f.tap("ai-quick-val");
  const encounterStop = { encounter: false, autoBattle: true, quick: true, reason: "耐久力不足20%，已停止自动遇敌。" };
  f.receive(encounterStop);assert.deepEqual(f.wanted(), baseline); // Server stopped only encounter.
  f.receive({ encounter: false, autoBattle: false, quick: false, reason: "自动战斗已停止。" });
  for (const ack of f.sent) f.receive(ack);
  assert.deepEqual(f.wanted(), { encounter: false, autoBattle: false, quick: false });
  f.intent.reset();f.receive(baseline, true);assert.deepEqual(f.wanted(), baseline); // Reconnect snapshot wins.
});

test("pending auto enable never hands the turn to legacy client AI, and disable waits for its server ACK", () => {
  const off = { encounter: false, autoBattle: false, quick: false };
  const f = fixture();f.tap("ai-auto-val");f.tap("ai-quick-val");
  f.receive(f.sent[0]);f.receive(f.sent[1]);assert.equal(serverOwnsAutoTurn(f.wanted(), off), false);
  f.tap("ai-auto-val");assert.equal(serverOwnsAutoTurn(f.wanted(), off), true);
  const enabled = f.sent.at(-1)!;f.receive(enabled);
  f.tap("ai-auto-val");assert.equal(serverOwnsAutoTurn(f.wanted(), enabled), true);
  f.receive(f.sent.at(-1)!);assert.equal(serverOwnsAutoTurn(f.wanted(), off), false);
});

test("the shared quick-field control is a reachable real Ui action and sends quick off without opening world menus", () => {
  const f = fixture();
  const draw = () => { f.ui.begin();drawAutoPlayToggles(f.ui, settings.autoBattle, settings.quickBattle, () => f.menu.toggleAuto(false), () => f.menu.toggleQuick());f.ui.end(); };
  draw();
  assert.deepEqual(f.ui.getMobileActions().map(h => h.id), [...BATTLE_AUTO_ACTIONS]);
  const hit = f.ui.getMobileActions().find(h => h.id === "battle-quick-toggle");assert.ok(hit);
  f.mouse.x = (hit.x1 + hit.x2) / 2;f.mouse.y = (hit.y1 + hit.y2) / 2;f.mouse.clicked = true;
  draw();assert.equal(settings.quickBattle, false);assert.equal(f.sent.at(-1)?.quick, false);
  assert.equal(f.ui.getMobileActions().filter(h => h.id === "battle-quick-toggle").length, 1);
});
