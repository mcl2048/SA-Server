// Real native clicks/keys/GM chat only. evaluate() reads native state and geometry.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const MOVE=[[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1]];
const assert=(value,message)=>{if(!value)throw Error(message);};
export async function run(ui,results,{variant,out}) {
 const browser=ui.page.context().browser(),GameUI=ui.constructor;
 await ui.page.context().close();results.navigation=[];
 for(const mobile of [false,true]) {
  const device=mobile?'mobile':'desktop';
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  ui=new GameUI(await context.newPage(),mobile);await ui.enter();if(mobile)await ui.mode('immersive');
  const page=ui.page,wire=[],cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketFrameSent',({response})=>{let m;try{m=JSON.parse(response.payloadData);}catch{return;}if(['Move','MapReq','NpcListReq'].includes(m.t))wire.push(m);});
  const record=(name,evidence)=>{const row={device,name,evidence};results.navigation.push(row);results.checks.push({device,case:`${device} ${name}`,passed:true,evidence});console.log(`${device}: ${name}`);writeFileSync(resolve(out,`${variant}-navigation-progress.json`),JSON.stringify(results.navigation,null,2));};
  const wait=async(fn,message,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await ui.settle(80);}throw Error(`${device}: ${message}`);};
  let lastGm=0;
  const gm=async(command)=>{await ui.closePanels();await ui.settle(Math.max(0,800-(Date.now()-lastGm)));await ui.gm(command);lastGm=Date.now();};
  const state=()=>page.evaluate(()=>{const f=sa.field,m=sa.screen.menus.mapWnd;return{floor:f.floor,x:f.self.x,y:f.self.y,target:f.target,status:f.navigationStatus,corrections:f.corrections,cx:m.cx,cy:m.cy,mapOpen:sa.screen.menus.mapOpen};});
  const openMap=async()=>{
   await ui.closePanels();
   await page.waitForFunction(()=>sa.screen.openCount()===0&&!sa.ui.mouse.clicked,null,{timeout:15000});
   if(mobile){
    const control=page.locator('[data-mobile-control="menu-map"]'),tray=page.locator('[data-mobile-control="menu-tray"]:visible');
    await page.waitForFunction(()=>{const b=document.querySelector('[data-mobile-control="menu-map"]'),t=document.querySelector('[data-mobile-control="menu-tray"]');const shown=e=>e&&e.getClientRects().length&&!e.closest('[hidden]');return shown(b)||shown(t)&&t.getAttribute('aria-expanded')==='false';},null,{timeout:15000});
    if(!await control.isVisible())await tray.tap();
    await control.waitFor({state:'visible'});await control.scrollIntoViewIfNeeded();await control.tap();
   }else await ui.toolbar('map');
   await page.waitForFunction(()=>{const m=sa.screen.menus.mapWnd,p=sa.field.mapPlaces(sa.field.floor),h=sa.ui.getMobileActions();if(!sa.screen.menus.mapOpen||sa.ui.mouse.clicked||m.placeTop!==0||!p)return false;const f=p[0],e=f?.entrances[0];return !f||h.some(a=>a.id===`map-place-${sa.field.floor}-${f.floor}-${e.x}-${e.y}`);},null,{timeout:15000});
  };
  const catalogue=async()=>wait(()=>page.evaluate(()=>sa.field.mapPlaces(sa.field.floor)),'catalogue did not arrive');
  const nextPage=async()=>{
   const before=(await ui.actions()).filter(h=>h.id.startsWith('map-place-')).map(h=>h.id).join('|');
   await ui.action('map-places-next');
   await page.waitForFunction(before=>!sa.ui.mouse.clicked&&sa.ui.getMobileActions().filter(h=>h.id.startsWith('map-place-')).map(h=>h.id).join('|')!==before,before,{timeout:15000});
  };
  const findAction=async(place,sourceFloor=100)=>{
   const first=place.entrances[0],id=`map-place-${sourceFloor}-${place.floor}-${first.x}-${first.y}`;
   for(let i=0;i<50;i++){const actions=await ui.actions();if(actions.some(h=>h.id===id))return id;if(!actions.some(h=>h.id==='map-places-next'))break;await nextPage();}
   throw Error('location was not reachable through native pages: '+place.name);
  };
  const approach=async(place,sourceFloor=100)=>{
   const entry=place.entrances[0];await gm(`/warp ${sourceFloor} ${Math.max(0,entry.x-5)} ${entry.y}`);await openMap();
   const region=await wait(()=>page.evaluate(({x,y,floor})=>{const v=sa.field.floorView(floor);if(!v)return null;const x1=Math.max(0,x-12),y1=Math.max(0,y-12),x2=Math.min(v.w,x+13),y2=Math.min(v.h,y+13);if(!v.walk[y*v.w+x])return null;const rows=[];for(let yy=y1;yy<y2;yy++)rows.push(Array.from(v.walk.subarray(yy*v.w+x1,yy*v.w+x2)));return{x1,y1,w:x2-x1,h:y2-y1,walk:rows.flat()};},{...entry,floor:sourceFloor}),'entry map chunk did not arrive');
   const {x1,y1,w,h,walk}=region,enter=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&walk[y*w+x]>=2;
   const queue=[],seen=new Set();
   for(const p of place.entrances){const x=p.x-x1,y=p.y-y1;if(enter(x,y)){queue.push({x,y,d:0});seen.add(y*w+x);}}
   let source;
   for(let i=0;i<queue.length;i++){
    const p=queue[i];if(p.d>=6&&walk[p.y*w+p.x]===2){source={x:p.x+x1,y:p.y+y1,steps:p.d};break;}
    for(const [dx,dy]of MOVE){const x=p.x+dx,y=p.y+dy,key=y*w+x;if(!enter(x,y)||walk[key]===3||seen.has(key)||dx&&dy&&(!enter(p.x+dx,p.y)||!enter(p.x,p.y+dy)))continue;seen.add(key);queue.push({x,y,d:p.d+1});}
   }
   assert(source,'no plain six-step approach to '+place.name);
   await gm(`/warp ${sourceFloor} ${source.x} ${source.y}`);await openMap();
   // EnterFloor invalidates the previous catalogue; use the current response.
   const current=await catalogue();const selected=current.find(p=>p.floor===place.floor&&p.entrances[0].x===entry.x&&p.entrances[0].y===entry.y);assert(selected,'catalogue entry changed unexpectedly');
   return{source,place:selected,id:await findAction(selected,sourceFloor)};
  };
  try {
   for(const flag of ['quick','autoBattle','encounter'])await ui.flag(flag,false);
   await ui.noEncounter();await gm('/warp 100 633 491');await openMap();const places=await catalogue();
   assert(places.length>=15&&places.some(p=>p.name.includes('村'))&&places.some(p=>p.name.includes('洞窟')),'world catalogue lacks expected villages/caves');
   const ids=new Set();let pages=0;
   for(;pages<50;pages++){const actions=await ui.actions();for(const h of actions.filter(h=>h.id.startsWith('map-place-'))){assert(h.label&&!h.label.includes('…'),'mobile/native label lost full name');ids.add(h.id);}if(!actions.some(h=>h.id==='map-places-next'))break;await nextPage();}
   assert(ids.size===places.length,'sidebar omitted catalogue locations');
   await ui.action('map-tab-floors');assert((await ui.actions()).some(h=>h.id==='map-fl-100'),'historical floor tab lost current area');await ui.action('map-tab-places');
   await ui.snapshot(`navigation-catalogue-${device}`);record('complete current-world village/cave catalogue and native pagination',{floor:100,places:places.length,buttons:ids.size,pages:pages+1,names:places.map(p=>p.name)});
   for(const [name,place] of [['village',places.find(p=>p.floor===1000&&p.entrances[0].x===638)],['cave',places.find(p=>p.floor===11001)]]){
    assert(place,'expected native '+name+' entrance absent');const route=await approach(place),before=await state(),from=wire.length;
    await ui.snapshot(`navigation-${name}-before-${device}`);await ui.action(route.id);
    await wait(async()=>(await state()).floor===place.floor,'location click did not enter '+place.name,30000);await ui.fieldReady();
    const after=await state(),moves=wire.slice(from).filter(m=>m.t==='Move');
    assert(moves.length>=route.source.steps,'doorway was not reached through real Move requests');assert(after.corrections===before.corrections,'legal entrance route caused PosCorrect');
    await ui.snapshot(`navigation-${name}-arrived-${device}`);record(`native ${name} location click walks and enters destination`,{name:place.name,from:route.source,toFloor:after.floor,position:{x:after.x,y:after.y},moves:moves.length,corrections:after.corrections-before.corrections});
   }
   // The cave's real return doorway is on x=0. Go omits x=0 on the
   // WebSocket; this proves decoding and routing through the final ELF/client.
   await openMap();const zeroPlaces=await catalogue(),zeroPlace=zeroPlaces.find(p=>p.floor===100&&p.entrances.some(e=>e.x===0));
   assert(zeroPlace,'native zero-coordinate cave exit was lost during wire decoding');
   const zeroRoute=await approach(zeroPlace,11001),zeroBefore=await state(),zeroFrom=wire.length;
   await ui.action(zeroRoute.id);await wait(async()=>(await state()).floor===100,'zero-coordinate doorway did not return to world');await ui.fieldReady();
   const zeroAfter=await state(),zeroMoves=wire.slice(zeroFrom).filter(m=>m.t==='Move');
   assert(zeroMoves.length>=zeroRoute.source.steps&&zeroAfter.corrections===zeroBefore.corrections,'zero-coordinate exit failed server movement validation');
   record('zero-coordinate native cave exit decodes, walks and returns to world',{floor:11001,entrances:zeroPlace.entrances,source:zeroRoute.source,moves:zeroMoves.length,toFloor:zeroAfter.floor,corrections:0});
   // Show every conditional native branch without pretending to grant its
   // quest conditions or choosing the server's eventual destination.
   await gm('/warp 703 334 176');await openMap();const conditional=await catalogue();
   const branches=conditional.filter(p=>[7453,7454].includes(p.floor)&&p.entrances.some(e=>e.x===334&&e.y===182));
   assert(branches.length===2&&branches.every(p=>p.conditional),'native FREE/TO branches missing or marked unconditional');
   for(const place of branches){const id=await findAction(place,703);assert((await ui.actions()).find(h=>h.id===id).label.includes('条件入口'),'conditional native label missing');}
   await ui.snapshot(`navigation-conditional-${device}`);record('native conditional world entrances retain both quest branches',{floor:703,branches:branches.map(p=>({name:p.name,toFloor:p.floor,conditional:p.conditional,entrances:p.entrances}))});
   // Exercise actual browser input cancellation and panning independently of
   // location buttons. No DOM event is fabricated by page.evaluate.
   await gm('/warp 100 633 491');await openMap();const before=await state(),from=wire.length;
   const area=mobile?await page.locator('canvas[data-mobile-map]:visible').boundingBox():await page.evaluate(()=>{const h=sa.ui.getMobileActions().find(h=>h.id==='map-area'),r=document.querySelector('#view').getBoundingClientRect();return{x:r.x+h.x1*r.width/800,y:r.y+h.y1*r.height/600,width:(h.x2-h.x1)*r.width/800,height:(h.y2-h.y1)*r.height/600};});
   assert(area,'native map surface absent');const x=area.x+area.width*.45,y=area.y+area.height*.45;
   if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await ui.settle(80);for(let i=1;i<=4;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*12,y}]});await ui.settle(45);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else{await page.mouse.move(x,y);await page.mouse.down();await ui.settle(80);await page.mouse.move(x+48,y,{steps:5});await ui.settle(80);await page.mouse.up();}
   await ui.settle(400);const after=await state();assert(before.cx!==after.cx||before.cy!==after.cy,'map drag did not pan');assert(after.target===null&&!wire.slice(from).some(m=>m.t==='Move'),'map drag became navigation');
   record('native map drag pans without click-through or movement',{before:{cx:before.cx,cy:before.cy},after:{cx:after.cx,cy:after.cy},moves:0});
   // Native coordinate inputs remain adopted, labelled and validated.
   const ix=page.getByLabel('目的地东坐标 X',{exact:true}),iy=page.getByLabel('目的地南坐标 Y',{exact:true});
   assert(await ix.count()===1&&await iy.count()===1,'coordinate controls were duplicated/lost');await ix.fill('-1');await iy.fill('0');await ui.action('map-go');
   await wait(async()=>/范围外/.test((await state()).status),'out-of-bounds coordinate was not rejected');assert((await state()).target===null,'invalid coordinate started a route');
   if(mobile){await page.setViewportSize({width:844,height:390});await ui.settle(400);assert(await ix.count()===1&&await iy.count()===1,'rotation duplicated native coordinate controls');await ui.snapshot('navigation-landscape-mobile');}
   record('native coordinate validation and input lifecycle',{mobile,inputs:2,status:(await state()).status});
   await ui.closePanels();assert(await ix.count()===0&&await iy.count()===0,'closed map left invisible inputs');assert(!ui.errors.length,'browser error');
  } finally {await cdp.detach();}
  if(!mobile)await context.close();
 }
 return ui;
}
