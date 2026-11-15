import assert from "node:assert/strict";
import test from "node:test";
import {BattleScreen} from "../src/battle.ts";
import {fillDefaults} from "../src/proto.gen.ts";
import {ANIM} from "../src/assets.ts";

function setup(quick=false) {
 const host:any={root:"",quick:()=>quick,auto:()=>false,serverAuto:()=>true,pets:()=>({pets:[]}),aiMemory:()=>({observe(){},save(){}}),
 assets:{anim:()=>null},ui:{texts:[],image(){},box(){},text(){},pic(){}},finish(){},send(){},sendPet(){},chat(){}};
 const start:any=fillDefaults({t:"BattleStart",mySlot:0,resume:true,speed:100,fighters:[0,5,15,16].map(slot=>({slot,hp:100,maxHp:100,mp:20,maxMp:20,sprite:100001,name:`f${slot}`}))});
 const screen:any=new BattleScreen(host,start);screen.combatLabel=()=>({width:20,height:20});
 return screen;
}
const events=(coattack:number)=>[0,5].map((actor,i)=>({actor,target:15,kind:"attack",result:"damage",hp:70-i*30,damage:30,actorHp:100,actorMp:20,coattack,guardian:-1}));

test("coattack members advance and strike together while authoritative HP stays ordered",()=>{
 const screen=setup();screen.onTurn(fillDefaults({t:"BattleTurn",events:events(1)} as any));
 let now=100,together=false,simultaneous=false;const hp:number[]=[];
 while(screen.queue.length){
  if(screen.queue[0](now))screen.queue.shift();else now+=25;
  const actors=[screen.fighters.get(0),screen.fighters.get(5)];
  together ||= actors.every(a=>Math.hypot(a.x-a.homeX,a.y-a.homeY)>2);
  simultaneous ||= actors.every(a=>a.action===ANIM.ATTACK);
  const value=screen.fighters.get(15).hp;if(hp.at(-1)!==value)hp.push(value);
  assert.ok(now<30000);
 }
 assert.equal(together,true,"members must approach before either returns home");assert.equal(simultaneous,true,"both attack actions must share the strike stage");
 assert.deepEqual(hp,[100,40]);
 for(const slot of [0,5]) {const a=screen.fighters.get(slot);assert.deepEqual([a.x,a.y],[a.homeX,a.homeY]);}
});

test("quick coattack finishes with the final server HP and no stuck movement",()=>{
 const screen=setup(true);screen.onTurn(fillDefaults({t:"BattleTurn",events:events(1)} as any));screen.quickFrame(100);
 assert.equal(screen.queue.length,0);assert.equal(screen.fighters.get(15).hp,40);
 for(const slot of [0,5]) {const a=screen.fighters.get(slot);assert.deepEqual([a.x,a.y],[a.homeX,a.homeY]);}
});

test("escape failures come from own failed events and reset with a new battle",()=>{
 const screen=setup();screen.onTurn(fillDefaults({t:"BattleTurn",events:[{actor:1,kind:"escape",ok:false},{actor:0,kind:"guard"},{actor:0,kind:"escape",ok:false}]} as any));
 assert.equal(screen.escapeFailures,1);assert.equal(setup().escapeFailures,0);
});


test("enemy coattack focuses the follow camera before its approach",()=>{
 const screen=setup();screen.cameraSlot=5;
 screen.onTurn(fillDefaults({t:"BattleTurn",events:[15,16].map((actor,i)=>({actor,target:0,kind:"attack",result:"damage",hp:70-i*30,damage:30,actorHp:100,coattack:1,guardian:-1}))} as any));
 screen.queue[0](100);assert.equal(screen.cameraSlot,15);
});
