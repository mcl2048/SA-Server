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
    assets: { anim: (id: number) => id === 199300 ? { actions: Array.from({ length: 8 }, (_, dir) =>
      [action(ANIM.STAND, 9200000, 8), action(ANIM.HAND, 9200001, 8)].map(a => ({ ...a, dir }))).flat() }
      : id === 199301 ? { actions: [action(ANIM.STAND, 9200100, 28)] } : null },
    ui: { texts: [], image: (...args: number[]) => images.push(args), text() {}, box() {} }, finish() {}, send() {}, sendPet() {}, chat() {} };
  const start: any = fillDefaults({ t: "BattleStart", mySlot: 0, resume: true, speed: 100,
    fighters: [0, 5, 10, 15, 16].map(slot => ({ slot, hp: 100, maxHp: 100, mp: 30, maxMp: 30, sprite: slot === actor ? 199300 : 100001, name: `unit${slot}` })) });
  const screen: any = new BattleScreen(host, start);
  // Canvas font rasterization is unrelated to event timing/HP/status. Keep
  // real Fighter, animation effects, hit handling and playback queue below.
  screen.combatLabel = () => ({ width: 30, height: 30 }); host.ui.pic = () => {};
  return { screen, images, actor: screen.fighters.get(actor), host };
}

const shot = (target: number, extra = {}) => ({ actor: 5, target, kind: "magic", result: "damage", skill: "电磁火炮", effect: 199301,
  hp: 84, damage: 16, actorHp: 100, actorMp: 30, status: 0, guardian: -1, combo: false, ...extra });
function enqueue(screen: any, events: any[]) { screen.onTurn(fillDefaults({ t: "BattleTurn", events } as any)); }
function drain(screen: any, observe = (_now: number) => {}) {
 let now=100;
 while(screen.queue.length) { if(screen.queue[0](now))screen.queue.shift();else now+=25;observe(now);assert.ok(now<30000); }
}

test("five cannon rounds cast in place and render one target explosion before each separate HP settlement",()=>{
 const {screen,actor,images,host}=battle(),home=[actor.x,actor.y], casts:number[]=[];
 enqueue(screen,[shot(10),shot(15),shot(16),shot(10,{hp:68}),shot(15,{hp:68,status:2})]);
 const seen:number[][]=[]; let previous=-1;
 drain(screen,now=>{
  const frame=actor.frame(host.assets,now);
  if(actor.action===ANIM.HAND&&previous!==ANIM.HAND)casts.push(now);previous=actor.action;
  assert.deepEqual([actor.x,actor.y],home);
  const hp=[10,15,16].map(s=>screen.fighters.get(s).hp);
  if(!seen.length||hp.some((v,i)=>v!==seen.at(-1)![i]))seen.push(hp);
  const before=images.length;screen.drawFx(now);
  const fx=images.slice(before).filter(v=>v[0]===9200100);
  assert.ok(fx.length<=1,"five rounds cannot overlap five whole target atlases");
 });
 assert.equal(casts.length,5,"each shot needs its actual native right-cannon HAND cast");
 assert.deepEqual(seen,[[100,100,100],[84,100,100],[84,84,100],[84,84,84],[68,84,84],[68,68,84]]);
 assert.equal(screen.fighters.get(15).status,2);
 assert.ok(images.some(v=>v[0]===9200100),"electromagnetic explosion must use its native atlas");
});

test("cannon preserves reflection and guardian damage instead of applying physical HP to the original victim",()=>{
 for(const result of ["reflect","absorb","vanish","dodge"]){
  const {screen,actor}=battle();enqueue(screen,[shot(15,{result,hp:100,actorHp:result==="reflect"?0:100})]);drain(screen);
  assert.equal(actor.hp,result==="reflect"?0:100);assert.equal(actor.dead,result==="reflect");assert.equal(screen.fighters.get(15).hp,100);
 }
 const {screen}=battle();enqueue(screen,[shot(15,{guardian:16,status:2})]);drain(screen);
 assert.equal(screen.fighters.get(15).hp,100);assert.equal(screen.fighters.get(15).status,0);
 assert.equal(screen.fighters.get(16).hp,84);assert.equal(screen.fighters.get(16).status,2);
});

test("a forced live departure completes before later rounds and a stale slot never gets another explosion",()=>{
 const {screen,images}=battle();
 enqueue(screen,[shot(15),{actor:15,target:-1,kind:"flee",hp:84,status:0},shot(15,{hp:68}),shot(16)]);
 let emptyDraws=0;
 drain(screen,now=>{
  const before=images.length;screen.drawFx(now);
  if(screen.fighters.get(15).gone)emptyDraws+=images.slice(before).filter(v=>v[0]===9200100&&v[1]===screen.fighters.get(15).x).length;
 });
 assert.equal(screen.fighters.get(15).gone,true);assert.equal(screen.fighters.get(15).hp,84,"expulsion does not kill or hit an absent target");
 assert.equal(screen.fighters.get(16).hp,84);assert.equal(emptyDraws,0);
});

test("quick cannon settles ordered damage, paralysis and departure without moving the caster",()=>{
 const {screen,actor}=battle(),home=[actor.x,actor.y];
 enqueue(screen,[shot(15,{status:2}),{actor:15,target:-1,kind:"flee",hp:84,status:2},shot(16,{hp:52})]);
 screen.quickFrame(100);
 assert.equal(screen.queue.length,0);assert.equal(screen.fx.length,0);assert.deepEqual([actor.x,actor.y],home);
 assert.equal(screen.fighters.get(15).gone,true);assert.equal(screen.fighters.get(15).hp,84);assert.equal(screen.fighters.get(15).status,2);
 assert.equal(screen.fighters.get(16).hp,52);
});
