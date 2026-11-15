// Native UI / GM requests only. Page callbacks inspect state without assigning it.
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export async function run(ui,results,{variant,out}) {
 const browser=ui.page.context().browser(),GameUI=ui.constructor;
 results.automation=[];await ui.page.context().close();
 for(const mobile of [false,true]) {
  const device=mobile?'mobile':'desktop',context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  ui=new GameUI(await context.newPage(),mobile);await ui.enter();if(mobile)await ui.mode('immersive');
  const page=ui.page,wire=[],policies=[],cdp=await context.newCDPSession(page);
  cdp.on('Network.webSocketFrameReceived',({response})=>{let m;try{m=JSON.parse(response.payloadData);}catch{return;}
   if(m.t==='BattleStart')wire.push({t:m.t,mySlot:m.mySlot??0,fighters:(m.fighters??[]).map(f=>Object.fromEntries(['slot','hp','maxHp','mp','maxMp','ownerSlot'].map(k=>[k,f[k]??0])))});
   if(m.t==='BattleTurn')wire.push({t:m.t,events:(m.events??[]).map(e=>Object.fromEntries(['actor','kind','target','result','skill','damage','mpDamage','hp','actorHp','actorMp','coattack','ok'].map(k=>[k,e[k]??(['kind','result','skill'].includes(k)?'':0)])))});
   if(m.t==='BattleEnd')wire.push({t:m.t,result:m.result});
  });
  cdp.on('Network.webSocketFrameSent',({response})=>{let m;try{m=JSON.parse(response.payloadData);}catch{return;}if(m.t==='AutoPlay') {let s;try{s=JSON.parse(m.settings);}catch{return;}policies.push({autoBattle:!!m.autoBattle,quick:!!m.quick,paused:!!m.paused,autoEscape:s.autoEscape,autoDrop:s.autoDrop,dropKeywords:s.dropKeywords,healAt:s.healAt});}});
  await cdp.send('Network.enable');
  const state=()=>page.evaluate(()=>{const m=sa.screen.menus,s=m.host.status;return {status:Object.fromEntries(['hp','maxHp','mp','maxMp'].map(k=>[k,s[k]??0])),policy:JSON.parse(localStorage.getItem(`sa.ai.${s.name}`)??'null'),items:m.items.inv.items.map(i=>({id:i.id,slot:i.slot,name:i.name,pile:i.pile||1,equip:i.equip,magic:i.magic})),pets:m.pets.pets.map(p=>({slot:p.slot,agi:p.agi,skills:p.skills})),held:m.items.held};});
  const wait=async(fn,message,timeout=30000)=>{const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await ui.settle(60);}throw Error(device+': '+message);};
  const record=(name,evidence)=>{results.checks.push({case:device+' '+name,passed:true,evidence});results.automation.push({device,name,evidence});console.log(device+' '+name);writeFileSync(resolve(out,variant+'-automation-progress.json'),JSON.stringify(results.automation,null,2));};
  const menu=async name=>{await ui.closePanels();if(mobile)await ui.toolbar(name);else await ui.action({system:'tb-system',items:'tb-item',pets:'tb-pet'}[name]);};
  const ai=async()=>{await menu('system');await ui.action('sys-ai');await ui.action('ai-tab-基本');};
  const flag=async(name,on)=>{if(!!ui.latest.AutoPlayState?.[name]===on)return;await ai();await ui.action({quick:'ai-quick-val',autoBattle:'ai-auto-val',encounter:'ai-enc-val'}[name]);await ui.action('ai-close');await wait(()=>!!ui.latest.AutoPlayState?.[name]===on,'missing '+name+' acknowledgement');};
  const toggle=async(name,id,on)=>{await ai();if(!!(await state()).policy?.[name]!==on)await ui.action(id);await ui.action('ai-close');await wait(()=>policies.some(p=>p[name]===on),'missing '+name+' policy');};
  let lastGm=0;const gm=async(text,battle=false)=>{await ui.closePanels();await ui.settle(Math.max(0,800-(Date.now()-lastGm)));await ui.gm(text,battle);lastGm=Date.now();};
  const encounter=async(name,quick,validate)=>{
   await flag('autoBattle',true);await flag('quick',quick);await ui.closePanels();const from=wire.length;
   await gm('/encount 90004 1',true);await wait(()=>wire.slice(from).some(m=>m.t==='BattleEnd'),name+' did not finish',120000);
   const battle=wire.slice(from),start=battle.find(m=>m.t==='BattleStart'),end=battle.find(m=>m.t==='BattleEnd');
   assert(start&&end,'missing battle messages');const own=battle.filter(m=>m.t==='BattleTurn').flatMap(m=>m.events).filter(e=>e.actor===start.mySlot&&e.kind!=='none');
   validate({start,end,own});await ui.fieldReady(quick?90000:240000);await ui.closePanels();record((quick?'quick ':'auto ')+name,{start,end,own});
   await flag('quick',false);await flag('autoBattle',false);
  };
  try {
   for(const key of ['quick','autoBattle','encounter'])await flag(key,false);
   for(const p of [...ui.latest.Pets.pets])await gm('/petdel '+p.slot);
   await gm('/lv 100');await gm('/stat 100 500 100 100');await gm('/clearbag 确定');await gm('/heal');
   // Unequip via the original inventory's live item actions, never test hooks.
   for(let i=0;i<9;i++) {
    const current=await state(),equipped=current.items.find(it=>it.slot<9);if(!equipped)break;
    await gm('/clearbag 确定');await menu('items');
    const id=`inv-act-${equipped.slot}`;
    if((await ui.actions()).some(h=>h.id===id))await ui.action(id);
    else {await ui.action(`inv-${equipped.slot}`);await wait(async()=>(await state()).held===equipped.slot,'equipment pickup failed');await ui.action('inv-9');}
    await wait(async()=>!(await state()).items.some(it=>it.slot===equipped.slot),'equipment was not removed');await ui.closePanels();
   }
   await gm('/clearbag 确定');
   await ai();const initial=await state();assert(!initial.policy?.autoEscape&&!initial.policy?.autoDrop,'new switches must default off');assert(!await page.getByLabel('自动丢弃关键字',{exact:true}).count(),'disabled input visible');
   await ui.action('ai-auto-escape-val');await wait(async()=>(await state()).policy.autoEscape,'auto escape not persisted');await ui.action('ai-auto-escape-val');
   await ui.action('ai-drop-val');const input=page.getByLabel('自动丢弃关键字',{exact:true});await input.fill('石龟 | 蕨');await page.screenshot({path:resolve(out,`${variant}-settings-${device}.png`)});
   assert((await state()).policy.dropKeywords==='石龟 | 蕨','keywords not persisted');await ui.action('ai-drop-val');await wait(async()=>!await input.count(),'input not removed after disable');await ui.action('ai-esc-val');await wait(async()=>!(await state()).policy.escape,'recovery fixture must disable danger escape explicitly');await ui.action('ai-close');record('settings defaults, native input, persistence and hide',{policy:(await state()).policy});
   await gm('/item 1234 1');await gm('/item 1500 1');const items=(await state()).items;const meat=items.find(i=>i.id===1234),medicine=items.find(i=>i.id===1500);assert(meat&&medicine,'fixture native items absent');
   await ai();await ui.action('ai-drop-val');await page.getByLabel('自动丢弃关键字',{exact:true}).fill(' | '+meat.name+' | 蕨 | ');await ui.settle(1500);assert((await state()).items.some(i=>i.id===1234),'discard ran while keyword editing was paused');await ui.action('ai-close');
   await wait(async()=>!(await state()).items.some(i=>i.id===1234),'daily matched item was not dropped');assert((await state()).items.some(i=>i.id===1500),'unmatched medicine was dropped');
   record('daily literal keyword discard without confirmation',{keywords:' | '+meat.name+' | 蕨 | ',remaining:(await state()).items});
   await toggle('autoDrop','ai-drop-val',false);await gm('/item 1234 1');await ui.settle(1500);assert((await state()).items.some(i=>i.id===1234),'disabled discard removed item');record('disabled discard retains matching item',{});
   for(const quick of [false,true]){
    await gm('/clearbag 确定');await gm('/item 1500 1');await gm('/item 1234 1');await gm('/heal');await gm('/hp 1');
    await encounter('meat before medicine',quick,({own,end})=>{assert(end.result==='win','expected recovery battle win');assert(own[0]?.kind==='item'&&own[0]?.skill===meat.name,'meat did not precede medicine');});
    await gm('/clearbag 确定');await gm('/item 1510 1');await gm('/heal');await gm('/mp 0');
    await encounter('MP threshold without healing equipment',quick,({own})=>{assert(own[0]?.kind==='item'&&own[0]?.mpDamage>0,'MP threshold did not trigger medicine');});
    await gm('/heal');await toggle('autoEscape','ai-auto-escape-val',true);
    await encounter('automatic escape',quick,({own,end})=>{assert(own[0]?.kind==='escape','escape was not the default action');assert(own.filter(e=>e.kind==='escape').length<=3,'too many escape attempts');assert(end.result==='escape'||own.filter(e=>e.kind==='escape'&&!e.ok).length===3,'no escaped or fallback result');});
    await toggle('autoEscape','ai-auto-escape-val',false);
   }
   // Player and native NormalAttack pet target the same guard. Initiative
   // remains real and the 50% grouping probability is observed, never forced.
   await gm('/pet 9 20');const pet=(await state()).pets[0];assert(pet,'native pet missing');
   await gm(`/petai ${pet.slot} 10000`);await gm(`/petskill ${pet.slot} 1 1`);await gm(`/stat 100 10 100 ${Math.max(1,pet.agi)}`);await gm('/heal');
   // Field menus are replaced by BattleScreen during combat. Cache the native
   // skill slot while the field owns the pet panel, then use battle hit targets.
   const attack=(await state()).pets.find(p=>p.slot===pet.slot)?.skills.find(s=>s.id===1);assert(attack,'native normal attack skill missing');
   await menu('pets');for(let i=0;i<3&&ui.latest.Pets.pets.find(p=>p.slot===pet.slot).state!=='battle';i++)await ui.action(`pet-st${pet.slot}`);
   await gm('/encount 90005 1',true);let observed=false,parallel=false,groupEvidence=null;
   for(let attempt=0;attempt<16&&!observed;attempt++) {
    await ui.waitMenu();const from=wire.length;if(!(await ui.actions()).some(h=>/^t-\d+$/.test(h.id)))await ui.action('b-attack');const target=await wait(async()=>(await ui.actions()).find(h=>/^t-\d+$/.test(h.id)&&Number(h.id.slice(2))>=10),'native attack target missing');assert(target,'native attack target missing');await ui.action(target.id);
    // The original command memory can already select the pet's attack and
    // expose pt-* directly, just as it does for the player's remembered attack.
    let actions=await wait(async()=>{const h=await ui.actions();return h.some(a=>/^pt-\d+$/.test(a.id)||a.id.startsWith('pw-')||a.id==='pb-waza')&&h;},'native pet controls missing');
    if(!actions.some(h=>/^pt-\d+$/.test(h.id))){
     if(!actions.some(h=>h.id.startsWith('pw-')))await ui.action('pb-waza');
     await ui.action(`pw-${attack.slot}`);
    }
    const targetPet=await wait(async()=>(await ui.actions()).find(h=>h.id==='pt-'+target.id.slice(2)),'native pet target missing');
    let finished=false;const sample=(async()=>{const deadline=Date.now()+60000;while(!finished&&Date.now()<deadline){
     const v=await page.evaluate(()=>{const b=sa.battle;if(!b)return null;const actors=[...b.fighters.values()].filter(a=>(a.f.slot<10)===(b.me<10)&&(a.f.slot===b.me||a.f.ownerSlot===b.me&&a.f.slot%10>=5));return {queue:b.queue.length,sent:b.sent,actors:actors.map(a=>({x:a.x,y:a.y,homeX:a.homeX,homeY:a.homeY,action:a.action}))};});
     if(v?.actors.length===2&&v.actors.every(a=>Math.hypot(a.x-a.homeX,a.y-a.homeY)>5))parallel=true;
     if(wire.slice(from).some(m=>m.t==='BattleTurn')&&v&&!v.queue&&!v.sent)break;await ui.settle(30);
    }})();
    try{await ui.action(targetPet.id,0);await sample;}finally{finished=true;await sample;}
    const events=wire.slice(from).filter(m=>m.t==='BattleTurn').flatMap(m=>m.events),joint=events.filter(e=>e.coattack>0);
    if(joint.length>=2){observed=true;groupEvidence=joint;await page.screenshot({path:resolve(out,`${variant}-coattack-${device}.png`)});}
   }
   assert(observed&&parallel,'real ordinary attacks never grouped or approached together');record('native player and pet coattack with simultaneous approach',{events:groupEvidence,parallel});
   for(let attempt=0;attempt<8&&(await ui.phase()).battle;attempt++) {
    await ui.waitMenu();const from=wire.length;await ui.action('b-escape');
    await wait(()=>wire.slice(from).some(m=>m.t==='BattleTurn'),'manual escape response missing');
    await wait(async()=>!(await ui.phase()).battle||await page.evaluate(()=>sa.battle.queue.length===0&&!sa.battle.sent),'escape playback stuck',90000);
   }
   await ui.fieldReady();await ui.closePanels();
   assert(!ui.errors.length,'browser errors');
  } finally {await cdp.detach();}
  if(!mobile)await context.close();
 }
 return ui;
}
