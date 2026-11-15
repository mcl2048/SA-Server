import test from "node:test";
import assert from "node:assert/strict";
import {defaultAi, loadAi, saveAi} from "../src/ai.ts";
import {smartChoose, AiMemory, type SmartContext} from "../src/aismart.ts";

const store = new Map<string,string>();
Object.assign(globalThis,{localStorage:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)}});
function context(): SmartContext {
  const f=(slot:number)=>({slot,name:`f${slot}`,hp:500,maxHp:500,mp:100,maxMp:100,level:1,status:0,gone:false});
  return {me:0,first:true,fighters:new Map([f(0),f(15)].map(f=>[f.slot,f])),inv:[],myAtk:100,pet:null,capturePlace:false,noEscape:false,mem:new AiMemory("automation")};
}
function item(slot:number,name:string,memo:string) {return {slot,name,memo,usable:true,field:0,target:1} as any;}

test("new automation switches default off and remain isolated per character",()=>{
 const d=defaultAi();assert.equal(d.autoEscape,false);assert.equal(d.autoDrop,false);assert.equal(d.dropKeywords,"");
 saveAi("a",{...d,autoEscape:true,autoDrop:true,dropKeywords:"石龟 | 蕨"});
 assert.equal(loadAi("a").autoEscape,true);assert.equal(loadAi("a").autoDrop,true);assert.equal(loadAi("a").dropKeywords,"石龟 | 蕨");
 assert.equal(loadAi("b").autoDrop,false);
 store.set("sa.ai.old",JSON.stringify({v:2,healAt:45}));assert.equal(loadAi("old").autoDrop,false);assert.equal(loadAi("old").healAt,45);
});

test("meat recovery takes priority over both equipped healing magic and medicine",()=>{
 const c=context();c.fighters.get(0)!.hp=100;
 c.inv=[item(9,"耐久药","回复耐久力500"),item(10,"石龟的肉","回复耐久力100"),
 {...item(0,"装备",""),magic:"滋润精灵",magicFunc:"MAGIC_Recovery",magicMp:1,magicTarget:1,magicField:0,magicOption:"500"}];
 const cmd=smartChoose(defaultAi(),c);assert.equal(cmd.kind,"item");assert.equal(cmd.item,10);assert.equal(cmd.target,0);
});

test("MP threshold recovery works without a healing spell and prefers MP meat",()=>{
 const c=context();c.fighters.get(0)!.mp=20;
 c.inv=[item(9,"气力药","回复气力100"),item(10,"气力肉","回复气力40")];
 let cmd=smartChoose(defaultAi(),c);assert.equal(cmd.kind,"item");assert.equal(cmd.item,10);
 c.fighters.get(0)!.mp=30;cmd=smartChoose(defaultAi(),c);assert.equal(cmd.kind,"attack","at the exact threshold no recovery is required");
});

test("automatic escape precedes healing, caps real failures at three and excludes forbidden fights",()=>{
 const c=context(),s={...defaultAi(),autoEscape:true,escape:false};c.fighters.get(0)!.hp=100;c.inv=[item(9,"肉","回复耐久力100")];
 assert.equal(smartChoose(s,c).kind,"escape");
 c.escapeFailures=3;assert.equal(smartChoose(s,c).kind,"item");
 c.escapeFailures=0;c.noEscape=true;assert.equal(smartChoose(s,c).kind,"item");
 c.noEscape=false;c.pvp=true;assert.equal(smartChoose(s,c).kind,"item");
});

test("self-only meat is not selected for an injured teammate",()=>{
 const c=context();c.fighters.set(1,{...c.fighters.get(0)!,slot:1,hp:1});c.inv=[{...item(9,"肉","回复耐久力100"),target:0}];
 const cmd=smartChoose({...defaultAi(),escape:false},c);assert.notEqual(cmd.kind,"item");
});

test("mixed HP-first descriptions cannot masquerade as an MP recovery item",()=>{
 const c=context();c.fighters.get(0)!.mp=0;c.inv=[item(9,"料理肉","回复耐久力100、气力20")];
 assert.equal(smartChoose({...defaultAi(),escape:false},c).kind,"attack");
});

test("medicine precedes a whole-party healing spirit when multiple allies are low",()=>{
 const c=context();c.fighters.get(0)!.hp=20;c.fighters.set(1,{...c.fighters.get(0)!,slot:1,hp:10});
 c.inv=[item(9,"耐久药","回复耐久力500"),{...item(0,"装备",""),magic:"全体精灵",magicFunc:"MAGIC_Recovery",magicMp:1,magicTarget:2,magicField:0,magicOption:"500"}];
 const cmd=smartChoose(defaultAi(),c);assert.equal(cmd.kind,"item");assert.equal(cmd.item,9);
});
