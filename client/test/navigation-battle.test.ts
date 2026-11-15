import test from "node:test";
import assert from "node:assert/strict";
import { Field } from "../src/field.ts";
import type { Connection } from "../src/net.ts";
import type { Assets } from "../src/assets.ts";

async function fixture() {
  const handlers = new Map<string, (message: any) => void>(), sent: any[] = [];
  const field = new Field({} as Assets, {
    on: (type: string, handler: (message: any) => void) => { handlers.set(type, handler); return () => {}; },
    send: (message: any) => sent.push(message),
  } as unknown as Connection);
  handlers.get("Self")!({ id: 1, name: "navigation", sprite: 100000 });
  const enter = (floor: number) => handlers.get("EnterFloor")!({ floor, name: "fixture", width: 12, height: 12, x: 1, y: 1, dir: 5, mapVer: "test", step: 260 });
  enter(1);
  await new Promise(resolve => setTimeout(resolve, 0));
  handlers.get("MapData")!({ floor: 1, x1: 0, y1: 0, x2: 12, y2: 12, tiles: Array(144).fill(100), objs: Array(144).fill(0), walk: "1".repeat(144), ver: "test" });
  sent.length = 0;
  return { field, sent, enter };
}

test("quick battle pauses movement then resumes the same minimap destination", async () => {
  const { field, sent } = await fixture();
  field.navigateTo(9, 9);
  const now = performance.now() + 1000;
  field.update(now);
  const pausedPosition = [field.self!.x, field.self!.y];
  field.beginBattle?.(true);
  sent.length = 0;
  for (let i = 1; i < 8; i++) field.update(now + i * 300);
  assert.deepEqual([field.self!.x, field.self!.y], pausedPosition);
  assert.equal(sent.filter(message => message.t === "Move").length, 0, "battle cannot emit field moves");
  assert.deepEqual(field.target, [9, 9]);
  field.endBattle?.();
  for (let i = 8; i < 25; i++) field.update(now + i * 300);
  assert.deepEqual([field.self!.x, field.self!.y], [9, 9]);
  assert.equal(field.navigationStatus, "已到达目标");
});

test("normal battle cancels navigation, including a switch out of quick battle", async () => {
  const { field, sent } = await fixture();
  field.navigateTo(9, 9); field.beginBattle?.(true); field.beginBattle?.(false); field.endBattle?.();
  field.update(performance.now() + 1000);
  assert.equal(field.target, null);
  assert.equal(sent.filter(message => message.t === "Move").length, 0);
});

test("passive mobile input cleanup preserves map navigation but manual directions override it", async () => {
  const { field } = await fixture();
  field.navigateTo(9, 9); field.cancelManualMotion?.();
  assert.deepEqual(field.target, [9, 9]);
  field.wantDir = 7; field.update(performance.now() + 1000);
  assert.equal(field.navigationStatus, "");
  assert.equal(field.target, null, "manual direction must cancel the earlier destination");
  assert.equal((field as any).mapNavigation, false);
});

test("quick battle cannot revive a route after a floor change", async () => {
  const { field, enter } = await fixture();
  field.navigateTo(9, 9); field.beginBattle?.(true); enter(2); field.endBattle?.();
  assert.equal(field.target, null);
});

test("exact destinations reject fractional and non-finite coordinates", async () => {
  const { field } = await fixture();
  for (const x of [1.5, NaN, Infinity]) {
    field.navigateTo(x, 5);
    assert.equal(field.target, null);
    assert.match(field.navigationStatus, /整数/);
  }
});
