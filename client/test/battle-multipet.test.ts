// node --test client/test/battle-multipet.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { BattleScreen, type BattleHost } from "../src/battle.ts";
import type { BattleFighter, PetInfo, S2CBattleStart, S2CPets } from "../src/proto.gen.ts";

const fighter = (slot: number, ownerSlot = -1, bagSlot = -1): BattleFighter => ({ slot, ownerSlot, bagSlot, name: `f${slot}`, sprite: 0, level: 10, hp: 100, maxHp: 100, mp: 20, maxMp: 20, rideName: "", rideLevel: 0, rideHp: 0, rideMaxHp: 0, fallSprite: 0, status: 0 });
const pet = (slot: number): PetInfo => ({ slot, name: `pet${slot}`, freeName: "", hp: 100, maxHp: 100, state: "battle", maxSkill: 2, skills: [{ slot: slot % 2, name: `skill${slot}`, field: 1, target: 0 }] } as PetInfo);
function setup(options: { serverAuto?: boolean; quick?: boolean; resume?: boolean; submitted?: boolean; submittedPets?: number[]; watch?: boolean } = {}) {
  const sent: unknown[][] = [], petSent: number[][] = [], labels: string[] = [], hits: string[] = [];
  let clicked = "";
  const pets = { pets: Array.from({ length: 5 }, (_, slot) => pet(slot)), battle: 0 } as S2CPets;
  const ui = { texts: [], mouse: { x: 0, y: 0, rightClicked: false }, text(_x: number, _y: number, text: string) { labels.push(text); return false; }, image() { return false; }, box() {}, window() {}, hitBox(_x: number, _y: number, _x2: number, _y2: number, id: string) { hits.push(id); return false; }, clicked(id: string) { return id === clicked; }, hovered() { return false; } };
  const host = { ui, assets: { anim: () => null, image: () => null }, root: "", quick: () => options.quick ?? true, auto: () => false, serverAuto: () => !!options.serverAuto,
    send: (...args: unknown[]) => sent.push(args), sendPet: (...args: number[]) => petSent.push(args), pets: () => pets,
    aiMemory: () => ({ observe() {}, save() {} }), inventory: () => ({ items: [] }), names: () => false, finish() {}, chat() {},
  } as unknown as BattleHost;
  const fighters = [fighter(0), fighter(1), fighter(5, 0, 3), fighter(6, 1, 0), fighter(7, 0, 0), fighter(8, 0, 4), fighter(9, 0, 2), fighter(15)];
  const start = { t: "BattleStart", field: 0, mySlot: 0, turnTime: 30000, surprise: 0, fighters, pvp: false, event: false, watch: !!options.watch, speed: 100, resume: !!options.resume, turn: 4, submitted: !!options.submitted, petSubmitted: false, submittedPets: options.submittedPets ?? [] } as S2CBattleStart;
  // Deliberately exercise the real screen state machine with a tiny drawing host.
  // Private methods are observable through their network effects, without WebGL.
  const screen: any = new BattleScreen(host, start);
  return { screen, host, start, sent, petSent, labels, hits, click: (id: string) => { clicked = id; } };
}

test("each owned live pet uses its bag skills and sends one independent action", () => {
  const { screen, sent, petSent } = setup();
  screen.openMenu(100);
  assert.deepEqual(screen.ownedPets().map((p: any) => [p.a.f.slot, p.info.slot]), [[5, 3], [7, 0], [8, 4], [9, 2]]);
  screen.submit("attack", 15);
  screen.sendPet(1, 15);
  screen.sendPet(0, 0);
  screen.sendPet(0, 8);
  screen.sendPet(0, 15);
  screen.sendPet(0, 15);
  screen.submit("guard", -1);
  assert.deepEqual(sent, [["attack", 15]]);
  assert.deepEqual(petSent, [[1, 15, 5], [0, 0, 7], [0, 8, 8], [0, 15, 9]]);
  assert.equal(screen.petSent, true);
});

test("pet tabs select another pending pet without borrowing another owner's pet", () => {
  const { screen, hits, click } = setup();
  screen.openMenu(100);screen.submit("guard", -1);
  click("pet-tab-9");screen.petMenu(200);
  assert.equal(screen.activePet, 9);
  assert.ok(hits.includes("pet-tab-9"));assert.ok(!hits.includes("pet-tab-6"));
  screen.chooseSkill(0, 5); // T_NONE targets the selected pet itself.
  assert.equal(screen.petSentSlots.has(9), true);
});

