import test from "node:test";
import assert from "node:assert/strict";
import { Ui, Mouse } from "../src/ui.ts";
import { MapWindow } from "../src/worldmap.ts";

Object.assign(globalThis,{location:{search:""},localStorage:{getItem:()=>null},document:{createElement:()=>({width:0,height:0,getContext:()=>({font:"",measureText:(s:string)=>({width:s.length*7}),fillRect(){},clearRect(){},beginPath(){},arc(){},fill(){},createRadialGradient:()=>({addColorStop(){}})})})}});
function fixture() {
 const assets={tile:()=>undefined,image:()=>undefined,anim:()=>undefined};
 const mouse=new Mouse(),ui=new Ui(assets as any,mouse),routes:unknown[]=[];
 const places=Array.from({length:20},(_,i)=>({name:`世界地图洞窟村庄地点完整长名称${i}`,floor:200+i,conditional:i===0,entrances:[{x:i+1,y:i+2}]}));
 const view={floor:100,name:"world",w:2,h:2,tiles:new Uint16Array(4),objs:new Uint16Array(4),walk:new Uint8Array(4),seen:new Uint8Array(4),version:1,seenVersion:1};
 const field:any={floor:100,self:null,actors:new Map(),floorView:()=>view,exploredFloors:()=>[{floor:100,name:"world"},{floor:200,name:"old"}],mapPlaces:()=>places,npcList:()=>[],requestFloor(){},navigatePlace:(...args:unknown[])=>routes.push(args)};
 const map=new MapWindow({ui,canvas:{} as any,assets:assets as any,root:"/assets/",field:()=>field});
 const draw=()=>{ui.begin();map.frame([],()=>{});ui.end();};
 const click=(id:string)=>{const h=ui.getMobileActions().find(h=>h.id===id);assert.ok(h,`live action ${id}`);mouse.x=(h.x1+h.x2)/2;mouse.y=(h.y1+h.y2)/2;mouse.clicked=true;draw();mouse.clicked=false;draw();};
 return {ui,draw,click,routes,places,field};
}

test("current-location sidebar pages every entry, retains full native labels and invokes the selected doorway",()=>{
 const h=fixture();h.draw();
 let actions=h.ui.getMobileActions().filter(a=>a.id.startsWith("map-place-"));
 assert.ok(actions.length>0,"default sidebar lists current places even if never visited");
 assert.match(actions[0].label??"",/完整长名称0/);assert.match(actions[0].label??"",/条件入口/);
 h.click(actions[0].id);assert.equal(h.routes.length,1);assert.equal(h.routes[0][1],h.places[0]);
 const ids=new Set(actions.map(a=>a.id));
 for(let i=0;i<20&&h.ui.getMobileActions().some(a=>a.id==="map-places-next");i++){
  h.click("map-places-next");for(const a of h.ui.getMobileActions().filter(a=>a.id.startsWith("map-place-")))ids.add(a.id);
 }
 assert.equal(ids.size,h.places.length);
 h.click("map-tab-floors");assert.ok(h.ui.getMobileActions().some(a=>a.id==="map-fl-200"),"historical floor navigation remains available");
});

test("an explicit native hit label preserves full mobile text without changing desktop geometry",()=>{
 const h=fixture();h.ui.begin();
 (h.ui.hitBox as any)(10,20,150,52,"long-map-place",false,"完整的村庄与洞窟名称 东 400 南 300");
 h.ui.text(12,23,"完整的村…","#fff");
 const hit=h.ui.getMobileActions()[0];
 assert.equal(hit.label,"完整的村庄与洞窟名称 东 400 南 300");assert.deepEqual([hit.x1,hit.y1,hit.x2,hit.y2],[10,20,150,52]);
});


test("compact sidebar wraps complete long place names rather than truncating them",()=>{
 const h=fixture();h.draw();
 const hit=h.ui.getMobileActions().find(a=>a.id.startsWith("map-place-"))!;
 const lines=h.ui.texts.filter(t=>t.x>=hit.x1&&t.x<hit.x2&&t.y>=hit.y1&&t.y<hit.y2&&!t.text.startsWith("东 "));
 assert.equal(lines.map(t=>t.text).join(""),"※ "+h.places[0].name);
 assert.ok(lines.every(t=>t.size===12));
});

test("NPC tab pages the entire current scene and selects the exact named NPC",()=>{
 const h=fixture(),npcs=Array.from({length:67},(_,i)=>({name:`洞窟本层守门人完整长名字${i}`,x:i+2,y:i+3}));
 const selected:unknown[]=[];h.field.npcList=(floor:number)=>{assert.equal(floor,100);return npcs;};
 h.field.navigateNpc=(...args:unknown[])=>selected.push(args);
 h.draw();h.click("map-tab-npcs");
 const ids=new Set<string>();let last;
 for(let page=0;page<67;page++){
  const actions=h.ui.getMobileActions().filter(a=>a.id.startsWith("map-npc-"));
  assert.ok(actions.length>0);for(const hit of actions){assert.ok(hit.label?.includes("完整长名字"));ids.add(hit.id);}last=actions.at(-1);
  if(!h.ui.getMobileActions().some(a=>a.id==="map-npcs-next"))break;
  h.click("map-npcs-next");
 }
 assert.equal(ids.size,67);h.click(last!.id);assert.deepEqual(selected,[[100,npcs[66]]]);
 h.field.floor=200;h.field.npcList=()=>[{name:"新地图NPC",x:4,y:5}];h.draw();
 assert.ok(h.ui.getMobileActions().some(a=>a.id.startsWith("map-npc-200-")&&a.label?.includes("新地图NPC")));
 assert.ok(!h.ui.getMobileActions().some(a=>a.id.startsWith("map-npc-100-")));
});


test("historical floor browsing never requests NPCs outside the player's current scene",()=>{
 const h=fixture(),requested:number[]=[];
 h.field.npcList=(floor:number)=>{requested.push(floor);return [];};
 const floorView=h.field.floorView;h.field.floorView=(floor:number)=>({...floorView(),floor});
 h.draw();h.click("map-tab-floors");h.click("map-fl-200");
 assert.ok(requested.length>0);assert.ok(requested.every(floor=>floor===100),"NPC catalogue must stay current-scene only");
});

test("historical region rows also preserve complete long names at the compact font",()=>{
 const h=fixture(),name="世界地图洞窟村庄地点完整长名称历史楼层";
 h.field.exploredFloors=()=>[{floor:200,name}];h.draw();h.click("map-tab-floors");
 const hit=h.ui.getMobileActions().find(a=>a.id==="map-fl-200")!;assert.ok(hit);
 const lines=h.ui.texts.filter(t=>t.x>=hit.x1&&t.x<hit.x2&&t.y>=hit.y1&&t.y<hit.y2);
 assert.equal(lines.map(t=>t.text).join(""),name);assert.ok(lines.every(t=>t.size===12));
});
