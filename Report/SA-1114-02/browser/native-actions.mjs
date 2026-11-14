// Final-release Chromium acceptance, called by the owning real-game driver.
// Every business mutation enters a visible native UI action or GM chat. Page
// callbacks only read current state; CDP observes a strict public wire allowlist.
const assert = (ok, message) => { if (!ok) throw Error(message); };

export async function nativeActions(ui, record) {
  const page = ui.page, cdp = await page.context().newCDPSession(page);
  const sent = [], received = { Status: 0, Inventory: 0 };
  const onSent = ({ response }) => {
    let m; try { m = JSON.parse(response.payloadData); } catch { return; }
    if (m.t === "StatUp") sent.push({ t: m.t, stat: m.stat ?? 0 });
    if (m.t === "ItemMove") sent.push({ t: m.t, from: m.from ?? 0, to: m.to ?? 0 });
    if (m.t === "ItemUse") sent.push({ t: m.t, slot: m.slot ?? 0, target: m.target ?? 0 });
  };
  const onReceived = ({ response }) => {
    let m; try { m = JSON.parse(response.payloadData); } catch { return; }
    if (m.t === "Status" || m.t === "Inventory") received[m.t]++;
  };
  cdp.on("Network.webSocketFrameSent", onSent);
  cdp.on("Network.webSocketFrameReceived", onReceived);
  await cdp.send("Network.enable");
  const state = () => page.evaluate(() => {
    const menu = sa.screen.menus, w = menu.items, s = menu.host.status;
    return {
      status: s ? Object.fromEntries(["face", "hp", "maxHp", "mp", "maxMp", "points", "vital", "str", "tgh", "dex"].map(k => [k, s[k] ?? 0])) : null,
      items: w.inv.items.map(i => ({ id: i.id ?? 0, slot: i.slot ?? 0, image: i.image ?? 0, pile: i.pile || 1, equip: i.equip, usable: !!i.usable, field: i.field ?? 0 })),
      held: w.held, page: w.page, wndNo: w.wndNo, petPage: w.petPage,
      cards: sa.ui.cards.map(c => ({ id: c.id, image: c.image, category: c.category, primaryAction: c.primaryAction })),
      hits: sa.ui.getMobileActions().map(h => h.id),
    };
  });
  const wait = async (predicate, message) => {
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      const value = await state();
      if (predicate(value)) return value;
      await ui.settle(80);
    }
    throw Error(message);
  };
  const mark = () => ({ sent: sent.length, status: received.Status, inventory: received.Inventory });
  const acked = m => received.Status > m.status && received.Inventory > m.inventory;
  const count = (s, id) => s.items.filter(i => i.id === id).reduce((n, i) => n + i.pile, 0);
  let lastGm = 0;
  const gm = async command => {
    await ui.closePanels();
    await ui.settle(Math.max(0, 800 - (Date.now() - lastGm)));
    await ui.gm(command); lastGm = Date.now();
  };
  const openItems = async () => { await ui.closePanels(); await ui.toolbar("items"); };
  const showSlot = async slot => {
    if (slot >= 9) {
      const index = Math.floor((slot - 9) / 15), current = await state();
      if (current.page !== index) await ui.action(`inv-page${index}`);
    }
    await wait(s => s.cards.some(c => c.id === `inv-${slot}`), `native card for slot ${slot} is absent`);
  };
  const card = async (slot, image, label) => {
    await showSlot(slot);
    const current = await state(), c = current.cards.find(c => c.id === `inv-${slot}`);
    assert(c.image === image, `slot ${slot} has wrong native image`);
    assert(typeof c.category === "string" && c.category.length, `slot ${slot} has no category`);
    assert(c.primaryAction?.id === `inv-act-${slot}` && c.primaryAction.label === label, `slot ${slot} has wrong explicit primary action`);
    const primary = page.locator(`button[data-action="inv-act-${slot}"]:visible`);
    await primary.waitFor();
    assert((await primary.textContent()).trim() === label, `slot ${slot} action label is incorrect`);
    assert(await primary.getAttribute("data-primary-action") === "true", `slot ${slot} primary action marker is absent`);
    const title = page.locator(`button[data-action="inv-${slot}"]:visible`);
    await title.scrollIntoViewIfNeeded();
    await page.waitForFunction(({ slot, image }) => {
      const b = document.querySelector(`button[data-action="inv-${slot}"]`);
      return b?.dataset.nativeImage === String(image) && b.dataset.nativeIcon === "true"
        && b.style.getPropertyValue("--native-icon").includes("url(");
    }, { slot, image }, { timeout: 20000 });
    return { slot, image, category: c.category, action: label };
  };

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await ui.mode("immersive"); await ui.closePanels();
    await gm("/stat 20 20 10 10");
    // Confirm that CDP sees this already-connected real WebSocket, otherwise
    // none of the later assertions may claim a server acknowledgement.
    await wait(s => received.Status > 0 && s.status.vital === 20 && s.status.str === 20,
      "existing WebSocket Status observation is unavailable");
    await gm("/hp 1"); await gm("/mp 0"); await gm("/points 1");
    for (const id of [1, 1500, 1510, 1329]) await gm(`/item ${id} 1`);
    await wait(s => [1, 1500, 1510, 1329].every(id => s.items.some(i => i.id === id && i.slot >= 9)), "real GM fixtures did not arrive in Inventory");

    await openItems();
    let current = await state(), weapon = current.items.find(i => i.id === 1 && i.slot >= 9);
    const equipment = await card(weapon.slot, 20032, "装备");
    await ui.snapshot("native-item-equipment-action");
    let before = mark(); await ui.action(`inv-act-${weapon.slot}`);
    current = await wait(s => acked(before) && s.items.some(i => i.id === 1 && i.slot === 2), "equipment button did not receive authoritative arm-slot Inventory/Status");
    assert(sent.slice(before.sent).some(m => m.t === "ItemMove" && m.from === weapon.slot && m.to === -1), "equipment button bypassed native ItemMove");
    assert(current.held === -1, "equipment action left a held item");
    await card(2, 20032, "卸下"); await ui.snapshot("native-item-equipped");
    before = mark(); await ui.action("inv-act-2");
    current = await wait(s => acked(before) && !s.items.some(i => i.id === 1 && i.slot === 2) && s.items.some(i => i.id === 1 && i.slot >= 9), "unequip did not return item to the authoritative bag");
    assert(sent.slice(before.sent).some(m => m.t === "ItemMove" && m.from === 2 && m.to === -1), "unequip bypassed native ItemMove");
    record("real equipment image, explicit equip and unequip with server acknowledgement", { ...equipment, equippedSlot: 2, returnedToBag: true, requests: sent.slice(before.sent) });

    for (const fixture of [{ id: 1500, image: 23013, stat: "hp", max: "maxHp" }, { id: 1510, image: 23005, stat: "mp", max: "maxMp" }]) {
      current = await state(); const item = current.items.find(i => i.id === fixture.id && i.slot >= 9);
      const evidence = await card(item.slot, fixture.image, "使用");
      const previous = current.status[fixture.stat], quantity = count(current, fixture.id);
      assert(previous < current.status[fixture.max], `${fixture.stat} fixture is already full`);
      before = mark(); await ui.action(`inv-act-${item.slot}`);
      await wait(s => s.wndNo === 2 && s.hits.includes("select-0"), "use action did not open the original target selection");
      assert(!sent.slice(before.sent).some(m => m.t === "ItemUse"), "targeted recovery sent a request before target selection");
      await ui.action("select-0");
      current = await wait(s => acked(before) && count(s, fixture.id) === quantity - 1 && s.status[fixture.stat] > previous,
        `${fixture.stat} recovery did not consume exactly one item and update authoritative Status`);
      assert(current.status[fixture.stat] <= current.status[fixture.max], `${fixture.stat} exceeded its server maximum`);
      assert(sent.slice(before.sent).filter(m => m.t === "ItemUse" && m.slot === item.slot && m.target === 0).length === 1,
        `${fixture.stat} recovery did not dispatch exactly one native ItemUse`);
      await ui.closePanels(); await ui.toolbar("status"); await ui.snapshot(`native-recovery-${fixture.stat}-status`); await ui.closePanels();
      record(`real ${fixture.stat.toUpperCase()} recovery image, target, consumption and Status`, { ...evidence, id: fixture.id, before: previous, after: current.status[fixture.stat], remainingQuantity: quantity - 1 });
      await openItems();
    }

    current = await state(); const letter = current.items.find(i => i.id === 1329 && i.slot >= 9);
    await showSlot(letter.slot); current = await state();
    const unusable = current.cards.find(c => c.id === `inv-${letter.slot}`);
    assert(unusable.image === 22265 && !unusable.primaryAction, "unusable letter exposed a primary action");
    assert(!current.hits.includes(`inv-act-${letter.slot}`), "unusable letter retained a native use hit");
    assert(await page.locator(`button[data-action="inv-act-${letter.slot}"]:visible`).count() === 0, "unusable letter retained a visible operation");
    await ui.snapshot("native-item-unusable");
    record("real unusable letter retains its image and exposes no use operation", { id: 1329, slot: letter.slot, image: unusable.image, primaryAction: false });

    await ui.closePanels(); await ui.toolbar("status");
    current = await wait(s => s.status.points === 1 && s.hits.includes("st-up0"), "point fixture or original stat-up hit is absent");
    const original = current.status, plus = page.locator('button[data-action="st-up0"]:visible');
    assert((await plus.textContent()).trim() === "+1", "status point button does not show +1");
    await plus.scrollIntoViewIfNeeded(); const rectangle = await plus.boundingBox();
    assert(rectangle && rectangle.width >= 43.5 && rectangle.height >= 43.5, "stat button is smaller than a mobile target");
    before = mark(); await ui.action("st-up0");
    current = await wait(s => received.Status > before.status && s.status.points === 0 && s.status.vital === original.vital + 1,
      "+1 did not receive matching server Status and points decrement");
    assert(sent.slice(before.sent).filter(m => m.t === "StatUp" && m.stat === 0).length === 1, "single +1 did not dispatch exactly one StatUp");
    assert(!current.hits.some(id => /^st-up[0-3]$/.test(id)), "exhausted stat points retain live native hits");
    assert(await page.locator('button[data-action^="st-up"]:visible').count() === 0, "exhausted stat points retain visible operations");
    const exhaustedAt = sent.length;
    await page.touchscreen.tap(rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2); await ui.settle(500);
    assert(!sent.slice(exhaustedAt).some(m => m.t === "StatUp"), "tap after points exhausted dispatched a stale StatUp");
    const exhausted = await state();
    assert(exhausted.status.points === 0 && exhausted.status.vital === original.vital + 1, "exhausted tap changed authoritative attributes");
    await ui.snapshot("native-status-points-exhausted");
    record("native +1 updates exactly once and exhausted points remove operations", { before: original, after: exhausted.status, requests: sent.slice(before.sent), exhaustedTapSent: false });
    await ui.closePanels();
  } finally {
    cdp.off("Network.webSocketFrameSent", onSent);
    cdp.off("Network.webSocketFrameReceived", onReceived);
    await cdp.detach();
  }
}