test("server automation prevents normal, quick and reconnect duplicate client commands", () => {
  {
    const { screen, sent, petSent, labels } = setup({ serverAuto: true, resume: true, submitted: false, quick: true });
    screen.openMenu(100);screen.autoCommand();screen.quickFrame(2000);screen.submit("attack", 15);screen.sendPet(0, 15);screen.sendAllPets(-1, -1);
    assert.deepEqual(sent, []);assert.deepEqual(petSent, []);
    screen.quickAt = 1;screen.quickFrame(3000);
    assert.ok(screen.host.ui.texts.some((t: any) => t.text.includes("服务端自动战斗")));
    // Run the visual frame branch as well, without loading a real background.
    screen.frame(4000);assert.ok(labels.includes("服务端自动战斗"));

  }
});

test("resume restores turn, submitted pets, status and positions without an intro or first-turn AI", () => {
  const { screen, start, sent, petSent } = setup({ resume: true, submitted: true, submittedPets: [5, 8] });
  assert.equal(screen.queue.length, 0);assert.equal(screen.turns, 4);assert.equal(screen.aiFirst, false);
  for (const f of screen.fighters.values()) { assert.equal(f.x, f.homeX);assert.equal(f.y, f.homeY); }
  screen.openMenu(100);assert.equal(screen.sent, true);assert.equal(screen.activePet, 7);
  screen.sendPet(0, 15);screen.sendPet(0, 15);
  assert.deepEqual(sent, []);assert.deepEqual(petSent, [[0, 15, 7], [0, 15, 9]]);
  start.fighters[0].status = 10;
  const again: any = new BattleScreen(screen.host, start);
  assert.equal(again.fighters.get(0).status, 10);
});

test("turn resolution clears previous pending menus and opens fresh per-pet submissions", () => {
  const { screen, petSent } = setup();screen.openMenu(100);screen.submit("guard", -1);screen.sendPet(1, 15);
  screen.onTurn({ t: "BattleTurn", events: [] });assert.equal(screen.petMenuAt, 0);
  screen.openMenu(200);screen.submit("guard", -1);screen.sendPet(1, 15);
  assert.deepEqual(petSent, [[1, 15, 5], [1, 15, 5]]);
});

test("resetPets atomically removes old pets and updates full layout without a new intro", () => {
  const { screen } = setup();const before = screen.queue.length;
  const enemy = screen.fighters.get(15);
  screen.join({ t: "BattleJoin", resetPets: true, fighters: [fighter(0), fighter(1), fighter(5, 0, 0), fighter(6, 1, 1)] });
  assert.equal(screen.fighters.get(15), enemy); // Server rescue snapshot omits monsters.
  assert.equal(screen.fighters.has(7), false);assert.equal(screen.fighters.has(8), false);assert.equal(screen.fighters.has(9), false);
  assert.deepEqual(screen.ownedPets().map((p: any) => [p.a.f.slot, p.info.slot]), [[5, 0]]);
  assert.equal(screen.queue.length, before);assert.equal(screen.fighters.get(5).x, screen.fighters.get(5).homeX);
});

test("pet layout movement preserves submissions and selected skills by bag identity", () => {
  const { screen, petSent } = setup();screen.openMenu(100);screen.submit("guard", -1);
  screen.petSkill = 1;screen.sendPet(1, 15); // Old battle slot 5, bag 3 has submitted.
  screen.join({ t: "BattleJoin", resetPets: true, fighters: [fighter(0), fighter(1), fighter(5, 0, 0), fighter(6, 1, 0), fighter(8, 0, 3), fighter(15)] });
  assert.equal(screen.petSentSlots.has(5), false);assert.equal(screen.petSentSlots.has(8), true);
  assert.equal(screen.petSkills.get(8), 1);assert.equal(screen.activePet, 5);
  screen.sendPet(0, 15);assert.deepEqual(petSent, [[1, 15, 5], [0, 15, 5]]);
  assert.equal(screen.petSent, true);
});

