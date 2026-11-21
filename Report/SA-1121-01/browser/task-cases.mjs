// Actual native UI/GM chat only. Browser evaluation reads state and geometry.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const assert=(ok,message)=>{if(!ok)throw Error(message);};

export async function run(ui,results,{variant,out}) {
 const browser=ui.page.context().browser(),GameUI=ui.constructor;
 await ui.page.context().close();
 for(const mobile of (variant==='baseline'?[false]:[false,true])) {
  const device=mobile?'mobile':'desktop';
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  ui=new GameUI(await context.newPage(),mobile);await ui.enter();if(mobile)await ui.mode('immersive');
  const page=ui.page,wire=[],received=[],cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketFrameSent',({response})=>{let m;try{m=JSON.parse(response.payloadData);}catch{return;}if(['Move','NpcListReq','MapReq'].includes(m.t))wire.push(m);});
  cdp.on('Network.webSocketFrameReceived',({response})=>{let m;try{m=JSON.parse(response.payloadData);}catch{return;}if(['EnterFloor','PosCorrect','BattleEnd'].includes(m.t))received.push(m);});
  const record=(name,evidence)=>{results.checks.push({device,name,passed:true,evidence});writeFileSync(resolve(out,`${variant}-progress.json`),JSON.stringify(results.checks,null,2));console.log(`${device}: ${name}`);};
  const wait=async(fn,message,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await ui.settle(100);}throw Error(`${device}: ${message}`);};
  let lastGm=0;
  const gm=async(command,battle=false)=>{await ui.closePanels();await ui.settle(Math.max(0,850-(Date.now()-lastGm)));await ui.gm(command,battle);lastGm=Date.now();};
  const state=()=>page.evaluate(()=>{const f=sa.field;return{floor:f.floor,x:f.self.x,y:f.self.y,target:f.target,status:f.navigationStatus,corrections:f.corrections,mapNavigation:f.mapNavigation,wholeReady:f.wholeReady,waitingWarp:f.waitingWarp,search:!!f.routeSearch,locked:f.locked,follower:f.follower,wantDir:f.wantDir,goal:f.pathGoal,loaded:f.walk.reduce((n,v)=>n+!!v,0)};});
  const openMap=async(npcs=false)=>{
   await ui.closePanels();await page.waitForFunction(()=>!sa.screen.openCount()&&!sa.ui.mouse.clicked);
   await ui.toolbar('map');await page.waitForFunction(()=>sa.screen.menus.mapOpen&&!sa.ui.mouse.clicked);
   await wait(()=>page.evaluate(()=>sa.field.mapPlaces(sa.field.floor)),'map catalogue missing');
   if(npcs){await ui.action('map-tab-npcs');await wait(()=>page.evaluate(()=>sa.field.npcList(sa.field.floor)),'NPC list missing');}
  };
  const selectNpc=async(x,y)=>{
   const npc=await page.evaluate(({x,y})=>sa.field.npcList(sa.field.floor)?.find(n=>n.x===x&&n.y===y),{x,y});assert(npc,`actual NPC (${x},${y}) absent`);
   for(let i=0;i<60&&(await ui.actions()).some(h=>h.id==='map-npcs-prev');i++)await ui.action('map-npcs-prev');
   for(let i=0;i<60;i++){
    const hits=await ui.actions(),h=hits.find(h=>h.id.startsWith(`map-npc-`)&&h.id.endsWith(`-${x}-${y}`));
    if(h){await ui.action(h.id);return npc;}
    assert(hits.some(h=>h.id==='map-npcs-next'),'NPC pagination ended early');await ui.action('map-npcs-next');
   }throw Error('NPC pagination limit');
  };
  const selectPlace=async(toFloor,x,y)=>{
   await ui.action('map-tab-places');
   const place=await page.evaluate(({toFloor,x,y})=>sa.field.mapPlaces(sa.field.floor)?.find(p=>p.floor===toFloor&&(x==null||p.entrances.some(e=>e.x===x&&e.y===y))),{toFloor,x,y});
   assert(place,`actual exit ${toFloor} absent`);
   const first=place.entrances[0],id=`map-place-${(await state()).floor}-${toFloor}-${first.x}-${first.y}`;
   for(let i=0;i<60&&(await ui.actions()).some(h=>h.id==='map-places-prev');i++)await ui.action('map-places-prev');
   for(let i=0;i<60;i++){
    const hits=await ui.actions();if(hits.some(h=>h.id===id)){await ui.action(id);return place;}
    assert(hits.some(h=>h.id==='map-places-next'),'exit pagination ended early');await ui.action('map-places-next');
   }throw Error('exit pagination limit');
  };
  const npcRoute=async({floor,x,y,nx,ny,name,via=[]})=>{
   await gm(`/warp ${floor} ${x} ${y}`);await openMap(true);
   const before=await state(),sent=wire.length,recv=received.length,start=Date.now(),npc=await selectNpc(nx,ny);
   await wait(async()=>{const s=await state();return s.floor===floor&&s.x===nx&&s.y===ny&&!s.target&&s;},`${name} NPC route did not arrive`,600000);
   const after=await state(),frames=received.slice(recv),portals=frames.filter(m=>m.t==='EnterFloor').map(m=>({floor:m.floor,x:m.x??0,y:m.y??0}));
   for(const p of via)assert(portals.some(m=>m.floor===p.floor&&m.x===p.x&&m.y===p.y),`${name} missed authoritative portal confirmation`);
   assert(!frames.some(m=>m.t==='PosCorrect')&&after.corrections===before.corrections,`${name} caused server correction`);
   await ui.snapshot(`${name}-${device}`);record(`${name}: native NPC navigation`,{npc,before,after,portals,moves:wire.slice(sent).filter(m=>m.t==='Move').length,seconds:(Date.now()-start)/1000,corrections:0});
  };
  const exitRoute=async({floor,x,y,toFloor,ex,ey,name,via=[]})=>{
   if(floor!=null)await gm(`/warp ${floor} ${x} ${y}`);await openMap();
   const before=await state(),sent=wire.length,recv=received.length,start=Date.now(),place=await selectPlace(toFloor,ex,ey);
   await wait(async()=>{const s=await state();return s.floor===toFloor&&!s.target&&s;},`${name} native exit did not cross floor`,600000);
   const after=await state(),frames=received.slice(recv),portals=frames.filter(m=>m.t==='EnterFloor').map(m=>({floor:m.floor,x:m.x??0,y:m.y??0}));
   for(const p of via)assert(portals.some(m=>m.floor===p.floor&&m.x===p.x&&m.y===p.y),`${name} missed expected portal`);
   assert(!frames.some(m=>m.t==='PosCorrect')&&after.corrections===before.corrections,`${name} caused server correction`);
   await ui.snapshot(`${name}-${device}`);record(`${name}: native exit navigation`,{place,before,after,portals,moves:wire.slice(sent).filter(m=>m.t==='Move').length,seconds:(Date.now()-start)/1000,corrections:0});
  };
  try {
   for(const flag of ['quick','autoBattle','encounter'])await ui.flag(flag,false);
   await ui.noEncounter();await gm('/heal');await gm('/warp 817 146 19');await openMap(true);
   const before=await state(),sent=wire.length,recv=received.length;
   const npc=await selectNpc(148,35);
   console.log(JSON.stringify({device,stage:'selected-sea-npc',state:await state()}));
   if(variant==='baseline'){
    await wait(async()=>{const s=await state();return !s.target&&(s.status||!s.mapNavigation)&&s;},'baseline navigation defect was not reproduced');
    const after=await state();await ui.snapshot(`sea-npc-unreachable-${device}`);
    assert(after.floor===817&&after.x===before.x&&after.y===before.y,'baseline unexpectedly moved to the destination');
    record('baseline: real Sea of Tears NPC unreachable despite native same-floor portal',{npc,before,after,moves:wire.slice(sent).filter(m=>m.t==='Move').length});
   }else{
    await wait(async()=>{const s=await state();return s.floor===817&&s.x===148&&s.y===35&&!s.target&&s;},'Sea of Tears NPC route did not reach destination',120000);
    const after=await state(),frames=received.slice(recv),moves=wire.slice(sent).filter(m=>m.t==='Move');
    assert(moves.length>0&&frames.some(m=>m.t==='EnterFloor'&&m.floor===817),'same-floor portal was not traversed by actual movement');
    assert(!frames.some(m=>m.t==='PosCorrect')&&after.corrections===before.corrections,'navigation caused server corrections');
    await ui.snapshot(`sea-npc-arrived-${device}`);record('Sea of Tears NPC via real same-floor portal',{npc,before,after,moves:moves.length,portals:frames.filter(m=>m.t==='EnterFloor').map(m=>({floor:m.floor,x:m.x??0,y:m.y??0})),corrections:0});
   }
   if(variant!=='baseline'){
    await exitRoute({toFloor:8000,ex:386,ey:199,name:'sea-exit'});
    await gm('/heal');
    await gm('/warp 702 388 10');await openMap(true);await selectNpc(188,41);
    await wait(async()=>{const s=await state();return s.mapNavigation&&s;},'cancellation route never armed');
    if(mobile){
     const stick=page.locator('.mobile-shell-joystick[aria-disabled="false"]');
     await stick.tap({position:{x:78,y:48}});
    }else await page.keyboard.press('ArrowRight');
    await wait(async()=>{const s=await state();return !s.mapNavigation&&!s.target&&s;},'manual direction did not cancel portal route',10000);
    record('manual direction cancels a portal navigation intent',{after:await state(),input:mobile?'native touchscreen joystick':'ArrowRight keyboard'});
    await npcRoute({floor:702,x:388,y:10,nx:188,ny:41,name:'nyx-return-passage',via:[{floor:703,x:9,y:14},{floor:702,x:388,y:49}]});
    await npcRoute({floor:701,x:305,y:14,nx:243,ny:22,name:'eden-west-ordinary'});
   }
   await ui.closePanels();
   await gm('/stat 1000 1000 1000 1000');await gm('/heal');
   await ui.flag('autoBattle',true);await ui.flag('quick',true);
   const enemies=[{id:1969,level:130,want:3587},{id:1971,level:140,want:4076}];
   if(variant!=='baseline')enemies.push({id:2165,level:130,want:3341},{id:2168,level:140,want:4076},{id:2239,level:80,want:0});
   for(const enemy of enemies){
    // The fourth actual enemy uses ordinary animated auto battle as well.
    if(variant!=='baseline')await ui.flag('quick',enemy.id!==2168);
    await gm(`/lv ${enemy.want===0?140:enemy.level}`);
    assert(ui.latest.Status.level===(enemy.want===0?140:enemy.level),'native level command did not set the fixture level');
    const start=ui.events.length;await gm(`/encount ${enemy.id} ${enemy.level}`,true);
    const end=await wait(()=>ui.events.slice(start).find(m=>m.t==='BattleEnd'),'actual battle did not settle',120000);
    assert(end.result==='win','actual enemy battle was not won');
    assert(end.exp===(variant==='baseline'?0:enemy.want),'enemy battle reward differs from independently verified native value');
    await ui.fieldReady();await ui.closePanels();
    record(`${variant==='baseline'?'baseline':'patched'} native experience for enemy ${enemy.id} level ${enemy.level}`,{enemy,mode:enemy.id===2168?'ordinary automatic':'quick automatic',battle:end,status:ui.latest.Status});
   }
   await ui.flag('quick',false);await ui.flag('autoBattle',false);
   if(mobile){await ui.toolbar('map');await page.setViewportSize({width:844,height:390});await ui.settle(400);assert(await page.getByLabel('目的地东坐标 X',{exact:true}).count()===1,'rotation lost/duplicated native input');await ui.snapshot('map-landscape-mobile');await ui.closePanels();record('mobile native map survives landscape rotation',{viewport:page.viewportSize(),inputsRemoved:await page.getByLabel('目的地东坐标 X',{exact:true}).count()===0});}
   assert(!ui.errors.length,'Chromium reported browser errors');
  }finally{await cdp.detach();}
  if(!mobile&&variant!=='baseline')await context.close();
 }
 return ui;
}
