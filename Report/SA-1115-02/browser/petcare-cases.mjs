// Real UI actions against an owned release ELF. No wire/event injection.
import {resolve} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const expTable=readFileSync(new URL('../../../gamedata/battle/exp.txt',import.meta.url),'utf8').trim().split(/\r?\n/).map(l=>l.trim().split(/\s+/)).filter(f=>f.length>=2).map(f=>Number(f[1]));
const total=p=>expTable.slice(1,p.lv).reduce((a,b)=>a+b,0)+p.exp;
const trainingName='培养对象一二三四';
export async function run(ui,results,{variant,out,snapshot}) {
 const browser=ui.page.context().browser(),GameUI=ui.constructor;
 results.petcare=[];
 const record=(device,name,evidence)=>{const item={device,name,passed:true,evidence};results.checks.push(item);results.petcare.push(item);console.log(device+' '+name);writeFileSync(resolve(out,variant+'-petcare-progress.json'),JSON.stringify(results.petcare,null,2)+'\n');};
 for(const mobile of [false,true]) {
  const device=mobile?'mobile':'desktop',context=mobile?await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}):ui.page.context();
  if(mobile){ui=new GameUI(await context.newPage(),true);await ui.enter();await ui.mode('immersive');}
  const page=ui.page;
  const wait=async(fn,message,timeout=30000)=>{const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await ui.settle(70);}throw Error(device+': '+message);};
  let lastGm=0;
  const gm=async(text,battle=false)=>{await ui.closePanels();await ui.settle(Math.max(0,850-(Date.now()-lastGm)));await ui.gm(text,battle);lastGm=Date.now();};
  const nextNpc=async(action,predicate=()=>true)=>{
   const before=ui.npcCount;await action();await wait(()=>ui.npcCount>before&&predicate(ui.latest.NpcWindow),'NPC response missing');
   const win=ui.latest.NpcWindow,title=(win.text??'').split('\n').map(t=>t.trim()).find(t=>t&&!/^[0-7]$/.test(t));
   // Network acknowledgement precedes the next native frame. Read the rendered
   // title and live hits before testing or pressing the replacement window.
   await page.waitForFunction(({kind,title})=>{
    const ui=globalThis.sa?.ui;if(!ui)return false;const hits=ui.getMobileActions();
    if(kind==='petselect')return hits.some(h=>h.id.startsWith('psel-'));
    return hits.some(h=>h.id.startsWith('npc-'))&&(!title||ui.texts.some(t=>t.text.trim()===title));
   },{kind:win.kind,title},{timeout:20000});
   return win;
  };
  const select=async(label)=>{
   const hit=await wait(async()=>(await ui.actions()).find(h=>h.id.startsWith('npc-sel')&&h.label?.includes(label)),'native NPC option '+label+' missing');
   return nextNpc(()=>ui.action(hit.id));
  };
  const clickButton=async(bit,predicate)=>nextNpc(()=>ui.action('npc-btn'+bit),predicate);
  const menu=async()=>{
   await ui.closePanels();
   const point=await page.evaluate(()=>{const f=sa.field,actor=[...f.actors.values()].find(a=>a.kind==='npc'&&a.x===12&&a.y===13),rect=actor&&f.actorRects.find(r=>r[0]===actor),view=document.querySelector('#view').getBoundingClientRect();if(!rect)return null;const nx=(rect[1]+rect[3])/2,ny=(rect[2]+rect[4])/2;return{x:view.x+nx*view.width/800,y:view.y+ny*view.height/600};});
   assert(point,'official PetShop actor rectangle absent');
   return nextNpc(()=>mobile?page.touchscreen.tap(point.x,point.y):page.mouse.click(point.x,point.y),m=>m.seq===261);
  };
  const closeNpc=async()=>{for(let i=0;i<5;i++){const hits=await ui.actions();if(hits.some(h=>h.id==='npc-btn1')){await clickButton(1);continue;}await page.keyboard.press('Escape');await ui.settle(150);if(!(await ui.actions()).some(h=>/^npc-|^psel-/.test(h.id)))return;}throw Error('NPC modal failed to close');};
  const pageNumber=()=>Number((ui.latest.NpcWindow?.text??'').match(/第\s*(\d+)\s*\//)?.[1]??0);
  const lastPage=async()=>{await wait(()=>ui.latest.NpcWindow?.seq===267,'pet pool not open');for(let i=0;i<101;i++){if(!(ui.latest.NpcWindow.buttons&32))return;await clickButton(5,m=>m.seq===267);}throw Error('pool page did not end');};
  const poolAt=()=>snapshot().pool.find(p=>p.training&&p.free===trainingName);
  {
   await ui.noEncounter();
   for(const flag of ['quick','autoBattle','encounter'])await ui.flag(flag,false);
   await gm('/warp 1003 12 14');await gm('/lv 50');await gm('/stat 100 1000 100 100');await gm('/heal');
   if(!mobile){for(const p of [...ui.latest.Pets.pets])await gm('/petdel '+p.slot);await gm('/pet 9 1');await gm('/petname 0 '+trainingName);}
   assert(ui.latest.Pets.pets.length===1,'fixture must carry one pet');
   await gm('/gold 100000');const carried=ui.latest.Pets.pets[0],cost=(snapshot().level+carried.level)*100;
   await menu();assert(ui.latest.NpcWindow.text.includes('培养宠物'),'培养 option absent');
   const menuHits=(await ui.actions()).filter(h=>h.id.startsWith('npc-sel'));
   assert(menuHits.length===5,'all five native shop options must be reachable');
   record(device,'native menu preserves all five reachable options',{menu:ui.latest.NpcWindow.text,hits:menuHits});
   await select('培养宠物');await nextNpc(()=>ui.action('psel-'+carried.slot),m=>m.seq===271);
   assert(ui.latest.NpcWindow.text.includes(String(cost)),'training quote differs from (current character+pet level)*100');
   await ui.snapshot('petcare-quote-'+device);
   await clickButton(3);assert(ui.latest.Pets.pets.length===1&&snapshot().poolCount===499,'cancelled training changed ownership');
   await nextNpc(()=>ui.action('psel-btn1'));await closeNpc();
   record(device,'training quote and cancellation',{characterLevel:50,petLevel:carried.level,quote:cost,poolCount:snapshot().poolCount});
   await gm('/gold 0');await menu();await select('培养宠物');
   await nextNpc(()=>ui.action('psel-'+carried.slot));
   if(ui.latest.NpcWindow.buttons&4)await clickButton(2);
   assert(snapshot().poolCount===499&&ui.latest.Pets.pets.length===1&&snapshot().gold===0,'insufficient funds mutated pets or gold');
   await closeNpc();record(device,'insufficient funds preserves carried pet and balance',snapshot());
   await gm('/gold 100000');await menu();await select('培养宠物');await nextNpc(()=>ui.action('psel-'+carried.slot));await clickButton(2);
   await wait(()=>ui.latest.Pets.pets.length===0&&snapshot().poolCount===500,'training did not move pet into shared pool');
   const trained=poolAt();assert(trained&&trained.free===trainingName,'persisted training identity/flag missing');assert(snapshot().gold===100000-cost,'training charged wrong amount');
   record(device,'paid training occupies slot 500 and removes carried pet',{cost,stored:trained,poolCount:snapshot().poolCount,gold:snapshot().gold});
   await clickButton(0);await select('领取宠物');
   assert(pageNumber()===1&&!(ui.latest.NpcWindow.buttons&16)&&(ui.latest.NpcWindow.buttons&32),'first-page buttons wrong');
   await ui.snapshot('pool-first-'+device);
   await clickButton(5);assert(pageNumber()===2&&(ui.latest.NpcWindow.buttons&16)&&(ui.latest.NpcWindow.buttons&32),'middle-page buttons wrong');
   await clickButton(4);assert(pageNumber()===1,'previous page did not restore page 1');
   await lastPage();assert(pageNumber()===100&&(ui.latest.NpcWindow.buttons&16)&&!(ui.latest.NpcWindow.buttons&32),'500-pet list must end at page 100');
   const lastHits=(await ui.actions()).filter(h=>h.id.startsWith('npc-sel'));
   assert(lastHits.length===5&&lastHits[4].label?.includes('培养'),'last page must retain five rows including training status');
   if(mobile){const buttons=await page.locator('[data-action^="npc-"]:visible').evaluateAll(elements=>elements.map(e=>({id:e.dataset.action,label:e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));assert(buttons.length>=7&&buttons.every(b=>b.width>=24&&b.height>=24),'mobile NPC buttons lack minimum touch area');record(device,'mobile portrait pool controls have reachable touch targets',{buttons});await page.setViewportSize({width:844,height:390});await ui.settle(400);await ui.snapshot('pool-last-mobile-landscape');await page.setViewportSize({width:390,height:844});await ui.settle(400);}
   await ui.snapshot('pool-last-'+device);
   record(device,'shared pool first/middle/last pagination with 500 pets',{page:pageNumber(),buttons:ui.latest.NpcWindow.buttons,lastRows:lastHits});
   await closeNpc();
   await gm('/pet 9 1');await menu();await select('培养宠物');assert(snapshot().poolCount===500&&ui.latest.Pets.pets.length===1,'full pool accepted another pet');await closeNpc();
   await menu();await select('寄放宠物');assert(snapshot().poolCount===500&&ui.latest.Pets.pets.length===1,'full pool accepted an ordinary deposit');await closeNpc();await gm('/petdel '+ui.latest.Pets.pets[0].slot);
   record(device,'full shared pool refuses a 501st pet',{poolCount:snapshot().poolCount});
   const normalBefore=snapshot().pool.find(p=>p.free==='寄放001');
   await gm('/exp 7');assert(total(poolAt())===total(trained),'non-battle character experience trained pet');record(device,'GM character experience does not train deposited pets',{stored:poolAt()});
   for(const quick of [false,true]){
    const before=poolAt(),beforeAll=snapshot().pool.filter(p=>p.training),startEvent=ui.events.length;
    await ui.flag('autoBattle',true);await ui.flag('quick',quick);await ui.closePanels();
    await gm('/encount 90004 50',true);
    const ended=await wait(()=>ui.events.slice(startEvent).find(e=>e.t==='BattleEnd'),'battle did not finish',180000);
    assert(ended.result==='win'&&ended.exp>0,'real battle did not award character experience');await ui.fieldReady(quick?90000:240000);await ui.closePanels();
    const after=await wait(()=>{const p=poolAt();return total(p)>total(before)&&p;},'training did not persist after battle');
    const actual=total(after)-total(before),expected=Math.floor(ended.exp*4/5);
    assert(actual===expected,'training experience differs from 80% of actual BattleEnd reward');
    const independent=beforeAll.map(p=>{const current=snapshot().pool.find(a=>a.free===p.free);return{name:p.free,before:total(p),after:total(current),gain:total(current)-total(p)};});
    assert(independent.length===2&&independent.every(p=>p.gain===expected),'each training pet must receive the entire 80% share independently');assert(after.lv>1,'training never auto-levelled');
    assert(JSON.stringify(snapshot().pool.find(p=>p.free==='寄放001'))===JSON.stringify(normalBefore),'ordinary deposit received training experience');
    record(device,(quick?'quick':'ordinary auto')+' battle grants exactly 80% and persists automatic levels',{battle:ended,before,after,actual,expected,independent,ordinary:normalBefore});
    await ui.flag('quick',false);await ui.flag('autoBattle',false);
   }
   await menu();await select('领取宠物');await lastPage();
   const target=(await ui.actions()).filter(h=>h.id.startsWith('npc-sel')).at(-1);assert(target?.label?.includes('培养'),'training selection missing on page100');
   await nextNpc(()=>ui.action(target.id),m=>m.seq===268);assert(ui.latest.NpcWindow.text.includes(trainingName),'page100 selected wrong pet');await clickButton(2);
   await wait(()=>ui.latest.Pets.pets.some(p=>p.freeName===trainingName)&&snapshot().poolCount===499,'withdraw did not restore training pet');
   const restored=snapshot().pets.find(p=>p.free===trainingName);assert(restored&&!restored.training,'withdrawal retained training flag');
   record(device,'page100 withdrawal returns correct grown pet and clears training state',{restored,poolCount:snapshot().poolCount});
   await ui.snapshot('withdrawn-'+device);await closeNpc();
   const beforeOrdinary=snapshot(),restoredSlot=ui.latest.Pets.pets.find(p=>p.freeName===trainingName).slot;
   await menu();await select('寄放宠物');await nextNpc(()=>ui.action('psel-'+restoredSlot));await clickButton(2);
   await wait(()=>snapshot().poolCount===500&&ui.latest.Pets.pets.length===0,'ordinary deposit did not reach shared slot500');
   const ordinary=snapshot().pool.find(p=>p.free===trainingName);assert(ordinary&&!ordinary.training,'ordinary deposit incorrectly enables training');
   assert(snapshot().gold===beforeOrdinary.gold-(50+beforeOrdinary.level*4),'ordinary deposit fee regressed');
   await clickButton(0);await select('领取宠物');await lastPage();const ordinaryHit=(await ui.actions()).filter(h=>h.id.startsWith('npc-sel')).at(-1);
   assert(ordinaryHit?.label?.includes('寄放'),'ordinary deposit marker absent on page100');await nextNpc(()=>ui.action(ordinaryHit.id));await clickButton(2);
   await wait(()=>snapshot().poolCount===499&&ui.latest.Pets.pets.length===1,'ordinary retrieval failed');
   record(device,'ordinary deposit and page100 retrieval preserve fee and disable training',{fee:50+beforeOrdinary.level*4,ordinary,restored:snapshot().pets[0]});
   await closeNpc();assert(!ui.errors.length,'browser reported errors');
  }
  if(!mobile)await context.close();
 }
 return ui;
}
