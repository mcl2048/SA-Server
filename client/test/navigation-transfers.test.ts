import test from "node:test";
import assert from "node:assert/strict";
import { Field, MOVE } from "../src/field.ts";
import { gridPathSteps } from "../src/pathfinding.ts";
const transfer = {x:2,y:0,toX:5,toY:1};
const rows = ["1120011","1110021"];
const walk = Uint8Array.from(rows.join(""),c=>Number(c)+1);

test("a disconnected destination is routed through its explicit same-floor transfer",()=>{
 const search = (gridPathSteps as any)(7,2,walk,0,0,6,0,[],[transfer]);
 let r=search.next();while(!r.done)r=search.next();
 assert.deepEqual(r.value,[5,5],"return only the first legal leg ending at the chosen portal");
});

test("unknown transfer destinations and unrelated portals remain blocked",()=>{
 const unknown=walk.slice();unknown[12]=0;
 for(const transfers of [[],[{...transfer,toX:4}], [{...transfer,toX:99}], [{...transfer,toX:5}]]) {
  const search=(gridPathSteps as any)(7,2,transfers.length?unknown:walk,0,0,6,0,[],transfers);
  let r=search.next();while(!r.done)r=search.next();assert.equal(r.value,null);
 }
});

async function fixture(){
 const handlers=new Map<string,(m:any)=>void>(),sent:any[]=[];
 const field=new Field({} as any,{on:(t:string,h:any)=>{handlers.set(t,h);return()=>{};},send:(m:any)=>sent.push(m)} as any);
 const enter=(x:number,y:number,floor=817)=>handlers.get("EnterFloor")!({floor,name:"海底",width:7,height:2,x,y,dir:5,palette:0,mapVer:"transfers",step:260});
 handlers.get("Self")!({id:1,name:"navigator",sprite:100000});enter(0,0);await new Promise(r=>setImmediate(r));
 handlers.get("MapData")!({floor:817,x1:0,y1:0,x2:7,y2:2,tiles:Array(14).fill(100),objs:Array(14).fill(0),walk:rows.join(""),ver:"transfers"});
 const npc={name:"宝箱",x:6,y:0};handlers.get("NpcList")!({floor:817,npcs:[npc],places:[],transfers:[transfer]});sent.length=0;
 return {field,sent,handlers,enter,npc};
}

test("an NPC route resumes only after its planned same-floor EnterFloor confirmation",async()=>{
 const {field,sent,enter,npc}=await fixture();field.navigateNpc(817,npc);
 const began=performance.now()+1000;let jumps=0,moves=0;
 for(let i=0;i<20;i++){
  field.update(began+i*300);
  for(const m of sent.splice(0))if(m.t==="Move"){
   moves++;const x=m.x+MOVE[m.dir][0],y=m.y+MOVE[m.dir][1];
   if(x===2&&y===0){jumps++;enter(5,1);}
  }
 }
 assert.equal(jumps,1);assert.equal(moves,3);
 assert.deepEqual([field.self!.x,field.self!.y],[6,0]);assert.match(field.navigationStatus,/到达/);
});

for(const reason of ["manual","wrong-floor","wrong-position"] as const)test(`${reason} cannot revive a route waiting for a portal`,async()=>{
 const {field,sent,enter,npc}=await fixture();field.navigateNpc(817,npc);
 const began=performance.now()+1000;field.update(began);field.update(began+300);
 assert.ok(sent.some(m=>m.t==="Move"&&m.x===1),"precondition: planned portal entered");
 if(reason==="manual")field.setManualTarget(null);
 enter(reason==="wrong-position"?6:5,1,reason==="wrong-floor"?818:817);
 for(let i=0;i<10;i++)field.update(began+600+i*300);
 assert.equal(field.target,null);assert.equal([field.self!.x,field.self!.y].join(","),reason==="wrong-position"?"6,1":"5,1");
});

test("a safe return route confirms both floors before restoring the original NPC goal",async()=>{
 const {field,sent,handlers,npc}=await fixture();
 const via=[{floor:817,x:2,y:0,toFloor:900,toX:0,toY:0},{floor:900,x:2,y:0,toFloor:817,toX:5,toY:1}];
 handlers.get("NpcList")!({floor:817,npcs:[npc],places:[],transfers:[{...transfer,via}]});
 field.navigateNpc(817,npc);const began=performance.now()+1000;let jumps=0;
 for(let i=0;i<30;i++){
  field.update(began+i*300);
  for(const m of sent.splice(0))if(m.t==="Move"&&m.x+MOVE[m.dir][0]===2){
   jumps++;const back=field.floor===900;
   handlers.get("EnterFloor")!({floor:back?817:900,name:"return passage",width:back?7:3,height:back?2:1,x:back?5:0,y:back?1:0,dir:5,palette:0,mapVer:back?"transfers":"passage",step:260});
   if(!back)handlers.get("MapData")!({floor:900,x1:0,y1:0,x2:3,y2:1,tiles:[100,100,100],objs:[0,0,0],walk:"112",ver:"passage"});
   await new Promise(r=>setImmediate(r));
  }
 }
 assert.equal(jumps,2);assert.equal(field.floor,817);assert.deepEqual([field.self!.x,field.self!.y],[6,0]);assert.match(field.navigationStatus,/到达/);
});

for(const mode of ["quick","normal","locked","follower","new-target"] as const)test(`${mode} preserves or cancels the complete portal intent before the first warp`,async()=>{
 const {field,sent,enter,npc}=await fixture();field.navigateNpc(817,npc);
 const began=performance.now()+1000;field.update(began);
 if(mode==="quick"||mode==="normal"){field.beginBattle(mode==="quick");field.update(began+300);field.endBattle();}
 else if(mode==="new-target")field.navigateTo(0,1);
 else field[mode]=true;
 let jumped=false;
 for(let i=1;i<20;i++){
  field.update(began+i*300);
  for(const m of sent.splice(0))if(m.t==="Move"&&m.x+MOVE[m.dir][0]===2){jumped=true;enter(5,1);}
 }
 if(mode==="quick"){assert.ok(jumped);assert.deepEqual([field.self!.x,field.self!.y],[6,0]);assert.match(field.navigationStatus,/到达/);}
 else{assert.equal(jumped,false);assert.notDeepEqual([field.self!.x,field.self!.y],[6,0]);}
});

for(const mode of ["locked","follower"] as const)test(`${mode} cancels a portal route while the EnterFloor acknowledgement is pending`,async()=>{
 const {field,enter,npc}=await fixture();field.navigateNpc(817,npc);const began=performance.now()+1000;
 field.update(began);field.update(began+300);field[mode]=true;field.update(began+600);enter(5,1);
 field[mode]=false;for(let i=0;i<10;i++)field.update(began+900+i*300);
 assert.deepEqual([field.self!.x,field.self!.y],[5,1]);assert.equal(field.target,null);
});
