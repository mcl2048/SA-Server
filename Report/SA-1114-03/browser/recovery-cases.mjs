// Acceptance against the owned release ELF. Only native UI input and GM chat
// mutate game state. Page callbacks read state; CDP retains a public allowlist.
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

const assert = (ok, message) => { if (!ok) throw Error(message); };
const count = (state, id) => state.items.filter(i => i.id === id).reduce((n, i) => n + i.pile, 0);
const policyFields = ["v", "healAt", "escape", "magic", "capture", "meat", "first", "then", "petFirst", "petThen"];
const pickPolicy = value => Object.fromEntries(policyFields.map(k => [k, value?.[k]]));

// The owning runtime provides enemy 90004 with native gu:1 tactics. This makes
// HP1 safe while two actual server turns exercise potion -> recovery spirit.
export async function runRecovery(ui, results, { variant, out }) {
  const browser = ui.page.context().browser(), UiClass = ui.constructor;
  results.recovery = [];
  const record = (name, evidence) => {
    results.checks.push({ case: name, passed: true, evidence });
    console.log(JSON.stringify({ variant, recovery_case: name }));
  };
  await ui.page.context().close();

  for (const mobile of [false, true]) {
    const device = mobile ? "mobile" : "desktop";
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    ui = new UiClass(await context.newPage(), mobile);
    await ui.enter();
    if (mobile) await ui.mode("immersive");
    const page = ui.page, cdp = await context.newCDPSession(page);
    const wire = [], sent = [], received = { Inventory: 0, Status: 0, Pets: 0 };
    results.recoveryDiagnostic = { device, wire, sent };
    const onSent = ({ response }) => {
      let m; try { m = JSON.parse(response.payloadData); } catch { return; }
      if (m.t === "AutoPlay") {
        let settings; try { settings = pickPolicy(JSON.parse(m.settings)); } catch { return; }
        sent.push({ t: m.t, autoBattle: !!m.autoBattle, quick: !!m.quick, encounter: !!m.encounter, paused: !!m.paused, settings });
      }
      if (m.t === "ItemMove") sent.push({ t: m.t, from: m.from ?? 0, to: m.to ?? 0 });
    };
    const onReceived = ({ response }) => {
      let m; try { m = JSON.parse(response.payloadData); } catch { return; }
      if (m.t in received) received[m.t]++;
      if (m.t === "BattleStart") wire.push({ t: m.t, mySlot: m.mySlot ?? 0, surprise: m.surprise ?? 0, fighters: (m.fighters ?? []).map(f => Object.fromEntries(["slot", "hp", "maxHp", "mp", "maxMp", "ownerSlot"].map(k => [k, f[k] ?? 0]))) });
      if (m.t === "BattleTurn") wire.push({ t: m.t, turn: m.turn ?? 0, events: (m.events ?? []).map(e => Object.fromEntries(["actor", "kind", "target", "result", "skill", "damage", "mpDamage", "hp", "actorHp", "actorMp", "dead", "status"].map(k => [k, e[k] ?? (["kind", "result", "skill"].includes(k) ? "" : 0)]))) });
      if (m.t === "BattleEnd") wire.push({ t: m.t, result: m.result ?? "" });
    };
    cdp.on("Network.webSocketFrameSent", onSent);
    cdp.on("Network.webSocketFrameReceived", onReceived);
    await cdp.send("Network.enable");
    const state = () => page.evaluate(() => {
      const menu = sa.screen.menus, s = menu.host.status, w = menu.items;
      let policy = null;
      try { policy = JSON.parse(localStorage.getItem(`sa.ai.${s.name}`) ?? "null"); } catch { /* report missing persistence below */ }
      return {
        status: Object.fromEntries(["hp", "maxHp", "mp", "maxMp"].map(k => [k, s[k] ?? 0])),
        policy, items: w.inv.items.map(i => ({ id: i.id ?? 0, slot: i.slot ?? 0, pile: i.pile || 1, equip: i.equip, name: i.name,
          magic: i.magic, magicMp: i.magicMp ?? 0, magicFunc: i.magicFunc, magicTarget: i.magicTarget ?? 0 })),
        page: w.page, held: w.held, hits: sa.ui.getMobileActions().map(h => h.id),
      };
    });
    const wait = async (predicate, message, timeout = 20000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) { if (await predicate()) return; await ui.settle(80); }
      throw Error(`${device}: ${message}`);
    };
    const menu = async name => {
      await ui.closePanels();
      if (mobile) await ui.toolbar(name);
      else await ui.action({ system: "tb-system", items: "tb-item", pets: "tb-pet" }[name]);
    };
    const ai = async () => { await menu("system"); await ui.action("sys-ai"); await ui.action("ai-tab-基本"); };
    const flag = async (name, wanted) => {
      if (!!ui.latest.AutoPlayState?.[name] === wanted) return;
      await ai(); const ack = ui.ack;
      await ui.action({ autoBattle: "ai-auto-val", quick: "ai-quick-val", encounter: "ai-enc-val" }[name]);
      await wait(() => ui.ack > ack && !!ui.latest.AutoPlayState?.[name] === wanted, `native ${name} lacks server acknowledgement`);
      await ui.action("ai-close");
    };
    let lastGm = 0;
    const gm = async (text, battle = false) => {
      await ui.closePanels();
      await ui.settle(Math.max(0, 800 - (Date.now() - lastGm)));
      await ui.gm(text, battle); lastGm = Date.now();
    };
    const showSlot = async slot => {
      if (slot >= 9) { const p = Math.floor((slot - 9) / 15); if ((await state()).page !== p) await ui.action(`inv-page${p}`); }
      await wait(async () => (await state()).hits.includes(`inv-${slot}`), `inventory slot ${slot} is absent`);
    };
    const move = async (slot, target) => {
      await menu("items"); await showSlot(slot);
      const from = sent.length, inv = received.Inventory, status = received.Status;
      // Explicit item actions exist only in immersive mode. Inspect the live
      // native hit after navigation instead of assuming touch implies a mode.
      if ((await state()).hits.includes(`inv-act-${slot}`)) await ui.action(`inv-act-${slot}`);
      else {
        for (let attempt = 0; attempt < 3 && (await state()).held !== slot; attempt++) await ui.action(`inv-${slot}`, 350);
        await wait(async () => (await state()).held === slot, `native pickup did not hold slot ${slot}`);
        await showSlot(target);
        for (let attempt = 0; attempt < 3 && (await state()).held === slot; attempt++) await ui.action(`inv-${target}`, 350);
      }
      await wait(() => received.Inventory > inv && received.Status > status, "equipment movement lacks authoritative Inventory/Status");
      assert(sent.slice(from).some(m => m.t === "ItemMove" && m.from === slot && (m.to === target || m.to === -1)), `${device}: equipment bypassed native ItemMove`);
      assert((await state()).held === -1, `${device}: equipment left an item held`);
      await ui.closePanels();
    };
    const clearEquipment = async () => {
      for (;;) {
        const s = await state(), equipped = s.items.find(i => i.slot < 9);
        if (!equipped) break;
        const empty = Array.from({ length: 45 }, (_, n) => n + 9).find(slot => !s.items.some(i => i.slot === slot));
        assert(empty !== undefined, "private fixture bag has no room to unequip");
        await move(equipped.slot, empty);
      }
      await gm("/clearbag 确定");
    };
    const equip = async (id, expectedCost, expectedFunction) => {
      await clearEquipment(); await gm(`/item ${id} 1`);
      let s = await state(), it = s.items.find(i => i.id === id && i.slot >= 9);
      assert(it && it.equip >= 0, `${device}: real equipment ${id} did not arrive`);
      await move(it.slot, it.equip);
      s = await state(); it = s.items.find(i => i.id === id && i.slot < 9);
      assert(it && it.magic && it.magicMp === expectedCost && it.magicFunc === expectedFunction, `${device}: equipped ${id} has unexpected native recovery magic`);
      return it;
    };
    const screenshot = async name => {
      assert((await ui.phase()).field, "refuse an authentication screenshot");
      await page.screenshot({ path: resolve(out, `${variant}-recovery-${device}-${name}.png`) });
    };
    const encounter = async (name, quick, validate, expectedCounts = {}) => {
      console.log(JSON.stringify({ variant, recovery_start: `${device} ${quick ? "quick" : "automatic"} ${name}` }));
      await flag("autoBattle", true); await flag("quick", quick);
      await ui.closePanels();
      await wait(() => sent.some(m => m.t === "AutoPlay" && m.autoBattle && m.quick === quick && !m.paused && m.settings.healAt === 40), "active native policy was not sent");
      const before = await state(), from = wire.length;
      await gm("/encount 90004 1", true);
      await wait(() => wire.slice(from).some(m => m.t === "BattleEnd"), `${name}: server battle did not settle`, 120000);
      const events = wire.slice(from), start = events.find(m => m.t === "BattleStart"), end = events.find(m => m.t === "BattleEnd");
      assert(start && end?.result === "win", `${device}/${name}: actual encounter did not win`);
      const turns = events.filter(m => m.t === "BattleTurn");
      const own = turns.flatMap(t => t.events.filter(e => e.actor === start.mySlot).map(e => ({ ...e, turn: t.turn })));
      assert(own.length, `${device}/${name}: no authoritative player turn`);
      // The native enemy-surprise prelude resolves turn 1 before the player
      // can submit anything. Assert recovery on the first actionable event;
      // retain that explicit None in the evidence and reject any other skip.
      const actionable = own.filter(e => !(start.surprise === 2 && e.turn === 1 && e.kind === "none"));
      validate({ own: actionable, start, before });
      await ui.fieldReady(quick ? 90000 : 360000); await ui.settle(250); await ui.closePanels();
      const after = await state();
      for (const [id, delta] of Object.entries(expectedCounts)) assert(count(after, Number(id)) === count(before, Number(id)) + delta, `${device}/${name}: item ${id} consumption mismatch`);
      assert(after.status.hp <= after.status.maxHp && after.status.mp <= after.status.maxMp, `${device}/${name}: recovery exceeded native maximum`);
      const evidence = { device, mode: quick ? "quick" : "automatic", name, before: before.status, after: after.status,
        itemsBefore: before.items.filter(i => i.slot >= 9), itemsAfter: after.items.filter(i => i.slot >= 9), start, turns, end };
      results.recovery.push(evidence); record(`${device} ${quick ? "quick" : "automatic"} ${name}`, { playerEvents: own, before: before.status, after: after.status });
      writeFileSync(resolve(out, `${variant}-recovery-progress.json`), JSON.stringify({ completed: results.recovery.length, checks: results.checks, recovery: results.recovery }, null, 2)+"\n");
      await screenshot(`${quick ? "quick" : "auto"}-${name}`);
      await flag("quick", false); await flag("autoBattle", false);
    };

    try {
      for (const name of ["quick", "autoBattle", "encounter"]) await flag(name, false);
      // Rest pets through their original native state buttons so a pet cannot
      // defeat the controlled foe before the second recovery turn is selected.
      await menu("pets");
      for (let n = 0; n < 20; n++) {
        const p = ui.latest.Pets?.pets.find(p => ["battle", "ride", "standby"].includes(p.state));
        if (!p) break;
        const ack = received.Pets; await ui.action(`pet-st${p.slot}`);
        await wait(() => received.Pets > ack, "pet rest operation lacks acknowledgement");
      }
      assert(!ui.latest.Pets?.pets.some(p => ["battle", "ride", "standby"].includes(p.state)), "private fixture still has a deployed pet");
      await ui.closePanels();
      // Native stat derivation makes MaxHP 141. Both native Lv1 spirits heal
      // past the 40% threshold in one cast, so later turns cannot consume the
      // deliberately retained HP potion/meat and obscure the priority check.
      await gm("/stat 0 140 0 1");
      await wait(() => received.Status > 0, "existing real WebSocket was not observed");
      await ai();
      // Every change is an actual row arrow. Read persisted policy solely to
      // decide which arrow to click; never assign localStorage or app state.
      let s = await state(), threshold = s.policy?.healAt ?? 30;
      while (threshold !== 35) { await ui.action(threshold < 35 ? "ai-heal-next" : "ai-heal-prev"); threshold += threshold < 35 ? 5 : -5; }
      await ui.action("ai-heal-next");
      await wait(async () => (await state()).policy?.healAt === 40, "native 35 -> 40 threshold did not persist");
      if ((await state()).policy?.escape) await ui.action("ai-esc-val");
      await ui.action("ai-tab-人物");
      // The fixture profile starts with automatic character actions. Verify
      // those public values rather than overwriting a private test account.
      s = await state();
      assert(s.policy?.first.kind === "auto" && s.policy?.then.kind === "auto", "fixture requires native automatic first/then policy");
      if (s.policy?.magic) await ui.action("ai-magic-val");
      await ui.action("ai-close"); await ai();
      await wait(async () => (await state()).policy?.healAt === 40, "reopening settings lost threshold");
      await screenshot("native-threshold-40"); await ui.action("ai-close");
      await wait(() => sent.some(m => m.t === "AutoPlay" && m.settings.healAt === 40 && m.settings.escape === false), "AutoPlay.settings did not carry persisted threshold");
      // A real navigation rebuilds the app and resumes through its original
      // login flow; persisted policy must survive outside this window object.
      await ui.enter(); if (mobile) await ui.mode("immersive"); await ai();
      assert((await state()).policy?.healAt === 40, "real reload lost persisted threshold");
      await ui.action("ai-close");
      record(`${device} native heal threshold change, reload persistence and AutoPlay.settings`, { from: 35, to: 40, reloaded: true, settings: sent.filter(m => m.t === "AutoPlay").at(-1)?.settings });

      for (const quick of [false, true]) {
        for (const [id, cost, func] of [[1001, 5, "MAGIC_Recovery"], [1002, 8, "MAGIC_OtherRecovery"]]) {
          const it = await equip(id, cost, func);
          await gm("/item 1500 1"); await gm("/item 1234 1"); await gm("/heal"); await gm("/hp 1");
          await encounter(`spirit-${id}-before-items`, quick, ({ own, start }) => {
            const first = own[0], me = start.fighters.find(f => f.slot === start.mySlot);
            assert(first.kind === "magic" && first.skill === it.magic && first.result === "heal" && first.target === start.mySlot && first.damage > 0 && first.hp > me.hp, "affordable healing spirit did not take precedence over HP item and meat");
            assert(first.actorMp === me.mp - cost, "healing spirit did not consume its native MP cost");
          }, { 1500: 0, 1234: 0 });
        }
        // Isolate the MP path: no direct HP item can satisfy the same need.
        const spirit = await equip(1002, 8, "MAGIC_OtherRecovery");
        await gm("/item 1510 1"); await gm("/heal"); await gm("/hp 1"); await gm("/mp 0");
        await encounter("mp-potion-then-spirit", quick, ({ own, start }) => {
          const potion = own[0], healing = own.find(e => e.kind === "magic" && e.skill === spirit.magic && e.result === "heal");
          assert(potion.kind === "item" && potion.result === "heal" && potion.mpDamage >= 18 && potion.mpDamage <= 22 && potion.actorMp === potion.mpDamage && potion.target === start.mySlot, "MP0 did not use real native MP20 potion first");
          assert(healing && healing.turn === potion.turn + 1 && healing.damage > 0 && healing.actorMp === potion.actorMp - 8, "MP recovery was not followed by healing spirit next turn");
        }, { 1510: -1 });
        for (const id of [1500, 1234]) {
          await clearEquipment(); await gm(`/item ${id} 1`); await gm("/heal"); await gm("/hp 1");
          const item = (await state()).items.find(i => i.id === id);
          await encounter(id === 1234 ? "meat-recovery" : "hp-potion-recovery", quick, ({ own, start }) => {
            const first = own[0];
            assert(first.kind === "item" && first.skill === item.name && first.result === "heal" && first.target === start.mySlot && first.damage > 0 && first.hp > 1, "native recovery item was not selected and executed below threshold");
          }, { [id]: -1 });
        }
        // At or above the configured threshold, a ready heal must not replace
        // the ordinary first attack. Floor/ceil uses the actual server max HP.
        await equip(1001, 5, "MAGIC_Recovery"); await gm("/heal");
        const hp = Math.ceil((await state()).status.maxHp * 0.4); await gm(`/hp ${hp}`);
        await encounter("threshold-not-below", quick, ({ own, start }) => {
          const me = start.fighters.find(f => f.slot === start.mySlot);
          assert(me.hp * 100 >= me.maxHp * 40 && own[0].kind === "attack", "HP at/above configured threshold incorrectly triggered healing");
        });
      }
      await gm("/heal");
      assert(!ui.errors.length, `${device}: browser errors occurred`);
    } finally {
      cdp.off("Network.webSocketFrameSent", onSent); cdp.off("Network.webSocketFrameReceived", onReceived); await cdp.detach();
    }
    if (!mobile) await context.close();
  }
  return ui;
}
