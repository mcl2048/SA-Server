// Authenticated release-ELF acceptance. The owner runner supplies a real GameUI;
// this module uses UI controls/keys/GM chat and only reads native state in page.

const assert = (ok, message) => { if (!ok) throw Error(message); };
export async function runMatrix(ui, results, { variant, out }) {
  const cases = results.matrix = [], checks = results.checks;
  const record = (name, evidence) => { cases.push({ case: name, ...evidence }); checks.push({ case: name, passed: true }); console.log(JSON.stringify({ variant, matrix_case: name })); };
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const rawGm = ui.gm.bind(ui); let lastGm = 0;
  ui.gm = async (...args) => { await pause(Math.max(0, 750 - (Date.now() - lastGm))); const value = await rawGm(...args); lastGm = Date.now(); return value; };
  const geometry = page => page.evaluate(() => {
    const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const root = document.getElementById("mobile-root"), stage = document.querySelector(".stage"), viewport = document.getElementById("mobile-viewport");
    return { screen: { width: innerWidth, height: innerHeight }, mobile: document.documentElement.classList.contains("sa-mobile"),
      context: root.dataset.context, display: root.dataset.display, stage: rect(stage), viewport: rect(viewport), stageInBody: stage.parentElement === document.body,
      backing: { width: view.width, height: view.height } };
  });
  const mobileCount = () => ui.page.evaluate(() => sa.screen.openCount());
  async function closeMenus() {
    for (let i = 0; i < 4 && await mobileCount(); i++) await ui.back();
    assert(await mobileCount() === 0, "mobile menu did not close through its real back control");
  }
  async function dimensions(display) {
    if (variant !== "baseline") await ui.mode(display);
    for (const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390], [568, 320]]) {
      await ui.page.setViewportSize({ width, height }); await ui.settle(250);
      const g = await geometry(ui.page), ratio = g.stage.width / g.stage.height;
      assert(g.mobile && Math.abs(ratio - 4 / 3) < .002, "scene aspect ratio changed");
      if (display === "immersive") {
        assert(g.context === "field" && Math.abs(g.viewport.width - width) < 1 && Math.abs(g.viewport.height - height) < 1, "immersive field does not fill visible viewport");
        assert(g.stage.width / 800 >= .999 && g.stage.x <= g.viewport.x + .2 && g.stage.y <= g.viewport.y + .2
          && g.stage.x + g.stage.width >= g.viewport.x + width - .2 && g.stage.y + g.stage.height >= g.viewport.y + height - .2, "immersive scene shrank or revealed blank space");
      } else assert(g.stage.width <= width + 1 && g.stage.height <= height + 1, "classic scene is clipped");
      record(`${display} ${width}x${height}`, g);
      if (width === 390 || width === 844) await ui.snapshot(`matrix-${display}-${width}`);
    }
    await ui.page.setViewportSize({ width: 390, height: 844 }); await ui.settle(250);
  }
  async function menus(display) {
    for (const name of ["items", "pets", "status", "quests", "map", "system"]) {
      await ui.toolbar(name); await ui.settle(200);
      assert(await mobileCount() > 0, `${name} native menu was not opened`);
      const g = await geometry(ui.page);
      if (variant !== "baseline") assert(g.context === "panel", `${name} retained a cropped scene context`);
      const targets = await ui.page.evaluate(() => [...document.querySelectorAll("button[data-action]")].filter(e => e.getClientRects().length).map(e => ({ id: e.dataset.action, height: e.getBoundingClientRect().height })));
      assert(targets.every(b => b.height >= 43.5), `${name} has undersized mobile action buttons`);
      await ui.snapshot(`matrix-${display}-${name}`); await closeMenus();
      record(`${display} native ${name}`, { context: g.context, buttons: targets.length, closed: true });
    }
  }

  // A separate desktop browser context exercises mouse timing and the complete
  // original stage. It temporarily takes over this private test character.
  const browser = ui.page.context().browser(), UiClass = ui.constructor;
  await ui.page.context().close();
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
  const desk = new UiClass(await desktop.newPage(), false);
  results.desktopEvents = desk.events;
  try {
    console.log(JSON.stringify({ variant, matrix_step: "desktop-enter" }));
    await desk.enter(); console.log(JSON.stringify({ variant, matrix_step: "desktop-authenticated" }));
    await desk.noEncounter(); await desk.gm("/heal");
    const g = await geometry(desk.page);
    assert(!g.mobile && g.stageInBody && Math.abs(g.stage.width / g.stage.height - 4 / 3) < .001, "desktop stage no longer uses its original full layout");
    await desk.snapshot("matrix-desktop-field");
    for (const id of ["tb-status", "tb-item", "tb-pet", "tb-map", "tb-system"]) {
      console.log(JSON.stringify({ variant, matrix_step: "desktop-action", id }));
      await desk.action(id); await desk.settle(150);
      for (let n = 0; n < 4 && await desk.page.evaluate(() => sa.screen.openCount()); n++) {
        const close = (await desk.actions()).find(h => !/^(?:tb-|fp-)/.test(h.id) && /(?:close|cancel|return|back)$/.test(h.id));
        if (close) await desk.action(close.id); else { await desk.page.keyboard.press("Escape"); await desk.settle(150); }
      }
      assert(await desk.page.evaluate(() => sa.screen.openCount()) === 0, `${id} desktop native close failed`);
    }
    results.desktopEvents = desk.events; record("separate desktop context and native mouse menus", g);
  } catch (e) {
    results.desktopFailure = { stack: e.stack, phase: await desk.phase(), actions: await desk.actions() };
    throw e;
  } finally { await desktop.close(); }
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  ui = new UiClass(await mobile.newPage(), true);
  const mobileGm = ui.gm.bind(ui); lastGm = 0;
  ui.gm = async (...args) => { await pause(Math.max(0, 750 - (Date.now() - lastGm))); const value = await mobileGm(...args); lastGm = Date.now(); return value; };
  await ui.enter(); await ui.noEncounter(); await ui.gm("/heal");
  await dimensions("classic"); await menus("classic");
  if (variant === "baseline") return ui;
  await dimensions("immersive"); await menus("immersive");

  // Real joystick movement in a checked corridor, avoiding wall-induced false
  // negatives. Sector 4 is screen-left and maps to native direction 2.
  const corridor = await ui.page.evaluate(() => {
    const f = sa.field, s = f.self;
    for (let radius = 0; radius <= 12; radius++) for (let x = s.x - radius; x <= s.x + radius; x++) for (let y = s.y - radius; y <= s.y + radius; y++) {
      if (!f.plainWalkable(x, y)) continue;
      let legal = true;
      for (let n = 1; n <= 6; n++) if (!f.plainWalkable(x - n, y - n) || !f.plainWalkable(x - n, y - n + 1) || !f.plainWalkable(x - n + 1, y - n)) { legal = false; break; }
      if (legal) return { floor: f.floor, x, y };
    }
    return null;
  });
  assert(corridor, "no loaded legal corridor for joystick acceptance");
  await ui.gm(`/warp ${corridor.floor} ${corridor.x} ${corridor.y}`); await ui.settle(200);
  const stick = ui.page.locator("[data-mobile-control=joystick]"), r = await stick.boundingBox(), session = await ui.page.context().newCDPSession(ui.page);
  const before = await ui.position(), p = { x: r.x + r.width * .18, y: r.y + r.height / 2, id: 1 };
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] }); await ui.settle(650);
  const moved = await ui.position(); await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await ui.settle(700); const stopped = await ui.position(); await ui.settle(500); const stable = await ui.position(); await session.detach();
  assert(moved.x !== before.x || moved.y !== before.y, "joystick emitted no real movement");
  assert(stopped.x === stable.x && stopped.y === stable.y, "joystick continued moving after release");
  record("real joystick move and release", { before, moved, stopped, stable });

  // Exercise the position manager's production touch-action on a short screen.
  await ui.page.setViewportSize({ width: 568, height: 320 }); await ui.settle(200);
  const drawerToggle = ui.page.locator("[data-mobile-control=menu-tray]");
  if (await drawerToggle.getAttribute("aria-expanded") !== "true") await drawerToggle.tap();
  await ui.settle(120);
  const target = await ui.page.locator(".mobile-shell-drawer").evaluate(e => {
    const r = e.getBoundingClientRect();
    const buttons = [...e.querySelectorAll("button[data-mobile-control]")];
    const button = buttons.find(b => { const q = b.getBoundingClientRect(), x = q.x + q.width / 2, y = q.y + q.height / 2;
      return y > r.top + 8 && y < r.bottom - 8 && x > r.left && x < r.right && b.contains(document.elementFromPoint(x, y)); });
    if (!button) return { error: "no uncovered drawer button", top: e.scrollTop, max: e.scrollHeight - e.clientHeight, drawer: { x: r.x, y: r.y, width: r.width, height: r.height },
      controls: buttons.map(b => { const q = b.getBoundingClientRect(), x = q.x + q.width / 2, y = q.y + q.height / 2, at = document.elementFromPoint(x, y);
        return { id: b.dataset.mobileControl, rect: { x: q.x, y: q.y, w: q.width, h: q.height }, coveredBy: at?.className, touchAction: getComputedStyle(b).touchAction }; }) };
    const b = button.getBoundingClientRect(); return { id: button.dataset.mobileControl, x: b.x + b.width / 2, y: b.y + b.height / 2,
      top: e.scrollTop, max: e.scrollHeight - e.clientHeight, touchAction: getComputedStyle(button).touchAction };
  });
  results.drawerBefore = { target, geometry: await geometry(ui.page) };
  await ui.snapshot("matrix-drawer-before-swipe");
  assert(!target.error, "drawer has no visible touch target");
  const scrollBefore = target.top, touch = await ui.page.context().newCDPSession(ui.page);
  const t = { x: target.x, y: target.y, id: 1 };
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [t] });
  for (let i = 1; i <= 5; i++) { await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...t, y: t.y - i * 15 }] }); await ui.settle(35); }
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await ui.settle(200); await touch.detach();
  const scrollAfter = await ui.page.locator(".mobile-shell-drawer").evaluate(e => e.scrollTop);
  results.drawerTouch = { target, scrollBefore, scrollAfter, panelCount: await mobileCount(), geometry: await geometry(ui.page) };
  assert(scrollAfter > scrollBefore && await mobileCount() === 0, "production drawer button swipe did not scroll safely");
  await drawerToggle.tap(); await ui.page.setViewportSize({ width: 390, height: 844 }); await ui.settle(250);
  record("production short-screen drawer touch scroll", { scrollBefore, scrollAfter });

  // A normal manual battle retains the large model until a player explicitly
  // opens commands, then uses the original native IDs and server resolution.
  await ui.gm("/stat 1000 1000 1000 300"); await ui.gm("/heal"); await ui.gm("/encount 9 40", true); await ui.waitMenu();
  const model = await ui.page.evaluate(() => {
    const a = sa.battle.fighters.get(sa.battle.me), r = view.getBoundingClientRect(), box = a.rect;
    const sprite = { x: r.x + box[0] * r.width / 800, y: r.y + box[1] * r.height / 600, width: box[2] * r.width / 800, height: box[3] * r.height / 600 };
    const sheet = document.querySelector(".mobile-shell-sheet"), q = sheet.getBoundingClientRect();
    const overlap = Math.max(0, Math.min(sprite.x + sprite.width, q.right) - Math.max(sprite.x, q.left)) * Math.max(0, Math.min(sprite.y + sprite.height, q.bottom) - Math.max(sprite.y, q.top));
    return { sprite, sheetHidden: sheet.hidden, coverRatio: overlap / (sprite.width * sprite.height), hp: a.hp, maxHp: a.f.maxHp };
  });
  assert(model.sheetHidden && model.coverRatio === 0, "default command sheet hides the full-size player");
  await ui.snapshot("matrix-immersive-battle-player"); record("normal battle starts with an unobstructed native-scale player", model);
  const commands = ui.page.locator("[data-mobile-control=battle-commands]"); await commands.tap(); await ui.settle(150);
  assert(await ui.page.locator(".mobile-shell-sheet").evaluate(e => !e.hidden), "explicit command entry did not reveal native actions");
  await ui.action("b-pet"); await ui.settle(150);
  assert((await geometry(ui.page)).context === "panel", "native battle pet submenu stayed cropped");
  await ui.back(); await ui.settle(150);
  await ui.action("b-attack"); let targets = (await ui.actions()).filter(h => /^t-\d+$/.test(h.id) && Number(h.id.slice(2)) >= 10);
  if (!targets.length) { await ui.action("b-attack"); targets = (await ui.actions()).filter(h => /^t-\d+$/.test(h.id) && Number(h.id.slice(2)) >= 10); }
  assert(targets.length, "manual battle has no native attack target"); await ui.action(targets[0].id); await ui.guardPets(); await ui.fieldReady();
  await ui.page.waitForFunction(() => sa.ui.getMobileActions().some(h => h.id === "result-close"), null, { timeout: 15000 });
  assert(await mobileCount() > 0, "mobile victory result is not counted as a panel"); await ui.back(); await ui.settle(200);
  assert(!await ui.page.evaluate(() => sa.ui.getMobileActions().some(h => h.id === "result-close")), "mobile result back did not use native close");
  record("native manual battle, pet submenu, target and victory back", { result: ui.latest.BattleEnd?.result, returnClosed: true });

  async function flag(name, wanted, id) {
    if (ui.latest.AutoPlayState?.[name] === wanted) return;
    // FieldScreen is installed before its next draw registers the victory
    // sheet. Wait for that real frame and close it before opening another menu.
    await ui.settle(300); await closeMenus();
    await ui.toolbar("system"); await ui.action("sys-ai"); await ui.action(id);
    const until = Date.now() + 15000;
    while (ui.latest.AutoPlayState?.[name] !== wanted && Date.now() < until) await ui.settle(80);
    assert(ui.latest.AutoPlayState?.[name] === wanted, `server did not acknowledge ${name}=${wanted}`); await closeMenus();
  }
  await flag("autoBattle", true, "ai-auto-val"); await flag("quick", false, "ai-quick-val");
  let start = ui.events.length; await ui.gm("/encount 9 40", true); await ui.fieldReady(); await ui.settle(300);
  let events = ui.events.slice(start); assert(events.some(e => e.t === "BattleTurn") && events.some(e => e.t === "BattleEnd"), "normal auto battle produced no real turn/end");
  if (await ui.page.evaluate(() => sa.ui.getMobileActions().some(h => h.id === "result-close"))) await ui.back();
  record("server-acknowledged normal automatic battle", { turns: events.filter(e => e.t === "BattleTurn").length, end: events.find(e => e.t === "BattleEnd") });
  await flag("quick", true, "ai-quick-val"); start = ui.events.length;
  await ui.gm("/encount 9 40", true); await ui.fieldReady(); events = ui.events.slice(start);
  assert(events.some(e => e.t === "BattleTurn") && events.some(e => e.t === "BattleEnd"), "quick battle produced no real turn/end");
  record("server-acknowledged quick automatic battle", { turns: events.filter(e => e.t === "BattleTurn").length, end: events.find(e => e.t === "BattleEnd") });
  await flag("quick", false, "ai-quick-val"); await flag("autoBattle", false, "ai-auto-val");
  await ui.snapshot("matrix-immersive-final-field");
  return ui;
}
