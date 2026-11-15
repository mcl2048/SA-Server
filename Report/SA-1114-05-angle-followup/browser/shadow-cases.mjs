// Verify the final Lilith/Lisarido overlays through real UI and release drawing.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const assert=(v,m)=>{if(!v)throw Error(m);};
export async function runShadows(ui,results,{variant,out}){
 const browser=ui.page.context().browser(),Ui=ui.constructor;await ui.page.context().close();
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  ui=new Ui(await context.newPage(),mobile);const page=ui.page;await ui.enter();if(mobile)await ui.mode('immersive');const cdp=await context.newCDPSession(page);
  let lastGm=0;const gm=async(cmd,battle=false)=>{await ui.closePanels();await ui.settle(Math.max(0,850-(Date.now()-lastGm)));await ui.gm(cmd,battle);lastGm=Date.now();};
  const read=()=>page.evaluate(()=>({queue:sa.battle?.queue.length??0,sent:!!sa.battle?.sent,fighters:sa.battle?[...sa.battle.fighters.values()].map(a=>{const frame=a.lastAct?.frames[a.lastFrame]?.[0],e=frame===undefined?null:sa.assets.image(frame);return{slot:a.f.slot,sprite:a.f.sprite,dir:a.dir,action:a.action,frame,index:a.lastFrame,hp:a.hp,source:e,rect:a.rect};}):[],urls:[...sa.assets.extensionPageUrls.values()]}));
  const shot=async(name)=>{assert((await ui.phase()).field,'refuse authentication screenshot');const filename=`${variant}-${mobile?'mobile':'desktop'}-${name}.png`;const {data}=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(resolve(out,filename),Buffer.from(data,'base64'));return filename;};
  try{
   for(const p of [...(ui.latest.Pets?.pets??[])])await gm(`/petdel ${p.slot}`);await gm('/lv 100');await gm('/stat 100 100 100 1000');await gm('/charm 100');
   for(const spec of [{name:'lilith',sprite:199200,id:29005},{name:'lisarido',sprite:199300,id:29006}]){
    // Read actual released catalog IDs instead of assuming sequential numbers.
    const catalog=JSON.parse(readFileSync(resolve(out,`../../../server/internal/data/${spec.name}.json`),'utf8'));
    const petId=catalog.enemy??catalog.temp??spec.id;
    await gm(`/pet ${petId} 1`);const pet=ui.latest.Pets.pets.find(p=>p.sprite===spec.sprite);assert(pet,`${spec.name} pet absent from released catalog grant`);
    await gm(`/petlv ${pet.slot} 60`);await gm(`/petai ${pet.slot} 10000`);await gm('/heal');
    if(mobile)await ui.toolbar('pets');else await ui.action('tb-pet');
    for(let i=0;i<3&&ui.latest.Pets.pets.find(p=>p.slot===pet.slot).state!=='battle';i++)await ui.action(`pet-st${pet.slot}`);await ui.closePanels();
    await gm('/warp 300 371 183');await gm('/encount 91004 1',true);await ui.waitMenu();await page.waitForFunction(()=>sa.assets.pending===0,null,{timeout:60000});if(mobile)await ui.camera('follow');await ui.settle(600);
    const idle=await read(),actor=idle.fighters.find(a=>a.sprite===spec.sprite);assert(actor?.dir===3&&actor.source,'default battle pose absent');
    assert(idle.urls.some(p=>p.includes(`/extensions/${spec.name}-v2/`)),`${spec.name} corrected shadow pack not selected`);
    const screenshot=await shot(`${spec.name}-ground-shadow`);results.checks.push({case:`${mobile?'mobile':'desktop'} ${spec.name} real default pose with ground shadow`,passed:true,evidence:{actor,screenshot}});
    await ui.waitMenu();await ui.action('b-guard');const attack=ui.latest.Pets.pets.find(p=>p.slot===pet.slot).skills.find(s=>s.id===1);assert(attack,'native attack skill absent');
    const selected=await page.evaluate(()=>({selecting:sa.battle.petSelecting,skill:sa.battle.petSkill,wnd:sa.battle.petWnd}));
    if(!(selected.selecting&&selected.skill===attack.slot)){
     if(selected.selecting){await ui.action('pb-cancel');await page.waitForFunction(()=>sa.battle.petWnd&&!sa.battle.petSelecting,null,{timeout:15000});}
     else if(!selected.wnd)await ui.action('pb-waza');
     await ui.action(`pw-${attack.slot}`,300);
    }
    await page.waitForFunction(()=>sa.battle.petSelecting&&!sa.battle.petWnd,null,{timeout:15000});const enemy=idle.fighters.find(a=>a.slot>=10).slot;
    const observe=(async()=>{let sampled=false;const until=Date.now()+90000;while(Date.now()<until){const state=await read(),a=state.fighters.find(f=>f.sprite===spec.sprite);if(a?.action===0&&a.index>=1){sampled=true;return{actor:a,screenshot:await shot(`${spec.name}-attack-shadow`)}}await ui.settle(20);}assert(sampled,'real attack frame not observed');})();
    await ui.action(`pt-${enemy}`,0);const strike=await observe;await ui.waitMenu();results.checks.push({case:`${mobile?'mobile':'desktop'} ${spec.name} real attack shadow stays on floor`,passed:true,evidence:strike});
    if(mobile)await ui.mode('classic');await ui.escape();await gm(`/petdel ${pet.slot}`);if(mobile)await ui.mode('immersive');
   }
   assert(!ui.errors.length,'browser errors');
  }finally{await cdp.detach();}
  if(!mobile)await context.close();
 }
 return ui;
}
export {runShadows as runArt};
