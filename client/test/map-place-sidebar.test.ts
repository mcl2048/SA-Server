import test from "node:test";
import assert from "node:assert/strict";
import { Ui, Mouse } from "../src/ui.ts";
import { MapWindow } from "../src/worldmap.ts";

Object.assign(globalThis,{location:{search:""},localStorage:{getItem:()=>null},document:{createElement:()=>({width:0,height:0,getContext:()=>({font:"",measureText:(s:string)=>({width:s.length*7}),fillRect(){},clearRect(){},createRadialGradient:()=>({addColorStop(){}})})})}});
function fixture() {
 const assets={tile:()=>undefined,image:()=>undefined,anim:()=>undefined};
 const mouse=new Mouse(),ui=new Ui(assets as any,mouse),routes:unknown[]=[];
 const places=Array.from({length:20},(_,i)=>({name:`世界地图洞窟村庄地点完整长名称${i}`,floor:200+i,conditional:i===0,entrances:[{x:i+1,y:i+2}]}));
 const view={floor:100,name:"world",w:2,h:2,tiles:new Uint16Array(4),objs:new Uint16Array(4),walk:new Uint8Array(4),seen:new Uint8Array(4),version:1,seenVersion:1};
 const field:any={floor:100,self:null,actors:new Map(),floorView:()=>view,exploredFloors:()=>[{floor:100,name:"world"},{floor:200,name:"old"}],mapPlaces:()=>places,npcList:()=>[],requestFloor(){},navigatePlace:(...args:unknown[])=>routes.push(args)};
 const map=new MapWindow({ui,canvas:{} as any,assets:assets as any,root:"/assets/",field:()=>field});
 const draw=()=>{ui.begin();map.frame([],()=>{});ui.end();};
 const click=(id:string)=>{const h=ui.getMobileActions().find(h=>h.id===id);assert.ok(h,`live action ${id}`);mouse.x=(h.x1+h.x2)/2;mouse.y=(h.y1+h.y2)/2;mouse.clicked=true;draw();mouse.clicked=false;draw();};
 return {ui,draw,click,routes,places};
}

test("current-location sidebar pages every entry, retains full native labels and invokes the selected doorway",()=>{
 const h=fixture();h.draw();
 let actions=h.ui.getMobileActions().filter(a=>a.id.startsWith("map-place-"));
 assert.equal(actions.length,9,"default sidebar lists current places even if never visited");
 assert.match(actions[0].label??"",/完整长名称0/);assert.match(actions[0].label??"",/条件入口/);
 h.click(actions[0].id);assert.equal(h.routes.length,1);assert.equal(h.routes[0][1],h.places[0]);
 h.click("map-places-next");actions=h.ui.getMobileActions().filter(a=>a.id.startsWith("map-place-"));
 assert.equal(actions.length,9);assert.match(actions[0].label??"",/完整长名称9/);
 h.click("map-places-next");actions=h.ui.getMobileActions().filter(a=>a.id.startsWith("map-place-"));
 assert.equal(actions.length,2);assert.match(actions[1].label??"",/完整长名称19/);
 h.click("map-tab-floors");assert.ok(h.ui.getMobileActions().some(a=>a.id==="map-fl-200"),"historical floor navigation remains available");
});

test("an explicit native hit label preserves full mobile text without changing desktop geometry",()=>{
 const h=fixture();h.ui.begin();
 (h.ui.hitBox as any)(10,20,150,52,"long-map-place",false,"完整的村庄与洞窟名称 东 400 南 300");
 h.ui.text(12,23,"完整的村…","#fff");
 const hit=h.ui.getMobileActions()[0];
 assert.equal(hit.label,"完整的村庄与洞窟名称 东 400 南 300");assert.deepEqual([hit.x1,hit.y1,hit.x2,hit.y2],[10,20,150,52]);
});
