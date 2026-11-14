import assert from "node:assert/strict";
import test from "node:test";
import { BattleScreen } from "../src/battle.ts";
import { ANIM } from "../src/assets.ts";
import { fillDefaults } from "../src/proto.gen.ts";
import { FONT } from "../src/ui.ts";

Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:()=>({getContext:()=>({measureText:(s:string)=>({width:s.length*14})})})}});
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:()=>null,setItem(){}}});

function battle(sprite=199400, boost=0, turns=0) {
 const images:any[]=[],boxes:any[]=[],sent:any[]=[],text:any[]=[],targetIds:string[]=[];
 let hover="",click="";
 const skill={slot:2,id:29060,func:"PETSKILL_PrimalCross",target:1,field:0,name:"赤爪裂阵",memo:"",option:""};
 const pet={slot:0,name:"pet",sprite,skills:[skill],maxSkill:3};
 const actions=Array.from({length:8},(_,dir)=>[ANIM.STAND,ANIM.WALK,ANIM.ATTACK].map(type=>({dir,type,ticks:3,
  frames:Array.from({length:type===ANIM.ATTACK?10:4},(_,i)=>[9300000+type*100+dir*10+i,0,0,type===ANIM.ATTACK&&i===5?10000:0])}))).flat();
 const host:any={root:"",quick:()=>false,auto:()=>false,serverAuto:()=>false,names:()=>false,
  pets:()=>({battle:0,pets:[pet]}),aiMemory:()=>({observe(){},save(){}}),
  assets:{anim:(id:number)=>id===199402?{actions:[{dir:0,type:ANIM.STAND,ticks:2,frames:Array.from({length:24},()=>[9300999,0,0,0])}]}:{actions},image:()=>({ox:-20,oy:-60,w:40,h:64})},
  ui:{texts:[],mouse:{y:0},window(){},image:(...a:any[])=>images.push(a),pic(){},text:(...a:any[])=>text.push(a),
   hitBox:(_x:number,_y:number,_xx:number,_yy:number,id:string)=>{targetIds.push(id);return id===hover;},clicked:(id:string)=>id===click,box:(...a:any[])=>boxes.push(a)},
  finish(){},send(){},sendPet:(...a:any[])=>sent.push(a),chat(){}};
 const start:any=fillDefaults({t:"BattleStart",mySlot:0,resume:true,speed:100,fighters:[0,5,10,11,12,13,14,15,16,17,18,19].map(slot=>({slot,hp:1000,maxHp:1000,mp:0,maxMp:0,ownerSlot:0,bagSlot:0,sprite:slot===5?sprite:100001,name:`f${slot}`,defenseBoost:slot===5?boost:0,defenseTurns:slot===5?turns:0}))});
 const screen:any=new BattleScreen(host,start);screen.combatLabel=()=>({width:30,height:30});
 for(const a of screen.fighters.values())a.rect=[a.x-20,a.y-60,40,64];
 return {screen,host,actor:screen.fighters.get(5),images,boxes,sent,text,targetIds,pet,hover:(id:string)=>hover=id,click:(id:string)=>click=id};
}
const hit=(target:number,extra={})=>({actor:5,target,kind:"attack",result:"damage",skill:"赤爪裂阵",effect:199402,hp:900,damage:100,actorHp:1000,status:0,guardian:-1,combo:false,...extra});
function enqueue(screen:any,events:any[]){screen.onTurn(fillDefaults({t:"BattleTurn",events} as any));}
function drain(screen:any,host:any,observe=(_n:number)=>{}){let now=100;while(screen.queue.length){screen.vnow=now;const finished=screen.queue[0](now);if(finished)screen.queue.shift();for(const a of screen.fighters.values())a.frame(host.assets,now);observe(now);if(!finished)now+=25;assert.ok(now<50000,"native melee must finish and return home");}}

test("cross target preview follows the native two-by-five edge and submits the original center",()=>{
 const h=battle();h.screen.petSkill=2;h.hover("pt-14");h.screen.petTarget(1);
 const rect=(slot:number)=>{const [x,y,w,hh]=h.screen.fighters.get(slot).rect;return[x,y,x+w,y+hh];};
 assert.deepEqual(h.boxes.map(b=>b.slice(0,4)),[rect(13),rect(19)],"14 links left13 and opposite19, never wraps to15");
 h.click("pt-14");h.screen.petTarget(1);assert.deepEqual(h.sent[0],[2,14,5]);
});

test("ordinary attack keeps its native single-target preview and adult skill windows use only their wire skills",()=>{
 const h=battle();h.pet.skills[0].func="PETSKILL_NormalAttack";h.screen.petSkill=2;h.hover("pt-14");h.screen.petTarget(1);
 assert.equal(h.boxes.length,0);h.pet.skills=[];h.screen.petWindow(h.pet);assert.ok(!h.text.some(a=>a[2]==="赤爪裂阵"));
});

