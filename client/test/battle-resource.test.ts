import assert from "node:assert/strict";
import test from "node:test";
import { BattleScreen } from "../src/battle.ts";

test("resource cards expose exact HP, enlarge phone type and clamp transient values", () => {
 const texts: any[] = [], boxes: any[][] = [];
 const screen: any = Object.create(BattleScreen.prototype);
 screen.host = { ui: { texts, box: (...args: any[]) => boxes.push(args) } };
 screen.resourceCard(5, 40, 150, 100, true, "HP");
 assert.equal(texts[0].text, "HP 100/100");assert.equal(texts[0].size, 24);
 for (const box of boxes) { assert.ok(box[0] >= 0 && box[2] <= 800 && box[0] <= box[2]); }
 texts.length=0;boxes.length=0;
 screen.resourceCard(795,40,-1,0,false,"倒地");
 assert.equal(texts[0].text,"倒地 0/0");assert.equal(texts[0].size,16);
 assert.ok(boxes.every(b => b.slice(0,4).every(Number.isFinite)));
 // White numeric labels remain readable independently of the HP color cue.
 assert.equal(texts[0].color,"#f4f8ff");
});

test("absent legacy event metadata never creates NaN labels or invalid skill icons", () => {
 const screen: any = Object.create(BattleScreen.prototype);
 screen.fighters = new Map([[0, { gone: false }]]);screen.fx=[];
 assert.deepEqual(screen.eventSteps([{kind:"stat",actor:0,target:0}]),[]);
 screen.skillIcon({},undefined,100);
 assert.deepEqual(screen.fx,[]);
});
