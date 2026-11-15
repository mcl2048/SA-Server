// Read actual fighter/atlas/draw geometry. All mutations use native UI/GM chat.
import {resolve} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export async function runArt(ui,results,{variant,out}){
 const browser=ui.page.context().browser(),Ui=ui.constructor;await ui.page.context().close();
 const record=(name,evidence)=>{results.checks.push({case:name,passed:true,evidence});console.log(JSON.stringify({art_case:name}));};
 results.art=[];
 const entries=new Map(JSON.parse(readFileSync(resolve(out,'../../../assets/extensions/primal-claws-v3/manifest.json'),'utf8')).images.map(r=>[r[0],r]));
 const finalFrame=a=>{const e=entries.get(a.frame);return e&&a.source.w===e[4]&&a.source.h===e[5]&&a.source.ox===e[6]&&a.source.oy===e[7];};
 const requests=[];results.assetRequests=requests;
 for(const mobile of [false,true]){
  const device=mobile?'mobile':'desktop',context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  const pageForArt=await context.newPage();pageForArt.on('request',r=>{const path=new URL(r.url()).pathname;if(path.includes('/extensions/primal-claws-'))requests.push(path);});
  ui=new Ui(pageForArt,mobile);await ui.enter();if(mobile)await ui.mode('immersive');
  const page=ui.page,cdp=await context.newCDPSession(page);
  let lastGm=0;
  const gm=async(cmd,battle=false)=>{await ui.closePanels();await ui.settle(Math.max(0,850-(Date.now()-lastGm)));await ui.gm(cmd,battle);lastGm=Date.now();};
  const read=()=>page.evaluate(()=>{
   const b=sa.battle,canvas=document.getElementById('view').getBoundingClientRect(),scale=canvas.width/800;
   const project=q=>{const x=canvas.x+q.x*scale,y=canvas.y+q.y*scale,w=q.w*scale,h=q.h*scale;return{x,y,w,h,visible:Math.max(0,Math.min(innerWidth,x+w)-Math.max(0,x))*Math.max(0,Math.min(innerHeight,y+h)-Math.max(0,y))/Math.max(1,w*h)};};
   return{queue:b?.queue.length??0,sent:!!b?.sent,viewport:{width:innerWidth,height:innerHeight},fighters:b?[...b.fighters.values()].map(a=>{
    const frame=a.lastAct?.frames[a.lastFrame]?.[0],e=frame===undefined?null:sa.assets.image(frame),tex=e&&sa.assets.pages.get(`${e.set}/${e.page}`)?.tex;
    const q=e&&sa.ui.quads.find(q=>q.tex===tex&&q.u===e.x&&q.v===e.y&&q.w===e.w&&q.h===e.h);
    return{slot:a.f.slot,sprite:a.f.sprite,owner:a.f.ownerSlot,hp:a.hp,dir:a.dir,action:a.action,index:a.lastFrame,frame,x:a.x,y:a.y,homeX:a.homeX,homeY:a.homeY,source:e?{w:e.w,h:e.h,ox:e.ox,oy:e.oy}:null,quad:q?project(q):null};
   }):[],pack:[199400,199401,199402].map(s=>({sprite:s,loaded:sa.assets.extensionAnims.has(s)}))};
  });
  const shot=async name=>{assert((await ui.phase()).field,'refuse authentication screenshot');const file=`${variant}-${device}-${name}.png`;const {data}=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(resolve(out,file),Buffer.from(data,'base64'));return file;};
  try{
   for(const p of [...(ui.latest.Pets?.pets??[])])await gm(`/petdel ${p.slot}`);
   await gm('/lv 100');await gm('/stat 100 100 100 1000');await gm('/charm 100');
   for(const spec of [{name:'cyrufas',sprite:199400,id:29007,native:100330,nativeEnemy:91002,x:450,y:230},{name:'claudes',sprite:199401,id:29008,native:100286,nativeEnemy:91004,x:371,y:183}]){
    await gm(`/pet ${spec.id} 1`);const pet=ui.latest.Pets.pets.find(p=>p.sprite===spec.sprite);assert(pet,'GM grant absent');
    await gm(`/petlv ${pet.slot} 60`);await gm(`/petai ${pet.slot} 10000`);await gm('/heal');
    if(mobile)await ui.toolbar('pets');else await ui.action('tb-pet');
    for(let i=0;i<3&&ui.latest.Pets.pets.find(p=>p.slot===pet.slot).state!=='battle';i++)await ui.action(`pet-st${pet.slot}`);
    assert(ui.latest.Pets.pets.find(p=>p.slot===pet.slot).state==='battle','native deployment failed');await ui.closePanels();
    await gm(`/warp 300 ${spec.x} ${spec.y}`);
    await gm(`/encount ${spec.nativeEnemy} 1`,true);await ui.waitMenu();const start=await read();
    assert(start.fighters.some(f=>f.sprite===spec.native)&&start.fighters.some(f=>f.sprite===spec.sprite),'actual native comparison opponent absent');
    await page.waitForFunction(()=>sa.assets.pending===0,null,{timeout:60000});await ui.settle(500);
    const screenshots=[];
    const comparison=await read();screenshots.push(await shot(`${spec.name}-native-comparison`));
    assert(comparison.pack.every(p=>p.loaded),'v3 extension did not load');
    assert(comparison.fighters.some(f=>f.sprite===spec.sprite&&f.dir===3&&f.quad),'real allied battle direction absent');
    const alliedPose=comparison.fighters.find(f=>f.sprite===spec.sprite&&f.dir===3);
    assert(finalFrame(alliedPose),'dir3 does not match the final corrected v3 frame');
    assert(Math.abs(alliedPose.quad.w/alliedPose.quad.h-alliedPose.source.w/alliedPose.source.h)<.001,'battle projection stretches dir3');
    record(`${device} ${spec.name} actual dir3 with native reference`,{comparison,screenshot:screenshots.at(-1)});
    const own=state=>state.fighters.find(f=>f.sprite===spec.sprite&&f.owner===ui.latest.BattleStart.mySlot);
    if(mobile){
     await ui.camera('follow');
     const tray=page.locator('[data-mobile-control="menu-tray"]:visible');if(await tray.count()&&await tray.getAttribute('aria-expanded')==='true')await tray.tap();
     for(const viewport of [{width:844,height:390},{width:390,height:844}]){
      await page.setViewportSize(viewport);await ui.settle(850);const v=await read(),a=own(v);
      assert(a?.quad&&a.quad.visible>=.95,'mobile orientation clips the real pet');screenshots.push(await shot(`${spec.name}-${viewport.width>viewport.height?'landscape':'portrait'}-idle`));
      record(`${spec.name} ${viewport.width}x${viewport.height} actual combat visibility`,{actor:a,viewport,screenshot:screenshots.at(-1)});
     }
    }
    await ui.waitMenu();await ui.action('b-guard');
    const attack=ui.latest.Pets.pets.find(p=>p.slot===pet.slot).skills.find(s=>s.id===1);assert(attack,'native attack absent');
    const selected=await page.evaluate(()=>({selecting:sa.battle.petSelecting,skill:sa.battle.petSkill,wnd:sa.battle.petWnd}));
    if(!(selected.selecting&&selected.skill===attack.slot)){
     if(selected.selecting){await ui.action('pb-cancel');await page.waitForFunction(()=>sa.battle.petWnd&&!sa.battle.petSelecting,null,{timeout:15000});}
     else if(!selected.wnd)await ui.action('pb-waza');
     await page.waitForFunction(slot=>sa.battle.petWnd&&sa.ui.getMobileActions().some(h=>h.id===`pw-${slot}`),attack.slot,{timeout:15000});
     await ui.action(`pw-${attack.slot}`,300);
    }
    await page.waitForFunction(slot=>sa.battle.petSelecting&&!sa.battle.petWnd&&sa.battle.petSkill===slot&&sa.ui.getMobileActions().some(h=>/^pt-/.test(h.id)),attack.slot,{timeout:15000});
    const target=start.fighters.find(f=>f.slot>=10&&f.sprite===spec.native).slot;
    const samples=[],captured=new Set();let done=false;
    const observe=(async()=>{const until=Date.now()+90000;while(!done&&Date.now()<until){
     const v=await read(),a=own(v);samples.push(v);
     const label=a?.action===0&&[4,5,6,7].includes(a.index)?'strike':null;
     if(label&&!captured.has(label)&&a.quad?.visible>=.8){captured.add(label);screenshots.push(await shot(`${spec.name}-${label}`));}
     if(samples.some(s=>own(s)?.action===0)&&!v.queue&&!v.sent)break;await ui.settle(25);
    }})();
    try{await ui.action(`pt-${target}`,0);await observe;}finally{done=true;await observe;}
    results.artDiagnostic={device,pet:spec.name,samples};
    assert(samples.some(v=>own(v)?.action===4&&Math.hypot(own(v).x-own(v).homeX,own(v).y-own(v).homeY)>20),'native outbound/return movement missing');
    assert(samples.some(v=>own(v)?.action===0&&[4,5,6,7].includes(own(v).index)&&own(v).quad?.visible>=.8),'claw attack not visible in actual draw');
    await ui.waitMenu();const returned=await read(),a=own(returned);
    assert(Math.hypot(a.x-a.homeX,a.y-a.homeY)<1,'attack did not return to native home');screenshots.push(await shot(`${spec.name}-returned`));
    record(`${device} ${spec.name} walk, articulated strike and return`,{screenshots,frames:[...new Set(samples.map(v=>own(v)?.frame))],returned:a});
    results.art.push({device,pet:spec.name,comparison,samples,returned,screenshots});
    if(mobile)await ui.mode('classic');await ui.escape();await gm(`/petdel ${pet.slot}`);
    // Reverse the actual sides through normal GM pet/encounter requests. The
    // released catalog rejects duplicate sprite templates, so the fixture uses
    // the real primal enemy instead of creating a second artificial template.
    await gm(`/pet ${spec.nativeEnemy} 1`);const nativePet=ui.latest.Pets.pets.find(p=>p.sprite===spec.native);assert(nativePet,'native reference pet absent');
    if(mobile)await ui.toolbar('pets');else await ui.action('tb-pet');
    for(let i=0;i<3&&ui.latest.Pets.pets.find(p=>p.slot===nativePet.slot).state!=='battle';i++)await ui.action(`pet-st${nativePet.slot}`);
    await ui.closePanels();await gm(`/encount ${spec.id} 1`,true);await ui.waitMenu();await page.waitForFunction(()=>sa.assets.pending===0,null,{timeout:60000});await ui.settle(300);
    const reversed=await read();assert(reversed.fighters.some(f=>f.sprite===spec.sprite&&f.dir===7&&f.quad),'real enemy battle direction absent');
    const enemyPose=reversed.fighters.find(f=>f.sprite===spec.sprite&&f.dir===7);
    assert(finalFrame(enemyPose),'dir7 does not match the final corrected v3 frame');
    assert(Math.abs(enemyPose.quad.w/enemyPose.quad.h-enemyPose.source.w/enemyPose.source.h)<.001,'battle projection stretches dir7');
    const reverseShot=await shot(`${spec.name}-enemy-native-comparison`);
    record(`${device} ${spec.name} actual dir7 with native reference`,{comparison:reversed,screenshot:reverseShot});
    await ui.escape();await gm(`/petdel ${nativePet.slot}`);if(mobile)await ui.mode('immersive');
   }
   assert(!ui.errors.length,'browser errors');
  }finally{await cdp.detach();}
  if(!mobile)await context.close();
 }
 assert(requests.some(p=>p.includes('/primal-claws-v3/pages/00000.png'))&&requests.some(p=>p.includes('/primal-claws-v3/pages/00001.png')),'corrected v3 atlas requests absent');
 assert(!requests.some(p=>/primal-claws-v[12]\//.test(p)),'browser still requests obsolete v1/v2');
 results.checks.push({case:'real browser requests v3 only after v1/v2 cleanup',passed:true,evidence:{requests:[...new Set(requests)]}});
 return (await import("./shadow-cases.mjs")).runShadows(ui,results,{variant,out});
}
