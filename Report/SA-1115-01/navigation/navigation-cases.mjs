// Browser actions drive the original UI. Evaluation only reads map/route/state;
// encounters come from the private fixture's real encounter table and rule.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export async function run(initial,results,{variant,out}) {
 const browser=initial.page.context().browser(),UI=initial.constructor;
 await initial.page.context().close();
 results.navigation=[];
 let lastUi;
 for(const touch of [false,true]) {
  const device=touch?'mobile':'desktop';console.log(JSON.stringify({navigation:device,stage:'context'}));
  const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1280,height:900},isMobile:touch,hasTouch:touch,deviceScaleFactor:1});
  const page=await context.newPage(),traffic={starts:0,ends:0,movesDuringBattle:0,moves:[],inBattle:false};
  page.on('websocket',socket=>{
   socket.on('framereceived',frame=>{let m;try{m=JSON.parse(String(frame.payload));}catch{return;}
    if(m.t==='BattleStart'){traffic.inBattle=true;traffic.starts++;}
    if(m.t==='BattleEnd'){traffic.inBattle=false;traffic.ends++;}
   });
   socket.on('framesent',frame=>{let m;try{m=JSON.parse(String(frame.payload));}catch{return;}
    if(m.t==='Move'){if(traffic.inBattle)traffic.movesDuringBattle++;traffic.moves.push({x:m.x,y:m.y,dir:m.dir});}
   });
  });
  const ui=new UI(page,touch);lastUi=ui;await ui.enter();console.log(JSON.stringify({navigation:device,stage:'entered'}));
  const gm=async text=>{await ui.settle(850);await ui.gm(text);};
  const openMap=async()=>{if(touch)await ui.toolbar('map');else await ui.action('tb-map');};
  // No runtime hook is installed; all selectors below address real InputBox DOM.
  const form=async(x,y)=>{
   await page.getByLabel('目的地东坐标 X',{exact:true}).fill(String(x));
   await page.getByLabel('目的地南坐标 Y',{exact:true}).fill(String(y));
   await ui.action('map-go');
  };
  const flag=async(name,on)=>{
   if(!!ui.latest.AutoPlayState?.[name]===on)return;
   await ui.closePanels();if(touch)await ui.toolbar('system');else await ui.action('tb-system');
   await ui.action('sys-ai');await ui.action(name==='quick'?'ai-quick-val':'ai-auto-val');
   const until=Date.now()+15000;while(!!ui.latest.AutoPlayState?.[name]!==on&&Date.now()<until)await ui.settle(80);
   assert(!!ui.latest.AutoPlayState?.[name]===on,'server automation acknowledgement missing');
   await ui.back();
  };
  const choice=async()=>{
   await page.waitForFunction(()=>sa.field.walk[183*sa.field.width+371]>0,null,{timeout:30000});
   return page.evaluate(async()=>{
    const f=sa.field,s=f.self,url=new URL([...document.querySelectorAll('script[type="module"]')][0].src);
    url.pathname=url.pathname.replace(/main\.js$/,'pathfinding.js');const {gridPath}=await import(url.href);
    let goal=null,wall=null,detour=null;
    for(let y=s.y-9;y<=s.y+9;y++)for(let x=s.x-9;x<=s.x+9;x++){
     if(x<360||x>390||y<170||y>200)continue;
     if(!wall&&f.walk[y*f.width+x]===1)wall={x,y};
     if(f.walk[y*f.width+x]!==2||Math.max(Math.abs(x-s.x),Math.abs(y-s.y))<6)continue;
     const p=gridPath(f.width,f.height,f.walk,s.x,s.y,x,y);
     if(p&&p.length>=6&&p.length<=12&&(!goal||p.length<goal.length))goal={x,y,length:p.length};
     if(p&&p.length>Math.max(Math.abs(x-s.x),Math.abs(y-s.y))+1&&p.length<=12&&(!detour||p.length<detour.length))detour={x,y,length:p.length};
    }return{start:{x:s.x,y:s.y},goal,wall,detour};
   });
  };
  console.log(JSON.stringify({navigation:device,stage:'setup'}));if(touch)await ui.mode('immersive');await ui.noEncounter();await gm('/stat 1000 1000 1000 300');await gm('/heal');await gm('/warp 300 371 183');
  await openMap();
  console.log(JSON.stringify({navigation:device,stage:'map'}));const picked=await choice();if(!await page.evaluate(()=>JSON.parse(localStorage.getItem('sa.settings')??'{}').minimap))await ui.action('map-mini');assert(picked.goal&&picked.wall,'known reachable exact goal/wall unavailable');
  await form('42.5','17');
  assert(await page.evaluate(()=>sa.field.target===null&&sa.field.navigationStatus.includes('整数')),'fractional coordinate was accepted');
  await form(picked.wall.x,picked.wall.y);
  assert(await page.evaluate(()=>sa.field.target===null&&sa.field.navigationStatus.includes('不可达')),'wall target was accepted');
  await page.getByLabel('目的地东坐标 X',{exact:true}).scrollIntoViewIfNeeded();await ui.snapshot(`${device}-coordinate-form`);
  const exactGoal=picked.detour??picked.goal;await form(exactGoal.x,exactGoal.y);
  await page.waitForFunction(g=>sa.field.self.x===g.x&&sa.field.self.y===g.y&&sa.field.navigationStatus==='已到达目标',exactGoal,{timeout:45000});
  assert(await page.locator('input:visible').count()===0,'coordinate native inputs remained over field');
  await ui.snapshot(`${device}-exact-arrival`);
  const exactArrival=await ui.position();if(!touch){await ui.action('mini-coordinates');await page.getByLabel('目的地东坐标 X',{exact:true}).waitFor({state:'visible',timeout:15000});assert(await page.evaluate(()=>sa.field.target===null),'opening the coordinate map leaked the same click into navigation');await ui.action('map-close');await page.waitForFunction(()=>!sa.screen.menus.mapOpen&&sa.ui.getMobileActions().some(h=>h.id==='mini-navigate'),null,{timeout:15000});
   const goal=(await choice()).goal,point=await page.evaluate(g=>{const h=sa.ui.getMobileActions().find(h=>h.id==='mini-navigate'),r=document.getElementById('view').getBoundingClientRect(),me=sa.field.self,dx=g.x-me.x,dy=g.y-me.y;return{x:r.x+((h.x1+h.x2)/2+3*(dx+dy))*r.width/800,y:r.y+((h.y1+h.y2)/2+2.25*(dy-dx))*r.height/600};},goal);
   await page.mouse.click(point.x,point.y);await page.waitForFunction(g=>sa.field.self.x===g.x&&sa.field.self.y===g.y&&sa.field.navigationStatus==='已到达目标',goal,{timeout:45000});
   results.checks.push({case:'desktop actual minimap pointer navigation',passed:true,evidence:{goal,arrival:await ui.position()}});}
  // Enable quick through its actual settings row. Restore encounters via GM,
  // then let ordinary Move -> encounter -> battle -> field execute every step.
  console.log(JSON.stringify({navigation:device,stage:'quick'}));await flag('quick',true);await gm('/warp 300 371 183');await gm('/heal');
  await ui.gm('/noenc');assert(ui.lastChat.includes('恢复遇敌'),'encounter toggle did not enable real random encounters');
  await openMap();const quickGoal=(await choice()).goal;assert(quickGoal,'quick route missing');
  const beforeStarts=traffic.starts,beforeEnds=traffic.ends,beforeMoves=traffic.moves.length;
  await form(quickGoal.x,quickGoal.y);
  if(touch){await page.setViewportSize({width:844,height:390});await ui.settle(450);await page.setViewportSize({width:390,height:844});}
  await page.waitForFunction(g=>!sa.battle&&sa.field.self.x===g.x&&sa.field.self.y===g.y&&sa.field.navigationStatus==='已到达目标',quickGoal,{timeout:120000});
  assert(traffic.starts>beforeStarts&&traffic.ends>beforeEnds,'quick route never encountered a real battle');
  assert(traffic.movesDuringBattle===0,'field Move was emitted during an actual server battle');
  const quickTraffic={starts:traffic.starts-beforeStarts,ends:traffic.ends-beforeEnds,moves:traffic.moves.slice(beforeMoves)};const quickArrival=await ui.position();await ui.snapshot(`${device}-quick-battle-resumed-arrival`);
  await ui.noEncounter();
  // Manual/visible combat keeps its intentional stop behavior.
  console.log(JSON.stringify({navigation:device,stage:'normal'}));await flag('quick',false);await flag('autoBattle',true);await gm('/warp 300 371 183');await gm('/heal');
  await ui.gm('/noenc');assert(ui.lastChat.includes('恢复遇敌'),'manual path encounter toggle missing');
  await openMap();const normalGoal=(await choice()).goal;
  await form(normalGoal.x,normalGoal.y);
  await page.waitForFunction(()=>!!sa.battle,null,{timeout:15000});
  assert(await page.evaluate(()=>sa.field.target===null),'visible battle retained an old route');
  await ui.fieldReady(120000);await ui.settle(500);
  const normalStopped=await ui.position();
  assert(normalStopped.x!==normalGoal.x||normalStopped.y!==normalGoal.y,'visible combat unexpectedly resumed navigation');
  await ui.noEncounter();await ui.closePanels();await flag('autoBattle',false);
  const evidence={device,viewport:page.viewportSize(),picked,exactGoal,exactArrival,quickGoal,quickArrival,quickBattleStarts:quickTraffic.starts,quickBattleEnds:quickTraffic.ends,quickRouteMoves:quickTraffic.moves,movesDuringBattle:traffic.movesDuringBattle,normalGoal,normalStopped,errors:ui.errors};
  results.navigation.push(evidence);results.checks.push({case:`${device} exact coordinate navigation, quick encounter resume, normal combat stop`,passed:true,evidence});
  writeFileSync(resolve(out,`${variant}-${device}-navigation.json`),JSON.stringify(evidence,null,2)+'\n');
  assert(!ui.errors.length,'browser console/page error');
  if(!touch)await context.close();
 }
 return lastUi;
}
