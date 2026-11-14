// Screen-internal native UI geometry, assets and real game actions. All evaluate
// callbacks only inspect state; changes enter native buttons or physical input.
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export async function adaptivePanels(ui,record){
 const page=ui.page;
 for(const [width,height] of [[320,568],[390,844],[430,932],[844,390],[568,320]]){
  await page.setViewportSize({width,height});await ui.settle(180);
  for(const name of ['items','pets','status','quests','map','system']){
   await ui.toolbar(name);await ui.settle(180);
   const data=await page.evaluate(()=>{
    const root=document.getElementById('mobile-root'),sheet=document.querySelector('.mobile-shell-sheet');
    const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};
    const cards=[...document.querySelectorAll('.mobile-native-card')];
    return {viewport:rect(document.getElementById('mobile-viewport')),sheet:rect(sheet),role:sheet.getAttribute('role'),modal:sheet.getAttribute('aria-modal'),
     overflow:sheet.scrollWidth-sheet.clientWidth,bodyOverflow:document.documentElement.scrollWidth-innerWidth,
     nativeSkin:document.querySelector('.mobile-shell').style.getPropertyValue('--native-window').startsWith('url('),
     buttons:[...sheet.querySelectorAll('button[data-action]')].filter(e=>e.getClientRects().length).map(e=>({id:e.dataset.action,...rect(e)})),
     content:rect(document.querySelector('.mobile-shell-content')),actions:rect(document.querySelector('.mobile-shell-actions')),
     cards:cards.map(c=>({kind:c.dataset.kind,actions:[...c.querySelectorAll('button[data-action]')].map(b=>b.dataset.action)})),
     map:document.querySelector('[data-mobile-map]')?.hidden===false,context:root.dataset.context};
   });
   assert(data.context==='panel'&&data.role==='dialog'&&data.modal==='true',`${name} lacks native screen dialog semantics`);
   assert(data.nativeSkin,`${name} did not load original game window tiles`);
   assert(data.viewport.w===width&&data.viewport.h===height,`${name} reverted to external rails`);
   assert(data.sheet.x>=0&&data.sheet.y>=0&&data.sheet.x+data.sheet.w<=width+.5&&data.sheet.y+data.sheet.h<=height+.5,`${name} exceeds device screen`);
   assert(data.overflow<=1&&data.bodyOverflow<=1,`${name} has horizontal overflow`);
   assert(data.buttons.every(b=>b.w>=43.5&&b.h>=43.5),`${name} has undersized native actions at ${width}x${height}`);
   if(width>=700)assert(data.content.x+data.content.w<=data.actions.x+1,`${name} landscape columns overlap`);
   if(name==='items')assert(data.cards.length>0&&data.cards.every(c=>c.kind==='item'&&c.actions.length===1),`inventory native slots were flattened`);
   if(name==='pets')assert(data.cards.length>0&&data.cards.every(c=>c.kind==='pet'&&c.actions.some(id=>id.startsWith('pet-name'))),`pet status and operations were split apart`);
   if(name==='map')assert(data.map,'native rendered map is absent');
   if(width===844||width===320)await ui.snapshot(`adaptive-${name}-${width}`);
   await ui.closePanels();record(`adaptive native ${name} ${width}x${height}`,data);
  }
 }
 await page.setViewportSize({width:390,height:844});await ui.settle(200);
 await ui.toolbar('items');
 const art=page.locator('.mobile-native-card button[data-native-image]:not([data-native-image=""])').first();
 await art.waitFor();await art.scrollIntoViewIfNeeded();await page.waitForFunction(()=>[...document.querySelectorAll('.mobile-native-card button[data-native-image]')].some(b=>b.dataset.nativeImage&&b.dataset.nativeIcon==='true'),null,{timeout:15000});
 await ui.snapshot('adaptive-inventory-art');await ui.closePanels();
 await ui.toolbar('pets');await ui.action('pet-name0');
 await page.waitForFunction(()=>{const p=document.querySelector('.mobile-shell-native-portrait');return !p.hidden&&p.complete&&p.naturalWidth>0;},null,{timeout:20000});
 await ui.snapshot('adaptive-pet-native-portrait');
 await ui.action('pet-rename');
 const rename=page.locator('.mobile-shell-input input:visible').first();await rename.waitFor();const before=await rename.inputValue();
 await rename.fill('触屏输入验证');await rename.press('Escape');await ui.settle(200);
 // Escape follows the original native input handler; cancelled text cannot
 // mutate the authoritative pet name or become a scene shortcut.
 const after=await page.evaluate(()=>sa.screen.menus.petWnd.host.pets().pets.find(p=>p.slot===0).freeName);
 await ui.closePanels();record('native item CG, selected pet model and cancelled rename input',{itemArt:true,petModel:true,renameCancelled:after!== '触屏输入验证',originalInputLength:before.length});
 assert(after!=='触屏输入验证','cancelled native rename changed server state');
 await ui.toolbar('map');await ui.action('map-me');await ui.settle(150);
 const beforeMap=await page.evaluate(()=>{const m=sa.screen.menus.mapWnd,f=sa.field;return{cx:m.cx,cy:m.cy,follow:m.follow,target:f.target};});
 const map=page.locator('[data-mobile-map]:visible');await map.scrollIntoViewIfNeeded();
 const r=await map.boundingBox(),cdp=await page.context().newCDPSession(page);
 const p={x:r.x+r.width*.45,y:r.y+r.height*.5,id:1};
 assert(await page.evaluate(point=>document.elementFromPoint(point.x,point.y)?.getAttribute('data-mobile-map')==='true',p),'native map gesture point is covered or offscreen');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await ui.settle(50);
 for(let i=1;i<=5;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,x:p.x+i*9,y:p.y+i*3}]});await ui.settle(45);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await ui.settle(250);await cdp.detach();
 const afterMap=await page.evaluate(()=>{const m=sa.screen.menus.mapWnd,f=sa.field;return{cx:m.cx,cy:m.cy,follow:m.follow,target:f.target};});
 assert(!afterMap.follow&&(beforeMap.cx!==afterMap.cx||beforeMap.cy!==afterMap.cy),`real touch drag did not pan native map: ${JSON.stringify({beforeMap,afterMap,rect:r})}`);
 assert(JSON.stringify(beforeMap.target)===JSON.stringify(afterMap.target),'map drag incorrectly started navigation');
 await ui.snapshot('adaptive-native-map-pan');record('real touch pans the native map without navigation',{before:beforeMap,after:afterMap});
 const cancelSession=await page.context().newCDPSession(page);
 await cancelSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
 await cancelSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,x:p.x+30}]});await ui.settle(60);
 await cancelSession.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await ui.settle(200);await cancelSession.detach();
 const cancelState=await page.evaluate(()=>({target:sa.field.target,down:sa.ui.mouse.down}));
 assert(!cancelState.down&&JSON.stringify(cancelState.target)===JSON.stringify(beforeMap.target),'cancelled map gesture leaked a press or navigation');
 await ui.action('map-me');await ui.settle(200);
 const destination=await page.evaluate(()=>{
  const m=sa.screen.menus.mapWnd,f=sa.field,s=f.self,zoom=[2,3,4,6,8,12,16][m.zoom];
  for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)if((dx||dy)&&f.plainWalkable(s.x+dx,s.y+dy)){
   const ax=(s.x+dx-m.cx+s.y+dy-m.cy)*zoom,ay=(s.y+dy-m.cy-(s.x+dx-m.cx))*zoom*.75;
   return{x:s.x+dx,y:s.y+dy,u:.5+ax/430,v:.5+ay/356};
  }return null;
 });
 assert(destination,'no legal nearby native map tap destination');
 await map.scrollIntoViewIfNeeded();
 const positionBefore=await ui.position(),tapRect=await map.boundingBox();
 await page.touchscreen.tap(tapRect.x+destination.u*tapRect.width,tapRect.y+destination.v*tapRect.height);
 await page.waitForFunction(before=>sa.field.self.x!==before.x||sa.field.self.y!==before.y,positionBefore,{timeout:10000});
 const positionAfter=await ui.position();await ui.closePanels();
 record('native map touch cancellation and precise tap navigation',{cancelState,destination,positionBefore,positionAfter});
}