test("PetOut uses event bag and owner while the Pets snapshot still names another primary", () => {
  const { screen, host, petSent } = setup();
  assert.equal(host.pets()?.battle, 0);
  screen.fighters.delete(5);
  const event = { actor: 0, kind: "petout", target: 5, ownerSlot: 0, bagSlot: 3, name: "replacement", sprite: 0, level: 10, hp: 100, maxHp: 100, status: 0 };
  const steps = screen.eventSteps([event]);
  for (const step of steps) { let now = 100; while (!step(now)) { now += 100; assert.ok(now < 10000); } }
  assert.equal(screen.fighters.get(5).f.bagSlot, 3);
  assert.equal(screen.fighters.get(5).f.ownerSlot, 0);
  screen.openMenu(100);screen.submit("guard", -1);screen.sendPet(1, 15);
  assert.deepEqual(petSent, [[1, 15, 5]]);
  // An ally's PetOut also carries its own owner, never the local player's bag.
  const allySteps = screen.eventSteps([{ ...event, actor: 1, target: 6, ownerSlot: 1, bagSlot: 2 }]);
  for (const step of allySteps) { let now = 100; while (!step(now)) now += 100; }
  assert.equal(screen.petOwner(screen.fighters.get(6)), 1);
  assert.ok(screen.ownedPets().every((p: any) => p.a.f.slot !== 6));
});

test("quick display never restarts client automation after both live auto switches are off", () => {
  const { screen, host, sent, petSent } = setup();
  let calls = 0;
  const original = screen.autoCommand.bind(screen);
  screen.autoCommand = () => { calls++; original(); };
  screen.quickFrame(1000);screen.quickFrame(1100);
  assert.equal(calls, 0);assert.deepEqual(sent, []);assert.deepEqual(petSent, []);
  original(); // The decision entry itself also rejects a disabled auto flag.
  assert.deepEqual(sent, []);assert.deepEqual(petSent, []);
  assert.equal(host.auto(), false);
});

test("quick display switches preserve the same fighters, queued work, turn and submissions and load the background once", async () => {
  const originalFetch = globalThis.fetch, urls: string[] = [];
  const data = new ArrayBuffer(804);new DataView(data).setUint16(4, 42);
  globalThis.fetch = (async (url: string) => { urls.push(String(url));return new Response(data); }) as typeof fetch;
  try {
    const { screen, sent, petSent } = setup();
    const fighterMap = screen.fighters, f = fighterMap.get(5), petSet = screen.petSentSlots, queue = screen.queue;
    for (const a of fighterMap.values()) { assert.equal(a.x, a.homeX);assert.equal(a.y, a.homeY); }
    screen.openMenu(1000);screen.submit("guard", -1);screen.sendPet(1, 15);
    f.hp = 73;f.status = 3;screen.turns = 6;
    const pending = () => true;queue.push(pending);
    screen.setQuick(false);
    assert.equal(screen.quick, false);assert.equal(screen.fighters, fighterMap);assert.equal(screen.fighters.get(5), f);
    assert.equal(screen.petSentSlots, petSet);assert.equal(screen.queue, queue);assert.equal(screen.queue[0], pending);
    assert.equal(f.hp, 73);assert.equal(f.status, 3);assert.equal(screen.turns, 6);assert.equal(screen.sent, true);assert.ok(petSet.has(5));
    await screen.backgroundLoad;
    assert.deepEqual(urls, ["battlemap/battle00.sab"]);assert.equal(screen.tiles[0], 42);
    screen.setQuick(true);screen.quickFrame(1200);screen.setQuick(false);await screen.backgroundLoad;
    assert.equal(urls.length, 1);assert.equal(screen.turns, 6);assert.equal(screen.sent, true);assert.ok(petSet.has(5));
    assert.deepEqual(sent, [["guard", -1]]);assert.deepEqual(petSent, [[1, 15, 5]]);
  } finally { globalThis.fetch = originalFetch; }
});

test("leaving fast playback preserves the remaining real command time on its advanced animation clock", async () => {
  const originalFetch = globalThis.fetch;globalThis.fetch = (async () => new Response(new ArrayBuffer(4))) as typeof fetch;
  try {
    const { screen } = setup();screen.quickFrame(1000);
    const remaining = screen.deadline - 1000;screen.clock = 20000;
    screen.setQuick(false);
    assert.equal(screen.vnow, 20000);assert.equal(screen.deadline - screen.vnow, remaining);
    assert.equal(screen.sent, false);assert.equal(screen.petSentSlots.size, 0);
    await screen.backgroundLoad;
    screen.pvp = true;screen.setQuick(true);assert.equal(screen.quick, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("watch mode and dead pets never expose a command slot", () => {
  const { screen, sent, petSent } = setup({ watch: true });screen.openMenu(100);screen.submit("attack", 15);screen.sendPet(0, 15);
  assert.deepEqual(sent, []);assert.deepEqual(petSent, []);
  const manual = setup();manual.screen.fighters.get(5).dead = true;manual.screen.fighters.get(7).gone = true;
  assert.deepEqual(manual.screen.ownedPets().map((p: any) => p.a.f.slot), [8, 9]);
});
