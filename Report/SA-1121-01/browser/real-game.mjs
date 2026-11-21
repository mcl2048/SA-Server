// Real Chromium + an owned release ELF + real assets/WebSocket/SQLite.
// Credentials, cookies, database and server logs stay inside the private runtime.
// All business changes use visible UI controls, native clicks/keys or GM chat.
// page.evaluate/waitForFunction only read native state and geometry.
import {readFileSync,writeFileSync,openSync,closeSync,mkdirSync,unlinkSync,statSync} from "node:fs";
import {spawn,execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const out=resolve(root,"Report/SA-1121-01/browser");mkdirSync(out,{recursive:true});
const argv=process.argv.slice(2),option=name=>{const i=argv.indexOf(name);return i<0?undefined:argv[i+1];};
const variant=option("--variant")??"final",probe=argv.includes("--probe"),inputOnly=argv.includes("--input-only"),resultOnly=argv.includes("--result-only"),cameraOnly=argv.includes("--camera-only");
const matrix=argv.includes("--matrix"), knockout=argv.includes("--knockout");
if(!["baseline","candidate","final"].includes(variant))throw Error("invalid variant");
const meta=JSON.parse(readFileSync(option("--meta")??`/tmp/sa112101-runtime.json`,"utf8"));
const runtime=resolve(meta.dir),credentials=JSON.parse(readFileSync(meta.credentials,"utf8"));
const privateValues=[credentials.account,credentials.password,credentials.secret].filter(v=>typeof v==="string"&&v.length);
const redact=value=>{
 if(typeof value==="string"){for(const token of privateValues)value=value.split(token).join("[private]");return value;}
 if(Array.isArray(value))return value.map(redact);
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v)]));
 return value;
};
const base=`http://127.0.0.1:${meta.port}`;
const digest=createHash("sha256").update(readFileSync(meta.binary)).digest("hex");
if(digest!==meta.binary_sha256)throw Error("runtime metadata does not match release binary; prepare a fresh runtime");
if((statSync(runtime).mode&0o077)!==0)throw Error("runtime must remain private (0700)");
const binaryVersion=execFileSync(meta.binary,["--version"],{encoding:"utf8"}).trim();
const lock=resolve(runtime,"real-game.lock"),lockFd=openSync(lock,"wx",0o600);writeFileSync(lockFd,String(process.pid));closeSync(lockFd);
const logFd=openSync(resolve(runtime,"server.log"),"a",0o600);
const results={variant,probe,matrix,binary_sha256:digest,binary_version:binaryVersion,
 scope:"actual release ELF, official runtime assets, real Chromium with SwiftShader software GPU, mobile viewport/touch emulation; not physical-device certification",
 stages:[],checks:[],errors:[],shutdown:null};
