import assert from "node:assert/strict";
import test from "node:test";
import { BattleScreen } from "../src/battle.ts";
import { ANIM } from "../src/assets.ts";
import { fillDefaults } from "../src/proto.gen.ts";

function battle(actor = 5) {
  const images: number[][] = [];
  const action = (type: number, image: number, length: number) => ({ dir: 0, type, ticks: 3, frames: Array.from({ length }, () => [image, 0, 0, 0]) });
  const host: any = { root: "", quick: () => true, auto: () => false, serverAuto: () => true,
    pets: () => ({ pets: [] }), aiMemory: () => ({ observe() {}, save() {} }),
    assets: { anim: (id: number) => id === 199200 ? { actions: Array.from({ length: 8 }, (_, dir) =>
      [action(ANIM.STAND, 9100000, 8), action(ANIM.HAND, 9100001, 14)].map(a => ({ ...a, dir }))).flat() }
      : id === 199201 ? { actions: [action(ANIM.STAND, 9100100, 28)] } : null },
    ui: { texts: [], image: (...args: number[]) => images.push(args), text() {}, box() {} }, finish() {}, send() {}, sendPet() {}, chat() {} };
  const start: any = fillDefaults({ t: "BattleStart", mySlot: 0, resume: true, speed: 100,
    fighters: [0, 5, 10, 15, 16].map(slot => ({ slot, hp: 100, maxHp: 100, mp: 30, maxMp: 30, sprite: slot === actor ? 199200 : 100001, name: `unit${slot}` })) });
  const screen: any = new BattleScreen(host, start);
  // Canvas font rasterization is unrelated to event timing/HP/status. Keep
  // real Fighter, animation effects, hit handling and playback queue below.
  screen.combatLabel = () => ({ width: 30, height: 30 }); host.ui.pic = () => {};
  return { screen, images, actor: screen.fighters.get(actor), host };
}

const hit = (actor: number, target: number, extra = {}) => ({ actor, target, kind: "magic", result: "damage", skill: "幽灵风暴",
  effect: 199201, hp: 25, damage: 75, actorHp: 100, actorMp: 30, status: 4, guardian: -1, ...extra });
function steps(screen: any, events: any[]) {
  screen.onTurn(fillDefaults({ t: "BattleTurn", events } as any));
  return screen.queue;
}
function drain(screen: any, now = 100) {
  while (screen.queue.length) { if (screen.queue[0](now)) screen.queue.shift(); else now += 50; assert.ok(now < 20000); }
}

test("Ghost Storm casts with both hands in place and plays one native effect at the complete target half", () => {
  for (const [caster, targets, center] of [[5, [15], [220, 185]], [5, [10, 15, 16], [220, 185]], [15, [0, 5], [580, 415]]] as [number, number[], number[]][]) {
    const { screen, actor, images, host } = battle(caster), home = [actor.x, actor.y];
    const queue = steps(screen, targets.map((target, i) => hit(caster, target, { combo: i < targets.length - 1 })));
    queue[0](100);
    assert.equal(actor.frame(host.assets, 100)[0], 9100001, "the caster must use the actual HAND animation");
    assert.deepEqual([actor.x, actor.y], home, "a ranged cast must never move the caster to an enemy");
    assert.equal(queue[0](800), true); queue.shift(); queue[0](800);
    screen.drawFx(800);
    const flames = images.filter(image => image[0] === 9100100);
    assert.equal(flames.length, 1, "a multi-target storm must not draw one full-field atlas per enemy");
    assert.deepEqual(flames[0].slice(1, 3), center, "the whole half stays stable even when only one target survives");
    assert.deepEqual([actor.x, actor.y], home);
    for (const target of targets) assert.equal(screen.fighters.get(target).hp, 100, "HP must wait for the native explosion");
    drain(screen, 800);
    for (const target of targets) { assert.equal(screen.fighters.get(target).hp, 25); assert.equal(screen.fighters.get(target).status, 4); }
    assert.deepEqual([actor.x, actor.y], home);
  }
});

test("Ghost Storm preserves physical reflection, absorption, barrier and dodge results", () => {
  for (const [result, targetHp, actorHp] of [["reflect", 100, 0], ["absorb", 100, 100], ["vanish", 100, 100], ["dodge", 100, 100]] as [string, number, number][]) {
    const { screen, actor } = battle();
    const queue = steps(screen, [hit(5, 15, { result, hp: targetHp, actorHp, status: 0, dead: false })]);
    assert.ok(queue.length); drain(screen);
    assert.equal(actor.hp, actorHp, `${result} must retain the authoritative caster HP`);
    assert.equal(actor.dead, actorHp === 0);
    assert.equal(screen.fighters.get(15).hp, targetHp);
    assert.equal(screen.fighters.get(15).status, 0, "a non-hit must never invent petrification");
  }
});

test("quick Ghost Storm settles all authoritative HP and petrification without moving its caster", () => {
  const { screen, actor } = battle(), home = [actor.x, actor.y];
  steps(screen, [hit(5, 15, { combo: true }), hit(5, 16)]);
  screen.quickFrame(100);
  assert.equal(screen.queue.length, 0); assert.equal(screen.fx.length, 0);
  assert.deepEqual([actor.x, actor.y], home);
  for (const slot of [15, 16]) { assert.equal(screen.fighters.get(slot).hp, 25); assert.equal(screen.fighters.get(slot).status, 4); }
});

test("ordinary recovery magic retains its original standing cast and per-target native effect", () => {
  const { screen, actor, host } = battle();
  const queue = steps(screen, [hit(5, 5, { effect: 100610, result: "heal", hp: 100, damage: 20, status: 0 })]);
  queue[0](100);
  assert.equal(actor.frame(host.assets, 100)[0], 9100000);
  drain(screen); assert.equal(actor.hp, 100);
});

test("Ghost Storm applies guardian damage and petrification to the actual protector only", () => {
  const { screen } = battle();
  steps(screen, [hit(5, 15, { guardian: 16 })]); drain(screen);
  assert.equal(screen.fighters.get(15).hp, 100); assert.equal(screen.fighters.get(15).status, 0);
  assert.equal(screen.fighters.get(16).hp, 25); assert.equal(screen.fighters.get(16).status, 4);
});
