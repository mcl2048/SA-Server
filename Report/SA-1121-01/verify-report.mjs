// Serve only this public report; inspect the actual rendered desktop/mobile DOM.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {dirname,extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const out=dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.png':'image/png','.json':'application/json','.md':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}
  const path=resolve(out,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(out+sep))throw Error('outside report');
  const bytes=await readFile(path);res.setHeader('Content-Type',mime[extname(path)]??'text/plain');res.end(bytes);
 }catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 const {chromium}=await import('/home/coder/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs');
 browser=await chromium.launch({headless:true,executablePath:'/home/coder/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
 const errors=[],page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${new URL(r.url()).pathname}`);});
 const checks=[];
 for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  await page.setViewportSize(viewport);
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
  const measured=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
   images:[...document.images].map(i=>({src:i.getAttribute('src'),width:i.naturalWidth,height:i.naturalHeight})),
   rows:document.querySelectorAll('tbody tr').length,links:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href'))}));
  if(measured.scrollWidth>measured.width)throw Error(`${device}: horizontal overflow`);
  for(const link of measured.links){const p=resolve(out,link);if(!(await stat(p)).isFile())throw Error(`missing report link: ${link}`);}
  await page.screenshot({path:resolve(out,`report-${device}.png`),fullPage:true});
  checks.push({device,viewport,...measured,passed:true});
 }
 if(errors.length)throw Error(errors.join('\n'));
 const result={success:true,browser:browser.version(),checks,errors};
 writeFileSync(resolve(out,'report-layout.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}finally{
 if(browser)await browser.close();
 await new Promise(r=>server.close(r));
}
