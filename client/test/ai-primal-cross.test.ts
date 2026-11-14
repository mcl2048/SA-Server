import assert from "node:assert/strict";
import test from "node:test";
import { defaultAi } from "../src/ai.ts";
import { smartChoose, smartChooseSoloPet, AiMemory, type SmartContext } from "../src/aismart.ts";
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:()=>null,setItem(){}}});
const fighter=(slot:number,hp=1000)=>({slot,hp,maxHp:1000,mp:0,name:`f${slot}`,level:20,status:0,gone:false});
const skill=(slot:number,id:number,func:string,target=1)=>({slot,id,func,target,name:func,memo:"",field:0,option:""});
function context(slots:number[],deadOwner=true):SmartContext{return{me:0,first:false,fighters:new Map([fighter(0,deadOwner?0:1000),fighter(5),...slots.map(s=>fighter(s))].map(f=>[f.slot,f])),inv:[],myAtk:100,pet:{name:"赤爪",atk:100,skills:[skill(0,29060,"PETSKILL_PrimalCross"),skill(1,1,"PETSKILL_NormalAttack"),skill(2,2,"PETSKILL_NormalGuard",0)]},capturePlace:false,noEscape:true,mem:new AiMemory("primal-test")};}

test("surviving pet chooses the most populated actual cross without counting row wraps",()=>{
 const c=context([14,15,16,17]);assert.deepEqual(smartChooseSoloPet(defaultAi(),c,5).pet,[0,16]);
 c.fighters.get(16)!.gone=true;c.fighters.get(17)!.hp=0;
 c.fighters.get(5)!.defenseBoost=40;c.fighters.get(5)!.defenseTurns=3;
 assert.deepEqual(smartChooseSoloPet(defaultAi(),c,5).pet,[1,14],"14 and15 are not neighbors; a single hit favors full normal accuracy");
});
test("living-owner AI scores the shared skill over each independent native neighbor group",()=>{
 const c=context([11,14,15,16,17],false),s=defaultAi();s.then={kind:"guard",name:"",target:"self"};
 assert.deepEqual(smartChoose(s,c).pet,[0,16]);
});
test("surviving pet fixed and automatic cross commands keep all protected level-one neighbors safe",()=>{
 const c=context([15,16,17,19]),s=defaultAi();c.capturePlace=true;s.capture=true;c.fighters.get(17)!.level=1;
 s.petThen={kind:"skill",name:"PETSKILL_PrimalCross",target:"enemy"};
 assert.deepEqual(smartChooseSoloPet(s,c,5).pet,[0,15],"safe center15 hits15,16 without endangering17");
 c.fighters.delete(15);c.fighters.delete(19);
 assert.deepEqual(smartChooseSoloPet(s,c,5).pet,[1,16],"unsafe fixed cross falls back to a safe single hit");
 c.pet!.skills.splice(1,1);assert.deepEqual(smartChooseSoloPet(s,c,5).pet,[2,5]);
});

test("a fixed living-owner cross plan chooses a legal populated center without wrapping or sacrificing capture neighbors",()=>{
 const c=context([11,14,15,16,17],false),s=defaultAi();s.then={kind:"guard",name:"",target:"self"};
 s.petThen={kind:"skill",name:"PETSKILL_PrimalCross",target:"enemy"};
 assert.deepEqual(smartChoose(s,c).pet,[0,16]);
 c.capturePlace=true;s.capture=true;c.fighters.get(17)!.level=1;
 assert.deepEqual(smartChoose(s,c).pet,[2,5],"capture overrides the fixed pet plan");
});

 test("cross defense utility is available once and vanishes when an authoritative buff is already active",()=>{
 const c=context([10]),s=defaultAi();assert.deepEqual(smartChooseSoloPet(s,c,5).pet,[0,10]);
 c.fighters.get(5)!.defenseBoost=45;c.fighters.get(5)!.defenseTurns=3;
 assert.deepEqual(smartChooseSoloPet(s,c,5).pet,[1,10]);
 c.fighters.get(0)!.hp=1000;s.then={kind:"guard",name:"",target:"self"};
 assert.deepEqual(smartChoose(s,c).pet,[1,10]);c.fighters.get(5)!.defenseTurns=0;
 assert.deepEqual(smartChoose(s,c).pet,[0,10]);
 });
