// Real touch/viewport acceptance. No page callback mutates game, asset or camera
// state: bitmap bounds are read from the frame/cache already used by rendering.
const assert = (ok, message) => { if (!ok) throw Error(message); };
const sizes = [[390, 844], [844, 390], [320, 568], [568, 320], [430, 932]];

async function cameraState(page) {
  return page.evaluate(() => {
    const root = document.getElementById("mobile-root"), stage = document.querySelector(".stage"), canvas = document.getElementById("view");
    const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const field = sa.field, self = field?.self, b = sa.battle;
    let box = null, native = null;
    if (b) {
      const a = b.fighters.get(b.me);
      if (a?.rect) { box = a.rect; native = { x: a.x, y: a.y, slot: a.f.slot, sprite: a.f.sprite, hp: a.hp, dead: a.dead, hidden: a.hidden, gone: a.gone }; }
    } else if (self) {
      // Actor.action/frame describe the last actually rendered pose. Calling
      // frameOf/assets.image would advance animation or start resource loads.
      const frame = self.action?.frames?.[self.frame], assets = sa.assets;
      let image = frame && assets.extensionImages.get(frame[0]);
      if (frame && !image && assets.index) {
        const id = frame[0], shift = assets.manifest.chunkShift, chunk = id >>> shift, entry = assets.imgChunks.get(chunk), index = id - (chunk << shift);
        if (entry && index >= 0 && index < entry[1]) {
          const view = assets.index, o = entry[0] + index * 16;
          if (view.getUint8(o) !== 255) image = { w: view.getInt16(o + 8, true), h: view.getInt16(o + 10, true), ox: view.getInt16(o + 12, true), oy: view.getInt16(o + 14, true) };
        }
      } else if (frame && !image) {
        const shift = assets.manifest.chunkShift, id = frame[0], row = assets.chunks.get(id >>> shift)?.[id - ((id >>> shift) << shift)];
        if (row) image = { w: row[4], h: row[5], ox: row[6], oy: row[7] };
      }
      if (frame && image) box = [Math.round(400 + frame[1] + image.ox), Math.round(324 + frame[2] + image.oy), image.w, image.h];
      native = { x: self.x, y: self.y, sprite: self.sprite, dir: self.dir, frame: self.frame };
    }
    const c = canvas.getBoundingClientRect(), scale = c.width / 800;
    const model = box && { x: c.x + box[0] * scale, y: c.y + box[1] * scale, width: box[2] * scale, height: box[3] * scale };
    const obstacles = [...document.querySelectorAll(".mobile-shell-status,.mobile-shell-sheet,.mobile-shell-tray-toggle,.mobile-shell-joystick,.mobile-shell-battle-footer,.mobile-shell-drawer")]
      .filter(e => !e.hidden && !e.closest("[hidden]") && e.getClientRects().length)
      .map(e => ({ class: e.className, ...rect(e) }));
    return {
      context: root.dataset.context, display: root.dataset.display,
      viewport: { width: innerWidth, height: innerHeight }, visual: { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale, x: visualViewport.offsetLeft, y: visualViewport.offsetTop },
      transform: { scale: Number(stage.style.getPropertyValue("--mobile-scale")), left: Number.parseFloat(stage.style.getPropertyValue("--mobile-left")), top: Number.parseFloat(stage.style.getPropertyValue("--mobile-top")) },
      stage: rect(stage), model, native, obstacles,
      field: self ? { x: self.x, y: self.y, target: field.target, wantDir: field.wantDir } : null,
      battle: b ? { queue: b.queue.length, sent: b.sent, turn: b.turns, me: b.me } : null,
      pressed: sa.ui.mouse.down, panels: sa.screen.openCount?.() ?? (b?.mobilePanelOpen() ? 1 : 0),
    };
  });
}

