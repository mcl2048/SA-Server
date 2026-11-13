// Real Chromium source component check. No dist/build writes; no fake game ACK.
import {chromium} from '/home/coder/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
const root=process.cwd(),out=resolve(root,'Report/SA-1113-03');
const browser=await chromium.launch({headless:true,executablePath:'/home/coder/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const results=[];
try{for(const viewport of [{width:390,height:844},{width:844,height:390}]){
 const page=await browser.newPage({viewport,isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://layout.test/**',async route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/src/'))return route.fulfill({contentType:'text/javascript',body:stripTypeScriptTypes(readFileSync(resolve(root,'client'+u.pathname.replace(/\.js$/,'.ts')),'utf8')).replace(/(from\s+["'][^"']+)\.ts(["'])/g,'$1.js$2')});return route.fulfill({contentType:'text/html',body:readFileSync('client/index.html','utf8').replace(/<script[^>]+><\/script>/,'')});});
 await page.goto('http://layout.test/?device=mobile');
 await page.evaluate(async()=>{const {MobileShell}=await import('/src/mobile-shell.js');const {setDeviceMode}=await import('/src/mobile-view.js');setDeviceMode('mobile');
 const hits=Array.from({length:60},(_,i)=>({id:`long-${i}`,label:`策略与系统选项 ${i+1}`,x1:10,y1:i*12,x2:120,y2:i*12+10}));
 window.shell=new MobileShell({getMobileActions:()=>hits,texts:[],bottomLine:''},{action(){},command(){},direction(){},cancel(){},navigate(){},click(){}});window.shell.frame({phase:'field',panel:true,canEncounter:false});});
 await page.waitForTimeout(100);
 const bounds=await page.evaluate(()=>{const r=s=>{const x=document.querySelector(s).getBoundingClientRect();return {x:x.x,y:x.y,w:x.width,h:x.height}};return {stick:r('.mobile-shell-joystick'),sheet:r('.mobile-shell-sheet'),field:r('.mobile-shell-field')};});
 if(bounds.field.y>bounds.sheet.y)throw Error('movement below options');
 await page.locator('#mobile-chrome').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:resolve(out,`mobile-top-${viewport.width}.png`)});
 const sheet=page.locator('.mobile-shell-sheet');await sheet.hover();await page.mouse.wheel(0,900);await page.waitForTimeout(120);
 const session=await page.context().newCDPSession(page);
 await session.send('Input.synthesizeScrollGesture',{x:Math.min(80,viewport.width-10),y:viewport.height-45,yDistance:-150,gestureSourceType:'touch',speed:500});
 await page.waitForTimeout(150);
 const scroll=await sheet.evaluate(el=>({top:el.scrollTop,height:el.clientHeight,all:el.scrollHeight,touch:getComputedStyle(el).touchAction}));
 // Portrait uses chrome scroll; landscape the bounded sheet owns scrolling.
 const chromeScroll=await page.locator('#mobile-chrome').evaluate(el=>el.scrollTop);
 if(scroll.top===0&&chromeScroll===0)throw Error('long list cannot scroll');
 await page.screenshot({path:resolve(out,`mobile-layout-${viewport.width}.png`)});
 if(errors.length)throw Error(errors.join('\n'));results.push({viewport,bounds,scroll,chromeScroll,errors});await page.close();
}writeFileSync(resolve(out,'mobile-layout.json'),JSON.stringify({browser:browser.version(),scope:'real Chromium synthetic long-list component, not server toggle acceptance',results},null,2)+'\n');}finally{await browser.close();}
