// Native pages and retained animation, driven through real touch controls.
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export async function petStatusPanels(ui,record){
 const page=ui.page;
 await ui.closePanels();await ui.toolbar('pets');
 let basic=await page.evaluate(()=>({cards:sa.ui.cards.map(c=>({id:c.id,title:c.title,detail:c.detail})),portrait:sa.ui.portraits.length,info:sa.ui.panelInfo}));
 assert(basic.cards.length>0 && !basic.portrait && !basic.info,'initial pets page must contain basic list only');
 await ui.snapshot('native-pets-basic');await ui.action('pet-name0');
 await page.waitForFunction(()=>{const p=document.querySelector('.mobile-shell-native-portrait');return p&&!p.hidden&&p.complete&&p.naturalWidth>0;},null,{timeout:30000});
 const detail=await page.evaluate(()=>({cards:sa.ui.cards.length,info:sa.ui.panelInfo,animation:sa.ui.portraits[0]?.animation?.key,frames:sa.ui.portraits[0]?.animation?.frames.length}));
 assert(!detail.cards && detail.info?.lines.length>0&&detail.frames>1,'name tap failed to enter animated native detail');
 const frames=new Set();
 for(let i=0;i<32;i++){frames.add(await page.locator('.mobile-shell-native-portrait').getAttribute('src'));await ui.settle(90);}
 assert(frames.size>1,'pet native model never advanced its actual image');
 await ui.snapshot('native-pets-animated-detail');
 await page.emulateMedia({reducedMotion:'reduce'});await ui.settle(500);
 const first=await page.locator('.mobile-shell-native-portrait').getAttribute('src');await ui.settle(1000);
 assert(await page.locator('.mobile-shell-native-portrait').getAttribute('src')===first,'reduced-motion did not stop animation');
 await page.emulateMedia({reducedMotion:'no-preference'});await ui.closePanels();await ui.toolbar('pets');
 basic=await page.evaluate(()=>({cards:sa.ui.cards.length,portrait:sa.ui.portraits.length,info:sa.ui.panelInfo}));
 assert(basic.cards>0&&!basic.portrait&&!basic.info,'reopened pets window retained detail');
 await ui.closePanels();record('pet basic list, native animated detail and reduced motion',{basic,detail,distinctRenderedImages:frames.size,reducedMotionStable:true});
 await ui.toolbar('status');
 await page.waitForFunction(()=>{const p=document.querySelector('.mobile-shell-native-portrait');return !p.hidden&&p.complete&&p.naturalWidth>0;},null,{timeout:30000});
 const status=await page.evaluate(()=>({portrait:sa.ui.portraits[0],stats:sa.ui.panelInfo?.stats,info:sa.ui.panelInfo?.lines,rows:[...document.querySelectorAll('.mobile-native-stat')].map(r=>r.textContent)}));
 assert(status.portrait&&!status.portrait.rawIndex&&status.stats?.length===4,'status missing native face or attributes');
 await ui.snapshot('native-status-avatar');
 const wasExpanded=await page.evaluate(()=>sa.screen.menus.statusDetail);await ui.action('st-detail');await ui.settle(150);
 assert(await page.evaluate(()=>sa.screen.menus.statusDetail)===!wasExpanded,'native detail toggle did not change state');
 if(wasExpanded){await ui.action('st-detail');await ui.settle(150);}
 const expanded=await page.evaluate(()=>sa.ui.texts.filter(t=>t.x===298).map(t=>t.text));assert(expanded.length>0,'native status detail did not open');
 await ui.snapshot('native-status-expanded');await ui.action('st-group');await ui.settle(150);
 const group=await page.evaluate(()=>({portraits:sa.ui.portraits.length,stats:sa.ui.panelInfo?.stats??[],lines:sa.ui.panelInfo?.lines??[],buttons:[...document.querySelectorAll('button[data-action]')].filter(e=>e.getClientRects().length).map(e=>e.dataset.action)}));
 assert(!group.portraits&&!group.stats.length&&!group.buttons.some(id=>/^st-up/.test(id)),'party page leaked status avatar/points controls');
 await ui.snapshot('native-status-party');await ui.action('st-pclose');await ui.settle(100);await ui.closePanels();
 record('native status avatar, four attributes, expanded detail and party page',{status,expanded,group});
}
