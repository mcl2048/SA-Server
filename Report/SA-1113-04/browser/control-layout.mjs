// Real Chromium component regression for the production shell/view/position
// manager. Synthetic content only: this does not authenticate or certify a device.
import { chromium } from "/home/coder/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd(), name = process.argv.includes("--before") ? "before" : "after";
const scrollOnly = process.argv.includes("--scroll-only");
const result = { browser: "", scope: "real Chromium UI components with synthetic content; production position manager installed", cases: [], failures: [] };
const browser = await chromium.launch({ executablePath: "/home/coder/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const pause = ms => new Promise(r => setTimeout(r, ms));
const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const check = (ok, message) => { if (!ok) throw Error(message); };
await page.route("http://controls.test/**", async route => {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith("/src/")) {
    const path = resolve(root, "client" + url.pathname.replace(/\.js$/, ".ts"));
    if (!path.startsWith(resolve(root, "client/src") + "/")) throw Error("invalid source path");
    let source = readFileSync(path, "utf8");
    if (name === "before" && url.pathname === "/src/mobile-position.js") source = execFileSync("git", ["show", "31a8848:client/src/mobile-position.ts"], { encoding: "utf8" });
    if (name === "before" && url.pathname === "/src/mobile-view.js") source = source
      .replace('if (root.dataset.orientation !== orientation) root.dataset.orientation = orientation;', 'root.dataset.orientation = orientation;')
      .replace('if (root.dataset.display !== display) root.dataset.display = display;', 'root.dataset.display = display;');
    return route.fulfill({ contentType: "text/javascript", body: stripTypeScriptTypes(source).replace(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2") });
  }
  const html = readFileSync(resolve(root, "client/index.html"), "utf8").replace(/<script type="module"[^>]*><\/script>/, "");
  return route.fulfill({ contentType: "text/html", body: html });
});
page.on("pageerror", e => result.failures.push(e.message));
async function setup() {
  await page.goto("http://controls.test/?device=mobile");
  await page.evaluate(async () => {
    const { MobileShell } = await import("/src/mobile-shell.js");
    const view = await import("/src/mobile-view.js");
    const { installControlPositions } = await import("/src/mobile-position.js");
    globalThis.controlsView = view;
    globalThis.controlCommands = [];
    const ui = { texts: [], bottomLine: "", getMobileActions: () => Array.from({ length: 12 }, (_, i) => ({ id: `fp-social-${i}`, x1: 1, y1: i * 44, x2: 45, y2: i * 44 + 40, label: `附近互动 ${i + 1}` })) };
    const shell = new MobileShell(ui, { action() {}, command: id => controlCommands.push(id), direction() {}, cancel() {}, navigate() {}, click() {} });
    globalThis.controlsShell = shell;
    globalThis.controlsState = { phase: "field", context: "field", panel: false, status: "真实组件验证" };
    view.setDeviceMode("mobile"); view.setMobileDisplayMode("classic"); shell.frame(controlsState);
    installControlPositions(() => {});
  });
  await settle(); await pause(120);
}
async function mode(display, battle = false) {
  await page.evaluate(({ display, battle }) => {
    controlsState = { ...controlsState, phase: battle ? "battle" : "field", context: battle ? "battle" : "field" };
    controlsView.setMobileDisplayMode(display); controlsShell.frame(controlsState);
  }, { display, battle });
  await settle(); await pause(120);
}
async function drag(selector, dx, dy, animate = false) {
  const el = page.locator(selector), box = await el.boundingBox(); check(box, "control is not visible");
  const session = await page.context().newCDPSession(page);
  const p = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  if (animate) await page.evaluate(() => {
    globalThis.animateControls = true;
    const tick = now => { if (!animateControls) return; controlsView.setSceneFocus(400 + Math.sin(now / 180) * 120, 300, now); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
  await pause(800);
  const active = await el.evaluate(e => e.classList.contains("is-positioning"));
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...p, x: p.x + dx, y: p.y + dy }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  if (animate) await page.evaluate(() => { animateControls = false; });
  await settle(); await pause(120); await session.detach();
  return active;
}
try {
  result.browser = browser.version(); await setup();
  if (!scrollOnly) {
  const classicActive = await drag("[data-mobile-control=joystick]", 40, -25);
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("sa-control-positions-v1"))["portrait:joystick"]);
  check(classicActive && original, "classic drag did not record a real preference");
  await mode("immersive");
  const inherited = await page.locator(".mobile-floating-controls [data-mobile-control=joystick]").count();
  await drag("[data-mobile-control=joystick]", 20, -20);
  await mode("classic");
  const returned = await page.evaluate(() => JSON.parse(localStorage.getItem("sa-control-positions-v1"))["portrait:joystick"]);
  const independent = inherited === 0 && returned.x === original.x && returned.y === original.y;
  result.cases.push({ case: "classic preference survives immersive layout and drag", original, returned, inherited, passed: independent });
  if (!independent) result.failures.push("classic saved position was applied/overwritten in immersive mode");

  await mode("immersive", true);
  const activeDuringCamera = await drag("[data-mobile-control=menu-tray]", 15, 15, true);
  result.cases.push({ case: "long press survives an animating battle camera", passed: activeDuringCamera });
  if (!activeDuringCamera) result.failures.push("camera layout repeatedly cancels the position edit timer");
  }

  await page.setViewportSize({ width: 568, height: 320 }); await mode("immersive");
  const toggle = page.locator(".mobile-shell-tray-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.tap();
  await settle();
  const first = page.locator(".mobile-shell-drawer [data-mobile-control=menu-items]"), box = await first.boundingBox(); check(box, "drawer item control not visible");
  const commandCountBefore = await page.evaluate(() => controlCommands.length);
  const before = await page.locator(".mobile-shell-drawer").evaluate(e => ({ top: e.scrollTop, max: e.scrollHeight - e.clientHeight }));
  const visiblePrimary = await first.evaluate(e => { const r = e.getBoundingClientRect(), p = e.closest(".mobile-shell-drawer").getBoundingClientRect(); return r.y + r.height / 2 >= p.top && r.y + r.height / 2 <= p.bottom; });
  result.cases.push({ case: "primary menu stays visible ahead of a long native social list", passed: visiblePrimary });
  if (!visiblePrimary) result.failures.push("inherited toolbar order pushes primary menus below the long list");
  const session = await page.context().newCDPSession(page), p = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
  for (let i = 1; i <= 5; i++) { await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...p, y: p.y - i * 15 }] }); await pause(35); }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await pause(200); await session.detach();
  const after = await page.locator(".mobile-shell-drawer").evaluate(e => e.scrollTop);
  const fired = await page.evaluate(() => controlCommands);
  const scrolled = before.max > 0 && after > before.top && fired.length === commandCountBefore;
  result.cases.push({ case: "drawer scrolls from a button without firing its action", before, after, fired, passed: scrolled });
  if (!scrolled) result.failures.push("button touch action blocks drawer scrolling or fires a command");
  await page.screenshot({ path: resolve(root, `Report/SA-1113-04/browser/control-layout-${name}.png`) });
} catch (e) {
  result.failures.push(e.message);
  result.debug = await page.evaluate(() => ({ mobile: document.documentElement.className,
    root: { ...document.getElementById("mobile-root").dataset }, state: controlsState,
    shell: { ...document.querySelector(".mobile-shell").dataset },
    tray: document.getElementById("mobile-shell-drawer")?.outerHTML,
    toolbarParent: document.querySelector(".mobile-shell-toolbar")?.parentElement?.className,
    controls: [...document.querySelectorAll("[data-mobile-control]")].map(e => ({ id: e.dataset.mobileControl, visible: !!e.getClientRects().length })) }));
  await page.screenshot({ path: resolve(root, `Report/SA-1113-04/browser/control-layout-${name}.png`) });
}
finally { await browser.close(); }
writeFileSync(resolve(root, `Report/SA-1113-04/browser/control-layout-${name}.json`), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
if (result.failures.length) process.exitCode = 1;