function verifyVisible(s, phase, width, height) {
  assert(s.display === "immersive" && s.context === phase, `${phase} camera is not in the immersive scene`);
  assert(s.viewport.width === width && s.viewport.height === height, "camera rotation did not reach the requested viewport");
  const r = s.model;
  assert(r && r.width > 0 && r.height > 0, `${phase} actual player bitmap is unavailable`);
  assert(r.x >= 8 && r.y >= 8 && r.x + r.width <= width - 8 && r.y + r.height <= height - 8,
    `${phase} player bitmap is outside the safe visible viewport: ${JSON.stringify({ model: r, viewport: s.viewport })}`);
  const cover = s.obstacles.map(o => ({ class: o.class,
    ratio: Math.max(0, Math.min(r.x + r.width, o.x + o.width) - Math.max(r.x, o.x))
      * Math.max(0, Math.min(r.y + r.height, o.y + o.height) - Math.max(r.y, o.y)) / (r.width * r.height) }));
  assert(cover.every(o => o.ratio < .02), `${phase} player is covered by control chrome: ${JSON.stringify(cover)}`);
  assert(s.stage.x <= .5 && s.stage.y <= .5 && s.stage.x + s.stage.width >= width - .5 && s.stage.y + s.stage.height >= height - .5,
    `${phase} camera exposes blank space beyond the native scene`);
  return cover;
}

async function rotate(ui, record, phase) {
  for (const [width, height] of sizes) {
    await ui.page.setViewportSize({ width, height }); await ui.settle(650);
    const s = await cameraState(ui.page), cover = verifyVisible(s, phase, width, height);
    await ui.snapshot(`camera-${phase}-${width}x${height}`);
    record(`${phase} player remains visible through rotation ${width}x${height}`, { ...s, cover });
  }
  await ui.page.setViewportSize({ width: 390, height: 844 }); await ui.settle(650);
}

async function closeTray(ui) {
  const tray = ui.page.locator('[data-mobile-control="menu-tray"]:visible');
  if (await tray.count() && await tray.getAttribute("aria-expanded") === "true") { await tray.tap(); await ui.settle(180); }
}

async function zoomButton(ui, label) {
  const page = ui.page, tray = page.locator('[data-mobile-control="menu-tray"]:visible');
  if (await tray.count() && await tray.getAttribute("aria-expanded") !== "true") { await tray.tap(); await ui.settle(120); }
  const detail = page.locator("details.mobile-shell-advanced:visible");
  if (await detail.count() && await detail.getAttribute("open") === null) { await detail.locator("summary").tap(); await ui.settle(100); }
  const button = page.getByRole("button", { name: label, exact: true });
  await button.waitFor({ state: "visible" }); await button.scrollIntoViewIfNeeded(); await button.tap(); await ui.settle(180);
}

