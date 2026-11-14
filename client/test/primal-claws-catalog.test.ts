import assert from "node:assert/strict";
import test from "node:test";
import { PET_CATALOG, petForSprite } from "../src/pet-catalog.ts";
import { GmWindow } from "../src/gm.ts";
import { ANIM } from "../src/assets.ts";

test("both primal claw pets join the native catalogue after every saved extension identity", () => {
  assert.deepEqual(PET_CATALOG.slice(0, 6).map(p => p.sprite), [199100,199101,199102,199103,199200,199300]);
  const c = petForSprite(199400), d = petForSprite(199401);
  assert.ok(c, "Cyrufas must be available through native catalogue consumers");
  assert.ok(d, "Claudes must be available through native catalogue consumers");
  assert.deepEqual(PET_CATALOG.slice(6).map(p => p.sprite), [199400,199401]);
  assert.deepEqual([c.name,c.temp,...c.attrs], ["萨鲁法斯",29007,50,0,0,50]);
  assert.deepEqual([d.name,d.temp,...d.attrs], ["克劳德斯",29008,0,50,50,0]);
  assert.ok(c.skills.includes(29060)); assert.ok(d.skills.includes(29060));
  assert.match(c.story, /ChatGPT/); assert.match(d.story, /Claude/);
  assert.equal(petForSprite(199402), undefined);
});

test("native GM previews animate both new pets and keep the shared claw effect outside the pet catalogue", () => {
  const actors:any[]=[],images:any[]=[];
  const ui:any={texts:[],window(){},text(){},actor:(...a:any[])=>actors.push(a),image:(...a:any[])=>images.push(a)};
  const gm:any=new GmWindow({ui} as any);gm.hover={kind:"enemy",id:29007};
  for (const sprite of [199400,199401]) {
    gm.setDetail({kind:"enemy",id:29007,image:sprite,lines:[]});gm.detailFrame(0,0);
    const actor=actors.at(-1)?.[0];assert.ok(actor, "pet preview must use the native animated actor");
    const assets:any={anim:()=>({actions:[{dir:1,type:ANIM.STAND,ticks:3,frames:[[9300000,0,0,0],[9300001,0,1,0]]}]})};
    assert.deepEqual(actor.frameOf(assets,0),[9300000,0,0]);assert.deepEqual(actor.frameOf(assets,60),[9300001,0,1]);
  }
  assert.equal(actors.length,2);gm.setDetail({kind:"enemy",id:29007,image:199402,lines:[]});gm.detailFrame(0,0);
  assert.equal(actors.length,2);assert.equal(images.at(-1)[0],199402);
});
