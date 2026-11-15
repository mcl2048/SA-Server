// Supplementary actual touch path in the native mobile landscape panel.
import {resolve} from 'node:path';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export async function run(ui,results,{variant,out,snapshot}) {
 const browser=ui.page.context().browser(),GameUI=ui.constructor;await ui.page.context().close();
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 ui=new GameUI(await context.newPage(),true);await ui.enter();await ui.mode('immersive');
 const page=ui.page,record=(name,evidence)=>{results.checks.push({device:'mobile landscape',name,passed:true,evidence});console.log('mobile landscape '+name);};
 const wait=async(fn,message)=>{const end=Date.now()+30000;while(Date.now()<end){const value=await fn();if(value)return value;await ui.settle(70);}throw Error(message);};
 const nextNpc=async(action)=>{const before=ui.npcCount;await action();await wait(()=>ui.npcCount>before,'native landscape NPC response missing');const win=ui.latest.NpcWindow,title=(win.text??'').split('\n').map(t=>t.trim()).find(t=>t&&!/^[0-7]$/.test(t));await page.waitForFunction(({kind,title})=>{const ui=globalThis.sa?.ui,hits=ui?.getMobileActions()??[];return kind==='petselect'?hits.some(h=>h.id.startsWith('psel-')):hits.some(h=>h.id.startsWith('npc-'))&&(!title||ui.texts.some(t=>t.text.trim()===title));},{kind:win.kind,title},{timeout:20000});return win;};
 const select=async(label)=>{const h=await wait(async()=>(await ui.actions()).find(h=>h.id.startsWith('npc-sel')&&h.label?.includes(label)),'native landscape option missing: '+label);return nextNpc(()=>ui.action(h.id));};
 await ui.noEncounter();let lastGm=Date.now();
 for(const command of ['/warp 1003 12 14','/pet 9 1','/petname 0 横屏培养','/gold 100000']){await ui.settle(Math.max(0,850-(Date.now()-lastGm)));await ui.gm(command);lastGm=Date.now();}
 assert((await ui.position()).floor===1003,'landscape fixture must establish the official PetShop room via native GM warp');
 const point=await page.waitForFunction(()=>{const f=sa.field,actor=[...f.actors.values()].find(a=>a.kind==='npc'&&a.x===12&&a.y===13),rect=actor&&f.actorRects.find(r=>r[0]===actor),view=document.querySelector('#view').getBoundingClientRect();if(!rect)return null;return{x:view.x+(rect[1]+rect[3])/2*view.width/800,y:view.y+(rect[2]+rect[4])/2*view.height/600};});
 const p=await point.jsonValue();await point.dispose();await nextNpc(()=>page.touchscreen.tap(p.x,p.y));await select('培养宠物');await nextNpc(()=>ui.action('psel-0'));
 assert(ui.latest.NpcWindow.text.includes('5100'),'landscape quote must be (50+1)*100');await nextNpc(()=>ui.action('npc-btn2'));await wait(()=>snapshot().poolCount===500&&ui.latest.Pets.pets.length===0,'landscape training failed');
 record('real touch cultivation removes carried pet and fills shared slot500',{viewport:page.viewportSize(),quote:5100,stored:snapshot().pool.find(p=>p.free==='横屏培养')});
 await nextNpc(()=>ui.action('npc-btn0'));await select('领取宠物');
 for(let i=0;i<99;i++)await nextNpc(()=>ui.action('npc-btn5'));
 assert(ui.latest.NpcWindow.text.includes('第100/100页')&&!(ui.latest.NpcWindow.buttons&32),'landscape pagination did not end at100');
 await nextNpc(()=>ui.action('npc-btn4'));assert(ui.latest.NpcWindow.text.includes('第99/100页'),'landscape previous page did not work');await nextNpc(()=>ui.action('npc-btn5'));
 record('real touch next/previous reaches page100 and honors last-page boundary',{page:100,buttons:ui.latest.NpcWindow.buttons,viewport:page.viewportSize()});
 const target=await wait(async()=>(await ui.actions()).find(h=>h.id.startsWith('npc-sel')&&h.label?.includes('横屏培养')),'last landscape pet row missing');
 const dom=page.locator(`[data-action=${JSON.stringify(target.id)}]:visible`).first();await dom.scrollIntoViewIfNeeded();await ui.settle(160);
 const rect=await dom.boundingBox();assert(rect&&rect.y>=0&&rect.y+rect.height<=390&&rect.height>=24,'last landscape row cannot scroll into a reachable touch target');
 await page.screenshot({path:resolve(out,`${variant}-landscape-last-row-scrolled.png`)});
 await nextNpc(()=>ui.action(target.id));assert(ui.latest.NpcWindow.text.includes('横屏培养'),'landscape last-row selection changed pet identity');await nextNpc(()=>ui.action('npc-btn2'));
 await wait(()=>snapshot().poolCount===499&&ui.latest.Pets.pets.some(p=>p.freeName==='横屏培养'),'landscape retrieval failed');const restored=snapshot().pets.find(p=>p.free==='横屏培养');assert(restored&&!restored.training,'landscape retrieval retained training flag');
 record('landscape scroll reveals last row and real touch retrieves correct pet',{target:target.id,targetBounds:rect,restored,poolCount:snapshot().poolCount});
 await page.screenshot({path:resolve(out,`${variant}-landscape-withdrawn.png`)});await page.keyboard.press('Escape');await ui.settle(160);assert(!ui.errors.length,'landscape browser errors');return ui;
}
