// Real Chromium component evidence. Synthetic menu content exercises the real
// Ui, native hit filtering and MobileShell; this is not authenticated gameplay.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = resolve(root, "Report/SA-1113-04/browser");
mkdirSync(out, { recursive: true });
const baseline = process.argv.includes("--baseline");
const { chromium } = await import(process.env.SA_PLAYWRIGHT_MODULE ?? "/home/coder/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs");
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.SA_CHROMIUM ?? "/home/coder/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell",
  args: ["--no-sandbox"] });
const results = [], failures = [];
try {
  for (const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:568,height:320}]) {
    const page = await browser.newPage({ viewport, isMobile: true, hasTouch: true });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.route("http://mobile.test/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/src/")) {
        const path = resolve(root, "client" + url.pathname.replace(/\.js$/, ".ts"));
        if (!path.startsWith(resolve(root,"client/src") + "/")) throw Error("invalid source path");
        return route.fulfill({ contentType: "text/javascript", body: stripTypeScriptTypes(readFileSync(path,"utf8"))
          .replace(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2") });
      }
      return route.fulfill({ contentType: "text/html", body: readFileSync(resolve(root,"client/index.html"),"utf8")
        .replace(/<script[^>]+><\/script>/," ") });
    });
    await page.goto("http://mobile.test/?device=mobile");
    await page.evaluate(async () => {
      const { MobileShell } = await import("/src/mobile-shell.js");
      const { Ui, Mouse, FONT } = await import("/src/ui.js");
      const { setDeviceMode } = await import("/src/mobile-view.js"); setDeviceMode("mobile");
      const mouse = new Mouse(); mouse.attach(document.querySelector("#view"));
      const ui = new Ui({}, mouse); window.ui = ui;
      window.fired = [];
      window.shell = new MobileShell(ui, {
        action: id => window.fired.push(["action",id]), command: name => window.fired.push(["command",name]),
        direction: dir => window.fired.push(["direction",dir]), cancel: () => window.fired.push(["cancel"]),
        navigate: dir => window.fired.push(["navigate",dir]), click: key => window.fired.push(["click",key])
      });
      window.menu = () => {
        ui.begin();
        for (const column of [0,1]) for (let row=0;row<4;row++) {
          const x=column===0?110:280,y=100+row*50;
          const text=column===0?["地属性","水属性","火属性","风属性"][row]:`增加${["地","水","火","风"][row]}属性`;
          ui.textButton(x,y,text,FONT.WHITE,`${column===0?"stat":"add"}-${row}`);
        }
        ui.textButton(110,360,"返回人物资料",FONT.WHITE,"st-pclose");
        window.shell.frame({phase:"field",panel:true,title:"状态",canEncounter:true,encounter:false});
      };
      window.menu();
    });
    await page.waitForTimeout(90);
    const aligned = await page.evaluate(() => {
      const actions=[...document.querySelectorAll(".mobile-shell-actions button")];
      const rowIds=actions.map(b=>b.dataset.action);
      const expected=["stat-0","add-0","stat-1","add-1","stat-2","add-2","stat-3","add-3","st-pclose"];
      const pairs=Array.from({length:4},(_,i)=>{
        const a=actions.find(b=>b.dataset.action===`stat-${i}`).getBoundingClientRect();
        const b=actions.find(b=>b.dataset.action===`add-${i}`).getBoundingClientRect();
        return {y:a.y,nextY:b.y,height:a.height,nextHeight:b.height};
      });
      const touch=[...document.querySelectorAll(".mobile-shell button")].filter(b=>b.getClientRects().length)
        .map(b=>({id:b.dataset.action??b.dataset.mobileControl??b.textContent,w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height}));
      const field=document.querySelector(".mobile-shell-field").getBoundingClientRect();
      const sheet=document.querySelector(".mobile-shell-sheet").getBoundingClientRect();
      return {rowIds,orderCorrect:JSON.stringify(rowIds)===JSON.stringify(expected),pairs,
        shortTargets:touch.filter(b=>b.w<43.5||b.h<43.5),fieldBeforeSheet:field.y<sheet.y};
    });
    if (!aligned.orderCorrect) failures.push(`${viewport.width}: native visual row order`);
    if (aligned.shortTargets.length) failures.push(`${viewport.width}: touch targets below44px`);
    const portrait=viewport.width<viewport.height;
    if (portrait && aligned.pairs.some(p=>Math.abs(p.y-p.nextY)>1||Math.abs(p.height-p.nextHeight)>1)) failures.push(`${viewport.width}: same-row button alignment`);
    await page.screenshot({path:resolve(out,`mobile-${baseline?"baseline":"final"}-${viewport.width}.png`)});
    await page.evaluate(() => {
      const ui=window.ui; ui.begin();
      for(let i=0;i<60;i++) ui.textButton(110,90+i*22,`系统长选项 ${i+1}`,"#fff",`long-${i}`);
      window.shell.frame({phase:"field",panel:true,title:"系统",canEncounter:true}); window.fired.length=0;
    });
    await page.waitForTimeout(60);
    const sheet=page.locator(".mobile-shell-sheet");
    const box=await sheet.boundingBox();
    const chrome=page.locator("#mobile-chrome");
    // Bring the independent native sheet into view in portrait; narrow screens
    // may put its first item just below the movement controls.
    await page.locator(".mobile-shell-actions button").first().scrollIntoViewIfNeeded();
    const first=await page.locator(".mobile-shell-actions button").first().boundingBox();
    const x=Math.max(8,Math.min(viewport.width-8,first.x+first.width/2));
    const y=Math.max(80,Math.min(viewport.height-15,first.y+first.height/2));
    const session=await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id:1}]});
    for (const distance of [20,50,90,140]) {
      await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:Math.max(15,y-distance),id:1}]});
      await page.waitForTimeout(20);
    }
    await session.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await page.waitForTimeout(80);
    const scroll=await page.evaluate(()=>({sheet:document.querySelector(".mobile-shell-sheet").scrollTop,
      chrome:document.querySelector("#mobile-chrome").scrollTop,actions:window.fired.filter(e=>e[0]==="action"),
      all:document.querySelector(".mobile-shell-sheet").scrollHeight,client:document.querySelector(".mobile-shell-sheet").clientHeight}));
    if (!scroll.sheet&&!scroll.chrome) failures.push(`${viewport.width}: long list cannot scroll`);
    if(scroll.actions.length) failures.push(`${viewport.width}: scrolling activated native action`);
    if(errors.length) failures.push(`${viewport.width}: ${errors.join("; ")}`);
    results.push({viewport,aligned,scroll,errors,scope:"real Chromium / actual Ui and MobileShell / synthetic menu content"});
    await page.close();
  }
  writeFileSync(resolve(out,`mobile-components-${baseline?"baseline":"final"}.json`),JSON.stringify({browser:browser.version(),baseline,results,failures},null,2)+"\n");
  console.log(JSON.stringify({browser:browser.version(),baseline,failures,viewports:results.length},null,2));
  if(failures.length&&!baseline) process.exitCode=1;
} finally { await browser.close(); }
