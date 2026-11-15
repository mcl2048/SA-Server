// Render the actual report at desktop/mobile sizes and check local evidence links.
import {createServer} from 'node:http';
import {readFileSync,statSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from '/home/coder/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(import.meta.dirname);
const types={'.html':'text/html; charset=utf-8','.png':'image/png','.json':'application/json','.md':'text/plain; charset=utf-8'};
const server=createServer((req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+'/')||!statSync(path).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream'});if(req.method==='HEAD')res.end();else res.end(readFileSync(path));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const errors=[],checks=[];
try{
 browser=await chromium.launch({headless:true,executablePath:'/home/coder/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
 for(const [device,width,height]of [['desktop',1360,1000],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/Report/SA-1115-03/index.html`,{waitUntil:'networkidle'});
  const result=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,links:[...document.querySelectorAll('a[href]')].map(a=>a.href),images:[...document.images].map(i=>i.src)}));
  if(result.scrollWidth>result.width)throw Error(device+' report overflows');
  for(const url of new Set([...result.links,...result.images])){const r=await page.request.head(url);if(r.status()!==200)throw Error('broken local evidence link: '+new URL(url).pathname);}
  await page.screenshot({path:resolve(out,`report-${device}.png`),fullPage:true});
  checks.push({device,width,height,documentOverflow:false,links:[...new Set(result.links)].length,images:result.images.length,passed:true});await page.close();
 }
 if(errors.length)throw Error('report page errors');
 writeFileSync(resolve(out,'report-validation.json'),JSON.stringify({success:true,checks,errors},null,2)+'\n');console.log('Report desktop/mobile and all local links passed');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
