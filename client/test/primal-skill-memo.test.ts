import assert from "node:assert/strict";
import test from "node:test";
import { PetWindow } from "../src/pets.ts";
import { BattleScreen } from "../src/battle.ts";
import { fillDefaults } from "../src/proto.gen.ts";
Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:()=>({getContext:()=>({measureText:(s:string)=>({width:s.length*14})})})}});
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:()=>null,setItem(){}}});
function fixture(){
 let click="";const texts:any[]=[],nativeActions:string[]=[];
 const memo="甲".repeat(12)+"乙".repeat(12)+"丙".repeat(12)+"丁".repeat(12)+"戊".repeat(12)+"己".repeat(12);
 const p:any={slot:0,name:"萨鲁法斯",freeName:"",maxSkill:3,skills:[{slot:2,id:29060,name:"赤爪裂阵",func:"PETSKILL_PrimalCross",memo,field:1,target:1}]};
 const ui:any={texts:[],mouse:{},image:()=>false,button:()=>false,hitBox:()=>false,box(){},hovered:(id:string)=>id==="pet-skill2"||id==="pw-2",clicked:(id:string)=>id===click,
  text:(x:number,y:number,text:string,_color:string,id?:string)=>{texts.push({x,y,text,id});if(id)nativeActions.push(id);return id===click;}};
 const host:any={ui,pets:()=>({pets:[p],battle:0}),quick:()=>false,root:"",aiMemory:()=>({}),assets:{anim:()=>null}};
 return{ui,p,host,texts,nativeActions,click:(v:string)=>click=v};
}
test("long claw skill description stays above return controls and every later line is reachable through native pagination",()=>{
 const h=fixture(),wnd:any=new PetWindow(h.host);wnd.skillPage([]);
 assert.ok(h.texts.filter(t=>t.y>=256).every(t=>t.y<=328),"description must not draw over return buttons or below the window");
 assert.deepEqual(h.texts.filter(t=>[256,276,296].includes(t.y)).map(t=>t.text),["甲".repeat(12),"乙".repeat(12),"丙".repeat(12)]);
 assert.ok(h.nativeActions.includes("pet-memo-next"),"touch and keyboard need a native next-page action");
 h.click("pet-memo-next");wnd.skillPage([]);h.click("");h.texts.length=0;wnd.skillPage([]);
 assert.deepEqual(h.texts.filter(t=>[256,276,296].includes(t.y)).map(t=>t.text),["丁".repeat(12),"戊".repeat(12),"己".repeat(12)]);
 h.click("pet-memo-prev");wnd.skillPage([]);h.click("");h.texts.length=0;wnd.skillPage([]);
 assert.equal(h.texts.find(t=>t.y===256)?.text,"甲".repeat(12));
});
test("battle claw memo uses the same bounded native pages without selecting or submitting a skill",()=>{
 const h=fixture(),b:any=new BattleScreen(h.host,fillDefaults({t:"BattleStart",mySlot:0,resume:true,fighters:[]} as any));b.petWindow(h.p);
 assert.ok(h.texts.filter(t=>t.y>=353).every(t=>t.y<=425));assert.ok(h.nativeActions.includes("pw-memo-next"));
 h.click("pw-memo-next");b.petWindow(h.p);h.click("");h.texts.length=0;b.petWindow(h.p);
 assert.equal(h.texts.find(t=>t.y===353)?.text,"丁".repeat(12));assert.equal(b.petSelecting,false);
});
