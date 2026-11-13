import assert from "node:assert/strict";
import { Field } from "../src/field.ts";
import type { Connection } from "../src/net.ts";
import type { Assets } from "../src/assets.ts";
const handlers = new Map<string,(m:any)=>void>(), sent:any[]=[];
const field = new Field({} as Assets, {on:(t:string,f:(m:any)=>void)=>handlers.set(t,f),send:(m:any)=>sent.push(m)} as unknown as Connection);
handlers.get("Self")!({id:1,name:"test",sprite:100000});
handlers.get("EnterFloor")!({floor:1,name:"test",width:96,height:96,x:1,y:1,dir:5,palette:0,mapVer:"test",step:260});
await new Promise(resolve=>setTimeout(resolve,0));
field.setMinimapReveal(true);
field.navigateTo(90,90);
let count=0;
for(let batch=0;batch<100;batch++) {
 field.update(performance.now()+batch*300);
 const requests=sent.splice(0).filter(m=>m.t==="MapReq");
 assert.ok(requests.length<=2,"bounded outstanding map requests");
 for(const m of requests) {
  const n=(m.x2-m.x1)*(m.y2-m.y1);
  assert.ok(m.x2-m.x1<=64 && m.y2-m.y1<=64);
  handlers.get("MapData")!({...m,t:"MapData",tiles:Array(n).fill(100),objs:Array(n).fill(0),walk:"1".repeat(n),ver:"test"}); count++;
 }
 if(field.navigationStatus==="已到达目标") break;
}
assert.ok(count>1,"map loaded in chunks");
assert.equal(field.navigationStatus,"已到达目标");
assert.equal(field.self?.x,90); assert.equal(field.self?.y,90);
assert.equal(field.seen[95],0,"reveal prefetch must not mark remote cells explored");
field.navigateTo(-1,0); assert.match(field.navigationStatus,/范围外/);
field.navigateTo(10,10);
handlers.get("PosCorrect")!({x:90,y:90,dir:0});
assert.equal(field.target,null); assert.match(field.navigationStatus,/服务端阻止/);
// Large floor, tiny known region, a wall requiring ten steps instead of the
// eight-step Chebyshev distance. No response to background chunks is supplied.
handlers.get("EnterFloor")!({floor:2,name:"large",width:1000,height:1000,x:371,y:183,dir:5,palette:0,mapVer:"large",step:260});
await new Promise(resolve=>setTimeout(resolve,0));
sent.splice(0);
const x1=368,y1=180,x2=384,y2=192, tiles=Array((x2-x1)*(y2-y1)).fill(100);
const walk=Array(tiles.length).fill("1");
for(let y=181;y<=186;y++) walk[(y-y1)*(x2-x1)+375-x1]="0";
handlers.get("MapData")!({t:"MapData",floor:2,x1,y1,x2,y2,tiles,objs:Array(tiles.length).fill(0),walk:walk.join(""),ver:"large"});
field.navigateTo(375,183);
assert.match(field.navigationStatus,/目标不可达/,"known wall gives immediate feedback on incomplete map");
assert.equal(field.target,null);
assert.equal((field as unknown as {mapNavigation:boolean}).mapNavigation,false);
// An unknown target still waits, but resolves immediately when its chunk says wall.
field.navigateTo(500,500);
assert.match(field.navigationStatus,/加载/);
handlers.get("MapData")!({t:"MapData",floor:2,x1:500,y1:500,x2:501,y2:501,tiles:[100],objs:[0],walk:"0",ver:"large"});
field.update(performance.now()+500);
assert.match(field.navigationStatus,/目标不可达/,"newly loaded wall does not wait for whole floor");
assert.equal(field.target,null);
field.navigateTo(379,186);
const began=performance.now()+1000;
field.update(began);
assert.equal(field.navigationStatus,"自动寻路中…","known local detour starts immediately");
assert.ok(sent.some(m=>m.t==="Move"),"movement begins without waiting for unrelated chunks");
let moves=sent.filter(m=>m.t==="Move").length;
for(let i=1;i<20;i++) { sent.splice(0);field.update(began+i*300);moves+=sent.filter(m=>m.t==="Move").length; }
assert.equal(field.navigationStatus,"已到达目标");
assert.equal(field.self?.x,379);assert.equal(field.self?.y,186);
assert.ok(moves>8,"takes a real obstacle detour");
assert.equal(field.floorView(2)?.walk[0],0,"floor remains incomplete throughout movement");
// Simulate lost pending requests: expired slots are released without a burst.
const pending=(field as unknown as {pending:Map<string,number>}).pending;
for(const key of pending.keys()) pending.set(key,performance.now()-10_001);
sent.splice(0);field.update(began+7000);
assert.ok(sent.some(m=>m.t==="MapReq"),"stale pending requests cannot permanently block full reveal");
assert.ok(pending.size<=2);
console.log("minimap navigation integration passed");
