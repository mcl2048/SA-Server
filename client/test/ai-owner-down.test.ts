import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultAi } from '../src/ai.ts';
import { smartChoose, smartChooseSoloPet, AiMemory, type SmartContext, type SmartFighter } from '../src/aismart.ts';
const fighter=(slot:number,hp=500):SmartFighter=>({slot,hp,maxHp:500,mp:0,name:'f'+slot,level:20,status:0,gone:false});
const skill=(slot:number,id:number,func:string,target=1)=>({slot,id,func,target,name:func,memo:'',field:0,option:''});
function context():SmartContext {return {me:0,first:false,fighters:new Map([fighter(0,0),fighter(5),fighter(6),fighter(10)].map(f=>[f.slot,f])),inv:[],myAtk:100,pet:{name:'pet',atk:100,skills:[skill(0,2,'PETSKILL_NormalGuard',0),skill(1,3,'PETSKILL_Guardian'),skill(2,1,'PETSKILL_NormalAttack')]},capturePlace:false,noEscape:false,mem:new AiMemory('owner-down-test')};}
test('dead-owner auto chooses living pets independently including zero MP and low health',()=>{
 const c=context(),s=defaultAi();
 assert.deepEqual(smartChoose(s,c).pet,[2,10]);
 assert.equal(smartChoose(s,c).kind,'skip');
 c.pet={...c.pet!,skills:[skill(7,1,'PETSKILL_NormalAttack'),skill(4,2,'PETSKILL_NormalGuard',0)]};
 assert.deepEqual(smartChooseSoloPet(s,c,6).pet,[7,10]);
 c.fighters.get(6)!.hp=1;
 assert.deepEqual(smartChooseSoloPet(s,c,6).pet,[4,6]);
 c.pet={...c.pet!,skills:[]};
 assert.deepEqual(smartChooseSoloPet(s,c,5).pet,[-1,-1]);
});
test('alive to dead transition, party pets and PvP negative control',()=>{
 const c=context(),s=defaultAi();
 c.fighters.get(0)!.hp=500;c.noEscape=true;
 assert.equal(smartChoose(s,c).kind,'attack');
 c.fighters.get(0)!.hp=0;
 c.fighters.set(1,fighter(1)); // live party member does not seize this owner's pet
 assert.deepEqual(smartChooseSoloPet(s,c,5).pet,[2,10]);
 c.pvp=true;
 assert.deepEqual(smartChooseSoloPet(s,c,5).pet,[-1,-1]);
 assert.equal(smartChoose(s,c).kind,'skip');
});
test('dead or absent pets and defeated enemies do not get offensive commands',()=>{
 const c=context(),s=defaultAi();c.fighters.get(5)!.hp=0;
 assert.deepEqual(smartChooseSoloPet(s,c,5).pet,[-1,-1]);
 c.fighters.get(6)!.gone=true;
 assert.deepEqual(smartChooseSoloPet(s,c,6).pet,[-1,-1]);
 c.fighters.get(5)!.hp=100;c.fighters.get(10)!.hp=0;
 assert.deepEqual(smartChooseSoloPet(s,c,5).pet,[-1,-1]);
});
