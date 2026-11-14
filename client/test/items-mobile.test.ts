import test from "node:test";
import assert from "node:assert/strict";
import type { InvItem } from "../src/proto.gen.ts";

const events=new EventTarget();
Object.assign(globalThis,{window:events,document:Object.assign(new EventTarget(),{
 documentElement:{classList:{toggle(){}}},querySelector:()=>null,getElementById:()=>null,
 createElement:()=>({getContext:()=>({measureText:(s:string)=>({width:s.length*7})})})}),
 matchMedia:()=>({matches:false,addEventListener(){}}),location:{search:""},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:()=>1,
 addEventListener:events.addEventListener.bind(events)});
const {ItemWindow}=await import("../src/items.ts");
const {setDeviceMode,setMobileDisplayMode}=await import("../src/mobile-view.ts");
const item=(overrides:Partial<InvItem>={}):InvItem=>({slot:9,id:0,name:"测试",image:23013,memo:"恢复耐久",pile:1,type:16,equip:-1,usable:true,field:0,target:1,level:0,magicMemo:"",jigsaw:"",...overrides} as InvItem);
function setup(items:InvItem[]){
 let clicked="";const cards:any[]=[],hits:string[]=[],calls:any[]=[];
 const ui:any={mouse:{x:-1,y:-1,rightClicked:false,clicked:false,down:false},assets:{anim:()=>null},
  hitBox(_x1:number,_y1:number,_x2:number,_y2:number,id:string){hits.push(id);return id===clicked;},
  button:()=>false,clicked:(id:string)=>id===clicked,hovered:()=>false,overUi:()=>true,
  image(_i:number,_x:number,_y:number,id:string){return id===clicked;},text(_x:number,_y:number,_s:string,_c:string,id:string){return id===clicked;},box(){},mobileInfo(){},mobileCard(c:any){cards.push(c);}};
 const host:any={ui,level:()=>100,trans:()=>0,mp:()=>100,name:()=>"人物",pets:()=>[{slot:0,name:"宠物"}],partyMembers:()=>[],petList:()=>[],ridePet:()=>-1,
  move:(...args:any[])=>calls.push(["move",...args]),use:(...args:any[])=>calls.push(["use",...args]),notice:(text:string)=>calls.push(["notice",text])};
 const wnd=new ItemWindow(host);wnd.open=true;wnd.inv={t:"Inventory",gold:0,items};
 return {wnd,cards,hits,calls,frame(id=""){clicked=id;cards.length=hits.length=0;wnd.frame([]);clicked="";}};
}

test("fullscreen inventory exposes explicit equipment/use actions, images and authoritative categories",()=>{
 setDeviceMode("mobile");setMobileDisplayMode("immersive");
 const h=setup([item({equip:0,type:10,usable:false}),item({slot:10}),item({slot:11,usable:false}),item({slot:12,field:1})]);h.frame();
 assert.deepEqual(h.cards.find(c=>c.id==="inv-9").primaryAction,{id:"inv-act-9",label:"装备"});
 assert.deepEqual(h.cards.find(c=>c.id==="inv-10").primaryAction,{id:"inv-act-10",label:"使用"});
 assert.equal(h.cards.find(c=>c.id==="inv-9").image,23013);
 assert.equal(h.cards.find(c=>c.id==="inv-9").category,"人物装备");
 assert.equal(h.cards.find(c=>c.id==="inv-10").category,"可用道具");
 assert.equal(h.cards.find(c=>c.id==="inv-11").primaryAction,undefined);
 assert.equal(h.cards.find(c=>c.id==="inv-12").primaryAction,undefined);
 h.frame("inv-act-9");assert.deepEqual(h.calls,[["move",9,-1]]);
 h.frame("inv-act-10");assert.equal(h.calls.length,1,"targeted item must open native target selection");
 h.frame("select-0");assert.deepEqual(h.calls.at(-1),["use",10,0]);
});

test("primary actions revalidate live item availability, preserve self use and explicit unequip",()=>{
 setDeviceMode("mobile");setMobileDisplayMode("immersive");
 const h=setup([item({slot:0,equip:0,usable:false}),item({target:0})]);
 h.frame("inv-act-0");assert.deepEqual(h.calls,[["move",0,-1]]);
 assert.equal(h.cards.find(c=>c.id==="inv-0").primaryAction.label,"卸下");
 h.frame("inv-act-9");assert.deepEqual(h.calls.at(-1),["use",9,0]);
 h.wnd.inv.items=[];h.frame("inv-act-9");assert.equal(h.calls.length,2,"removed slot cannot use its previous contents");
 assert.equal(h.hits.includes("inv-act-9"),false);
});

test("classic and desktop retain their existing pickup and double-click behavior",()=>{
 for(const mode of ["desktop","mobile"] as const){
  setDeviceMode(mode);setMobileDisplayMode("classic");const h=setup([item({target:0})]);h.frame("inv-9");
  assert.deepEqual(h.calls,[]);assert.equal(h.hits.some(id=>id.startsWith("inv-act-")),false);
  h.frame("inv-9");assert.deepEqual(h.calls,[["use",9,0]]);
 }
});

test("explicit fullscreen actions and slot pickup both remain reachable in the actual native hit stack", async()=>{
 const {Ui,Mouse}=await import("../src/ui.ts");
 setDeviceMode("mobile");setMobileDisplayMode("immersive");
 const mouse=new Mouse(),ui=new Ui({tile:(id:number)=>id,image:()=>({page:0,set:0,x:0,y:0,w:16,h:16,ox:-8,oy:-8}),page:()=>null,anim:()=>null} as any,mouse);
 const h=setup([item({equip:0,usable:false}),item({slot:10,target:0})]);
 (h.wnd as any).host.ui=ui;
 const draw=()=>{ui.begin();h.wnd.frame([]);ui.end();};draw();
 const reachable=ui.getMobileActions();
 for(const id of ['inv-9','inv-act-9','inv-10','inv-act-10'])assert.ok(reachable.some(hit=>hit.id===id),`${id} must survive overlapping native layers`);
 const equip=reachable.find(hit=>hit.id==='inv-act-9')!;
 mouse.x=(equip.x1+equip.x2)/2;mouse.y=(equip.y1+equip.y2)/2;draw();mouse.clicked=true;draw();
 assert.deepEqual(h.calls,[["move",9,-1]],"native semantic click must dispatch once without also picking up");
});
