import assert from "node:assert/strict";
import test from "node:test";
import { GmWindow } from "../src/gm.ts";
import { ANIM } from "../src/assets.ts";

test("GM previews Lilith with her native idle animation while keeping effect sprites out of pet previews", () => {
  const actors: any[] = [], images: any[] = [];
  const ui: any = { texts: [], window() {}, text() {}, actor: (...args: any[]) => actors.push(args), image: (...args: any[]) => images.push(args) };
  const gm: any = new GmWindow({ ui } as any);
  gm.hover = { kind: "enemy", id: 29005 };
  gm.setDetail({ kind: "enemy", id: 29005, image: 199200, lines: [] });
  gm.detailFrame(0, 0);
  assert.equal(actors.length, 1, "the GM pet preview must use Ui.actor rather than treating its sprite as a static tile");
  const assets: any = { anim: (id: number) => id === 199200 ? { actions: [{ dir: 1, type: ANIM.STAND, ticks: 3, frames: [[9100000, 0, -15, 0], [9100001, 0, -16, 0]] }] } : null };
  assert.deepEqual(actors[0][0].frameOf(assets, 0), [9100000, 0, -15]);
  assert.deepEqual(actors[0][0].frameOf(assets, 60), [9100001, 0, -16]);
  gm.setDetail({ kind: "enemy", id: 29005, image: 199201, lines: [] }); gm.detailFrame(0, 0);
  assert.equal(actors.length, 1); assert.equal(images.at(-1)[0], 199201);
});
