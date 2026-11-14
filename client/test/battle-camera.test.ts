import assert from "node:assert/strict";
import test from "node:test";
import { immersiveScene } from "../src/mobile-camera.ts";
import { BattleScreen, type BattleHost } from "../src/battle.ts";
import type { BattleFighter, S2CBattleStart } from "../src/proto.gen.ts";

function battle() {
  const fighter = (slot: number): BattleFighter => ({ slot, name: `unit${slot}`, sprite: 0, hp: 100, maxHp: 100, mp: 10, maxMp: 10,
    level: 1, status: 0, rideMaxHp: 0, rideHp: 0, rideName: "", rideLevel: 0, fallSprite: 0 });
  const sent: unknown[][] = [];
  const host = { root: "", quick: () => true, auto: () => false, pets: () => null,
    send: (...args: unknown[]) => sent.push(args), aiMemory: () => ({ observe() {}, save() {} }) } as unknown as BattleHost;
  const screen = new BattleScreen(host, { t: "BattleStart", mySlot: 0, resume: true, speed: 100, turnTime: 30000,
    fighters: [fighter(0), fighter(5), fighter(15), fighter(16)], pvp: false, field: 0 } as S2CBattleStart);
  return { screen, sent };
}

test("self and enemy camera preferences use native battle positions without submitting commands", () => {
  const { screen, sent } = battle();
  assert.deepEqual(screen.mobileFocus("self"), { x: 677, y: 456, label: "unit0" });
  assert.deepEqual(screen.mobileFocus("enemy"), { x: 197, y: 154, label: "unit15" });
  assert.deepEqual(sent, []);
});

test("automatic camera follows the actual actor and switches to a visible damage target", () => {
  const { screen, sent } = battle();
  const state = screen as any;
  screen.onTurn({ t: "BattleTurn", events: [{ actor: 15, target: -1, kind: "guard" }] } as any);
  // Run the real first playback step, using the game's queue and guard effect.
  state.host.ui = { image() {}, box() {}, text() {}, texts: [] };
  state.queue[0](100);
  assert.equal(screen.mobileFocus("follow").label, "unit15");
  state.popup(state.fighters.get(0), 200, { text: "25" });
  assert.equal(screen.mobileFocus("follow").label, "unit0");
  state.fighters.get(0).gone = true;
  assert.equal(screen.mobileFocus("follow").label, "unit5");
  assert.deepEqual(sent, []);
});

test("mobile battle status reports current playback HP/MP rather than the entry snapshot", () => {
  const { screen } = battle();
  const state = screen as any;
  state.fighters.get(0).hp = 33;
  state.fighters.get(0).mp = 5;
  assert.equal(screen.mobileStatus(), "unit0 Lv.1　HP 33/100　MP 5/10");
});

test("enemy camera prefers a live opponent and falls back to corpses after the last defeat", () => {
  const { screen } = battle();
  const state = screen as any;
  state.fighters.get(15).dead = true; state.fighters.get(15).hp = 0;
  assert.equal(screen.mobileFocus("enemy").label, "unit16");
  state.fighters.get(16).dead = true; state.fighters.get(16).hp = 0;
  assert.equal(screen.mobileFocus("enemy").label, "unit15");
});

test("idle self framing keeps the real player and wide deployed pet inside a portrait crop", () => {
  const { screen, sent } = battle(), state = screen as any;
  const player=state.fighters.get(0), pet=state.fighters.get(5);
  pet.f.ownerSlot=0;
  // Native standing geometry: a normal 118px pet extends beyond the old
  // player-only crop after landscape -> portrait. These are world rectangles.
  player.rect=[662,451,31,63];pet.rect=[522,379,118,80];
  const focus=screen.mobileFocus("self"), scene=immersiveScene(390,844,focus.x,focus.y);
  for(const a of [player,pet]){
    const [x,y,w,h]=a.rect;
    assert.ok(x*scene.scale+scene.left>=0,"left claw/player clipped");
    assert.ok((x+w)*scene.scale+scene.left<=390,"right edge clipped");
    assert.ok(y*scene.scale+scene.top>=0&&(y+h)*scene.scale+scene.top<=844);
  }
  assert.deepEqual(sent,[]);
});

test("companion framing never pulls the camera away from an actor during playback", () => {
  const { screen }=battle(), state=screen as any;
  state.fighters.get(0).rect=[662,451,31,63];
  state.fighters.get(5).f.ownerSlot=0;state.fighters.get(5).rect=[150,143,118,80];
  state.queue.push(()=>false);
  assert.deepEqual(screen.mobileFocus("self"),{x:677,y:456,label:"unit0"});
});

test("idle party framing excludes enemy records whose absent owner defaults to slot zero", () => {
  const {screen}=battle(),state=screen as any;
  state.fighters.get(0).rect=[662,451,31,63];
  state.fighters.get(5).f.ownerSlot=0;state.fighters.get(5).rect=[514,364,122,85];
  const expected=screen.mobileFocus('self');
  for(const slot of [15,16]){state.fighters.get(slot).f.ownerSlot=0;state.fighters.get(slot).rect=[150,143,90,90];}
  assert.deepEqual(screen.mobileFocus('self'),expected);
});


test("a party wider than the portrait window keeps the selected player inside the safe crop",()=>{
 const {screen}=battle(),state=screen as any;
 state.fighters.get(0).rect=[662,451,34,59];
 state.fighters.get(5).f.ownerSlot=0;state.fighters.get(5).rect=[373,244,160,304];
 const focus=screen.mobileFocus('self',390,844),scene=immersiveScene(390,844,focus.x,focus.y);
 assert.equal(focus.y,456,'companions must not lower the selected player behind the battle footer');
 assert.ok(662*scene.scale+scene.left>=8);
 assert.ok(696*scene.scale+scene.left<=382,'wide party must not push the chosen player out');
});