let child,browser,liveUi,expectedPosition=null,interrupted=false;
let abortReject;const abortPromise=new Promise((_,reject)=>{abortReject=reject;});
const onInterrupt=signal=>{interrupted=true;abortReject(Error(`interrupted by ${signal}`));};
const sigint=()=>onInterrupt("SIGINT"),sigterm=()=>onInterrupt("SIGTERM");
process.on("SIGINT",sigint);process.on("SIGTERM",sigterm);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const announce=stage=>{results.stages.push({stage,time:new Date().toISOString()});console.log(JSON.stringify({variant,stage}));};
function assert(ok,message){if(!ok)throw Error(message);}
const strings=new Set(["name","freeName","state","kind","skill","result"]),booleans=new Set(["dead","ok","pvp","watch","resume"]);
function pick(object,fields){return Object.fromEntries(fields.map(k=>[k,object[k]??(strings.has(k)?"":booleans.has(k)?false:0)]));}
const fighterFields=["slot","name","sprite","level","exp","nextExp","hp","maxHp","mp","maxMp","ownerSlot","bagSlot","status","defenseBoost","defenseTurns"];
function publicWire(m){
 switch(m.t){
  case"NpcWindow":return{t:m.t,id:m.id,seq:m.seq,kind:m.kind,buttons:m.buttons??0,text:m.text??""};
  case"Status":return{t:m.t,...pick(m,["level","exp","nextExp","hp","maxHp","mp","maxMp"])};
  case"AutoPlayState":return{t:m.t,canEncounter:!!m.canEncounter,encounter:!!m.encounter,autoBattle:!!m.autoBattle,quick:!!m.quick,paused:!!m.paused,reason:m.reason??""};
  case"EnterFloor":return{t:m.t,...pick(m,["floor","name","x","y","width","height"])};
  case"BattleStart":return{t:m.t,...pick(m,["field","mySlot","turnTime","speed","turn"]),pvp:!!m.pvp,watch:!!m.watch, resume:!!m.resume,
   fighters:(m.fighters??[]).slice(0,30).map(f=>pick(f,fighterFields))};
  case"BattleTurn":return{t:m.t,turn:m.turn??0,events:(m.events??[]).slice(0,300).map(e=>pick(e,["actor","kind","target","damage","hp","actorHp","actorMp","skill","status","dead","ok","fly"]))};
  case"BattleEnd":return{t:m.t,result:m.result??"",exp:m.exp??0,gold:m.gold??0,levelUp:m.levelUp??0};
  case"Pets":return{t:m.t,pets:(m.pets??[]).slice(0,10).map(p=>({...pick(p,["slot","name","freeName","sprite","level","exp","nextExp","hp","maxHp","state"]),skills:(p.skills??[]).slice(0,10).map(s=>pick(s,["id","slot","name","target","field"]))}))};
  case"Inventory":return{t:m.t,gold:m.gold??0,items:(m.items??[]).slice(0,60).map(i=>pick(i,["slot","name","pile","type","target"]))};
  default:return null; // Never retain Login/Session/Resume/authentication fields.
 }
}
class GameUI{
 constructor(page,touch){this.page=page;this.touch=touch;this.latest={};this.events=[];this.ack=0;this.chatCount=0;this.npcCount=0;this.lastChat="";this.errors=results.errors;liveUi=this;results.events=this.events;results.errors=this.errors;
  page.on("pageerror",e=>this.errors.push(redact(e.message)));
  page.on("console",m=>{if(m.type()==="error")this.errors.push(/token|password|secret|session|login|resume/i.test(m.text())?"console error involving private session handling":redact(m.text()));});
  page.on("websocket",ws=>ws.on("framereceived",frame=>{let m;try{m=JSON.parse(String(frame.payload));}catch{return;}
   if(m.t==="ChatMsg"){this.lastChat=String(m.text??"");this.chatCount++;return;} // Private in-memory GM acknowledgement only.
   if(m.t==="NpcWindow")this.npcCount++;
   const event=publicWire(m);if(!event)return;this.latest[m.t]=event;if(m.t==="AutoPlayState")this.ack++;
   this.events.push(redact(event));if(this.events.length>1000)this.events.shift();
  }));
 }
 async settle(ms=120){await this.page.waitForTimeout(ms);if(interrupted)throw Error("interrupted");}
 async phase(){return this.page.evaluate(()=>({screen:globalThis.sa?.screen?.constructor?.name??"loading",field:!!globalThis.sa?.field?.self,battle:!!globalThis.sa?.battle}));}
 async actions(){return this.page.evaluate(()=>globalThis.sa?.ui?.getMobileActions().map(h=>({id:h.id,label:h.label,x1:h.x1,y1:h.y1,x2:h.x2,y2:h.y2}))??[]);}
 async action(id,ms=160){
  await this.page.waitForFunction(id=>globalThis.sa?.ui?.getMobileActions().some(h=>h.id===id),id,{timeout:15000});
  let dom=this.page.locator(`[data-action=${JSON.stringify(id)}]:visible`).first();
  if(!await dom.count()){
   const commands=this.page.locator('[data-mobile-control="battle-commands"]:visible');
   if(await commands.count()&&!await commands.isDisabled()&&await commands.getAttribute("aria-expanded")==="false"){await commands.tap();await this.settle();}
   else{const tray=this.page.locator('[data-mobile-control="menu-tray"]:visible');
    if(await tray.count()&&await tray.getAttribute("aria-expanded")==="false"&&await this.page.locator(`[data-action=${JSON.stringify(id)}]`).count()){await tray.tap();await this.settle();}}
   dom=this.page.locator(`[data-action=${JSON.stringify(id)}]:visible`).first();
  }
  if(await dom.count()){await dom.scrollIntoViewIfNeeded();if(this.touch)await dom.tap();else await dom.click();}
  else{
   // Immediate-mode hit snapshots can change between two protocol round trips.
   // Read readiness and the coordinates atomically from the same native frame.
   const handle=await this.page.waitForFunction(id=>{const h=sa.ui.getMobileActions().find(h=>h.id===id),r=document.querySelector("#view").getBoundingClientRect();if(!h)return null;const nx=(h.x1+h.x2)/2,ny=(h.y1+h.y2)/2,x=r.x+nx*r.width/800,y=r.y+ny*r.height/600;return nx>=0&&nx<800&&ny>=0&&ny<600&&x>=0&&x<innerWidth&&y>=0&&y<innerHeight?{x,y}:null;},id,{timeout:15000});
   const point=await handle.jsonValue();await handle.dispose();
   assert(point,"native action disappeared");const size=this.page.viewportSize();
   assert(point.x>=0&&point.y>=0&&point.x<size.width&&point.y<size.height,`native action ${id} is clipped without a DOM control`);
   if(this.touch&&await this.page.evaluate(()=>document.documentElement.classList.contains("sa-mobile")))await this.page.touchscreen.tap(point.x,point.y);
   else await this.page.mouse.click(point.x,point.y);
  }
  await this.settle(ms);
 }
 async toolbar(name){
  if(!this.touch){await this.action(({system:"tb-system",pets:"tb-pet",items:"tb-item",status:"tb-status",map:"tb-map"})[name]??`tb-${name}`);return;}
  const b=this.page.locator(`[data-mobile-control="menu-${name}"]`);
  // The native close can finish before the next rendered mobile frame. Wait
  // for either the toolbar or its tray opener before deciding to open it.
  await this.page.waitForFunction(name=>{
   const shown=e=>e&&e.getClientRects().length&&!e.closest('[hidden]');
   return shown(document.querySelector(`[data-mobile-control="menu-${name}"]`))||shown(document.querySelector('[data-mobile-control="menu-tray"]'));
  },name,{timeout:30000});
  if(!await b.isVisible()){
   const tray=this.page.locator('[data-mobile-control="menu-tray"]:visible');
   if(await tray.count()&&await tray.getAttribute("aria-expanded")==="false"){await tray.tap();await this.settle();}
  }
  await b.scrollIntoViewIfNeeded();if(this.touch)await b.tap();else await b.click();await this.settle();
 }
 async back(){
  const b=this.page.locator(".mobile-shell-back:visible").first();
  if(await b.count()){if(this.touch)await b.tap();else await b.click();await this.settle();return"sheet";}
  if(await this.page.evaluate(()=>document.documentElement.classList.contains("sa-mobile"))){await this.toolbar("back");return"toolbar";}
  await this.page.keyboard.press("Escape");await this.settle();return"keyboard";
 }
 async fieldReady(timeout=90000){await this.page.waitForFunction(()=>globalThis.sa?.screen?.constructor.name==="FieldScreen"&&sa.field?.self&&sa.field.floor>=0&&sa.field.width>0&&sa.field.height>0&&!sa.battle,null,{timeout});}
 async enter(){
  await this.page.goto(`${base}/?device=${this.touch?"mobile":"desktop"}&view=classic`,{waitUntil:"domcontentloaded"});
  await this.page.waitForFunction(()=>globalThis.sa&&(["LoginScreen","LineScreen","CharSelectScreen"].includes(sa.screen.constructor.name)||sa.field?.self),null,{timeout:90000});
  // A same-tab re-entry may restore its private session directly into lobby.
  // Let the real resume handshake settle before deciding password UI is needed.
  await this.settle(450);
  if((await this.phase()).field){await this.fieldReady();return;}
  if((await this.phase()).screen==="LoginScreen"){
   if(this.touch){await this.page.getByLabel("账号",{exact:true}).fill(credentials.account);await this.page.getByLabel("密码",{exact:true}).fill(credentials.password);}
   else{const inputs=this.page.locator("input:visible");await inputs.nth(0).fill(credentials.account);await inputs.nth(1).fill(credentials.password);}
   await this.action("ok");
  }
  const deadline=Date.now()+90000;
  while(Date.now()<deadline){
   const p=await this.phase();if(p.screen==="FieldScreen"&&p.field){await this.fieldReady();await this.settle(400);return;}
   if(p.screen==="LineScreen"){
    try{await this.action("item0");}catch(error){if((await this.phase()).screen==="LineScreen")throw error;}
   }
   else if(p.screen==="CharSelectScreen"){
    // A separately authenticated context explicitly confirms taking over this
    // private fixture's online role; do not bypass the native confirmation.
    if((await this.actions()).some(h=>h.id==="modal-yes"))await this.action("modal-yes");
    else {
     try { await this.action("login0"); }
     catch (error) {
      // The role may enter the field between the phase snapshot and hit
      // lookup. Accept only that actual completed transition, never a retry.
      if ((await this.phase()).screen !== "FieldScreen") throw error;
     }
    }
   }
   else if(p.screen==="LoginScreen"&&(await this.actions()).some(h=>h.id==="modal-ok"))throw Error("authentication UI rejected private fixture credentials");
   else await this.settle(150);
  }throw Error("real UI did not reach the field");
 }
 async gm(text,battle=false){
  await this.fieldReady();const count=this.chatCount;
  if(await this.page.evaluate(()=>document.documentElement.classList.contains("sa-mobile")))await this.toolbar("chat");
  else{await this.page.keyboard.press("Enter");await this.settle();}
  const input=this.page.locator("input:visible").first();await input.fill(text);
  const send=this.page.getByRole("button",{name:"发送聊天",exact:true});
  if(await send.isVisible())await send.tap();else await input.press("Enter");
  if(battle)await this.page.waitForFunction(()=>!!sa.battle,null,{timeout:30000});
  else{const deadline=Date.now()+10000;while(this.chatCount===count&&Date.now()<deadline)await this.settle(80);assert(this.chatCount>count,"GM chat did not receive an acknowledgement");}
  await this.settle(200);
 }
 async noEncounter(){await this.gm("/noenc");if(this.lastChat.includes("恢复遇敌"))await this.gm("/noenc");assert(this.lastChat.includes("不会遇敌"),"GM no-encounter acknowledgement absent");}
 async mode(display){
  const select=this.page.locator('select[aria-label="游戏画面"]');
  if(!await select.isVisible())await this.page.locator("#mobile-mode-switch summary").click();
  await select.selectOption(display);await this.page.locator("#mobile-mode-switch summary").click();await this.settle(200);
 }
 async camera(name){
  const b=this.page.locator(`[data-mobile-control="camera-${name}"]`),tray=this.page.locator('[data-mobile-control="menu-tray"]:visible');
  if(!await b.isVisible()&&await tray.count()&&await tray.getAttribute("aria-expanded")==="false"){await tray.tap();await this.settle();}
  await b.scrollIntoViewIfNeeded();await b.tap();await this.settle(650);
 }
 async closePanels(){
  for(let i=0;i<5;i++){
   await this.fieldReady();
   // Pet return is reused for skills -> details -> list. Read the native page
   // and its drawn hits together; a transition frame can still draw old hits.
   await this.page.waitForFunction(()=>{
    const p=sa.screen.menus.petWnd,h=sa.ui.getMobileActions();if(!p.open)return true;
    return p.page===0?h.some(a=>a.id==='pet-close')&&!h.some(a=>a.id==='pet-return')
     :h.some(a=>a.id==='pet-return')&&(p.page===1)===h.some(a=>a.id==='pet-waza');
   },null,{timeout:15000});
   const state=await this.page.evaluate(()=>({count:sa.screen.openCount(),petPage:sa.screen.menus.petWnd.open?sa.screen.menus.petWnd.page:-1,hits:sa.ui.getMobileActions().map(h=>({id:h.id,x1:h.x1,y1:h.y1,x2:h.x2,y2:h.y2}))})),hits=state.hits;
   if(hits.some(h=>h.id==="result-close")){
    try{await this.action("result-close");}
    catch(error){
     // The native result window expires after five seconds. Rendering/scroll
     // may cross that deadline between observing the hit and tapping it. Only
     // accept its actual disappearance with no remaining panel, never another
     // UI failure or an unclosed result.
     const expired=await this.page.evaluate(()=>!sa.screen.openCount()&&!sa.ui.getMobileActions().some(h=>h.id==='result-close'));
     if(!expired)throw error;
     return;
    }
    continue;
   }
   if(!state.count)return;
   if(!this.touch){
    const close=hits.filter(h=>!/^tb-/.test(h.id)&&/(?:close|cancel|return|back)$/.test(h.id)).at(-1);
    if(close){
     try{await this.action(close.id);}
     catch(error){
      // back() may finish between reading the native panel state and the
      // next rendered hit list. Accept only a fully closed panel with this
      // exact hit gone; an open panel or unrelated UI failure still fails.
      const closed=await this.page.evaluate(id=>sa.screen.openCount()===0&&!sa.ui.getMobileActions().some(h=>h.id===id),close.id);
      if(!closed)throw error;
      return;
     }
     // Wait for the click to finish and a subsequent real frame to publish
     // its new page/hits before choosing another close control.
     await this.page.waitForFunction(({before,id})=>{
      const after={count:sa.screen.openCount(),petPage:sa.screen.menus.petWnd.open?sa.screen.menus.petWnd.page:-1,hits:sa.ui.getMobileActions().map(h=>({id:h.id,x1:h.x1,y1:h.y1,x2:h.x2,y2:h.y2}))};
      return !sa.ui.mouse.clicked&&sa.ui.clickHot!==id&&JSON.stringify(after)!==before;
     },{before:JSON.stringify(state),id:close.id},{timeout:15000});
     continue;
    }
   }
   await this.back();
  }assert(await this.page.evaluate(()=>sa.screen.openCount()===0),"native field panel did not close");
 }
 async flag(name,wanted){
  if(!!this.latest.AutoPlayState?.[name]===wanted)return;
  await this.closePanels();await this.toolbar("system");await this.action("sys-ai");const ack=this.ack;
  await this.action({quick:"ai-quick-val",autoBattle:"ai-auto-val",encounter:"ai-enc-val"}[name]);
  const until=Date.now()+15000;while((this.ack<=ack||!!this.latest.AutoPlayState?.[name]!==wanted)&&Date.now()<until)await this.settle(80);
  assert(this.ack>ack&&!!this.latest.AutoPlayState?.[name]===wanted,`native UI ${name} did not receive server acknowledgement`);await this.back();
 }
 async snapshot(name){assert((await this.phase()).field,"refuse to publish authentication screenshots");await this.settle(180);await this.page.screenshot({path:resolve(out,`${variant}-${name}.png`)});}
 async position(){return this.page.evaluate(()=>({id:sa.field.self.id,floor:sa.field.floor,x:sa.field.self.x,y:sa.field.self.y}));}
 async waitMenu(){await this.page.waitForFunction(()=>sa.battle&&sa.battle.queue.length===0&&!sa.battle.sent&&sa.ui.getMobileActions().some(h=>h.id==="b-guard"),null,{timeout:90000});}
 async guardPets(){
  for(let tries=0;tries<15;tries++){
   const p=await this.page.evaluate(()=>{const b=sa.battle;if(!b||b.petSent)return null;const a=[...b.fighters.values()].find(a=>a.f.ownerSlot===b.me&&a.f.slot%10>=5&&!a.dead&&!a.gone&&!a.hidden&&!b.petSentSlots.has(a.f.slot));return a?{slot:a.f.slot,bag:a.f.bagSlot}:null;});
   if(!p)return;let hits=await this.actions();
   if(hits.some(h=>h.id===`pet-tab-${p.slot}`))await this.action(`pet-tab-${p.slot}`);
   else if(hits.some(h=>h.id==="pb-waza")&&!hits.some(h=>h.id.startsWith("pw-")))await this.action("pb-waza");
   hits=await this.actions();const pet=this.latest.Pets?.pets.find(x=>x.slot===p.bag);
   const skill=pet?.skills.find(s=>s.id===2||String(s.name).includes("防御"))??pet?.skills.find(s=>s.field!==2);
   assert(skill,"fixture pet has no native battle skill");await this.action(`pw-${skill.slot}`);
   hits=await this.actions();const targets=hits.filter(h=>/^pt-\d+$/.test(h.id));
   if(targets.length){const preferred=skill.target===0?`pt-${p.slot}`:targets.find(h=>Number(h.id.slice(3))>=10)?.id??`pt-${p.slot}`;
    assert(targets.some(h=>h.id===preferred),"fixture skill has no legal native target");await this.action(preferred);}
  }throw Error("manual native pet commands did not finish");
 }
 async escape(){await this.waitMenu();await this.action("b-escape");await this.fieldReady();await this.settle(250);}
}
async function work(){
 child=spawn(meta.binary,[],{cwd:runtime,stdio:["ignore",logFd,logFd],env:{...process.env,GOMAXPROCS:"2",GOMEMLIMIT:"400MiB"}});
 const deadline=Date.now()+90000;
 while(Date.now()<deadline){if(child.exitCode!==null)throw Error("owned ELF exited during startup");try{const response=await fetch(base+"/",{signal:AbortSignal.timeout(2000)});if(response.status===200){results.client_version=(/dist\/main\.js\?v=([\w]+)/.exec(await response.text())??[])[1];break;}}catch{}await delay(150);}
 assert(child.exitCode===null&&results.client_version,"owned ELF did not become HTTP ready");announce("server-ready");
 const {chromium}=await import(process.env.SA_PLAYWRIGHT_MODULE??"/home/coder/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs");
 browser=await chromium.launch({headless:true,executablePath:process.env.SA_CHROMIUM??"/home/coder/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell",args:["--no-sandbox","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-background-timer-throttling","--disable-backgrounding-occluded-windows","--disable-renderer-backgrounding"]});
 results.browser=browser.version();const context=await browser.newContext({viewport:{width:1280,height:900},isMobile:false,hasTouch:false,deviceScaleFactor:1});
 let ui=new GameUI(await context.newPage(),false);liveUi=ui;results.events=ui.events;results.errors=ui.errors;
 await ui.enter();announce("authenticated-real-field");
 const snapshot=()=>{
  const code="import sys,json,sqlite3; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); r=c.execute('SELECT level,exp,gold,pets FROM characters WHERE id=1').fetchone(); b=json.loads(r[3]); p=lambda x: {k:x.get(k,False if k=='training' else 0) for k in ('name','free','lv','exp','training','vit','str','tgh','dex')}; print(json.dumps({'level':r[0],'exp':r[1],'gold':r[2],'poolCount':len(b.get('pool',[])),'pool':[p(x) for x in b.get('pool',[]) if x and (x.get('training') or x.get('free','').startswith('寄放001') or x.get('free')=='培养对象一二三四')],'pets':[p(x) for x in b.get('pets',[]) if x]}))";
  return JSON.parse(execFileSync('python3',['-c',code,resolve(runtime,'test.db')],{encoding:'utf8'}));
 };
 ui=await(await import(option("--cases")??"./task-cases.mjs")).run(ui,results,{variant,out,snapshot});liveUi=ui;
 expectedPosition=await ui.position();results.events=ui.events;results.errors=ui.errors;
 assert(!ui.errors.length,"browser reported errors (see sanitized result)");await ui.page.context().close();announce("scenario-finished");
}
async function stopServer(){
 if(!child)return{started:false};const sent=child.exitCode===null;if(sent)child.kill("SIGTERM");
 let timedOut=false;await new Promise(resolve=>{
  if(child.exitCode!==null){resolve();return;}
  const timer=setTimeout(()=>{timedOut=true;resolve();},30000);
  child.once("exit",()=>{clearTimeout(timer);resolve();});
 });
 if(timedOut&&child.exitCode===null){child.kill("SIGKILL");await new Promise(r=>child.once("exit",r));}
 let stored=null;
 if(expectedPosition){const code="import sys,json,sqlite3; m=json.load(sys.stdin); c=sqlite3.connect('file:'+m['db']+'?mode=ro',uri=True); r=c.execute('SELECT floor,x,y FROM characters WHERE id=?',(m['id'],)).fetchone(); print(json.dumps(dict(zip(('floor','x','y'),r)) if r else None))";
  stored=JSON.parse(execFileSync("python3",["-c",code],{input:JSON.stringify({db:resolve(runtime,"test.db"),id:expectedPosition.id}),encoding:"utf8"}));}
 const match=!!expectedPosition&&stored&&["floor","x","y"].every(k=>stored[k]===expectedPosition[k]);
 return{started:true,sigterm_sent:sent,exit_code:child.exitCode,signal:child.signalCode,timed_out:timedOut,expected_position:expectedPosition,stored_position:stored,position_matches:!!match};
}
try{await Promise.race([work(),abortPromise]);}
catch(e){results.failure=redact(e.message);results.failure_stack=redact(e.stack);process.exitCode=1;console.error(redact(e.stack??e.message));
 if(liveUi)try{const phase=await liveUi.phase();results.failure_state={...phase,actions:await liveUi.actions()};if(phase.field){expectedPosition=await liveUi.position();await liveUi.snapshot("failure");}}catch{}
}
finally{
 try{if(browser)await browser.close();}catch{}
 try{results.shutdown=await stopServer();if(results.shutdown.started&&(results.shutdown.exit_code!==0||results.shutdown.timed_out||expectedPosition&&!results.shutdown.position_matches))process.exitCode=1;}catch(e){results.shutdown_error=redact(e.message);process.exitCode=1;}
 closeSync(logFd);try{unlinkSync(lock);}catch{}process.removeListener("SIGINT",sigint);process.removeListener("SIGTERM",sigterm);
 const destination=resolve(out,option("--result-name")??`${variant}-automation.json`);writeFileSync(destination,JSON.stringify(redact(results),null,2)+"\n");
 console.log(JSON.stringify({variant,probe,result:destination,success:!process.exitCode,gesture_continued:results.gesture?.continuedAfterGesture,result_return_closed:results.resultReturn?.returnClosed,shutdown:results.shutdown}));
}
// All owned browser/server resources are joined and evidence is synchronous.
// The reusable Playwright driver can retain an IPC handle after browser.close;
// do not turn a completed QA command into an idle process awaiting tool signals.
process.exit(process.exitCode??0);
