import test from "node:test";
import assert from "node:assert/strict";
import { Field } from "../src/field.ts";
import type { Connection } from "../src/net.ts";
import type { Assets } from "../src/assets.ts";

async function fixture(w=96,h=96,x=80,y=80) {
 const handlers=new Map<string,(m:any)=>void>(),sent:any[]=[];
 const field=new Field({} as Assets,{on:(t:string,f:(m:any)=>void)=>{handlers.set(t,f);return ()=>handlers.delete(t);},send:(m:any)=>sent.push(m)} as unknown as Connection);
 handlers.get("Self")!({id:1,name:"places",sprite:100000});
 handlers.get("EnterFloor")!({floor:100,name:"world",width:w,height:h,x,y,dir:5,palette:0,mapVer:"places",step:260});
 await new Promise(resolve=>setImmediate(resolve));sent.splice(0);
 const data=(x1:number,y1:number,x2:number,y2:number,walk:string)=>handlers.get("MapData")!({t:"MapData",floor:100,x1,y1,x2,y2,tiles:Array(walk.length).fill(100),objs:Array(walk.length).fill(0),walk,ver:"places"});
 return {field,handlers,sent,data};
}

test("distant navigation requests the destination chunk before unrelated world corners",async()=>{
 const {field,sent}=await fixture();
 (field as any).pending.clear(); // The view chunk is intentionally held by the test transport.
 field.navigateTo(90,90);field.update(performance.now());
 const request=sent.find(m=>m.t==="MapReq");
 assert.ok(request&&request.x1<=90&&request.x2>90&&request.y1<=90&&request.y2>90,"destination must load first for early wall validation");
 assert.ok((field as any).pending.size<=2);
});

test("location data arrives with NPCs and a dropped catalogue request retries",async t=>{
 let now=0;t.mock.method(performance,"now",()=>now);
 const {field,sent,handlers}=await fixture();
 field.npcList(100);field.npcList(100);
 assert.equal(sent.filter(m=>m.t==="NpcListReq").length,1);
 now=10_001;field.npcList(100);
 assert.equal(sent.filter(m=>m.t==="NpcListReq").length,2,"lost request must not block location catalogue forever");
 const place={name:"洞窟",floor:200,entrances:[{x:4,y:1},{x:4,y:2}],conditional:false};
 handlers.get("NpcList")!({t:"NpcList",floor:100,npcs:[],places:[place]});
 assert.deepEqual((field as any).mapPlaces(100),[place]);
 field.forgetNpcs(100);assert.equal((field as any).mapPlaces(100),null);
});

test("a location chooses a reachable doorway edge and manual input cancels it",async()=>{
 const {field,handlers,sent,data}=await fixture(5,3,0,0);
 data(0,0,5,3,"111111000211112");
 const place={name:"洞窟",floor:200,entrances:[{x:4,y:2},{x:4,y:1}],conditional:false};
 handlers.get("NpcList")!({t:"NpcList",floor:100,npcs:[],places:[place]});
 (field as any).navigatePlace(100,place);
 const start=performance.now();field.update(start);
 assert.deepEqual(field.target,[4,1],"choose shortest reachable entry instead of catalogue representative");
 for(let i=1;i<8;i++)field.update(start+i*300);
 assert.ok(sent.some(m=>m.t==="Move"));assert.equal(field.self?.x,4);assert.equal(field.self?.y,1);
 // An old-floor location cannot overwrite a valid current route.
 const before=field.target;(field as any).navigatePlace(99,place);assert.equal(field.target,before);
 handlers.get("EnterFloor")!({floor:100,name:"world",width:5,height:3,x:0,y:0,dir:5,palette:0,mapVer:"places",step:260});
 await new Promise(resolve=>setImmediate(resolve));data(0,0,5,3,"111111000211112");
 (field as any).navigatePlace(100,place);field.wantDir=7;field.update(start+3000);
 assert.equal(field.target,null,"direction input still cancels location navigation");
});
