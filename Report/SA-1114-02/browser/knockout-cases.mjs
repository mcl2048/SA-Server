// Actual release server + browser UI + controlled private encounter data.
// No battle state or events are injected into the browser.
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export async function runKnockout(ui,results,{variant}){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));const gm=ui.gm.bind(ui);let last=0;
 ui.gm=async(...args)=>{await pause(Math.max(0,800-(Date.now()-last)));const r=await gm(...args);last=Date.now();return r;};
 results.knockout=[];
 await ui.mode('immersive');await ui.gm('/stat 1000 1000 1000 1000');await ui.gm('/heal');await ui.gm('/warp 300 415 195');
 for(const quick of [false,true]){
  await ui.flag('autoBattle',true);await ui.flag('quick',quick);
  const from=ui.events.length;await ui.gm('/encount',true);
  const until=Date.now()+(variant==='baseline'?45000:120000);
  let events=[],flyEvents=[],badRevives=[],ended=false;
  while(Date.now()<until){
   events=ui.events.slice(from);const flown=new Set();flyEvents=[];badRevives=[];
   for(const turn of events.filter(e=>e.t==='BattleTurn'))for(const e of turn.events){
    if(e.fly>0){flown.add(e.target);flyEvents.push({...e,turn:turn.turn});}
    if((e.kind==='revive'||e.result==='revive')&&flown.has(e.target))badRevives.push({...e,turn:turn.turn});
   }
   ended=events.some(e=>e.t==='BattleEnd');
   if(variant==='baseline'?badRevives.length>0:ended)break;
   await ui.settle(100);
  }
  const state=await ui.page.evaluate(()=>({battle:!!sa.battle,queue:sa.battle?.queue.length??0,
   fighters:sa.battle?[...sa.battle.fighters.values()].map(a=>({slot:a.f.slot,hp:a.hp,dead:a.dead,gone:a.gone,fly:!!a.fly})):[]}));
  const check={mode:quick?'quick':'automatic',flyEvents,badRevives,ended,state,
   turns:events.filter(e=>e.t==='BattleTurn').length,end:events.find(e=>e.t==='BattleEnd')??null};
  results.knockout.push(check);
  assert(flyEvents.length>0,'controlled encounter did not exercise a real fly event');
  if(variant==='baseline'){
   assert(badRevives.length>0,'baseline did not reproduce flight resurrection');
   results.checks.push({case:'baseline real flight/resurrection reproduced',passed:true});
   await ui.snapshot('knockout-before-flight-revived');return ui;
  }
  assert(badRevives.length===0,'server revived a permanently departed slot');
  assert(ended&&check.end.result==='win','automatic battle did not settle a real victory');
  // Normal playback deliberately animates each real event. Five queued turns
  // can legitimately exceed the generic 90s UI timeout under software WebGL.
  await ui.fieldReady(quick ? 90000 : 360000);await ui.settle(350);await ui.closePanels();
  results.checks.push({case:`${check.mode} flown enemies remain departed and battle ends`,passed:true});
  console.log(JSON.stringify({variant,knockout:check.mode,turns:check.turns,fly:flyEvents.length}));
  const normalFrom=ui.events.length;await ui.gm('/encount 90003 1',true);
  const normalUntil=Date.now()+60000;
  while(!ui.events.slice(normalFrom).some(e=>e.t==='BattleEnd')&&Date.now()<normalUntil)await ui.settle(100);
  const normalEvents=ui.events.slice(normalFrom),normalHits=normalEvents.filter(e=>e.t==='BattleTurn').flatMap(e=>e.events);
  assert(normalHits.some(e=>e.dead&&e.hp===0&&!e.fly),'controlled HP0 death without flight was not exercised');
  assert(normalEvents.filter(e=>e.t==='BattleEnd'&&e.result==='win').length===1,'non-flight knockout must settle exactly once');
  await ui.fieldReady();await ui.settle(350);await ui.closePanels();
  results.knockout.push({mode:check.mode,case:'HP0 without flight',hits:normalHits,end:normalEvents.find(e=>e.t==='BattleEnd')});
  results.checks.push({case:`${check.mode} HP0 without flight settles once`,passed:true});

 }
 await ui.flag('quick',false);await ui.flag('autoBattle',false);return ui;
}
