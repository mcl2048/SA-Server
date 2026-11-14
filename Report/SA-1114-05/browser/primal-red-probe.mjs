// Supplementary real cast for raster evidence. This is explicitly separate
// from the original 20-case run; no browser business state is written.
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export async function runPrimalRedProbe(ui,results,{variant,out}){
 await ui.mode("immersive");const page=ui.page,cdp=await page.context().newCDPSession(page),events=[],requests=[];
 const incoming=({response})=>{let m;try{m=JSON.parse(response.payloadData);}catch{return;}if(m.t==="BattleTurn")events.push({turn:m.turn,events:m.events.map(e=>Object.fromEntries(["actor","kind","target","effect","skill","damage","hp","actorHp"].map(k=>[k,e[k]??(["kind","skill"].includes(k)?"":0)])))});};
 const outgoing=({response})=>{let m;try{m=JSON.parse(response.payloadData);}catch{return;}if(m.t==="BattlePetCommand")requests.push({skill:m.skill,target:m.target,petSlot:m.petSlot});};
 cdp.on("Network.webSocketFrameReceived",incoming);cdp.on("Network.webSocketFrameSent",outgoing);await cdp.send("Network.enable");
 let lastGm=0;const gm=async(text,battle=false)=>{await ui.closePanels();await ui.settle(Math.max(0,800-(Date.now()-lastGm)));await ui.gm(text,battle);lastGm=Date.now();};
 const read=()=>page.evaluate(()=>{
  const b=sa.battle,a=b&&[...b.fighters.values()].find(f=>f.f.sprite===199400&&f.f.ownerSlot===b.me),canvas=document.getElementById("view").getBoundingClientRect(),scale=canvas.width/800;
  const fx=new Set(sa.assets.anims.get(199402)?.actions.flatMap(a=>a.frames.map(f=>f[0]))??[]),lookup=new Map();
  for(const id of fx){const e=sa.assets.extensionImages.get(id);if(!e)continue;const tex=sa.assets.pages.get(`5/${e.page}`)?.tex;if(tex===undefined)continue;let entries=lookup.get(tex);if(!entries){entries=new Map();lookup.set(tex,entries);}entries.set(`${e.x}/${e.y}/${e.w}/${e.h}`,id);}
  const redEffects=sa.ui.quads.flatMap(q=>{const id=lookup.get(q.tex)?.get(`${q.u}/${q.v}/${q.w}/${q.h}`);if(id===undefined)return[];const s={x:canvas.x+q.x*scale,y:canvas.y+q.y*scale,w:q.w*scale,h:q.h*scale},area=Math.max(0,Math.min(innerWidth,s.x+s.w)-Math.max(0,s.x))*Math.max(0,Math.min(innerHeight,s.y+s.h)-Math.max(0,s.y));return[{frame:id,screen:{...s,visibleRatio:area/Math.max(1,s.w*s.h),centerVisible:s.x+s.w/2>=0&&s.x+s.w/2<=innerWidth&&s.y+s.h/2>=0&&s.y+s.h/2<=innerHeight}}];});
  return{now:performance.now(),battle:!!b,queue:b?.queue.length??0,sent:!!b?.sent,focus:b?.cameraSlot??-1,viewport:{width:innerWidth,height:innerHeight},actor:a?{slot:a.f.slot,x:a.x,y:a.y,index:a.lastFrame,action:a.action,frame:a.lastAct?.frames[a.lastFrame]?.[0]??-1}:null,redEffects};
 });
 try{
  for(const p of [...(ui.latest.Pets?.pets??[])])await gm(`/petdel ${p.slot}`);
  await gm("/lv 100");await gm("/stat 100 100 100 1000");await gm("/charm 100");await gm("/pet 29007 1");
  const pet=ui.latest.Pets.pets.find(p=>p.sprite===199400);assert(pet,"native hatchling grant absent");await gm(`/petlv ${pet.slot} 60`);await gm(`/petai ${pet.slot} 10000`);await gm("/heal");
  await ui.toolbar("pets");for(let i=0;i<3&&ui.latest.Pets.pets.find(p=>p.slot===pet.slot).state!=="battle";i++)await ui.action(`pet-st${pet.slot}`);assert(ui.latest.Pets.pets.find(p=>p.slot===pet.slot).state==="battle","native deployment absent");
  await gm("/warp 300 450 230");let start;
  for(let attempt=0;attempt<12;attempt++){await gm("/encount",true);start=ui.latest.BattleStart;if(start.fighters.filter(f=>f.slot>=10).length>=7)break;await ui.escape();}
  assert(start.fighters.filter(f=>f.slot>=10).length>=7,"native cross fixture never provided both rows");await ui.waitMenu();await ui.camera("follow");
  const tray=page.locator('[data-mobile-control="menu-tray"]:visible');if(await tray.count()&&await tray.getAttribute("aria-expanded")==="true"){await tray.tap();await ui.settle(250);}
  await ui.action("b-guard");const skill=ui.latest.Pets.pets.find(p=>p.slot===pet.slot).skills.find(s=>s.id===29060);assert(skill,"native shared skill absent");
  let actions=await ui.actions();if(!actions.some(h=>h.id===`pw-${skill.slot}`)){if(actions.some(h=>h.id==="pb-cancel"))await ui.action("pb-cancel");else await ui.action("pb-waza");}
  await ui.action(`pw-${skill.slot}`,250);await page.waitForFunction(()=>sa.ui.getMobileActions().some(h=>h.id==='pt-16'),null,{timeout:15000});
  const samples=[],captures=[],seen=new Set();let done=false;
  const sample=async()=>{const until=Date.now()+90000;while(!done&&Date.now()<until){const s=await read();samples.push(s);const red=s.redEffects.find(q=>q.screen.visibleRatio>=.35&&!seen.has(q.frame));
    if(red&&captures.length<4){seen.add(red.frame);const screenshot=`${variant}-cyrufas-mobile-red-probe-${String(captures.length+1).padStart(2,"0")}.png`,requestedAt=Date.now();
     // Direct native CDP raster capture skips Playwright's font/RAF preparation.
     const response=await cdp.send("Page.captureScreenshot",{format:"png",fromSurface:true,captureBeyondViewport:false});writeFileSync(resolve(out,screenshot),Buffer.from(response.data,"base64"));captures.push({...red,screenshot,sample:s,requestedAt,completedAt:Date.now(),method:"CDP Page.captureScreenshot"});}
    if(events.length&&s.queue===0&&!s.sent)break;await ui.settle(20);
  }};
  const sampling=sample();try{await ui.action("pt-16",0);await sampling;}finally{done=true;await sampling;}
  const visibleRedFrames=[...new Set(samples.flatMap(s=>s.redEffects.filter(q=>q.screen.visibleRatio>=.35).map(q=>q.frame)))];
  const evidence={sourceScope:"supplemental native mobile cast; separate from original 20-case cast",device:"mobile",pet:"cyrufas",command:{skillId:29060,skillSlot:skill.slot,target:16},camera:{preference:"follow",control:"camera-follow",input:"native tap"},viewport:samples[0].viewport,threshold:.35,visibleRedFrames,captures,samples,events,requests};
  results.redProbe=evidence; // Retain native diagnostics even if a later assertion fails.
  // The wire carries the individual skill-bar slot, not the catalog skill ID.
  assert(requests.some(r=>r.skill===skill.slot&&r.target===16),"supplementary cast did not send native shared command");assert(events.flatMap(t=>t.events).filter(e=>e.kind==="attack"&&e.effect===199402).map(e=>e.target).join(",")==="16,15,17,11","supplementary cast did not resolve native cross");assert(captures.length&&visibleRedFrames.length>=2,"supplementary cast has no advancing visible red effects");
  results.checks.push({case:"mobile Cyrufas supplementary native cross red raster capture",passed:true,evidence});console.log(JSON.stringify({red_probe:"captured",captures:captures.length,visibleRedFrames:visibleRedFrames.length}));
  await ui.escape();await gm(`/petdel ${pet.slot}`);
 }finally{cdp.off("Network.webSocketFrameReceived",incoming);cdp.off("Network.webSocketFrameSent",outgoing);await cdp.detach();}
 return ui;
}