async function zoomAndPinch(ui, record, phase) {
  const page = ui.page;
  // Settle any automatic focus first. Explicit controls are the only accepted
  // way to change magnification under the new immersive input contract.
  await closeTray(ui); await ui.settle(650);
  await page.evaluate(() => {
    window.__zoomDiagnostic=[];
    if(window.__zoomDiagnosticInstalled)return;window.__zoomDiagnosticInstalled=true;
    for(const kind of ['pointerdown','pointerup','pointercancel','click'])document.addEventListener(kind,e=>{
      const b=e.target.closest?.('.mobile-shell-zoom button');if(!b)return;
      const sample=when=>window.__zoomDiagnostic.push({kind,when,label:b.getAttribute('aria-label')??b.textContent,time:performance.now(),scale:document.querySelector('.stage').style.getPropertyValue('--mobile-scale'),viewportScale:visualViewport.scale});
      sample('event');if(kind==='click'){setTimeout(()=>sample('task'),0);requestAnimationFrame(()=>sample('frame'));}
    },true);
  });
  const initial = await cameraState(page);
  // Layout is published on requestAnimationFrame; software rendering may
  // exceed a fixed 180ms delay. Wait for the required visible transform, never
  // retry the tap or relax the original scale assertions.
  await zoomButton(ui, "放大场景");
  await page.waitForFunction(scale => Number(document.querySelector('.stage').style.getPropertyValue('--mobile-scale')) > scale * 1.05, initial.transform.scale, {timeout:5000});
  const larger = await cameraState(page);
  assert(larger.transform.scale > initial.transform.scale * 1.05, `${phase} visible + zoom did not enlarge the scene`);
  await zoomButton(ui, "缩小场景");
  await page.waitForFunction(scale => Number(document.querySelector('.stage').style.getPropertyValue('--mobile-scale')) < scale * .96, larger.transform.scale, {timeout:5000});
  const smaller = await cameraState(page);
  const events=await page.evaluate(()=>window.__zoomDiagnostic);
  console.log(JSON.stringify({zoomDiagnostic:phase,initial:initial.transform,larger:larger.transform,smaller:smaller.transform,events}));
  assert(smaller.transform.scale < larger.transform.scale * .96, `${phase} visible − zoom did not reduce the scene: ${JSON.stringify({initial:initial.transform,larger:larger.transform,smaller:smaller.transform,events})}`);
  await zoomButton(ui, "复位");
  await page.waitForFunction(scale => Math.abs(Number(document.querySelector('.stage').style.getPropertyValue('--mobile-scale'))-scale)<.002, initial.transform.scale, {timeout:5000});
  await closeTray(ui); await ui.settle(650);
  const reset = await cameraState(page);
  assert(Math.abs(reset.transform.scale - initial.transform.scale) < .002, `${phase} visible reset did not restore scene scale`);
  record(`${phase} visible zoom +, − and reset remain functional`, { initial: initial.transform, larger: larger.transform, smaller: smaller.transform, reset: reset.transform, nativeButtonEvents: events });

  const pair = await page.evaluate(() => {
    for (const y of [innerHeight * .43, innerHeight * .52, innerHeight * .35, innerHeight * .6]) {
      const a = { x: innerWidth / 2 - 34, y, id: 1 }, b = { x: innerWidth / 2 + 34, y, id: 2 };
      const paths = [[a, b], [{ ...a, x: a.x - 40, y: a.y + 24 }, { ...b, x: b.x + 40, y: b.y + 24 }]];
      if (paths.flat().every(p => document.elementFromPoint(p.x, p.y)?.id === "view")) return [a, b];
    }
    return null;
  });
  assert(pair, `${phase} has no uncovered scene surface for two-finger touch`);
  const cdp = await page.context().newCDPSession(page), sent = [];
  cdp.on("Network.webSocketFrameSent", ({ response }) => {
    let m; try { m = JSON.parse(response.payloadData); } catch { return; }
    if (["Move", "BattleCommand", "BattlePetCommand"].includes(m.t)) sent.push({ t: m.t });
  });
  await cdp.send("Network.enable");
  const before = await cameraState(page), samples = [];let touching=false;
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pair });
    touching=true;
    for (let i = 1; i <= 5; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
        { ...pair[0], x: pair[0].x - i * 8, y: pair[0].y + i * 4.8 },
        { ...pair[1], x: pair[1].x + i * 8, y: pair[1].y + i * 4.8 },
      ] }); await ui.settle(65); samples.push(await cameraState(page));
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });touching=false;await ui.settle(650);
    const after = await cameraState(page);
    const unchanged = sample => Math.abs(sample.transform.scale - before.transform.scale) < .002
      && Math.abs(sample.transform.left - before.transform.left) < .8 && Math.abs(sample.transform.top - before.transform.top) < .8
      && Math.abs(sample.visual.scale - before.visual.scale) < .001;
    assert([...samples, after].every(unchanged), `${phase} two-finger input changed scene scale, pan or browser magnification`);
    assert(!after.pressed, `${phase} multi-touch left a held mouse press`);
    assert(after.field.target === null && before.field.x === after.field.x && before.field.y === after.field.y,
      `${phase} multi-touch created map navigation or character movement`);
    assert(sent.length === 0, `${phase} multi-touch leaked game movement or battle commands`);
    assert(after.panels === before.panels, `${phase} multi-touch opened a game panel`);
    await ui.snapshot(`camera-${phase}-two-finger-locked`);
    record(`${phase} real two-finger spread and translation preserve camera and game intent`, { before, after, samples: samples.map(s => ({ transform: s.transform, visual: s.visual })), businessRequests: sent });
  } finally {
    // Chromium rejects cancelling an already-ended touch stream. Only clean
    // up an interrupted gesture; do not turn passed assertions into a CDP error.
    if(touching)await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await cdp.detach();
  }
}

export async function fieldCameraLock(ui, record) {
  await ui.fieldReady(); await ui.closePanels(); await ui.mode("immersive"); await closeTray(ui);
  await rotate(ui, record, "field"); await zoomAndPinch(ui, record, "field");
}

export async function battleCameraLock(ui, record) {
  await ui.waitMenu(); await ui.mode("immersive");
  const commands = ui.page.locator('[data-mobile-control="battle-commands"]:visible');
  if (await commands.count() && await commands.getAttribute("aria-expanded") === "true") { await commands.tap(); await ui.settle(120); }
  await ui.camera("self"); await closeTray(ui); await ui.settle(650);
  await rotate(ui, record, "battle"); await zoomAndPinch(ui, record, "battle");
}
