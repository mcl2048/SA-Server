// Actual ELF, native GM requests and native mouse/touch controls. evaluate is
// read-only: observe real wire events, Fighter frames and submitted draw quads.
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export async function runPrimalPanelProbe(ui,results){
 const browser=ui.page.context().browser(),UiClass=ui.constructor;await ui.page.context().close();
 const context=await browser.newContext({viewport:{width:1280,height:900}});ui=new UiClass(await context.newPage(),false);await ui.enter();
 for(let round=0;round<6;round++){
  for(const p of [...(ui.latest.Pets?.pets??[])])await ui.gm(`/petdel ${p.slot}`);
  const id=round%2?29018:29017,sprite=round%2?199401:199400;await ui.gm(`/pet ${id} 30`);
  const pet=ui.latest.Pets.pets.find(p=>p.sprite===sprite);assert(pet,"native adult grant absent");
  await ui.action("tb-pet");await ui.action(`pet-name${pet.slot}`);await ui.action("pet-waza");
  await ui.closePanels();assert(await ui.page.evaluate(()=>sa.screen.openCount()===0),"native repeated pet close did not reach field");
  await ui.gm(`/petdel ${pet.slot}`);results.checks.push({case:`desktop native pet skills/details/list close ${round+1}`,passed:true});console.log(JSON.stringify({panel_probe:round+1}));
 }
 return ui;
}
export async function runPrimal(ui,results,{variant,out}) {
 const browser=ui.page.context().browser(),UiClass=ui.constructor;results.primal=[];
 await ui.page.context().close();
 for(const mobile of [false,true]){
  const device=mobile?"mobile":"desktop",context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  ui=new UiClass(await context.newPage(),mobile);await ui.enter();if(mobile)await ui.mode("immersive");
  const page=ui.page,wire=[],sent=[],cdp=await context.newCDPSession(page);
  const received=({response})=>{let m;try{m=JSON.parse(response.payloadData);}catch{return;}
   if(m.t==="BattleStart")wire.push({t:m.t,mySlot:m.mySlot,fighters:(m.fighters??[]).map(f=>Object.fromEntries(["slot","sprite","hp","maxHp","level","ownerSlot","bagSlot","defenseBoost","defenseTurns"].map(k=>[k,f[k]??0])))});
   if(m.t==="BattleTurn")wire.push({t:m.t,turn:m.turn,events:(m.events??[]).map(e=>Object.fromEntries(["actor","kind","target","guardian","result","skill","damage","hp","actorHp","status","effect","combo","dead","fly","stat","statVal","statTurns"].map(k=>[k,e[k]??(["kind","result","skill"].includes(k)?"":0)])))});
   if(m.t==="BattleEnd")wire.push({t:m.t,result:m.result});
  };
  const transmitted=({response})=>{let m;try{m=JSON.parse(response.payloadData);}catch{return;}if(m.t==="BattlePetCommand")sent.push({t:m.t,skill:m.skill,target:m.target,petSlot:m.petSlot});};
  cdp.on("Network.webSocketFrameReceived",received);cdp.on("Network.webSocketFrameSent",transmitted);await cdp.send("Network.enable");
  const wait=async(read,message,timeout=30000)=>{const end=Date.now()+timeout;while(Date.now()<end){const v=await read();if(v)return v;await ui.settle(45);}throw Error(`${device}: ${message}`);};
  const menu=async name=>{await ui.closePanels();if(name==="album"){await page.locator("body").focus();await page.keyboard.press("Control+a");await ui.settle();}else if(mobile)await ui.toolbar(name);else await ui.action({pets:"tb-pet",system:"tb-system"}[name]);};
  const flag=async(name,wanted)=>{if(!!ui.latest.AutoPlayState?.[name]===wanted)return;await menu("system");await ui.action("sys-ai");await ui.action("ai-tab-基本");const ack=ui.ack;await ui.action({quick:"ai-quick-val",autoBattle:"ai-auto-val",encounter:"ai-enc-val"}[name]);await wait(()=>ui.ack>ack&&!!ui.latest.AutoPlayState?.[name]===wanted,`${name} native acknowledgement absent`);await ui.action("ai-close");};
  let lastGm=0;const gm=async(text,battle=false)=>{await ui.closePanels();await ui.settle(Math.max(0,800-(Date.now()-lastGm)));await ui.gm(text,battle);lastGm=Date.now();};
  const record=(name,evidence)=>{results.checks.push({case:`${device} ${name}`,passed:true,evidence});console.log(JSON.stringify({variant,primal_case:`${device} ${name}`}));};
  try{
   for(const name of ["quick","autoBattle","encounter"])await flag(name,false);
   for(const p of [...(ui.latest.Pets?.pets??[])])await gm(`/petdel ${p.slot}`);
   await gm("/lv 100");await gm("/stat 100 100 100 1000");await gm("/charm 100");
   for(const spec of [{sprite:199400,id:29007,adult:29017,name:"萨鲁法斯",attrs:[50,0,0,50],album:576,tag:"cyrufas"},{sprite:199401,id:29008,adult:29018,name:"克劳德斯",attrs:[0,50,50,0],album:577,tag:"claudes"}]){
    const screenshotName=name=>`${variant}-${spec.tag}-${device}-${name}.png`;
    const shot=async name=>{assert((await ui.phase()).field,"refuse authentication screenshots");return page.screenshot({path:resolve(out,screenshotName(name))});};
    let camera={preference:"desktop",control:null,input:null};
    const view=()=>page.evaluate(sprite=>{
     const b=sa.battle,a=b&&[...b.fighters.values()].find(f=>f.f.sprite===sprite&&f.f.ownerSlot===b.me);
     const images=sa.assets.extensionImages,pages=sa.assets.pages;
     const canvas=document.getElementById("view").getBoundingClientRect(),scale=canvas.width/800;
     const project=q=>{
      const screen={x:canvas.x+q.x*scale,y:canvas.y+q.y*scale,w:q.w*scale,h:q.h*scale};
      const area=Math.max(0,Math.min(innerWidth,screen.x+screen.w)-Math.max(0,screen.x))*Math.max(0,Math.min(innerHeight,screen.y+screen.h)-Math.max(0,screen.y));
      return{...screen,visibleRatio:area/Math.max(1,screen.w*screen.h),centerVisible:screen.x+screen.w/2>=0&&screen.x+screen.w/2<=innerWidth&&screen.y+screen.h/2>=0&&screen.y+screen.h/2<=innerHeight};
     };
     // A fresh local lookup is read-only and avoids scanning every atlas entry
     // for every quad while short native impact frames are playing.
     const lookup=new Map();for(const [id,e] of images){if(e.set!==5)continue;const tex=pages.get(`5/${e.page}`)?.tex;if(tex===undefined)continue;let entries=lookup.get(tex);if(!entries){entries=new Map();lookup.set(tex,entries);}entries.set(`${e.x}/${e.y}/${e.w}/${e.h}`,id);}
     const quads=sa.ui.quads.flatMap(q=>{const id=lookup.get(q.tex)?.get(`${q.u}/${q.v}/${q.w}/${q.h}`);return id===undefined?[]:[{image:id,x:q.x,y:q.y,w:q.w,h:q.h,screen:project(q)}];});
     const fxImages=new Set(sa.assets.anims.get(199402)?.actions.flatMap(a=>a.frames.map(f=>f[0]))??[]);
     return{battle:!!b,now:performance.now(),queue:b?.queue.length??0,sent:!!b?.sent,focus:b?.cameraSlot??-1,viewport:{width:innerWidth,height:innerHeight},
      actor:a?{slot:a.f.slot,x:a.x,y:a.y,homeX:a.homeX,homeY:a.homeY,dir:a.dir,action:a.action,index:a.lastFrame,frame:a.lastAct?.frames[a.lastFrame]?.[0]??-1,hp:a.hp,defenseBoost:a.defenseBoost,defenseTurns:a.defenseTurns}:null,
      targets:b?[...b.fighters.values()].filter(f=>(f.f.slot<10)!==(b.me<10)).map(f=>({slot:f.f.slot,hp:f.hp,status:f.status,dead:f.dead,gone:f.gone,x:f.x,y:f.y})):[],
      quads,claws:quads.filter(q=>fxImages.has(q.image)),loaded:sa.assets.extensionAnims.has(sprite)&&sa.assets.extensionAnims.has(199402),
      texts:sa.ui.texts.map(t=>t.text)};
    },spec.sprite);
    let battleMemoChecked=false;
    const choose=async(id,target=16)=>{
     await ui.waitMenu();await ui.action("b-guard");const s=ui.latest.Pets?.pets.find(p=>p.sprite===spec.sprite)?.skills.find(s=>s.id===id);assert(s,`${spec.name} skill${id} absent from actual PetInfo`);
     const actions=await ui.actions();if(!actions.some(h=>h.id===`pw-${s.slot}`)){if(actions.some(h=>h.id==="pb-cancel"))await ui.action("pb-cancel");else await ui.action("pb-waza");}
     if(id===29060&&!battleMemoChecked){
      assert((await ui.actions()).some(h=>h.id==="pw-memo-next"),"native battle memo pagination action missing");
      const before=await page.evaluate(()=>sa.ui.texts.filter(t=>t.x===476&&[353,373,393].includes(t.y)).map(t=>t.text).join(""));
      await ui.action("pw-memo-next");const after=await page.evaluate(()=>sa.ui.texts.filter(t=>t.x===476&&[353,373,393].includes(t.y)).map(t=>t.text).join(""));
      assert(before&&after&&before!==after,"native battle memo pager did not advance");await shot("battle-skill-memo-page2");battleMemoChecked=true;
     }
     if(s.target===5)return()=>ui.action(`pw-${s.slot}`,0); // Native no-target guard sends itself on the skill click.
     for(let attempt=0;attempt<3;attempt++){await ui.action(`pw-${s.slot}`,250);if(!(await ui.actions()).some(h=>h.id===`pw-${s.slot}`))break;}
     await wait(async()=>(await ui.actions()).some(h=>/^pt-\d+$/.test(h.id)),"native pet target selection absent");
     const actionsNow=await ui.actions(),preferred=`pt-${id===2?(await view()).actor.slot:target}`;
     assert(actionsNow.some(h=>h.id===preferred),`native target ${preferred} missing`);return preferred;
    };
    const observe=async(target,kind)=>{
     const from=wire.length,requestFrom=sent.length,samples=[],captured=new Set(),screens=[],captures=[];let done=false;
     const sampler=async()=>{const until=Date.now()+90000;while(!done&&Date.now()<until){const v=await view();samples.push(v);
      if(v.actor){const impact=v.actor.action===0&&[5,6,7].includes(v.actor.index),visibleActor=v.quads.some(q=>q.image===v.actor.frame&&q.screen.centerVisible&&q.screen.visibleRatio>=.8);const labels=[...(impact&&visibleActor?[`${kind}-left-claw`]:[]),...(v.claws.some(q=>q.screen.visibleRatio>=.35)?[`${kind}-red-impact`]:[])].filter(label=>!captured.has(label));
       // Rising poses remain in read-only samples. Do not send a screenshot
       // request before impact: software composition can skip that short pose.
       for(const label of labels){captured.add(label);captures.push({label,screenshot:screenshotName(label),now:v.now,actor:v.actor,actorQuad:v.quads.find(q=>q.image===v.actor.frame&&q.screen.centerVisible&&q.screen.visibleRatio>=.8)??null,redEffects:v.claws.filter(q=>q.screen.visibleRatio>=.35)});}
       if(labels.length)screens.push(shot(labels[0]).then(buffer=>{for(const label of labels.slice(1))writeFileSync(resolve(out,screenshotName(label)),buffer);}));}
      if(wire.slice(from).some(m=>m.t==="BattleTurn")&&v.queue===0&&!v.sent)break;await ui.settle(25);
     }};
     const observing=sampler();try{if(typeof target==="function")await target();else await ui.action(target,0);await observing;}finally{done=true;await observing;}await Promise.all(screens);
     const events=wire.slice(from).filter(m=>m.t==="BattleTurn"),requests=sent.slice(requestFrom);results.primalDiagnostic={device,pet:spec.tag,kind,events,samples,captured:[...captured],captures,requests};
     assert(events.length&&requests.length,"native command did not produce an actual turn");return{events,samples,captured:[...captured],captures,requests};
    };
    await gm(`/pet ${spec.id} 1`);let pet=await wait(()=>ui.latest.Pets?.pets.find(p=>p.sprite===spec.sprite),"GM hatchling grant absent");
    assert(pet.level===1&&pet.skills.some(s=>s.id===29060),"level-one pet must learn shared skill from server");
    await gm(`/petlv ${pet.slot} 60`);await gm(`/petai ${pet.slot} 10000`);await gm("/heal");
    await menu("pets");await shot("pet-list");await ui.action(`pet-name${pet.slot}`);await wait(async()=>{const v=await view();return v.loaded&&v.quads.length;},"new native atlas not drawn in pet details");
    const details=await page.evaluate(sprite=>{const p=sa.screen.menus.pets.pets.find(p=>p.sprite===sprite);return{slot:p.slot,name:p.name,sprite:p.sprite,level:p.level,attrs:p.attrs,atk:p.atk,def:p.def,agi:p.agi,maxHp:p.maxHp,skills:p.skills.map(s=>({id:s.id,slot:s.slot,name:s.name,target:s.target,memo:s.memo})),std:p.ext.std,grow:p.ext.grow};},spec.sprite);
    assert(details.name===spec.name&&details.attrs.join(",")===spec.attrs.join(",")&&details.skills.some(s=>s.id===29060),"real stats/skills differ from registry");
    await shot("pet-detail");await ui.action("pet-snap");await ui.action("pet-waza");await shot("pet-skills");
    // Both pets share the same description and native pager may remember it.
    // Return through visible controls before reading every page in order.
    for(let i=0;i<30;i++){const index=await page.evaluate(()=>Number((sa.ui.texts.find(t=>t.x===114&&t.y===236)?.text??"").split("/")[0]));if(index===1)break;await ui.action("pet-memo-prev");}
    const memoPages=[];for(let i=0;i<30;i++){
     const v=await page.evaluate(()=>({lines:sa.ui.texts.filter(t=>t.x===36&&[256,276,296].includes(t.y)).map(t=>t.text),page:sa.ui.texts.find(t=>t.x===114&&t.y===236)?.text??""}));
     memoPages.push(v);const [index,total]=v.page.split("/").map(Number);assert(index>0&&total>1,"native memo page count missing");if(index===total)break;await ui.action("pet-memo-next");
    }
    assert(memoPages.flatMap(p=>p.lines).join("")===details.skills.find(s=>s.id===29060).memo.trim(),"native touch/desktop pages do not expose the complete skill description");await shot("pet-skills-last-page");
    await menu("album");
    for(let i=0;i<73&&!(await ui.actions()).some(a=>a.id===`album-${spec.album}`);i++)await ui.action("album-prev");
    await ui.action(`album-${spec.album}`);await shot("album-story");
    const album=await page.evaluate(()=>({lines:sa.ui.texts.filter(t=>t.x===298).map(t=>t.text),portraits:sa.ui.portraits.map(p=>({image:p.image,rawIndex:p.rawIndex}))}));
    assert(album.lines.join("").includes(spec.sprite===199400?"ChatGPT":"Claude"),"native appended album story missing");await ui.action("album-close");
    record(`${spec.name} native list, detail, hatchling skill and page73 story`,{details,album,memoPages});
    await menu("pets");for(let i=0;i<3&&ui.latest.Pets.pets.find(p=>p.slot===pet.slot).state!=="battle";i++)await ui.action(`pet-st${pet.slot}`);assert(ui.latest.Pets.pets.find(p=>p.slot===pet.slot).state==="battle","native deployment failed");
    // Make the deployed pet lose HP through the ordinary enemy attack resolver.
    // This enemy's native tactics prefer pets; no page state or DB is edited.
    await gm("/encount 90006 60",true);await ui.waitMenu();let injury=[];
    for(let round=0;round<10;round++){
     const state=await view();if(state.actor.hp<=details.maxHp-80)break;
     const turn=await observe(await choose(2,state.actor.slot),`injury-${round}`);injury.push(turn.events);
    }
    const wounded=await view();assert(wounded.actor&&wounded.actor.hp>0&&wounded.actor.hp<details.maxHp,"native pet-targeting attack did not create real HP loss");
    await ui.escape();await gm("/warp 300 450 230");let start;
    for(let attempt=0;attempt<12;attempt++){const from=wire.length;await gm("/encount",true);start=await wait(()=>wire.slice(from).find(m=>m.t==="BattleStart"),"native encounter absent");if(start.fighters.filter(f=>f.slot>=10).length>=7)break;await ui.escape();await ui.closePanels();}
    assert(start.fighters.filter(f=>f.slot>=10).length>=7,"native picker never provided both rows for cross coverage");
    await ui.waitMenu();if(mobile){
     await ui.camera("follow");const tray=page.locator('[data-mobile-control="menu-tray"]:visible');if(await tray.count()&&await tray.getAttribute("aria-expanded")==="true"){await tray.tap();await ui.settle(250);}
     camera={preference:"follow",control:"camera-follow",input:"native tap"};
    }
    const idle=[];for(let i=0;i<12;i++){idle.push(await view());await ui.settle(100);}await shot("battle-idle");
    assert(new Set(idle.map(v=>v.actor?.frame)).size>=3,"idle tail/eye animation never advanced through native drawn frames");
    const attack=await observe(await choose(1),"attack");
    assert(attack.samples.some(v=>v.actor?.action===4&&Math.hypot(v.actor.x-v.actor.homeX,v.actor.y-v.actor.homeY)>20),"native run/crawl movement missing");
    assert(attack.samples.some(v=>v.actor?.action===0&&[5,6,7].includes(v.actor.index)&&v.quads.some(q=>q.image===v.actor.frame&&q.screen.centerVisible&&q.screen.visibleRatio>=.8)),"native left claw impact was not mostly visible in the actual viewport");
    const settled=await view();assert(settled.actor&&Math.hypot(settled.actor.x-settled.actor.homeX,settled.actor.y-settled.actor.homeY)<1,"pet did not return home");
    const visibilityOf=observed=>({camera,viewport:observed.samples[0].viewport,thresholds:{actorVisibleRatio:.8,actorCenterVisible:true,redEffectVisibleRatio:.35},actorEvidence:observed.captures.filter(c=>c.label.endsWith("left-claw")).map(c=>({frame:c.actor.frame,index:c.actor.index,screen:c.actorQuad.screen,screenshot:c.screenshot})),redEffectEvidence:observed.captures.filter(c=>c.label.endsWith("red-impact")).flatMap(c=>c.redEffects.map(q=>({frame:q.image,screen:q.screen,screenshot:c.screenshot}))),visibleRedFrames:[...new Set(observed.samples.flatMap(v=>v.claws.filter(q=>q.screen.visibleRatio>=.35).map(q=>q.image)))]});
    record(`${spec.name} native idle, run/crawl, left-claw strike and return`,{idleFrames:[...new Set(idle.map(v=>v.actor.frame))],captured:attack.captured,renderedAttackFrames:[...new Set(attack.samples.filter(v=>v.actor?.action===0).map(v=>v.actor.frame))],visibility:visibilityOf(attack)});
    const beforeCross=await view();
    const cross=await observe(await choose(29060),"cross"),events=cross.events.flatMap(t=>t.events),hits=events.filter(e=>e.kind==="attack"&&e.effect===199402);
    // The real native slot16 has neighbors15,17,11, all present with >=7 enemies.
    assert(hits.map(e=>e.target).join(",")==="16,15,17,11","actual shared skill did not use center/left/right/other row, or wrapped");
    assert(hits.every(e=>e.kind==="attack"&&e.skill==="赤爪裂阵"),"shared skill bypassed native physical events");
    assert(cross.samples.some(v=>v.actor?.action===0&&[5,6,7].includes(v.actor.index)&&v.quads.some(q=>q.image===v.actor.frame&&q.screen.centerVisible&&q.screen.visibleRatio>=.8)),"shared claw actor was not mostly visible in the actual viewport");
    const visibleClaws=cross.samples.flatMap(v=>v.claws.filter(q=>q.screen.visibleRatio>=.35));assert(visibleClaws.length&&new Set(visibleClaws.map(q=>q.image)).size>1,"red shared claw atlas was not clearly visible and advancing in the actual viewport");
    const totalActual=hits.reduce((sum,e)=>{const old=beforeCross.targets.find(t=>t.slot===(e.guardian>=0?e.guardian:e.target));return sum+(old&&!['reflect','absorb','vanish','dodge','miss'].includes(e.result)?Math.max(0,old.hp-e.hp):0);},0);
    const lifesteal=events.find(e=>e.kind==="heal"&&e.effect===199402&&e.actor===e.target);
    assert(lifesteal&&lifesteal.damage>0,"real shared cast never emitted a positive self-heal");
    assert(lifesteal.damage===Math.min(details.maxHp-beforeCross.actor.hp,Math.floor(totalActual*18/1000)),"real self-heal does not equal capped floor(total actual HP loss × 1.8%)");
    assert(lifesteal.hp===beforeCross.actor.hp+lifesteal.damage&&lifesteal.actorHp===lifesteal.hp,"self-heal HP delta differs from authoritative amount");
    assert(cross.samples.some(v=>v.actor?.hp===lifesteal.hp),"authoritative self-heal never reached native Fighter HP");
    const boost=events.find(e=>e.kind==="stat"&&e.stat===39&&e.statTurns===5);assert(boost&&boost.statVal>=30&&boost.statVal<=60,"authoritative defense boost missing");
    const buff=await view();assert(buff.actor.defenseBoost===boost.statVal&&buff.actor.defenseTurns===4&&buff.texts.some(t=>t===`防御 +${boost.statVal}% · 4回合`),"native display did not show authoritative percent and remaining turns");await shot("defense-remaining4");
    record(`${spec.name} actual cross neighbors, red impact, 1.8% self-heal and server defense timer`,{events,captured:cross.captured,boost:buff.actor,lifesteal,totalActual,preCastHp:beforeCross.actor.hp,injury,visibility:visibilityOf(cross)});
    const countdown=[];for(let i=0;i<4;i++){const turn=await observe(await choose(2),`guard-${i}`);countdown.push({events:turn.events,state:(await view()).actor});}
    assert(countdown.map(t=>t.state.defenseTurns).join(",")==="3,2,1,0","server five-turn defense lifecycle did not reach client");assert(countdown.at(-1).state.defenseBoost===0,"expired defense boost remained visible");
    assert(countdown.flatMap(t=>t.events.flatMap(e=>e.events)).some(e=>e.kind==="stat"&&e.statVal===-boost.statVal&&e.statTurns===0),"authoritative expiry event missing");
    record(`${spec.name} real defense countdown and expiry`,countdown);
    if((await ui.phase()).battle)await ui.escape();await gm(`/petdel ${pet.slot}`);await gm(`/pet ${spec.adult} 30`);
    const adult=await wait(()=>ui.latest.Pets?.pets.find(p=>p.sprite===spec.sprite),"native adult pet grant absent");assert(adult.level===30&&adult.skills.map(s=>s.id).join(",")==="1,2","adult individual inherited hatchling-only skill");
    await menu("pets");await ui.action(`pet-name${adult.slot}`);await ui.action("pet-waza");await shot("adult-only-attack-guard");
    record(`${spec.name} adult wire and native skill menu contain only attack/guard`,{level:adult.level,skills:adult.skills});
    results.primal.push({device,pet:spec.tag,details,album,start,idle,attack,cross,countdown,adult:{level:adult.level,skills:adult.skills},visibility:{camera,attack:visibilityOf(attack),cross:visibilityOf(cross)}});
    await gm(`/petdel ${adult.slot}`);await gm("/heal");assert(!ui.errors.length,`${device}: browser errors occurred`);
   }
  }finally{cdp.off("Network.webSocketFrameReceived",received);cdp.off("Network.webSocketFrameSent",transmitted);await cdp.detach();}
  if(!mobile)await context.close();
 }
 return ui;
}
