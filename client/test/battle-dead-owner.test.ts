import assert from 'node:assert/strict';
import test from 'node:test';
import {BattleScreen} from '../src/battle.ts';
import {defaultAi} from '../src/ai.ts';

function setup(auto:boolean,quick:boolean,pvp=false){
 const sent:any[]=[];const commands:any[]=[];
 const skill=(slot:number)=>({slot,id:1,name:'Attack',func:'PETSKILL_NormalAttack',field:1,target:1});
 const pets={pets:[{slot:0,name:'One',skills:[skill(1)]},{slot:1,name:'Two',skills:[skill(4)]}],battle:0};
 const host:any={root:'',quick:()=>quick,auto:()=>auto,serverAuto:()=>false,pets:()=>pets,place:()=>[300,1,1],aiSettings:()=>defaultAi(),inventory:()=>({items:[]}),myAtk:()=>10,aiMemory:()=>({}),sendPet:(...args:any[])=>sent.push(args),send:(...args:any[])=>commands.push(args)};
 const fighter=(slot:number,hp:number,ownerSlot=-1,bagSlot=-1)=>({slot,hp,maxHp:100,mp:20,level:10,sprite:100001,name:'test',ownerSlot,bagSlot});
 const screen:any=new BattleScreen(host,{mySlot:0,pvp,turn:0,resume:true,fighters:[fighter(0,0),fighter(1,100),fighter(5,100,0,0),fighter(7,100,0,1),fighter(15,100)]} as any);
 return {screen,sent,commands};
}
test('dead PvE owner emits no character action and live pets choose their own distinct skill slots',()=>{
 for(const [auto,quick]of [[true,false],[false,true]]){
  const {screen,sent,commands}=setup(auto,quick);screen.openMenu(100);
  assert.deepEqual(commands,[]);assert.deepEqual(sent,[[1,15,5],[4,15,7]]);
  screen.sendAllPets(-1,-1);assert.equal(sent.length,2,'no duplicate submission');
 }
});
test('manual and PvP dead owners preserve fallback pet commands',()=>{
 for(const [auto,quick,pvp]of [[false,false,false],[true,false,true],[false,true,true]]){
  const {screen,sent}=setup(auto,quick,pvp);screen.openMenu(100);assert.deepEqual(sent,[[-1,-1,5],[-1,-1,7]]);
 }
});

test('dead owner advances every pet from first-turn policy to subsequent-turn policy',()=>{
 for(const [auto,quick]of [[true,false],[false,true]]){
  const {screen,sent}=setup(auto,quick);
  const settings=defaultAi();settings.petFirst={kind:'attack',target:'enemy'};settings.petThen={kind:'skill',name:'Next',target:'enemy'};
  screen.host.aiSettings=()=>settings;
  for(const p of screen.host.pets().pets)p.skills.push({slot:8,id:9,name:'Next',func:'PETSKILL_NormalAttack',field:1,target:1});
  screen.aiFirst=true;screen.openMenu(100);
  assert.deepEqual(sent,[[1,15,5],[4,15,7]]);assert.equal(screen.aiFirst,false);
  screen.petSentSlots.clear();screen.openMenu(1000);
  assert.deepEqual(sent.slice(2),[[8,15,5],[8,15,7]]);
 }
});