test("each claw pet runs to its target, strikes on its hit frame with a red claw atlas, and returns home",()=>{
 for(const sprite of [199400,199401]){
  const h=battle(sprite),home=[h.actor.x,h.actor.y],enemy=h.screen.fighters.get(17),before=enemy.hp;
  let walked=false,attacked=false,earlyDamage=false,seenEffect=false;
  enqueue(h.screen,[hit(17)]);
  drain(h.screen,h.host,now=>{
   if(h.actor.action===ANIM.WALK)walked=true;
   if(h.actor.action===ANIM.ATTACK){attacked=true;assert.ok(h.actor.x<home[0]);assert.equal(h.actor.dir,3);}
   if(!attacked&&enemy.hp!==before)earlyDamage=true;
   if(h.actor.action===ANIM.ATTACK&&h.actor.lastFrame<5)assert.equal(enemy.hp,before,"HP must settle only on the native claw hit frame");
   const n=h.images.length;h.screen.drawFx(now);if(h.images.slice(n).some(a=>a[0]===9300999))seenEffect=true;
  });
  assert.ok(walked&&attacked);assert.equal(earlyDamage,false);assert.equal(enemy.hp,900);assert.ok(seenEffect,"shared skill must draw its red claw impact atlas at hit time");
  assert.deepEqual([h.actor.x,h.actor.y,h.actor.dir],[...home,3]);
 }
});

test("defense percentages and remaining turns come from wire events and reconnect snapshots",()=>{
 const h=battle(199400,46,3);assert.equal(h.actor.defenseBoost,46);assert.equal(h.actor.defenseTurns,3);
 h.screen.drawFighters(100);assert.ok(h.host.ui.texts.some((t:any)=>t.text==="防御 +46% · 3回合"));
 enqueue(h.screen,[{actor:5,target:5,kind:"stat",stat:39,statVal:52,statTurns:5}]);drain(h.screen,h.host);
 assert.deepEqual([h.actor.defenseBoost,h.actor.defenseTurns],[52,5]);
 enqueue(h.screen,[{actor:5,target:5,kind:"stat",stat:39,statVal:52,statTurns:2}]);drain(h.screen,h.host);
 assert.deepEqual([h.actor.defenseBoost,h.actor.defenseTurns],[52,2]);
 enqueue(h.screen,[{actor:5,target:5,kind:"stat",stat:39,statVal:-52,statTurns:0}]);drain(h.screen,h.host);
 assert.deepEqual([h.actor.defenseBoost,h.actor.defenseTurns],[0,0]);
});

 test("shared melee keeps guardians, reflection and prior departures authoritative",()=>{
 const g=battle();enqueue(g.screen,[hit(17,{guardian:18,status:8})]);drain(g.screen,g.host);
 assert.equal(g.screen.fighters.get(17).hp,1000);assert.equal(g.screen.fighters.get(18).hp,900);assert.equal(g.screen.fighters.get(18).status,8);
 const r=battle();enqueue(r.screen,[hit(17,{result:"reflect",hp:1000,actorHp:0})]);drain(r.screen,r.host);
 assert.equal(r.actor.hp,0);assert.equal(r.actor.dead,true);assert.equal(r.screen.fighters.get(17).hp,1000);
 const d=battle();enqueue(d.screen,[{actor:17,target:-1,kind:"flee",hp:1000},hit(17)]);drain(d.screen,d.host,now=>d.screen.drawFx(now));
 assert.equal(d.screen.fighters.get(17).gone,true);assert.equal(d.screen.fighters.get(17).hp,1000);
 assert.ok(!d.images.some(a=>a[0]===9300999),"a departed target cannot receive a stale claw effect");
 });

 test("cross only offers opponent centers because the authoritative skill rejects same-side targets",()=>{
 const h=battle();h.screen.petSkill=2;h.hover("pt-5");h.screen.petTarget(1);
 assert.ok(!h.targetIds.includes("pt-0")&&!h.targetIds.includes("pt-5"));assert.equal(h.boxes.length,0);
 assert.ok(h.targetIds.includes("pt-16"));
 });
 test("native run directions match all eight S/SW/W/NW/N/NE/E/SE artwork rows",()=>{
 const vectors=[[0,48],[-64,48],[-64,0],[-64,-48],[0,-48],[64,-48],[64,0],[64,48]];
 vectors.forEach(([dx,dy],dir)=>{const h=battle();const step=h.screen.moveStep(h.actor,()=>[h.actor.homeX+dx,h.actor.homeY+dy],100);step(100);assert.equal(h.actor.dir,dir);});
 });

test("cross lifesteal displays one authoritative self-heal after all hits without adding a second claw attack",()=>{
 const h=battle(),labels:{text:string;color:string}[]=[];let casts=0,previous=-1;h.actor.hp=700;
 h.screen.combatLabel=(text:string,_size:number,color:string)=>{labels.push({text,color});return{width:30,height:30};};
 enqueue(h.screen,[hit(17,{actorHp:700,combo:true}),hit(16,{actorHp:700}),{actor:5,target:5,kind:"heal",skill:"赤爪裂阵",effect:199402,damage:3,hp:703,actorHp:703,status:0}]);
 drain(h.screen,h.host,now=>{if(h.actor.action===ANIM.ATTACK&&previous!==ANIM.ATTACK)casts++;previous=h.actor.action;h.screen.drawFx(now);});
 assert.equal(h.actor.hp,703);assert.equal(casts,2,"self-healing must not synthesize another physical claw strike");assert.ok(labels.some(l=>l.text==="3"&&l.color===FONT.GREEN),"native self-heal amount must use the positive recovery color");
});
