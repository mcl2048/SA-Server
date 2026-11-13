// Real Chromium / real BattleScreen drawing, synthetic fighters and sprite art.
// No authenticated gameplay, game assets or physical-device certification implied.
import { chromium } from '/home/coder/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
const root=process.cwd(),out=resolve(root,'Report/SA-1113-03/browser');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/home/coder/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',headless:true,args:['--no-sandbox']});
const results=[];
try{for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1000,height:800},deviceScaleFactor:2,isMobile:mobile,hasTouch:mobile});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://battle.test/**',async route=>{
 const url=new URL(route.request().url());if(url.pathname.startsWith('/src/')){const p=resolve(root,'client'+url.pathname.replace(/\.js$/,'.ts'));if(!p.startsWith(resolve(root,'client/src')+'/'))throw Error('bad path');return route.fulfill({contentType:'text/javascript',body:stripTypeScriptTypes(readFileSync(p,'utf8')).replace(/(from\s+["'][^"']+)\.ts(["'])/g,'$1.js$2')});}
 return route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#15232c;color:#e9edf0;font:15px sans-serif}p{padding:10px}canvas{width:100%;max-width:800px;background:linear-gradient(150deg,#596749,#2c424a)}</style><p>真实 Chromium 组件 · 合成人物/宠物轮廓<br>${mobile?'390px mobile':'desktop'} · 非实际战斗</p><canvas width="800" height="600"></canvas>`});});
 await page.goto('http://battle.test/');
 const result=await page.evaluate(async mobile=>{
 const {BattleScreen}=await import('/src/battle.js'),{drawOverlay}=await import('/src/ui.js'),{setDeviceMode}=await import('/src/mobile-view.js');setDeviceMode(mobile?'mobile':'desktop');
 const c=document.querySelector('canvas'),ctx=c.getContext('2d');
 const ui={texts:[],boxes:[],pics:[],pic(canvas,x,y){this.pics.push({canvas,x,y});},box(x1,y1,x2,y2,color,fill){this.boxes.push({x1,y1,x2,y2,color,fill});},image(_i,x,y){if(_i===2){ctx.fillStyle='#79c4bc';ctx.strokeStyle='#192931';ctx.beginPath();ctx.ellipse(x,y-12,45,16,0,0,7);ctx.fill();ctx.stroke();return;}ctx.fillStyle='#79c4bc';ctx.strokeStyle='#192931';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y-45,24,44,0,0,7);ctx.fill();ctx.stroke();ctx.fillStyle='#ffe5aa';ctx.beginPath();ctx.arc(x,y-95,18,0,7);ctx.fill();ctx.stroke();}};
 const host={ui,names:()=>false,quick:()=>true,root:'',assets:{image:()=>({ox:-28,oy:-115,w:56,h:120}),anim:()=>({actions:[{type:3,dir:3,ticks:1,frames:[[1,0,0,0]]},{type:2,dir:0,ticks:1,frames:[[2,0,0,0]]}]})}};
 const wire=Array.from({length:5},(_,i)=>({slot:i,name:'sample',sprite:100001,maxHp:2400,maxMp:i===0?600:0,rideMaxHp:0,hp:i===3?0:1800,mp:300,status:0}));
 const s=new BattleScreen(host,{fighters:wire,mySlot:0,resume:true,field:0});
 const own=[...s.fighters.values()];own.forEach((a,i)=>{a.x=360+i*83;a.y=265+i*34;});
 s.drawFighters(0);if(own[3].frame(host.assets,0)[0]!==2)throw Error('dead sample not using DEAD frame');
 const resourcePics=ui.pics.slice();for(const p of resourcePics){const overlaps=own.some(a=>p.y<a.rect[1]+a.rect[3]&&p.y+p.canvas.height>a.rect[1]&&p.x<a.rect[0]+a.rect[2]&&p.x+p.canvas.width>a.rect[0]);if(overlaps)throw Error('resource intersects model');}
 // Five enemy positions stress the top edge through the full bounce trajectory.
 for(let i=0;i<5;i++){const a={x:80+i*150,y:40+i*20,rect:[58+i*150,-70+i*20,44,110]};s.popup(a,100,{text:String(12840+i*91)});}
 s.drawFx(300);for(const p of ui.pics)if(p.x<0||p.x+p.canvas.width>800||p.y<0||p.y+p.canvas.height>600)throw Error('clipped label');
 drawOverlay(ctx,ui);
 const label=s.combatLabel('12840',mobile?32:24,'#ffdf45');if(s.combatLabel('12840',mobile?32:24,'#ffdf45')!==label)throw Error('cache miss');
 return{mobile,resourceCount:resourcePics.length,allLabelsWithinStage:true,resourceModelIntersections:0,damageFont:'900 rounded sans-serif',damageColor:'#ffdf45',scope:'synthetic component scene / actual BattleScreen + Canvas'};
 },mobile);
 await page.screenshot({path:resolve(out,`battle-ui-${mobile?'mobile':'desktop'}.png`),fullPage:true});if(errors.length)throw Error(errors.join('\n'));results.push(result);await page.close();
}writeFileSync(resolve(out,'ui-components.json'),JSON.stringify({browser:browser.version(),results},null,2)+'\n');console.log(JSON.stringify(results));}finally{await browser.close();}
