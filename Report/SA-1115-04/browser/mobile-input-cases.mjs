// Real Chromium buttons/touch drive the native mobile surface; evaluate reads state only.
const assert = (value, message) => { if (!value) throw Error(message); };
export async function run(ui, results) {
 const browser=ui.page.context().browser(), GameUI=ui.constructor;
 await ui.page.context().close();
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 ui=new GameUI(await context.newPage(),true);await ui.enter();await ui.mode('immersive');
 for(const flag of ['quick','autoBattle','encounter'])await ui.flag(flag,false);
 await ui.noEncounter();await ui.gm('/warp 100 633 491');await ui.closePanels();
 await ui.page.waitForFunction(()=>sa.screen.openCount()===0&&!sa.ui.mouse.clicked,null,{timeout:15000});
 await ui.toolbar('map');
 const page=ui.page, surface=page.locator('canvas[data-mobile-map]:visible');await surface.waitFor();await ui.settle(400);
 const state=()=>page.evaluate(()=>({target:sa.field.target,status:sa.field.navigationStatus,x:sa.field.self.x,y:sa.field.self.y,mapOpen:sa.screen.menus.mapOpen}));
 const before=await state();
 await surface.click({button:'right',position:{x:130,y:65}});await ui.settle(700);
 const after=await state();
 results.mobileInput={before,after};
 assert(before.target===null&&after.target===null&&before.status===after.status&&before.x===after.x&&before.y===after.y,'secondary mouse click changed native mobile-map navigation');
 results.checks.push({case:'mobile map ignores secondary mouse button',passed:true,evidence:results.mobileInput});
 await surface.tap({position:{x:130,y:65}});await ui.settle(700);
 const tapped=await state();assert(tapped.target!==null||tapped.status!==after.status||tapped.x!==after.x||tapped.y!==after.y,'primary native touch tap stopped selecting destinations');
 results.mobileInput.touch=tapped;results.checks.push({case:'mobile map primary touch still selects destination',passed:true,evidence:tapped});
 await ui.snapshot('mobile-input-map');await ui.closePanels();return ui;
}
