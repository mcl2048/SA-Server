import {chromium} from '/home/coder/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
const out=dirname(fileURLToPath(import.meta.url)),errors=[],results=[];
const browser=await chromium.launch({headless:true,executablePath:'/home/coder/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
try{
 for(const [name,viewport]of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(resolve(out,'index.html')).href);await page.locator('img').first().waitFor();
  for(const img of await page.locator('img').all())await img.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));await page.locator('h1').scrollIntoViewIfNeeded();
  const state=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.title,cards:document.querySelectorAll('article').length,images:[...document.images].map(i=>({src:i.getAttribute('src'),loaded:i.complete&&i.naturalWidth>0})),text:document.body.innerText}));
  if(state.scroll>state.width||state.cards!==4||state.images.some(i=>!i.loaded)||!state.text.includes('274')||!state.text.includes('v0.2.22-LYNX'))throw Error('report verification failed '+name);
  await page.screenshot({path:resolve(out,`report-${name}.png`),fullPage:true});results.push({name,width:state.width,scroll:state.scroll,cards:state.cards,images:state.images.length});await page.close();
 }
 if(errors.length)throw Error(errors.join('\n'));
 writeFileSync(resolve(out,'report-validation.json'),JSON.stringify({success:true,browser:browser.version(),views:results,errors},null,2)+'\n');
 console.log('Report desktop/mobile layout and all screenshots verified');
}finally{await browser.close();}
