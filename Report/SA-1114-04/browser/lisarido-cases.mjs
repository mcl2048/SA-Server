// Real ELF + native GM/UI + observed public WebSocket events and draw quads.
// No browser business state, event, animation or storage is ever assigned.
import { resolve } from "node:path";
const assert = (ok, message) => { if (!ok) throw Error(message); };

export async function runLisarido(ui, results, { variant, out }) {
  const browser = ui.page.context().browser(), UiClass = ui.constructor;
  results.lisarido = [];
  await ui.page.context().close();
  for (const mobile of [false, true]) {
    const device = mobile ? "mobile" : "desktop";
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    ui = new UiClass(await context.newPage(), mobile); await ui.enter();
    if (mobile) await ui.mode("immersive");
    const page = ui.page, wire = [], sent = [], cdp = await context.newCDPSession(page);
    const onReceived = ({ response }) => {
      let m; try { m = JSON.parse(response.payloadData); } catch { return; }
      if (m.t === "BattleStart") wire.push({ t: m.t, mySlot: m.mySlot, fighters: (m.fighters ?? []).map(f => Object.fromEntries(["slot", "sprite", "hp", "maxHp", "mp", "level", "ownerSlot", "bagSlot"].map(k => [k, f[k] ?? 0]))) });
      if (m.t === "BattleTurn") wire.push({ t: m.t, turn: m.turn, events: (m.events ?? []).map(e => Object.fromEntries(["actor", "kind", "target", "guardian", "result", "skill", "damage", "hp", "actorHp", "actorMp", "status", "effect", "att", "combo", "dead", "fly", "ok"].map(k => [k, e[k] ?? (["kind", "result", "skill", "att"].includes(k) ? "" : 0)]))) });
      if (m.t === "BattleEnd") wire.push({ t: m.t, result: m.result });
    };
    const onSent = ({ response }) => {
      let m; try { m = JSON.parse(response.payloadData); } catch { return; }
      if (m.t === "BattleCommand") sent.push({ t: m.t, kind: m.kind, target: m.target, item: m.item });
      if (m.t === "BattlePetCommand") sent.push({ t: m.t, skill: m.skill, target: m.target, petSlot: m.petSlot });
    };
    cdp.on("Network.webSocketFrameReceived", onReceived); cdp.on("Network.webSocketFrameSent", onSent); await cdp.send("Network.enable");
    const record = (name, evidence) => { results.checks.push({ case: `${device} ${name}`, passed: true, evidence }); console.log(JSON.stringify({ variant, lisarido_case: `${device} ${name}` })); };
    const shot = async name => { assert((await ui.phase()).field, "refuse authentication screenshots"); await page.screenshot({ path: resolve(out, `${variant}-lisarido-${device}-${name}.png`) }); };
    const wait = async (read, message, timeout = 20000) => {
      const until = Date.now() + timeout;
      while (Date.now() < until) { const value = await read(); if (value) return value; await ui.settle(40); }
      throw Error(`${device}: ${message}`);
    };
    const menu = async name => {
      await ui.closePanels();
      // The touch toolbar has no album command. Its native Ctrl+A shortcut is
      // shared by both viewports and still enters the original menu handler.
      if (name === "album") { await page.locator("body").focus(); await page.keyboard.press("Control+a"); await ui.settle(); }
      else if (mobile) await ui.toolbar(name);
      else await ui.action({ pets: "tb-pet", system: "tb-system" }[name]);
    };
    const flag = async (name, wanted) => {
      if (!!ui.latest.AutoPlayState?.[name] === wanted) return;
      await menu("system"); await ui.action("sys-ai"); await ui.action("ai-tab-基本"); const ack = ui.ack;
      await ui.action({ quick: "ai-quick-val", autoBattle: "ai-auto-val", encounter: "ai-enc-val" }[name]);
      await wait(() => ui.ack > ack && !!ui.latest.AutoPlayState?.[name] === wanted, `native ${name} acknowledgement absent`); await ui.action("ai-close");
    };
    let lastGm = 0;
    const gm = async (text, battle = false) => { await ui.closePanels(); await ui.settle(Math.max(0, 800 - (Date.now() - lastGm))); await ui.gm(text, battle); lastGm = Date.now(); };
    const view = () => page.evaluate(() => {
      const b = sa.battle, a = b && [...b.fighters.values()].find(a => a.f.sprite === 199300 && a.f.ownerSlot === b.me);
      const images = sa.assets.extensionImages, pages = sa.assets.pages;
      const charTex = pages.get("4/0")?.tex, blastTex = pages.get("4/1")?.tex;
      const charQuads = sa.ui.quads.filter(q => q.tex === charTex).map(q => {
        const entry = [...images.entries()].find(([, e]) => e.set === 4 && e.page === 0 && e.x === q.u && e.y === q.v && e.w === q.w && e.h === q.h);
        return { image: entry?.[0] ?? -1, x: q.x, y: q.y, width: q.w, height: q.h };
      });
      return { battle: !!b, now: performance.now(), focus: b?.cameraSlot ?? -1, queue: b?.queue.length ?? 0, sent: !!b?.sent,
        actor: a ? { slot: a.f.slot, x: a.x, y: a.y, homeX: a.homeX, homeY: a.homeY, action: a.action, actionIndex:a.lastFrame, frame: a.lastAct?.frames[a.lastFrame]?.[0] ?? -1, hp: a.hp } : null,
        targets: b ? [...b.fighters.values()].filter(a => (a.f.slot < 10) !== (b.me < 10)).map(a => ({ slot: a.f.slot, hp: a.hp, status: a.status, dead: a.dead, gone: a.gone, x:a.x, y:a.y })) : [],
        charQuads, blasts: sa.ui.quads.filter(q => blastTex && q.tex === blastTex && q.w === 240 && q.h === 240).map(q => ({ x: q.x, y: q.y, width: q.w, height: q.h, u: q.u, v: q.v })),
        characterLoaded: sa.assets.extensionAnims.has(199300), effectLoaded: sa.assets.extensionAnims.has(199301),
      };
    });
    const choosePetSkill = async id => {
      await ui.waitMenu(); await ui.action("b-guard");
      const skill = ui.latest.Pets.pets.find(p => p.sprite === 199300)?.skills.find(s => s.id === id);
      assert(skill, `native Lisarido skill ${id} is absent`);
      const actions = await ui.actions();
      if (!actions.some(h => h.id === `pw-${skill.slot}`)) {
        if (actions.some(h => h.id === "pb-cancel")) await ui.action("pb-cancel");
        else await ui.action("pb-waza");
      }
      // A busy software-rendered frame can lag behind the pointer input. Only
      // retry while the same native skill window still owns that exact hit.
      for (let attempt = 0; attempt < 3; attempt++) {
        await ui.action(`pw-${skill.slot}`, 350);
        if (!(await ui.actions()).some(h => h.id === `pw-${skill.slot}`)) break;
      }
      await wait(async () => (await ui.actions()).some(h => /^pt-\d+$/.test(h.id)), "native skill click never entered target selection");
      const targets = (await ui.actions()).filter(h => /^pt-\d+$/.test(h.id) && Number(h.id.slice(3)) >= 10);
      assert(targets.length, "native pet skill has no opponent target");
      return targets[0].id;
    };
    const observeAction = async (target, kind) => {
      const start = wire.length, requests = sent.length, samples = [], captured = new Set(), screenshots = []; let done = false;
      const observe = async () => {
        const until = Date.now() + 90000;
        while (!done && Date.now() < until) {
          const v = await view();
          if (v.actor && (kind === "cannon" || v.actor.action === (kind === "attack" ? 0 : 6) || v.blasts.length || Math.hypot(v.actor.x - v.actor.homeX, v.actor.y - v.actor.homeY) > 1)) {
            samples.push(v);
            const label = kind === "attack" ? v.actor.action === 0 ? "attack-energy" : "" : v.blasts.length ? "cannon-electric-explosion" : "";
            // Screenshot encoding may take longer than a whole attack. Keep
            // read-only frame sampling running while Playwright captures it.
            if (label && !captured.has(label)) { captured.add(label); screenshots.push(shot(label)); }
          }
          if (wire.slice(start).some(m => m.t === "BattleTurn") && v.queue === 0 && !v.sent) break;
          await ui.settle(35);
        }
      };
      const observation = observe();
      try { await ui.action(target, 0); await observation; } finally { done = true; await observation; }
      await Promise.all(screenshots);
      const events = wire.slice(start).filter(m => m.t === "BattleTurn");
      results.lisaridoDiagnostic = { device, kind, events, samples, captured: [...captured], requests: sent.slice(requests) };
      assert(events.length, `${device}: real ${kind} turn did not arrive`);
      assert(sent.slice(requests).some(m => m.t === "BattlePetCommand"), "native target did not dispatch BattlePetCommand");
      return { events, samples, captured: [...captured], requests: sent.slice(requests) };
    };

    try {
      for (const name of ["quick", "autoBattle", "encounter"]) await flag(name, false);
      // The database is the owning runner's private backup. Delete its copied
      // pets through real GM requests so no unrelated pet can take this turn.
      for (const p of [...(ui.latest.Pets?.pets ?? [])]) await gm(`/petdel ${p.slot}`);
      await gm("/lv 100"); await gm("/stat 100 100 100 1000"); await gm("/charm 100");
      await gm("/pet 29006 60");
      const pet = await wait(() => ui.latest.Pets?.pets.find(p => p.sprite === 199300), "GM did not grant native Lisarido");
      await gm(`/petai ${pet.slot} 10000`); await gm("/heal");
      await menu("pets"); await shot("pet-list"); await ui.action(`pet-name${pet.slot}`);
      await wait(async () => { const v = await view(); return v.characterLoaded && v.effectLoaded && v.charQuads.length; }, "native Lisarido atlas did not load and draw");
      const details = await page.evaluate(() => {
        const p = sa.screen.menus.pets.pets.find(p => p.sprite === 199300);
        return { slot: p.slot, name: p.name, sprite: p.sprite, level: p.level, attrs: p.attrs, atk: p.atk, def: p.def, agi: p.agi, maxHp: p.maxHp,
          skills: p.skills.map(s => ({ id: s.id, slot: s.slot, name: s.name, target: s.target, field: s.field })), ext: { std: p.ext.std, grow: p.ext.grow } };
      });
      assert(details.name === "雷萨利朵" && details.attrs.join(",") === "0,0,70,30" && details.skills.some(s => s.id === 29050 && s.target === 1), "Lisarido native stats/skills differ from authoritative registry");
      await shot("pet-detail"); await ui.action("pet-snap"); await ui.action("pet-waza"); await shot("pet-skills");
      await menu("album"); await ui.action("album-prev"); await ui.action("album-575"); await shot("album-story");
      const album = await page.evaluate(() => ({ entry: sa.screen.menus.host ? sa.ui.texts.filter(t => t.x === 298 || t.text.includes("雷萨利朵")).map(t => t.text) : [],
        portrait: sa.ui.portraits.map(p => ({ image: p.image, rawIndex: p.rawIndex })) }));
      assert(album.entry.some(s => s.includes("雷萨利朵")), "native album did not render Lisarido story");
      record("native Lisarido list, stats, skill and appended album", { details, album });
      // Album's native close is separate from the general mobile back path.
      await ui.action("album-close");

      await menu("pets");
      for (let i = 0; i < 3 && ui.latest.Pets.pets.find(p => p.slot === pet.slot).state !== "battle"; i++) await ui.action(`pet-st${pet.slot}`);
      assert(ui.latest.Pets.pets.find(p => p.slot === pet.slot).state === "battle", "native Lisarido deployment failed");
      // Private native guard group is distinct from both natural pet habitats.
      await gm("/warp 300 450 230");
      let start;
      for (let attempt = 0; attempt < 10; attempt++) {
        const from = wire.length; await gm("/encount", true);
        start = await wait(() => wire.slice(from).find(m => m.t === "BattleStart"), "controlled native encounter did not start");
        if (start.fighters.filter(f => f.slot >= 10).length >= 3) break;
        await ui.escape(); await ui.closePanels();
      }
      assert(start.fighters.filter(f => f.slot >= 10).length >= 3, "native encounter picker never provided a multi-target group");
      await ui.waitMenu(); await shot("battle-idle");
      const attack = await observeAction(await choosePetSkill(1), "attack");
      assert(attack.samples.some(v => Math.hypot(v.actor.x - v.actor.homeX, v.actor.y - v.actor.homeY) > 20), "normal attack did not float toward the enemy");
      assert(attack.samples.some(v => v.actor.action === 0 && [2,3,4].includes(v.actor.actionIndex) && v.charQuads.some(q => q.image === v.actor.frame && q.image >= 9200000)), "normal right-cannon attack frame never reached native rendering");
      assert(attack.events.flatMap(t => t.events).some(e => e.kind === "attack" && e.actor === start.fighters.find(f => f.sprite === 199300).slot), "normal pet attack has no authoritative event");
      record("Lisarido normal attack floats and renders native right-cannon close explosion", { events: attack.events, captured: attack.captured, renderedFrames: [...new Set(attack.samples.map(v => v.actor.frame))] });

      const rounds=[],paralyzed=[],departed=[],gone=new Set();
      let exactFive=false;
      for(let attempt=0;attempt<10;attempt++) {
        const current=await view();
        if(current.targets.filter(t=>!t.dead&&!t.gone&&t.hp>0).length<2)break;
        const cannon=await observeAction(await choosePetSkill(29050),"cannon");
        rounds.push(cannon);
        const events=cannon.events.flatMap(t=>t.events),hits=events.filter(e=>e.effect===199301);
        assert(hits.length>0&&hits.length<=5&&hits.every(e=>e.kind==="magic"&&e.skill==="电磁火炮"&&!e.combo),"cannon did not emit up to five independent native round events");
        assert(cannon.samples.every(v=>Math.hypot(v.actor.x-v.actor.homeX,v.actor.y-v.actor.homeY)<1),"ranged cannon moved its caster");
        assert(cannon.samples.some(v=>v.actor.action===6&&[2,3,4].includes(v.actor.actionIndex)&&v.charQuads.some(q=>q.image===v.actor.frame)),"native firing HAND frame never rendered");
        const frames=cannon.samples.filter(v=>v.blasts.length);
        assert(frames.length&&frames.every(v=>v.blasts.length===1&&v.blasts[0].width===240&&v.blasts[0].height===240),"cannon effects overlap or do not use the native single-target atlas");
        assert(new Set(frames.map(v=>`${v.blasts[0].u}/${v.blasts[0].v}`)).size>1,"electromagnetic explosion atlas never advanced");
        for(const v of frames) {
          const f=v.targets.find(t=>t.slot===v.focus);
          assert(f&&!f.gone&&!f.dead,"native effect or follow camera returned to a departed slot");
        }
        let bursts=0,active=false;
        for(const v of cannon.samples){if(v.blasts.length&&!active)bursts++;active=!!v.blasts.length;}
        assert(bursts===hits.length,`observed ${bursts} sequential blasts for ${hits.length} real shots`);
        exactFive ||= hits.length===5;
        for(const e of events) {
          if(e.effect===199301) {
            assert(!gone.has(e.target)&&!(e.guardian>=0&&gone.has(e.guardian)),"a later server round attacked a departed slot");
            if(e.status===2&&e.damage>0&&e.hp>0)paralyzed.push(e);
          }
          if(e.kind==="flee"&&e.actor>=10){assert(e.hp>0,"expulsion incorrectly killed its recipient");gone.add(e.actor);departed.push(e);}
        }
        const settled=await view();
        for(const slot of gone)assert(!settled.battle||settled.targets.find(t=>t.slot===slot)?.gone,"native flee did not remove its live recipient");
        if(exactFive&&paralyzed.length&&departed.length)break;
      }
      assert(exactFive,"no real turn completed all five shots");
      assert(paralyzed.length&&departed.length,"real cannon rounds never exercised both paralysis and live expulsion");
      assert(rounds.some(r=>r.samples.some(v=>v.targets.some(t=>t.status===2&&!t.dead&&!t.gone))),"authoritative paralysis did not reach native living-target playback");
      await shot("paralysis-and-live-expulsion");
      record("five ordered stationary electromagnetic blasts, paralysis and live expulsion without empty-slot hits",{rounds:rounds.length,shotCounts:rounds.map(r=>r.events.flatMap(t=>t.events).filter(e=>e.effect===199301).length),paralyzed,departed});
      results.lisarido.push({device,details,start,attack,rounds,paralyzed,departed});
      if((await ui.phase()).battle)await ui.escape(); await ui.closePanels(); await gm("/heal");
      assert(!ui.errors.length, `${device}: browser errors occurred`);
    } finally {
      cdp.off("Network.webSocketFrameReceived", onReceived); cdp.off("Network.webSocketFrameSent", onSent); await cdp.detach();
    }
    if (!mobile) await context.close();
  }
  return ui;
}
