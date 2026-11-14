import assert from "node:assert/strict";
import test from "node:test";
import { BattleScreen } from "../src/battle.ts";
import { fillDefaults } from "../src/proto.gen.ts";

function setup(quick = true) {
  const host: any = { root: "", quick: () => quick, auto: () => false,
    pets: () => ({ pets: [] }), aiMemory: () => ({ observe() {}, save() {} }),
    assets: { anim: () => null }, ui: { texts: [], text() {}, box() {}, image() {} },
    finish() {}, send() {}, sendPet() {}, chat() {} };
  const start = fillDefaults({ t: "BattleStart", mySlot: 0, resume: true, speed: 100,
    fighters: [0, 5, 15, 16].map(slot => ({ slot, hp: 100, maxHp: 100, sprite: 0, name: `unit${slot}` })) } as any);
  const screen: any = new BattleScreen(host, start);
  screen.popup = () => {}; screen.hitMark = () => {}; screen.showSkill = () => {};
  return screen;
}

function play(screen: any, event: object) {
  const turn = fillDefaults({ t: "BattleTurn", events: [event] } as any);
  for (const step of screen.eventSteps(turn.events)) {
    let now = 100;
    while (!step(now)) { now += 100; assert.ok(now < 15000, "playback must finish"); }
  }
}

// Removing HP-derived death must fail this test: all command/target paths read
// this same Fighter.dead value, including quick playback's animation-free loop.
test("wire HP0 from fatal poison marks either side's player/pet dead without a fly event", () => {
  for (const slot of [0, 5, 15, 16]) {
    const screen = setup();
    play(screen, { kind: "poison", actor: slot, target: -1, dead: true, damage: 100 });
    const fighter = screen.fighters.get(slot);
    assert.equal(fighter.hp, 0);
    assert.equal(fighter.dead, true, `HP0 slot ${slot} must not retain a live command/target`);
  }
});

test("reviving a knocked-down fighter clears death choreography and restores target eligibility", () => {
  const screen = setup(), target = screen.fighters.get(15);
  target.hp = 0; target.stars = true; target.dying = true; target.deadAt = 1;
  play(screen, { kind: "revive", actor: 16, target: 15, hp: 50, damage: 50 });
  assert.equal(target.dead, false); assert.equal(target.hp, 50);
  assert.equal(target.stars, false); assert.equal(target.dying, false); assert.equal(target.deadAt, 0);
});

test("an already flown target cannot receive a second hit or damage popup", () => {
  const screen = setup(), target = screen.fighters.get(15), actor = screen.fighters.get(0);
  target.hp = 0; target.gone = true;
  const popups: unknown[] = []; screen.popup = (...args: unknown[]) => popups.push(args);
  const turn: any = fillDefaults({ t: "BattleTurn", events: [{ kind: "attack", actor: 0, target: 15,
    result: "normal", hp: 0, dead: true, actorHp: 100, damage: 25 }] } as any);
  screen.applyHit(turn.events[0], target, actor, 100);
  assert.equal(popups.length, 0, "no damage numbers over an empty slot");
  assert.equal(target.motion, null);
});

test("native enemy support cannot revive an already flown or absent target during playback", () => {
  for(const state of ["gone","flying"]){
    const screen=setup(),target=screen.fighters.get(15);target.hp=0;
    if(state==="gone")target.gone=true;else target.fly=[1,1];
    const popups:unknown[]=[];screen.popup=(...args:unknown[])=>popups.push(args);
    play(screen,{kind:"revive",actor:16,target:15,hp:50,damage:50});
    assert.equal(target.hp,0,`${state} support target must remain absent`);
    assert.equal(target.dead,true);assert.equal(popups.length,0);
  }
});
