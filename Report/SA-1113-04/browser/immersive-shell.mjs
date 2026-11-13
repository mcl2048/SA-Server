// Genuine Chromium UI flow against source modules. Canvas/text are synthetic
// fixtures; this verifies presentation controls, not authenticated game combat.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const out=resolve(root,"Report/SA-1113-04/browser"); mkdirSync(out,{recursive:true});
const baseline=process.argv.includes("--baseline");
const {chromium}=await import(process.env.SA_PLAYWRIGHT_MODULE??"/home/coder/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs");
const browser=await chromium.launch({headless:true,args:["--no-sandbox"],executablePath:process.env.SA_CHROMIUM??"/home/coder/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell"});
const results=[],failures=[];
const check=(ok,label)=>{if(!ok)failures.push(label);return ok;};
try{for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:568,height:320}]){
 const page=await browser.newPage({viewport,isMobile:true,hasTouch:true});const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.route("http://immersive.test/**",async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith("/src/")){
   const path=resolve(root,"client"+url.pathname.replace(/\.js$/,".ts"));if(!path.startsWith(resolve(root,"client/src")+"/"))throw Error("invalid source path");
   return route.fulfill({contentType:"text/javascript",body:stripTypeScriptTypes(readFileSync(path,"utf8")).replace(/(from\s+["'][^"']+)\.ts(["'])/g,"$1.js$2")});
  }
  return route.fulfill({contentType:"text/html",body:readFileSync(resolve(root,"client/index.html"),"utf8").replace(/<script[^>]+><\/script>/,"")});
 });
 await page.goto("http://immersive.test/?device=mobile&view=immersive");
 await page.evaluate(async()=>{
  const {MobileShell}=await import("/src/mobile-shell.js"),{Ui,Mouse}=await import("/src/ui.js");window.view=await import("/src/mobile-view.js");
  const canvas=document.querySelector("#view"),ctx=canvas.getContext("2d");
  ctx.fillStyle="#416969";ctx.fillRect(0,0,800,600);ctx.strokeStyle="#80a08c";
  for(let x=0;x<800;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,600);ctx.stroke();}
  for(let y=0;y<600;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(800,y);ctx.stroke();}
  ctx.fillStyle="#e2cca0";ctx.beginPath();ctx.arc(400,300,22,0,Math.PI*2);ctx.fill();ctx.font="16px sans-serif";ctx.fillText("组件验收：合成场景",20,30);
  ctx.fillRect(659,451,34,58); // Same bounds as the actual candidate's own fighter.
  const mouse=new Mouse();mouse.attach(canvas);const ui=new Ui({},mouse);window.ui=ui;window.fired=[];
  window.shell=new MobileShell(ui,{action:id=>window.fired.push(["action",id]),command:name=>window.fired.push(["command",name]),direction:dir=>window.fired.push(["direction",dir]),cancel:()=>window.fired.push(["cancel"]),navigate:dir=>window.fired.push(["navigate",dir]),click:key=>window.fired.push(["click",key])});
  window.field=()=>{ui.begin();window.view.setMobileContext("field");window.shell.frame({phase:"field",panel:false,status:"验收角色 Lv.12  HP 120/160  MP 35/50",canEncounter:true,encounter:false});};window.field();
 });
 await page.waitForFunction(()=>document.querySelector("#mobile-root").dataset.context==="field");
 const stableDom=await page.evaluate(async()=>{
  window.shell.frame(window.shell.state);await Promise.resolve();
  const observer=new MutationObserver(()=>{});
  for(const selector of [".mobile-shell","#mobile-mode-switch"])observer.observe(document.querySelector(selector),{attributes:true,childList:true,characterData:true,subtree:true});
  for(let i=0;i<60;i++)window.shell.frame(window.shell.state);
  const count=observer.takeRecords().length;observer.disconnect();return count;
 });
 check(stableDom===0,`${viewport.width}: unchanged presentation rewrote DOM (${stableDom})`);
 const field=await page.evaluate(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};
  const toggle=document.querySelector("[data-mobile-control='menu-tray']"),r=toggle.getBoundingClientRect();
  return{stage:rect(document.querySelector(".stage")),viewport:rect(document.querySelector("#mobile-viewport")),toggle:rect(toggle),
   actionable:toggle.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),
   stick:rect(document.querySelector(".mobile-shell-joystick")),menuHidden:document.querySelector(".mobile-shell-toolbar").hidden,
   display:window.view.getMobileDisplayMode(),context:document.querySelector("#mobile-root").dataset.context};
 });
 check(Math.abs(field.viewport.w-viewport.width)<1&&Math.abs(field.viewport.h-viewport.height)<1,`${viewport.width}: scene must fill viewport`);
 check(field.stage.w>=799&&Math.abs(field.stage.w/field.stage.h-4/3)<.001,`${viewport.width}: scene shrunk or distorted`);
 check(field.toggle.y>=viewport.height-100&&field.toggle.x>=viewport.width-100,`${viewport.width}: menu dock placement`);
 check(field.actionable,`${viewport.width}: menu touch hit blocked`);
 check(field.menuHidden,`${viewport.width}: initial tray must be closed`);
 await page.screenshot({path:resolve(out,`immersive-${baseline?"baseline":"final"}-field-${viewport.width}.png`)});
 let menu={skipped:true};
 if(field.actionable){
  await page.locator("[data-mobile-control='menu-tray']").click();
  check(await page.locator("[data-mobile-control='menu-tray']").getAttribute("aria-expanded")==="true",`${viewport.width}: tray did not open`);
  await page.locator("[data-mobile-control='menu-status']").scrollIntoViewIfNeeded();
  await page.locator("[data-mobile-control='menu-status']").click();
  menu=await page.evaluate(()=>({statusDispatched:window.fired.some(e=>e[0]==="command"&&e[1]==="status"),cancelled:window.fired.some(e=>e[0]==="cancel")}));
  check(menu.statusDispatched&&menu.cancelled,`${viewport.width}: native menu command or cancellation lost`);
  await page.evaluate(()=>window.field());
  check(await page.locator("[data-mobile-control='menu-tray']").getAttribute("aria-expanded")==="false",`${viewport.width}: native command did not close tray`);
 }
 // Native panels retain the complete 4:3 canvas and the very same real input.
 await page.evaluate(async()=>{
  const {InputBox}=await import("/src/ui.js");window.box=new InputBox(document.querySelector("#view"),70,554,600,16);window.box.value="输入法验收";
  window.view.setMobileContext("panel");window.ui.begin();window.shell.frame({phase:"field",panel:true,title:"聊天"});window.box.focus();
 });
 await page.waitForFunction(()=>document.querySelector("#mobile-root").dataset.context==="panel");
 const panel=await page.evaluate(()=>{const r=document.querySelector(".stage").getBoundingClientRect(),v=document.querySelector("#mobile-viewport").getBoundingClientRect();return{complete:r.left>=v.left-1&&r.top>=v.top-1&&r.right<=v.right+1&&r.bottom<=v.bottom+1,
  inputManaged:window.box.el.dataset.mobileManaged==="true",sameFocus:document.activeElement===window.box.el,value:window.box.value,menuHidden:document.querySelector("[data-mobile-control='menu-tray']").hidden};});
 check(panel.complete&&panel.inputManaged&&panel.sameFocus&&panel.value==="输入法验收"&&panel.menuHidden,`${viewport.width}: complete panel or input adoption failed`);
 await page.screenshot({path:resolve(out,`immersive-${baseline?"baseline":"final"}-panel-${viewport.width}.png`)});
 await page.evaluate(()=>{
  window.box.remove();window.ui.begin();window.ui.textButton(80,120,"使用回复药","#fff","bitem-9");
  window.shell.frame({phase:"battle",panel:true,context:"panel",cameraAvailable:true,status:"战斗道具菜单"});
 });
 await page.waitForFunction(()=>document.querySelector("#mobile-root").dataset.context==="panel");
 const battlePanel=await page.evaluate(()=>{const r=document.querySelector(".stage").getBoundingClientRect(),v=document.querySelector("#mobile-viewport").getBoundingClientRect();return{complete:r.left>=v.left-1&&r.top>=v.top-1&&r.right<=v.right+1&&r.bottom<=v.bottom+1,layout:document.querySelector(".mobile-shell").dataset.layout,cameraHidden:document.querySelector(".mobile-shell-camera").hidden};});
 check(battlePanel.complete&&battlePanel.layout==="full"&&battlePanel.cameraHidden,`${viewport.width}: native battle panel still cropped`);
 await page.evaluate(()=>{
  window.ui.begin();window.ui.textButton(20,20,"自动战斗 开","#fff","battle-auto-toggle");
  window.shell.frame({phase:"battle",panel:false,context:"field",cameraAvailable:false,status:"快速战斗地图"});
 });
 await page.waitForFunction(()=>document.querySelector("#mobile-root").dataset.context==="field");
 const quick=await page.evaluate(()=>{const v=document.querySelector("#mobile-viewport").getBoundingClientRect();return{w:v.width,h:v.height,cameraHidden:document.querySelector(".mobile-shell-camera").hidden,movementHidden:document.querySelector(".mobile-shell-field").hidden};});
 check(Math.abs(quick.w-viewport.width)<1&&Math.abs(quick.h-viewport.height)<1&&quick.cameraHidden&&quick.movementHidden,`${viewport.width}: quick battle map context lost`);
 await page.evaluate(()=>{window.view.setMobileContext("battle");window.ui.begin();
  for(let i=0;i<10;i++)window.ui.hitBox(50+i*65,100,100+i*65,150,`pt-${i}`);
  window.shell.frame({phase:"battle",panel:false,status:"验收战斗：真实 Ui 热区，合成目标",actionLabels:Object.fromEntries(Array.from({length:10},(_,i)=>[`pt-${i}`,`目标 ${i+1} · 乌力 Lv.5 · HP 120/160`]))});window.fired.length=0;
 });
 await page.waitForFunction(()=>document.querySelector("#mobile-root").dataset.context==="battle");
 await page.evaluate(()=>window.view.setSceneFocus(677,456));await page.waitForTimeout(70);
 const battleDefault=await page.evaluate(()=>{
  const c=document.querySelector("#view").getBoundingClientRect(),s=document.querySelector(".mobile-shell-sheet").getBoundingClientRect();
  const r={x:c.x+659*c.width/800,y:c.y+451*c.height/600,w:34*c.width/800,h:58*c.height/600};
  return{commandsHidden:document.querySelector(".mobile-shell-sheet").hidden,actor:r,sheetHeight:s.height,
    covered:Math.max(0,Math.min(r.x+r.w,s.right)-Math.max(r.x,s.left))*Math.max(0,Math.min(r.y+r.h,s.bottom)-Math.max(r.y,s.top))};
 });
 check(battleDefault.commandsHidden&&battleDefault.sheetHeight===0&&battleDefault.covered===0,`${viewport.width}: default command sheet covers actor`);
 await page.screenshot({path:resolve(out,`immersive-${baseline?"baseline":"final"}-battle-clear-${viewport.width}.png`)});
 await page.locator("[data-mobile-control='menu-tray']").click();
 await page.locator("[data-mobile-control='camera-enemy']").scrollIntoViewIfNeeded();
 await page.locator("[data-mobile-control='camera-enemy']").click();
 await page.evaluate(()=>window.shell.frame(window.shell.state));
 check(await page.evaluate(()=>window.fired.some(e=>e[0]==="command"&&e[1]==="camera-enemy")),`${viewport.width}: camera view command failed`);
 await page.locator("[data-mobile-control='battle-commands']").click();
 await page.locator("[data-action='pt-9']").scrollIntoViewIfNeeded();await page.locator("[data-action='pt-9']").click();
 await page.evaluate(()=>window.shell.frame(window.shell.state));
 const battle=await page.evaluate(()=>({targets:document.querySelectorAll(".mobile-shell-actions [data-action]").length,target9:window.fired.some(e=>e[0]==="action"&&e[1]==="pt-9"),scroll:document.querySelector(".mobile-shell-sheet").scrollTop}));
 check(battle.targets===10&&battle.target9,`${viewport.width}: cropped battle target unreachable`);
 await page.screenshot({path:resolve(out,`immersive-${baseline?"baseline":"final"}-battle-${viewport.width}.png`)});
 // Use trusted clicks for the native Fullscreen API; unsupported platforms are
 // accepted only when immersive mode stays usable and the status explains it.
 await page.locator("#mobile-mode-switch summary").click();
 await page.locator("[data-mobile-control='fullscreen']").click();
 await page.waitForTimeout(100);
 const fullscreen=await page.evaluate(()=>({native:!!document.fullscreenElement,display:window.view.getMobileDisplayMode(),text:document.querySelector(".mobile-shell-display-help").textContent}));
 check(fullscreen.display==="immersive"&&fullscreen.text.length>0,`${viewport.width}: fullscreen fallback unusable`);
 await page.locator("select[aria-label='界面模式']").selectOption("desktop");
 if(fullscreen.native){
  check(await page.locator("[data-mobile-control='fullscreen']").isVisible(),`${viewport.width}: desktop switch hid fullscreen exit`);
  await page.locator("[data-mobile-control='fullscreen']").click();await page.waitForFunction(()=>!document.fullscreenElement);
 }
 const desktop=await page.evaluate(()=>({mobile:window.view.isMobile(),shellHidden:document.querySelector(".mobile-shell").hidden,stageParent:document.querySelector(".stage").parentElement.tagName,
  mobileControlsHidden:document.querySelector("[data-mobile-control='fullscreen']").hidden}));
 check(!desktop.mobile&&desktop.shellHidden&&desktop.stageParent==="BODY"&&desktop.mobileControlsHidden,`${viewport.width}: desktop restore failed`);
 if(errors.length)failures.push(`${viewport.width}: ${errors.join("; ")}`);
 results.push({viewport,field,stableDom,menu,panel,battlePanel,quick,battleDefault,battle,fullscreen,desktop,errors});await page.close();
}writeFileSync(resolve(out,`immersive-shell-${baseline?"baseline":"final"}.json`),JSON.stringify({browser:browser.version(),scope:"real Chromium / actual source Ui and shell / synthetic menu, input and target data / no physical device certification",baseline,results,failures},null,2)+"\n");
 console.log(JSON.stringify({browser:browser.version(),baseline,failures,viewports:results.length},null,2));if(failures.length&&!baseline)process.exitCode=1;
}finally{await browser.close();}
