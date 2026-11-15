// Business changes are native UI/GM actions. Page evaluation only inspects
// state. Frozen/closed-browser progress is measured from the real SQLite save.
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export async function run(ui,results,{variant,out,snapshot}) {
 const browser=ui.page.context().browser(),GameUI=ui.constructor;
 await ui.page.context().close();
 const record=(device,name,evidence)=>{
  results.checks.push({device,name,passed:true,evidence});
  writeFileSync(resolve(out,`${variant}-automation-progress.json`),JSON.stringify(results.checks,null,2)+'\n');
  console.log(`${device}: ${name}`);
 };
 for(const mobile of [false,true]) {
  const device=mobile?'mobile':'desktop';
  const options={viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1};
  let context=await browser.newContext(options);
  ui=new GameUI(await context.newPage(),mobile);await ui.enter();if(mobile)await ui.mode('immersive');
  let lastGM=0;
  const gm=async(text,battle=false)=>{await ui.closePanels();await ui.settle(Math.max(0,850-(Date.now()-lastGM)));await ui.gm(text,battle);lastGM=Date.now();};
  const wait=async(fn,message,timeout=60000)=>{const until=Date.now()+timeout;while(Date.now()<until){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,100));}throw Error(`${device}: ${message}`);};
  const state=()=>ui.page.evaluate(()=>{
   const m=sa.screen.menus,s=m.host.status;
   return {status:{hp:s.hp,maxHp:s.maxHp,mp:s.mp,maxMp:s.maxMp,gold:m.items.inv.gold},
    policy:JSON.parse(localStorage.getItem(`sa.ai.${s.name}`)??'null'),
    items:m.items.inv.items.map(i=>({id:i.id,slot:i.slot,pile:i.pile||1,name:i.name})),
    pets:m.pets.pets.map(p=>({slot:p.slot,state:p.state,hp:p.hp}))};
  });
  const ai=async()=>{await ui.closePanels();await ui.toolbar('system');await ui.action('sys-ai');await ui.action('ai-tab-基本');};
  const policy=async(name,id,wanted)=>{await ai();if(!!(await state()).policy?.[name]!==wanted)await ui.action(id);await ui.action('ai-close');};
  for(const flag of ['encounter','quick','autoBattle'])await ui.flag(flag,false);
  await policy('autoEscape','ai-auto-escape-val',false);
  await policy('autoDrop','ai-drop-val',false);
  await gm('/lv 30');await gm('/stat 80 500 100 100');await gm('/heal');await gm('/clearbag 确定');
  for(const pet of [...ui.latest.Pets.pets])await gm(`/petdel ${pet.slot}`);
  for(let i=0;i<5;i++)await gm('/pet 9 20');
  await ui.toolbar('pets');
  for(let slot=0;slot<5;slot++){
   const wanted=slot===0?'battle':'standby';
   for(let i=0;i<3&&ui.latest.Pets.pets.find(p=>p.slot===slot)?.state!==wanted;i++){
    const before=ui.latest.Pets.pets.find(p=>p.slot===slot)?.state;
    await ui.settle(350);
    await ui.action(`pet-st${slot}`);
    await wait(()=>ui.latest.Pets.pets.find(p=>p.slot===slot)?.state!==before,`pet ${slot} state acknowledgement missing`,15000);
   }
   assert(ui.latest.Pets.pets.find(p=>p.slot===slot)?.state===wanted,`native pet ${slot} was not selected`);
  }
  await ui.closePanels();
  record(device,'five pets selected through native controls',{pets:ui.latest.Pets.pets.map(p=>({slot:p.slot,state:p.state}))});
  for(const quick of [false,true]) {
   await ui.flag('autoBattle',true);await ui.flag('quick',quick);await ui.closePanels();
   const from=ui.events.length;await gm('/encount 90004 1',true);
   await wait(()=>ui.events.slice(from).find(e=>e.t==='BattleEnd'),'automated battle did not finish',120000);
   const wire=ui.events.slice(from),start=wire.find(e=>e.t==='BattleStart'),end=wire.find(e=>e.t==='BattleEnd');
   assert(start?.fighters.filter(f=>f.ownerSlot===start.mySlot&&Math.floor(f.slot/10)===Math.floor(start.mySlot/10)&&f.slot%10>=5).length===5,'actual battle did not deploy five pets');
   assert(end.result==='win','automatic battle did not win');await ui.fieldReady(240000);
   await ui.snapshot(`${quick?'quick':'auto'}-${device}`);
   record(device,`${quick?'quick':'normal'} automatic five-pet battle`,{start,end,turns:wire.filter(e=>e.t==='BattleTurn').length});
   await ui.flag('quick',false);await ui.flag('autoBattle',false);
  }
  // Pick an actual loaded plain pair in the controlled native encounter area.
  // GM warp itself accepts walls; that must not masquerade as a farm failure.
  await gm('/warp 300 379 186');
  const farm=await wait(()=>ui.page.evaluate(()=>{const f=sa.field;for(let y=180;y<=190;y++)for(let x=374;x<=384;x++){const k=y*f.width+x;if(f.walk[k]===2&&f.walk[k+1]===2&&!Array.from(f.actors.values()).some(a=>a.kind==='npc'&&a.y===y&&(a.x===x||a.x===x+1)))return{x,y};}return null;}),'no loaded safe native farm pair');
  const warpFarm=()=>gm(`/warp 300 ${farm.x} ${farm.y}`);
  // Resource IDs are native medicines/meat. The field supplies exercise the
  // real effect, inventory consumption, UI pause lease and save path together.
  await warpFarm();await gm('/heal');await gm('/clearbag 确定');
  await gm('/item 1234 1');await gm('/item 1500 1');await gm('/hp 1');
  await ui.flag('quick',true);
  await ai();
  const before=await state();assert(before.items.some(i=>i.id===1234),'native meat missing');
  await ui.action('ai-enc-val');
  await wait(()=>ui.latest.AutoPlayState?.encounter===true,'encounter switch was not acknowledged');
  await ui.settle(1300);
  const editing=await state();assert(editing.status.hp===1&&editing.items.some(i=>i.id===1234),'preparation ignored foreground pause');
  await ui.action('ai-close');
  await wait(async()=>{const s=await state();return s.status.hp>1&&!s.items.some(i=>i.id===1234);},'field meat was not used before the HP safety stop');
  const prepared=await state();assert(prepared.items.some(i=>i.id===1500),'preparation did not prioritize meat');
  await ui.flag('encounter',false);await ui.flag('quick',false);
  record(device,'paused editing then native meat preparation',{before,editing,prepared});
  await gm('/heal');await gm('/clearbag 确定');await warpFarm();
  // Ensure ordinary encounters are enabled, via the GM command's real reply.
  await gm('/noenc');if(ui.lastChat.includes('不会遇敌'))await gm('/noenc');
  assert(ui.lastChat.includes('恢复遇敌'),'native encounter enable acknowledgement missing');
  await ui.flag('quick',true);await ui.flag('encounter',true);await ui.closePanels();
  const base=snapshot();
  const progressed=(s,b)=>s.gold>b.gold||s.level>b.level||s.level===b.level&&s.exp>b.exp;
  const cdp=await context.newCDPSession(ui.page);
  await cdp.send('Page.setWebLifecycleState',{state:'frozen'});
  let frozen;
  try {frozen=await wait(()=>{const s=snapshot();return progressed(s,base)&&s;},'no frozen-page reward observed before deadline',90000);}
  finally {await cdp.send('Page.setWebLifecycleState',{state:'active'});}
  record(device,'server rewards progress while Chromium page is frozen',{before:{gold:base.gold,exp:base.exp},after:{gold:frozen.gold,exp:frozen.exp}});
  // There are now no browser pages for this actor. Two separate persisted
  // increases prove continued encounter/battle cycles, rather than one queued win.
  await context.close();
  const detached=snapshot();
  let first;
  try {first=await wait(()=>{const s=snapshot();return progressed(s,detached)&&s;},'no first offline reward observed before deadline',90000);}
  catch(error){
   context=await browser.newContext(options);ui=new GameUI(await context.newPage(),mobile);await ui.enter();
   results.offline_failure_diagnostic={device,latest:ui.latest.AutoPlayState,state:await state(),saved:snapshot()};
   throw error;
  }
  const second=await wait(()=>{const s=snapshot();return progressed(s,first)&&s;},'no repeated offline reward observed before deadline',90000);
  record(device,'two repeated offline reward settlements with every page closed',{before:{gold:detached.gold,exp:detached.exp},first:{gold:first.gold,exp:first.exp},second:{gold:second.gold,exp:second.exp}});
  context=await browser.newContext(options);ui=new GameUI(await context.newPage(),mobile);await ui.enter();if(mobile)await ui.mode('immersive');
  for(const flag of ['encounter','quick','autoBattle'])await ui.flag(flag,false);
  await ui.closePanels();
  const restored=await state(),stored=snapshot();
  assert(restored.pets.length===5,'reattach lost the five carried pets');
  assert(stored.gold>=second.gold&&(stored.level>second.level||stored.level===second.level&&stored.exp>=second.exp),'reattach lost offline rewards');
  await ui.snapshot(`offline-restored-${device}`);
  record(device,'native login takes over current actor and restores rewards/pets',{stored:{gold:stored.gold,exp:stored.exp},pets:restored.pets,position:await ui.position()});
  if(!mobile)await context.close();
 }
 return ui;
}
