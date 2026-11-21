import assert from 'node:assert/strict';
import {Field,MOVE} from '../../../client/src/field.ts';
const rows=['1120011','1110021'];
async function fixture(){
 const handlers=new Map<string,(m:any)=>void>(),sent:any[]=[];
 const field=new Field({} as any,{on:(t:string,h:any)=>{handlers.set(t,h);return()=>{};},send:(m:any)=>sent.push(m)} as any);
 const enter=(floor:number,x:number,y:number)=>handlers.get('EnterFloor')!({floor,name:'review',width:floor===817?7:3,height:floor===817?2:1,x,y,dir:5,palette:0,mapVer:floor===817?'source':'via',step:260});
 const data=(floor:number)=>handlers.get('MapData')!({floor,x1:0,y1:0,x2:floor===817?7:3,y2:floor===817?2:1,tiles:Array(floor===817?14:3).fill(100),objs:Array(floor===817?14:3).fill(0),walk:floor===817?rows.join(''):'112',ver:floor===817?'source':'via'});
 handlers.get('Self')!({id:1,name:'review',sprite:100000});enter(817,0,0);await new Promise(r=>setImmediate(r));data(817);
 const npc={name:'goal',x:6,y:0},via=[{floor:817,x:2,y:0,toFloor:900,toX:0,toY:0},{floor:900,x:2,y:0,toFloor:817,toX:5,toY:1}];
 handlers.get('NpcList')!({floor:817,npcs:[npc],places:[],transfers:[{x:2,y:0,toX:5,toY:1,via}]});
 field.navigateNpc(817,npc);sent.length=0;return{field,handlers,sent,enter,data};
}
let checks=0;
for(const mode of ['manual-mid','normal-mid','quick-mid','correction-mid','wrong-final-floor','wrong-final-position','locked-final','follower-final','stale-npcs'] as const){
 const {field,handlers,sent,enter,data}=await fixture();let t=performance.now()+1000;
 field.update(t);field.update(t+=300);assert.ok(sent.some(m=>m.t==='Move'&&m.x===1));sent.length=0;
 enter(900,0,0);await new Promise(r=>setImmediate(r));data(900);assert.equal(field.floor,900);
 if(mode==='manual-mid')field.setManualTarget(null);
 if(mode==='normal-mid'){field.beginBattle(false);field.endBattle();}
 if(mode==='quick-mid'){field.beginBattle(true);field.update(t+=300);assert.equal(sent.filter(m=>m.t==='Move').length,0);field.endBattle();}
 if(mode==='correction-mid')handlers.get('PosCorrect')!({x:0,y:0,dir:5});
 if(mode==='stale-npcs'){handlers.get('NpcList')!({floor:817,npcs:[{name:'stale',x:0,y:0}],places:[],transfers:[]});assert.equal((field as any).npcLists.has(817),false);}
 if(['manual-mid','normal-mid','correction-mid'].includes(mode)){
  for(let i=0;i<10;i++)field.update(t+=300);assert.equal(sent.filter(m=>m.t==='Move').length,0);assert.equal(field.target,null);checks++;field.dispose();continue;
 }
 let returnSent=false;for(let i=0;i<10;i++){field.update(t+=300);if(sent.splice(0).some(m=>m.t==='Move'&&m.x+MOVE[m.dir][0]===2)){returnSent=true;break;}}
 assert.ok(returnSent,mode);
 if(mode==='locked-final'||mode==='follower-final')field[mode==='locked-final'?'locked':'follower']=true;
 enter(mode==='wrong-final-floor'?901:817,mode==='wrong-final-position'?6:5,1);
 await new Promise(r=>setImmediate(r));if(field.floor===817)data(817);
 field.locked=false;field.follower=false;sent.length=0;
 for(let i=0;i<12;i++)field.update(t+=300);
 if(['quick-mid','stale-npcs'].includes(mode)){assert.deepEqual([field.self!.x,field.self!.y],[6,0]);assert.match(field.navigationStatus,/到达/);}
 else{assert.equal(field.target,null);assert.equal(sent.filter(m=>m.t==='Move').length,0);}
 checks++;field.dispose();
}
console.log(JSON.stringify({scenarios:checks,result:'PASS',modes:['manual-mid','normal-mid','quick-mid','correction-mid','wrong-final-floor','wrong-final-position','locked-final','follower-final','stale-npcs']}));
