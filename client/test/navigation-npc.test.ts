import test from "node:test";
import assert from "node:assert/strict";
import { Field } from "../src/field.ts";

async function fixture(rows:string[],x=0,y=0) {
 const handlers=new Map<string,(m:any)=>void>(),sent:any[]=[];
 const field=new Field({} as any,{on:(t:string,h:any)=>{handlers.set(t,h);return()=>{};},send:(m:any)=>sent.push(m)} as any);
 handlers.get("Self")!({id:1,name:"route",sprite:100000});
 handlers.get("EnterFloor")!({floor:100,name:"cave",width:rows[0].length,height:rows.length,x,y,dir:5,palette:0,mapVer:"npc",step:260});
 await new Promise(r=>setImmediate(r));
 const data=()=>handlers.get("MapData")!({floor:100,x1:0,y1:0,x2:rows[0].length,y2:rows.length,tiles:Array(rows.join("").length).fill(100),objs:Array(rows.join("").length).fill(0),walk:rows.join(""),ver:"npc"});
 const npc={name:"洞窟引路人",x:4,y:1};
 handlers.get("NpcList")!({floor:100,npcs:[npc],places:[]});sent.length=0;
 return {field,handlers,sent,data,npc};
}
const finish=(field:Field)=>{const now=performance.now()+1000;for(let i=0;i<40;i++)field.update(now+i*300);};

test("current-scene NPC route reaches its exact walkable coordinate",async()=>{
 const {field,data,npc,sent}=await fixture(["11111","11111","11111"]);data();
 field.navigateNpc(100,npc);finish(field);
 assert.deepEqual([field.self!.x,field.self!.y],[4,1]);
 assert.ok(sent.some(m=>m.t==="Move"));assert.match(field.navigationStatus,/到达/);
});

test("NPC on an obstacle routes to a reachable adjacent interaction cell",async()=>{
 const {field,data,npc}=await fixture(["11111","11110","11111"]);data();
 field.navigateNpc(100,npc);finish(field);
 assert.equal(field.self!.x,3); assert.ok(Math.abs(field.self!.y-1)<=1);
 assert.match(field.navigationStatus,/相邻|附近/);
});

test("unknown NPC terrain can resolve to a wall without abandoning the interaction route",async()=>{
 const {field,data,npc}=await fixture(["11111","11110","11111"]);
 field.navigateNpc(100,npc);data();finish(field);
 assert.equal(field.self!.x,3); assert.ok(Math.abs(field.self!.y-1)<=1);assert.match(field.navigationStatus,/相邻|附近/);
});

test("stale floor and replaced NPC snapshots cannot overwrite a current destination",async()=>{
 const {field,data,npc,handlers}=await fixture(["11111","11111","11111"]);data();field.navigateTo(2,2);
 field.navigateNpc(99,npc);assert.deepEqual(field.target,[2,2]);
 handlers.get("NpcList")!({floor:100,npcs:[],places:[]});
 field.navigateNpc(100,npc);assert.deepEqual(field.target,[2,2]);
});

test("NPC list refresh retains last good snapshot and limits concurrent requests",async t=>{
 let now=0;t.mock.method(performance,"now",()=>now);
 const {field,npc,sent,handlers}=await fixture(["11111","11111","11111"]);
 now=6000;assert.deepEqual(field.npcList(100),[npc]);field.npcList(100);
 assert.equal(sent.filter(m=>m.t==="NpcListReq").length,1);
 now=16001;field.npcList(100);assert.equal(sent.filter(m=>m.t==="NpcListReq").length,2);
 handlers.get("NpcList")!({floor:100,npcs:[{...npc,x:2}],places:[]});
 assert.equal(field.npcList(100)![0].x,2);
});

test("NPC on a portal stops alongside it without triggering a floor transition",async()=>{
 const {field,data,npc,sent}=await fixture(["11111","11112","11111"]);data();
 field.navigateNpc(100,npc);finish(field);
 assert.equal(field.self!.x,3);assert.ok(Math.abs(field.self!.y-1)<=1);
 assert.match(field.navigationStatus,/附近/);
 assert.equal(sent.filter(m=>m.t==="Move").length,3);
});

test("NPC discovery never requests or retains characters from another scene",async()=>{
 const {field,handlers,sent,npc}=await fixture(["11111","11111","11111"]);
 assert.deepEqual(field.npcList(999),[]);
 assert.equal(sent.filter(m=>m.t==="NpcListReq"&&m.floor===999).length,0);
 handlers.get("EnterFloor")!({floor:101,name:"next cave layer",width:5,height:3,x:0,y:0,dir:5,palette:0,mapVer:"new",step:260});
 handlers.get("NpcList")!({floor:100,npcs:[npc],places:[]});
 assert.deepEqual(field.npcList(100),[],"late response from prior floor stays out of current scene");
 assert.equal((field as any).npcLists.has(100),false,"old scene NPC snapshots are released");
});
