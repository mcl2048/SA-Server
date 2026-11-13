// Real Chromium component rendering against current repository source; no server
// authentication or physical-device certification is implied. Run from repo root.
import { chromium } from '/home/coder/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
const root = process.cwd(), out = resolve(root,'Report/SA-1113-02/browser');
mkdirSync(out,{recursive:true});
const browser = await chromium.launch({headless:true,executablePath:'/home/coder/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const results=[];
try {
 for (const mobile of [false,true]) {
  const page=await browser.newPage({viewport:mobile?{width:390,height:760}:{width:1000,height:760},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://pets.test/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/src/')) {
    const path=resolve(root,'client'+url.pathname.replace(/\.js$/,'.ts'));
    if(!path.startsWith(resolve(root,'client/src')+'/'))throw Error('unexpected path');
    return route.fulfill({contentType:'text/javascript',body:stripTypeScriptTypes(readFileSync(path,'utf8')).replace(/(from\s+["'][^"']+)\.ts(["'])/g,'$1.js$2')});
   }
   return route.fulfill({contentType:'text/html',body:'<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#172438;color:white;font:16px sans-serif"><p>Battle resource rendering · '+(mobile?'390px mobile':'desktop')+'</p><canvas width="800" height="600" style="width:100%;max-width:800px;background:linear-gradient(140deg,#475b48,#303e54)"></canvas></body></html>'});
  });
  await page.goto('http://pets.test/?device='+ (mobile?'mobile':'desktop'));
  const result=await page.evaluate(async mobile=>{
   const {BattleScreen}=await import('/src/battle.js');const {drawOverlay}=await import('/src/ui.js');
   const {setDeviceMode}=await import('/src/mobile-view.js');setDeviceMode(mobile?'mobile':'desktop');
   const ui={texts:[],boxes:[],pics:[],box(x1,y1,x2,y2,color,fill){this.boxes.push({x1,y1,x2,y2,color,fill});}};
   const screen=Object.create(BattleScreen.prototype);screen.host={ui};screen.fx=[];
   const values=[[180,120,2400,2400,'HP'],[330,230,600,2400,'HP'],[480,340,0,2400,'倒地'],[630,450,12000,12500,'HP']];
   for(const [x,y,hp,max,label]of values)screen.resourceCard(x,y,hp,max,mobile,label);
   screen.popup({x:330,y:330},100,{text:'−1284',color:'#ffb4ab'});
   screen.popup({x:600,y:310},100,{text:'+520',color:'#70e0b5'});screen.drawFx(220);
   drawOverlay(document.querySelector('canvas').getContext('2d'),ui);
   if(ui.texts.some(t=>!Number.isFinite(t.x)||!Number.isFinite(t.y)))throw Error('nonfinite label');
   if(!ui.texts.some(t=>t.text==='倒地 0/2400'))throw Error('missing dead resource');
   return {mobile,labels:ui.texts.map(t=>({text:t.text,size:t.size})),boxes:ui.boxes.length};
  },mobile);
  await page.screenshot({path:resolve(out,mobile?'battle-resource-mobile.png':'battle-resource-desktop.png'),fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));results.push(result);await page.close();
 }
 writeFileSync(resolve(out,'pets-battle-results.json'),JSON.stringify({browser:browser.version(),scope:'Chromium component rendering, synthetic battle values using real BattleScreen and drawOverlay; not authenticated end-to-end',results},null,2)+'\n');
 console.log(JSON.stringify(results));
}finally{await browser.close();}
