import { InputBox,                                    } from "./ui.js?v=9fd0e82e0b4d0a7d";
import { getDeviceMode, setDeviceMode, isMobile, setMobileScene, setSceneZoom, getSceneZoom, resetSceneView,                 } from "./mobile-view.js?v=9fd0e82e0b4d0a7d";
import { createMobileJoystick } from "./mobile-controls.js?v=9fd0e82e0b4d0a7d";






















const TITLES                         = { login: "欢迎来到 StoneAge", line: "选择线路", char: "选择角色", make: "创建角色", field: "冒险", battle: "战斗" };
const LABELS                         = {
  ok: "确定", quit: "清空账号与密码", id: "账号", pass: "密码", register: "注册新账号", reset: "找回密码", back: "返回上一页",
  "dlg-ok": "提交", "dlg-cancel": "取消", "modal-ok": "确定", "modal-yes": "确定", "modal-no": "取消",
  "b-attack": "攻击", "b-guard": "防御", "b-escape": "逃跑", "b-capture": "捕捉", "b-jujutu": "咒术", "b-item": "道具", "b-pet": "宠物", "b-help": "求救",
  "pet-detail": "宠物详细资料", "pet-rename": "宠物改名", "pet-rename-ok": "确认改名", "pet-rename-cancel": "取消改名", "pet-snap": "宠物照相", "pet-waza": "宠物技能", "pet-return": "返回宠物一览", "pet-prev": "上一只宠物", "pet-next": "下一只宠物", "pet-anim": "转动宠物方向",
  "inv-jujutu": "咒术", "gold-input": "输入石币数量", "gold-drop": "丢出石币", "gold-inc": "增加石币数量", "gold-dec": "减少石币数量",
  "tb-map": "地图", "tb-status": "状态", "tb-pet": "宠物", "tb-item": "道具", "tb-mail": "邮件", "tb-album": "相簿", "tb-system": "系统",
  "st-group": "队伍资料", "st-close": "关闭状态", "st-pclose": "返回人物资料",
  "inv-side0": "人物道具", "inv-side1": "宠物装备", "inv-pet-prev": "上一只宠物装备", "inv-pet-next": "下一只宠物装备",
  "sys-home": "回记录点", "sys-logout": "原地登出", "sys-chat": "聊天设定", "sys-bgm": "背景音乐", "sys-se": "音效设定", "sys-mouse": "鼠标设定", "sys-mute": "开启 / 关闭声音", "sys-account": "个人信息", "sys-hide": "显示 / 隐藏人物", "sys-ai": "战斗设定", "sys-exp": "经验显示设定", "sys-gm": "GM 指令", "sys-close": "关闭系统菜单", "sys-yes": "确定", "sys-no": "不要",
  "chat-all": "完整聊天记录", "chat-up": "较早聊天", "chat-down": "较新聊天", "chat-reset": "恢复最新聊天", "chat-more": "增加聊天行数", "chat-less": "减少聊天行数", "chat-color": "更换聊天颜色", "chat-back": "返回聊天设定", chan: "切换聊天频道",
  "map-lu": "上一批已探索区域", "map-ld": "下一批已探索区域", "pb-waza": "使用宠物技能", "pb-cancel": "取消宠物指令", "bpet-return": "收回出战宠物", "watch-leave": "离开观战",
  "voice-more": "增大发言音量", "voice-less": "减小发言音量", "se-more": "增大音效音量", "se-less": "减小音效音量", "se-stereo": "切换立体声 / 单声道", "bgm-more": "增大音乐音量", "bgm-less": "减小音乐音量", "bgm-fast": "加快音乐", "bgm-slow": "放慢音乐", "mouse-mode": "切换鼠标样式", "acct-pw": "修改密码", "acct-secret": "修改安全码",
  "map-out": "缩小地图", "map-in": "放大地图", "map-fit": "显示全图", "map-me": "地图回到自己", "map-mini": "切换小地图", "map-art": "切换实景地图", "map-area": "点击地图目的地", "map-close": "关闭地图",
  "eye-": "上一种眼睛 / 鼻子", "eye+": "下一种眼睛 / 鼻子", "mouth-": "上一种嘴巴", "mouth+": "下一种嘴巴", "chr-prev": "上一页角色", "chr-next": "下一页角色",
};
function node                                       (tag   , cls         , text         )                           {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function put(el             , value        )       { if (el.textContent !== value) el.textContent = value; }
function button(label        , run            )                    {
  const b = node("button", undefined, label); b.type = "button"; b.addEventListener("click", run); return b;
}
function clean(text        )         { return text.trim().replace(/[ \t　]+/g, " "); }
function isControl(hit           )          {
  return !/(?:^|-)(?:block|blocker|wnd|bg|win)$/.test(hit.id)
    && !["colorwin", "login-dlg", "pet-ext", "quest-detail", "status-party"].includes(hit.id)
    && !(hit.x2 - hit.x1 >= 600 && hit.y2 - hit.y1 >= 450);
}

/** DOM presentation only. Action IDs are queued by the host and validated against its next native frame. */
export class MobileShell {
                   root = node("section", "mobile-shell");
                   status = node("header", "mobile-shell-status");
                   heading = node("strong");
                   statusText = node("div");
                   sheet = node("section", "mobile-shell-sheet");
                   left = node("div", "mobile-shell-left");
                   right = node("section", "mobile-shell-right");
                   selected = node("div", "mobile-shell-selected");
                   joystick                                         ;
                   info = node("div", "mobile-shell-info");
                   inputs = node("div", "mobile-shell-inputs");
                   actions = node("div", "mobile-shell-actions");
                   dismiss = button("返回 / 取消对话", () => this.command("back"));
                   sheetBack = button("返回", () => this.command("back"));
                   field = node("div", "mobile-shell-field");
                   chat = node("div", "mobile-shell-chat");
                   toolbar = node("nav", "mobile-shell-toolbar");
                   mode = node("details");
                   modeSelect = node("select");
                   adopted = new Map                           ();
                   actionNodes = new Map                           ();
                   textNodes = new Map                     ();
                   chatNodes = new Map                     ();
          state                   = { phase: "login", panel: false };
          activeActions = new Set        ();
          layout = "";
          focusBeforeSheet                     = null;
          mobile = false;
          presentation = "";
          inputSnapshot             = [];
          orientation = "";

                   ui    ;
                   hooks                  ;

  constructor(ui    , hooks                  ) {
    this.ui = ui;
    this.hooks = hooks;
    this.installStyle();
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "游戏移动界面");
    this.heading.id = "mobile-shell-title";
    this.status.append(this.heading, this.statusText);
    this.sheet.setAttribute("aria-labelledby", this.heading.id);
    this.sheet.tabIndex = -1;
    this.sheetBack.className = "mobile-shell-back";
    this.sheet.append(this.sheetBack, this.info, this.inputs, this.actions, this.dismiss);
    this.joystick = createMobileJoystick({ direction: dir => this.hooks.direction(dir), cancel: () => this.hooks.cancel(), enabled: () => isMobile() && this.layout === "field" });
    this.chat.setAttribute("role", "log"); this.chat.setAttribute("aria-label", "最近聊天");
    // Deliberately not live: the native scene can change text every animation frame.
    this.field.append(this.chat, this.makeFieldControls());
    this.toolbar.setAttribute("aria-label", "游戏菜单");
    for (const [command, label] of [["status", "状态"], ["items", "道具"], ["pets", "宠物"], ["quests", "任务"], ["map", "地图"], ["chat", "聊天"], ["system", "系统"], ["back", "返回"]]) {
      const b = button(label, () => this.command(command)); b.dataset.mobileControl = `menu-${command}`;
      this.toolbar.append(b);
    }
    this.left.append(this.status, this.toolbar, this.sheet, this.field);
    this.right.setAttribute("aria-label", "选项与鼠标控制");
    const selectionTitle = node("span", "mobile-shell-eyebrow", "当前选项");
    this.selected.setAttribute("role", "status"); this.selected.setAttribute("aria-live", "polite");
    const selection = node("div", "mobile-shell-selection"); selection.append(selectionTitle, this.selected);
    const navigation = node("div", "mobile-shell-navigation"); navigation.setAttribute("role", "group"); navigation.setAttribute("aria-label", "切换选项");
    for (const [dir, glyph, label] of [[-1, "‹", "上一个选项"], [1, "›", "下一个选项"]]         ) {
      const b = button(glyph, () => this.hooks.navigate(dir)); b.setAttribute("aria-label", label); b.dataset.mobileControl = dir === -1 ? "option-prev" : "option-next"; navigation.append(b);
    }
    const clicks = node("div", "mobile-shell-clicks");
    for (const [key, title, hint] of [[0, "左键", "选择 / 确认"], [2, "右键", "原生右键操作"]]         ) {
      const b = button("", () => this.hooks.click(key)); b.className = `mobile-shell-click mobile-shell-click-${key}`;
      b.setAttribute("aria-label", key === 0 ? "鼠标左键" : "鼠标右键"); b.dataset.mobileControl = key === 0 ? "mouse-left" : "mouse-right";
      b.append(node("span", "mobile-shell-click-title", title), node("small", undefined, hint)); clicks.append(b);
    }
    this.right.append(selection, navigation, clicks, this.makeZoomControls());
    this.root.append(this.left, this.right);
    const chrome = document.getElementById("mobile-chrome");
    (chrome ?? document.body).append(this.root);
    this.mode.id = "mobile-mode-switch";
    const toggle = node("summary", undefined, "界面"); toggle.setAttribute("aria-label", "界面模式");
    const label = node("label", undefined, "界面模式 ");
    this.modeSelect.setAttribute("aria-label", "界面模式");
    for (const [value, text] of [["auto", "自动"], ["desktop", "电脑版"], ["mobile", "手机版"]]) {
      const option = node("option", undefined, text); option.value = value; this.modeSelect.append(option);
    }
    this.modeSelect.value = getDeviceMode();
    this.modeSelect.addEventListener("change", () => { this.hooks.cancel(); setDeviceMode(this.modeSelect.value              ); this.frame(this.state); });
    label.append(this.modeSelect); this.mode.append(toggle, label); document.body.append(this.mode);
    // Chrome must never turn an input/button gesture into a canvas click or global hotkey.
    for (const el of [this.root, this.mode]) {
      for (const event of ["pointerdown", "pointerup", "pointermove", "click", "dblclick", "contextmenu"]) el.addEventListener(event, e => e.stopPropagation());
      el.addEventListener("keydown", e => {
        e.stopPropagation();
        if (e.key === "Escape" && isMobile()) { e.preventDefault(); this.command("back"); }
        if (e.key === "Tab" && this.layout === "full") this.trapFocus(e);
      });
      // Key releases must reach the global key-state tracker, even when focus
      // moved into chrome after a canvas keydown. Keyup never dispatches actions.
    }
    document.addEventListener("sa-device-change", () => { this.modeSelect.value = getDeviceMode(); this.hooks.cancel(); this.frame(this.state); });
    addEventListener("blur", () => this.hooks.cancel());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.hooks.cancel(); });
  }

  frame(state                  )       {
    const previousPhase = this.state.phase;
    this.state = state;
    const mobile = isMobile();
    if (this.modeSelect.value !== getDeviceMode()) this.modeSelect.value = getDeviceMode();
    if (!mobile) {
      if (this.mobile) { this.joystick.release(); this.hooks.cancel(); this.restoreInputs(); }
      this.mobile = false;
      if (!this.root.hidden) this.root.hidden = true;
      this.layout = ""; this.presentation = ""; this.inputSnapshot = [];
      setMobileScene(false); return;
    }
    const wasMobile = this.mobile;
    const visibilityBefore = [this.sheet.hidden, this.field.hidden, this.toolbar.hidden];
    const all = this.ui.getMobileActions().filter(isControl);
    const boxes = [...InputBox.live];
    const visual = window.visualViewport;
    // Native UI is immediate-mode, but the DOM is retained. Unchanged native
    // frames must not rewrite attributes, invalidate styles or sort text again.
    // Input identity is checked separately so replacement fields at the same
    // logical coordinates are still adopted immediately.
    const signature = JSON.stringify([state, all, this.ui.texts, this.ui.bottomLine,
      boxes.map(b => [b.el.style.display, b.el.type]),
      document.getElementById("mobile-root")?.dataset.orientation,
      visual?.offsetLeft ?? 0, visual?.offsetTop ?? 0, visual?.width ?? innerWidth, visual?.height ?? innerHeight]);
    if (this.mobile && signature === this.presentation && boxes.length === this.inputSnapshot.length
      && boxes.every((box, i) => box === this.inputSnapshot[i])) return;
    this.presentation = signature; this.inputSnapshot = boxes;
    const orientation = document.getElementById("mobile-root")?.dataset.orientation ?? "portrait";
    if (orientation !== this.orientation) { this.joystick.release(); this.hooks.cancel(); this.orientation = orientation; }
    this.mobile = true;
    if (this.root.hidden) this.root.hidden = false;
    if (this.root.dataset.phase !== state.phase) this.root.dataset.phase = state.phase;
    const npc = all.some(h => /^(?:npc-|psel-)/.test(h.id));
    const modal = all.some(h => /^modal-/.test(h.id));
    if (this.dismiss.hidden !== !npc) this.dismiss.hidden = !npc;
    this.sheetBack.hidden = npc || (state.phase === "login" && !modal && !all.some(h => h.id === "dlg-cancel"));
    const fieldNormal = state.phase === "field" && !state.panel && !npc && !modal;
    const layout = fieldNormal ? "field" : state.phase === "battle" && !npc && !modal ? "battle" : "full";
    const changed = layout !== this.layout;
    if (changed) {
      this.joystick.release();
      this.hooks.cancel();
      if (layout === "full") this.focusBeforeSheet = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.layout = layout; this.root.dataset.layout = layout;
    }
    // The game viewport owns its size. Chrome stays in the remaining portrait
    // space or in the landscape rails; opening a native panel never covers it.
    setMobileScene(fieldNormal);
    this.sheet.hidden = fieldNormal && ![...InputBox.live].some(b => b.el.style.display !== "none");
    this.field.hidden = !fieldNormal;
    this.toolbar.hidden = state.phase !== "field" || !fieldNormal;
    this.sheet.setAttribute("role", "region");
    const selectedHit = all.find(hit => hit.id === state.selectedId);
    const selectedLabel = selectedHit && (!state.selectedLabel || state.selectedLabel === selectedHit.id)
      ? this.actionLabel(selectedHit, state) : state.selectedLabel;
    put(this.selected, selectedLabel || "轻点画面或切换选项");
    put(this.heading, npc ? "对话" : modal ? "提示" : state.title || (state.panel ? "游戏菜单" : TITLES[state.phase]) || "StoneAge");
    put(this.statusText, state.status || "");
    this.activeActions = new Set(all.map(h => h.id));
    const texts = this.readableTexts(state, all, npc, modal, fieldNormal);
    this.diffLines(this.info, this.textNodes, texts);
    this.diffLines(this.chat, this.chatNodes, (state.chat ?? []).slice(-3));
    this.syncInputs(state, npc, modal, fieldNormal);
    // Input focus hits remain represented by the actual input rather than duplicate buttons.
    const hits = fieldNormal ? [] : all.filter(h => !this.isInputHit(h)
      && !(state.phase === "field" && (/^tb-/.test(h.id) || /^chat-(?:all|up|down|reset)$/.test(h.id))));
    this.syncActions(hits, state);
    if (!wasMobile || changed || previousPhase !== state.phase
      || visibilityBefore.some((hidden, i) => hidden !== [this.sheet.hidden, this.field.hidden, this.toolbar.hidden][i])) {
      document.dispatchEvent(new Event("sa-controls-layout"));
    }
    if (changed && layout === "full" && !this.sheet.contains(document.activeElement)) {
      // Do not steal focus from an original input newly focused by a native screen.
      const first = [...this.sheet.querySelectorAll             ("input,button")].find(el => !el.closest("[hidden]") && !el.hasAttribute("disabled"));
      (first ?? this.sheet).focus({ preventScroll: true });
    } else if (changed && layout === "field" && this.focusBeforeSheet?.isConnected && !this.sheet.contains(document.activeElement)) {
      this.focusBeforeSheet.focus({ preventScroll: true }); this.focusBeforeSheet = null;
    }
  }

          command(name        )       { this.hooks.cancel(); this.hooks.command(name); }

          makeFieldControls()              {
    const controls = node("div", "mobile-shell-controls");
    const tools = node("div", "mobile-shell-tools");
    for (const [command, label] of [["interact", "交互"], ["back", "返回 / 取消"]]) {
      const b = button(label, () => this.command(command)); b.dataset.mobileControl = `field-${command}`; tools.append(b);
    }
    controls.append(this.joystick.element, tools); return controls;
  }

          makeZoomControls()              {
    const zoom = node("div", "mobile-shell-zoom"); zoom.dataset.mobileControl = "zoom";
    zoom.setAttribute("role", "group"); zoom.setAttribute("aria-label", "场景缩放");
    zoom.append(button("−", () => setSceneZoom(getSceneZoom() - .1)), button("复位", () => resetSceneView()), button("＋", () => setSceneZoom(getSceneZoom() + .1)));
    zoom.firstElementChild?.setAttribute("aria-label", "缩小场景"); zoom.lastElementChild?.setAttribute("aria-label", "放大场景");
    return zoom;
  }

          diffLines(container             , nodes                          , lines          )       {
    const counts = new Map                (), keep = new Set        (); let previous                   = null;
    for (const value of lines) {
      const text = clean(value); if (!text) continue;
      const occurrence = counts.get(text) ?? 0; counts.set(text, occurrence + 1);
      const key = `${text}\0${occurrence}`; keep.add(key);
      let el = nodes.get(key); if (!el) { el = node("p", undefined, text); nodes.set(key, el); }
      const next                   = previous ? previous.nextSibling : container.firstChild;
      if (next !== el) container.insertBefore(el, next); previous = el;
    }
    for (const [key, el] of nodes) if (!keep.has(key)) { el.remove(); nodes.delete(key); }
  }

          readableTexts(state                  , hits             , npc         , modal         , field         )           {
    if (field) return state.summary ?? [];
    const chat = new Set((state.chat ?? []).map(clean));
    let texts = this.ui.texts.filter(t => clean(t.text) && !chat.has(clean(t.text)));
    if (npc) texts = texts.filter(t => t.x >= 105 && t.x <= 695 && t.y >= 70 && t.y <= 520);
    else if (modal) {
      const modalHits = hits.filter(h => h.id.startsWith("modal-"));
      const bottom = Math.max(...modalHits.map(h => h.y2), 340);
      texts = texts.filter(t => t.x >= 100 && t.x <= 700 && t.y >= 180 && t.y <= bottom);
    } else if (state.phase === "field") texts = texts.filter(t => t.y < 550 && t.align !== "center"
      && !(t.x <= 8 || t.x >= 775)
      && !(t.y === 68 && /\d+\s*,\s*\d+$/.test(t.text)));
    if (state.phase === "field" && state.title === "状态" && state.summary?.length) {
      texts = texts.filter(t => !/^[\d\s/+.,-]+$/.test(clean(t.text)));
      const summaryValues = new Set(state.summary.map(clean));
      texts = texts.filter(t => !summaryValues.has(clean(t.text)));
    }
    // Native button text is already presented as a readable action. Avoid repeating
    // those labels (and unrelated chat glyphs) in the informational body.
    texts = texts.filter(t => !hits.some(h => clean(h.label ?? "") === clean(t.text)
      && t.x >= h.x1 - 8 && t.x <= h.x2 + 8 && t.y >= h.y1 - 8 && t.y <= h.y2 + 8));
    // Group native rows without preserving canvas whitespace. Only deduplicate overdraw at
    // the same position: equal numbers in different stat rows are meaningful information.
    const seenPosition = new Set        ();
    const rows                                    = [];
    for (const t of texts.slice().sort((a, b) => a.y - b.y || a.x - b.x)) {
      const value = this.describeText(t, state);
      const key = `${t.x},${t.y}:${value}`;
      if (seenPosition.has(key)) continue; seenPosition.add(key);
      let row = rows[rows.length - 1];
      if (!row || Math.abs(row.y - t.y) > 4) { row = { y: t.y, values: [] }; rows.push(row); }
      row.values.push(value);
    }
    const lines = rows.map(row => row.values.join(" · "));
    const seen = new Set(lines.map(clean));
    if (!npc && !modal) for (const text of state.summary ?? []) if (text && !seen.has(clean(text))) { seen.add(clean(text)); lines.unshift(text); }
    if (this.ui.bottomLine && !seen.has(clean(this.ui.bottomLine))) lines.push(this.ui.bottomLine);
    return lines;
  }

          describeText(t      , state                  )         {
    const value = clean(t.text);
    if (state.phase === "field" && this.activeActions.has("st-group") && /^\d+$/.test(value) && t.x < 280) {
      const labels                         = { 72: "等级", 93: "经验", 114: "下级经验", 135: t.x > 100 ? "最大 HP" : "HP", 156: "MP", 177: "攻击", 198: "防御", 219: "敏捷", 240: "魅力", 290: t.x > 150 ? "腕力" : "体力", 310: t.x > 150 ? "敏捷点" : "耐力" };
      if (labels[t.y]) return `${labels[t.y]}：${value}`;
      if (t.y === 30 && t.x > 170) return `DP：${value}`;
    }
    if (state.phase === "char" && /^\d+$/.test(value)) {
      const names                         = { 212: "等级", 234: "耐久", 256: "攻击", 278: "防御", 300: "敏捷", 322: t.x % 304 > 240 ? "DP" : "魅力", 344: "登入次数" };
      if (names[t.y]) return `${t.x >= 384 ? "角色 2" : "角色 1"} ${names[t.y]}：${value}`;
    }
    if (state.phase === "make" && /^\d+$/.test(value)) {
      if (t.y === 284) return `${t.x < 400 ? "可分配状态点" : "可分配属性点"}：${value}`;
      const stat = ({ 310: "体力", 338: "腕力", 365: "耐力", 394: "敏捷" }                          )[t.y];
      if (stat && t.x < 350) return `${stat}：${value}`;
    }
    return value;
  }

          isInputHit(h           )          {
    for (const entry of this.adopted.values()) {
      if (entry.row.hidden) continue;
      const x = Number(entry.box.el.dataset.logicalX), y = Number(entry.box.el.dataset.logicalY);
      const w = Number(entry.box.el.dataset.logicalWidth), ht = Number(entry.box.el.dataset.logicalHeight);
      if (x + w / 2 >= h.x1 && x + w / 2 <= h.x2 && y + ht / 2 >= h.y1 && y + ht / 2 <= h.y2 && h.x2 - h.x1 < w + 40 && h.y2 - h.y1 < ht + 40) return true;
    }
    return false;
  }

          syncInputs(state                  , npc         , modal         , field         )       {
    const live = new Set([...InputBox.live].map(b => b.el));
    for (const [el, entry] of this.adopted) if (!live.has(el)) { entry.row.remove(); this.adopted.delete(el); }
    const boxes = [...InputBox.live].sort((a, b) => Number(a.el.dataset.logicalY) - Number(b.el.dataset.logicalY));
    for (const box of boxes) {
      const el = box.el;
      let entry = this.adopted.get(el);
      if (!entry && el.parentNode) {
        const row = node("label", "mobile-shell-input"), caption = node("span");
        entry = { box, parent: el.parentNode, next: el.nextSibling, style: el.getAttribute("style"), aria: el.getAttribute("aria-label"), row, caption };
        this.adopted.set(el, entry); row.append(caption); this.inputs.append(row);
        // Reparent exactly once. Restore selection/focus if moving the original DOM node blurs it.
        const focused = document.activeElement === el, start = el.selectionStart, end = el.selectionEnd;
        row.append(el); el.dataset.mobileManaged = "true";
        Object.assign(el.style, { position: "static", left: "auto", top: "auto", width: "100%", height: "46px", fontSize: "16px", padding: "8px 10px", background: "#142b30", color: "#fff", border: "1px solid #749b99", borderRadius: "8px", textShadow: "none", boxSizing: "border-box", outline: "revert" });
        if (focused) { el.focus({ preventScroll: true }); if (start !== null && end !== null) el.setSelectionRange(start, end); }
      }
      if (!entry) continue;
      const y = Number(el.dataset.logicalY);
      // The persistent field chat input must not appear in a blocking NPC/native menu.
      entry.row.hidden = el.style.display === "none" || modal || (npc && state.phase === "field" && y >= 530);
      const label = this.inputLabel(el, state, npc);
      put(entry.caption, label); el.setAttribute("aria-label", label);
    }
    let send = this.inputs.querySelector                   ("button");
    if (state.phase === "field" && !npc && !modal && [...this.adopted.values()].some(e => !e.row.hidden && Number(e.box.el.dataset.logicalY) >= 530)) {
      if (!send) { send = button("发送聊天", () => this.command("send-chat")); this.inputs.append(send); }
      send.hidden = false;
    } else if (send) send.hidden = true;
  }

          inputLabel(el                  , state                  , npc         )         {
    const x = Number(el.dataset.logicalX), y = Number(el.dataset.logicalY);
    if (state.phase === "field" && y >= 530) return "聊天消息";
    if (npc) return "输入内容";
    if (state.phase === "login" && x > 440) return el.type === "password" ? "密码" : "账号";
    const nearby = this.ui.texts.filter(t => t.x < x && Math.abs(t.y - y) < 12 && x - t.x < 250).sort((a, b) => b.x - a.x)[0];
    if (nearby && /[\u3400-\u9fffA-Za-z]/.test(nearby.text)) return clean(nearby.text);
    if (state.phase === "make") return "角色姓名";
    return el.type === "password" ? "密码 / 安全码" : "输入内容";
  }

          restoreInputs()       {
    for (const [el, entry] of this.adopted) {
      if (InputBox.live.has(entry.box)) {
        const display = el.style.display;
        entry.parent.insertBefore(el, entry.next?.parentNode === entry.parent ? entry.next : null);
        if (entry.style === null) el.removeAttribute("style"); else el.setAttribute("style", entry.style);
        el.style.display = display;
        if (entry.aria === null) el.removeAttribute("aria-label"); else el.setAttribute("aria-label", entry.aria);
        delete el.dataset.mobileManaged; entry.box.layout();
      }
      entry.row.remove();
    }
    this.adopted.clear();
  }

          syncActions(hits             , state                  )       {
    const keep = new Set        (); let previous                   = null;
    for (const hit of hits) {
      if (keep.has(hit.id)) continue; keep.add(hit.id);
      let b = this.actionNodes.get(hit.id);
      if (!b) {
        const id = hit.id;
        b = button("", () => { if (isMobile() && this.activeActions.has(id)) { this.hooks.cancel(); this.hooks.action(id); } });
        b.dataset.action = id; this.actionNodes.set(id, b);
      }
      put(b, this.actionLabel(hit, state));
      const selected = state.selectedId === hit.id;
      if (b.getAttribute("aria-current") !== String(selected)) b.setAttribute("aria-current", String(selected));
      const next                   = previous ? previous.nextSibling : this.actions.firstChild;
      if (next !== b) this.actions.insertBefore(b, next); previous = b;
    }
    for (const [id, b] of this.actionNodes) if (!keep.has(id)) { b.remove(); this.actionNodes.delete(id); }
  }

          actionLabel(h           , state                  )         {
    const id = h.id;
    if (state.actionLabels?.[id]) return clean(state.actionLabels[id]);
    if (id === "ok" && state.phase === "login") return "进入游戏";
    if (LABELS[id]) return LABELS[id];
    if (h.label && /[^\d\s]/.test(h.label) && !/^inv-page/.test(id)) return clean(h.label);
    let m                         ;
    if ((m = id.match(/^(new|login|del)(\d+)$/))) return `${({ new: "创建角色", login: "进入角色", del: "删除角色" }                          )[m[1]]} ${Number(m[2]) + 1}`;
    if ((m = id.match(/^chr(\d+)$/))) return `选择人物形象 ${Number(m[1]) + 1}`;
    if ((m = id.match(/^town(\d+)$/))) return ["萨姆吉尔村", "玛丽娜丝村", "加加村", "卡鲁它那村"][Number(m[1])] || "选择出生地";
    if ((m = id.match(/^inv-(\d+)$/))) return `物品格 ${Number(m[1]) + 1}${h.label ? ` · ${clean(h.label)}` : ""}`;
    if ((m = id.match(/^inv-page(\d+)$/))) return `道具第 ${Number(m[1]) + 1} 页`;
    if ((m = id.match(/^st-up(\d)$/))) return `增加${["体力", "腕力", "耐力", "敏捷"][Number(m[1])]}点数`;
    if ((m = id.match(/^st-kick(\d+)$/))) return `移出队伍成员 ${Number(m[1]) + 1}`;
    if ((m = id.match(/^pet-(name|st|ride|skill)(\d+)$/))) return `${({ name: "宠物", st: "切换宠物状态", ride: "骑乘 / 下骑", skill: "宠物技能" }                          )[m[1]]} ${Number(m[2]) + 1}`;
    if ((m = id.match(/^([sa])(\d)([+-])$/))) return `${m[3] === "+" ? "增加" : "减少"}${(m[1] === "s" ? ["体力", "腕力", "耐力", "敏捷"] : ["地属性", "水属性", "火属性", "风属性"])[Number(m[2])]}`;
    if (/^(t-|.*target)/.test(id)) {
      const cx = (h.x1 + h.x2) / 2;
      const names = this.ui.texts.filter(t => /[\u3400-\u9fffA-Za-z]/.test(t.text) && !/请选择|您的目标/.test(t.text));
      const nearest = names.sort((a, b) => Math.hypot(a.x - cx, a.y - h.y1) - Math.hypot(b.x - cx, b.y - h.y1))[0];
      return nearest && Math.hypot(nearest.x - cx, nearest.y - h.y1) < 180 ? `目标 · ${clean(nearest.text)}` : `选择目标 ${Number(id.match(/\d+/)?.[0] ?? 0) + 1}`;
    }
    if (/(close|cancel)$/.test(id)) return /cancel$/.test(id) ? "取消" : "关闭";
    if (/(return|back)$/.test(id)) return "返回";
    if (/(prev|next)$/.test(id)) return /prev$/.test(id) ? "上一页" : "下一页";
    if (/(ok|yes|confirm)$/.test(id)) return "确定";
    if (h.label) return clean(h.label);
    const nearby = this.nearText(h);
    return nearby || `操作 ${[...this.activeActions].indexOf(id) + 1}`;
  }

          nearText(hit           )                     {
    const cx = (hit.x1 + hit.x2) / 2, cy = (hit.y1 + hit.y2) / 2;
    const text = this.ui.texts.filter(t => clean(t.text) && /[^\d\s]/.test(t.text)).sort((a      , b      ) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
    return text && Math.hypot(text.x - cx, text.y - cy) < 55 ? clean(text.text) : undefined;
  }

          trapFocus(event               )       {
    const targets = Array.from(this.root.querySelectorAll             ("button,input,select,[tabindex='0']")).filter(el => !el.closest("[hidden]") && !el.hasAttribute("disabled"));
    const first = targets[0], last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

          installStyle()       {
    if (document.getElementById("mobile-shell-style")) return;
    const style = node("style"); style.id = "mobile-shell-style";
    style.textContent = `
.mobile-shell{--jade:#153c3a;--gold:#e7c686;--ink:#eaf1e8;color:var(--ink);background:linear-gradient(165deg,#193d3c,#0a2528);font:15px/1.5 system-ui,sans-serif;box-sizing:border-box;display:flex;flex-direction:column;min-height:0;padding-bottom:env(safe-area-inset-bottom);isolation:isolate}
.mobile-shell [hidden],.mobile-shell[hidden]{display:none!important}.mobile-shell *{box-sizing:border-box}
.mobile-shell-left{display:contents}.mobile-shell button,.mobile-shell select{font:inherit;min-height:44px;min-width:44px;color:#f4eedc;border:1px solid #567b70;border-radius:12px;background:linear-gradient(#294e45,#1b3b37);box-shadow:inset 0 1px #ffffff12,0 2px 4px #0003;padding:8px 12px;touch-action:manipulation;cursor:pointer;-webkit-tap-highlight-color:transparent}
.mobile-shell button:active{background:#42685b;box-shadow:inset 0 2px 5px #0005}.mobile-shell button[aria-current='true']{border-color:var(--gold);box-shadow:inset 0 0 0 1px var(--gold),0 0 12px #e7c68622}.mobile-shell :focus-visible,#mobile-mode-switch :focus-visible{outline:3px solid #f7d48a;outline-offset:2px}
.mobile-shell-status{order:0;padding:12px 16px 10px;border-bottom:1px solid #e7c68626;flex:none}.mobile-shell-status strong{font-size:18px;letter-spacing:.06em;color:var(--gold)}.mobile-shell-status div{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;color:#b9d2c5;margin-top:3px}
.mobile-shell-sheet{order:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px 14px;scroll-padding:12px;flex:1}.mobile-shell-back{width:100%;margin-bottom:10px;color:var(--gold)!important}.mobile-shell-info p,.mobile-shell-chat p{margin:0 0 6px;white-space:pre-wrap;overflow-wrap:anywhere}.mobile-shell-info{margin-bottom:10px;max-height:24dvh;overflow:auto;overscroll-behavior:contain;font-size:14px;color:#c6dacf;scrollbar-gutter:stable}
.mobile-shell-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mobile-shell-actions button{white-space:normal;overflow-wrap:anywhere;text-align:left}.mobile-shell-input{display:block;margin-bottom:12px}.mobile-shell-input span{display:block;margin-bottom:5px;font-size:13px;letter-spacing:.06em;color:var(--gold)}.mobile-shell-input input{font-family:inherit!important;min-height:46px;max-width:100%;box-shadow:inset 0 2px 4px #0003}.mobile-shell-inputs>button{margin-bottom:8px;width:100%}
.mobile-shell-toolbar{order:3;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:10px 12px;border-top:1px solid #e7c68626;flex:none}.mobile-shell-toolbar button{padding:6px 2px;font-size:13px}.mobile-shell-field{order:2;padding:8px 14px;flex:none}.mobile-shell-chat{max-height:60px;overflow:auto;font-size:13px;color:#adcbbe}.mobile-shell-controls{display:flex;align-items:center;justify-content:space-between;gap:12px}.mobile-shell-dpad{display:grid;grid-template-areas:'. up .' 'left down right';grid-template-columns:44px 44px 44px;gap:4px}.mobile-shell-dpad button{padding:4px;font-size:23px}.mobile-shell-tools{display:grid;gap:6px}
.mobile-shell-right{order:4;padding:12px;display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:8px;border-top:1px solid #e7c68626;flex:none}.mobile-shell-selection{min-width:0;padding:0 2px}.mobile-shell-eyebrow{font-size:10px;color:#95b5a8;letter-spacing:.16em}.mobile-shell-selected{font-size:13px;color:var(--gold);min-height:22px;overflow-wrap:anywhere}.mobile-shell-navigation{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.mobile-shell-navigation button{font-size:26px;padding:0;line-height:1}
.mobile-shell-clicks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;grid-column:1/-1}.mobile-shell-click{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:60px!important}.mobile-shell-click-title{font-size:16px;font-weight:650;letter-spacing:.1em}.mobile-shell-click small{font-size:10px;color:#c3d5c9}.mobile-shell-click-0{background:linear-gradient(#e6c78b,#bc955a)!important;color:#24352b!important;border-color:#e5c994!important}.mobile-shell-click-0 small{color:#344c3e}.mobile-shell-click-2{border-color:#809b86!important}
.mobile-shell-zoom{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;grid-column:1/-1}.mobile-shell-zoom button{padding:5px;font-size:14px}.mobile-shell-joystick{display:block;position:relative;width:112px;height:112px;max-width:100%;aspect-ratio:1;flex:none;border-radius:50%;border:1px solid #c8b88066;background:radial-gradient(circle at 45% 40%,#294d47 0 28%,#173632 65%,#092024 100%);box-shadow:inset 0 3px 12px #0008,0 0 0 5px #081e22,0 0 0 6px #87a18444,0 6px 15px #0006;touch-action:none;user-select:none;-webkit-user-select:none}
.mobile-shell-joystick::before,.mobile-shell-joystick::after{content:'';position:absolute;background:#c4b68025;pointer-events:none}.mobile-shell-joystick::before{width:1px;top:13%;bottom:13%;left:50%}.mobile-shell-joystick::after{height:1px;left:13%;right:13%;top:50%}.mobile-shell-joystick-knob{position:absolute;left:50%;top:50%;width:46%;height:46%;border:1px solid #a6b894;border-radius:50%;background:radial-gradient(circle at 35% 25%,#729780,#2b5145 70%);box-shadow:0 4px 8px #0007,inset 0 1px #e9e8be55;transform:translate(calc(-50% + var(--stick-x,0px)),calc(-50% + var(--stick-y,0px)));pointer-events:none;z-index:1}.mobile-shell-joystick-guide{position:absolute;left:0;right:0;bottom:8px;text-align:center;font-size:10px;color:#acc2b2;pointer-events:none}.mobile-shell-joystick[data-active='true']{border-color:var(--gold)}
#mobile-mode-switch{position:fixed;right:6px;bottom:6px;z-index:1000;color:#e6e9df;background:#143632ed;border:1px solid #91a68a;border-radius:10px;box-shadow:0 3px 12px #0004;font:12px/1.4 system-ui,sans-serif;padding:3px 6px}#mobile-mode-switch summary{cursor:pointer;min-height:26px;display:flex;align-items:center;justify-content:center}#mobile-mode-switch label{display:block;padding:8px 0}#mobile-mode-switch select{font:16px system-ui,sans-serif;min-height:44px;color:#fff;background:#24483d;border:1px solid #91a597;border-radius:6px}html.sa-mobile #mobile-mode-switch{top:calc(env(safe-area-inset-top) + 6px);right:calc(env(safe-area-inset-right) + 6px);bottom:auto}html.sa-mobile #mobile-mode-switch summary{min-height:36px;min-width:44px}
html.sa-mobile:has(#mobile-root[data-orientation='portrait']) #mobile-mode-switch{top:calc(75vw + env(safe-area-inset-top) + 6px)}
#mobile-root[data-orientation='portrait'] .mobile-shell-status{padding-right:84px;min-height:58px}
#mobile-root[data-orientation='portrait'] .mobile-shell-status strong{font-size:16px;overflow-wrap:anywhere}
#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-layout='field']{display:grid;grid-template-columns:136px minmax(0,1fr);align-items:start}
#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-layout='field'] .mobile-shell-status,#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-layout='field'] .mobile-shell-sheet,#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-layout='field'] .mobile-shell-toolbar{grid-column:1/-1}
#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-layout='field'] .mobile-shell-toolbar{order:2}
#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-layout='field'] .mobile-shell-field{grid-column:1;order:3;padding:18px 12px 12px;align-self:stretch}
#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-layout='field'] .mobile-shell-controls{flex-direction:column;gap:14px}
#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-layout='field'] .mobile-shell-right{grid-column:2;order:3;display:flex;flex-direction:column;padding:12px 12px 12px 4px;border-top:0}
#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-layout='field'] .mobile-shell-right .mobile-shell-navigation{grid-template-columns:repeat(2,minmax(0,1fr))}
#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-layout='field'] .mobile-shell-chat{display:none}
#mobile-root[data-orientation='landscape'] .mobile-shell{display:contents;background:none;padding:0}
#mobile-root[data-orientation='landscape'] .mobile-shell-left,#mobile-root[data-orientation='landscape'] .mobile-shell-right{position:absolute;top:0;bottom:0;width:var(--rail-width,120px);pointer-events:auto;display:flex;flex-direction:column;min-width:0;overflow:auto;overscroll-behavior:contain;background:linear-gradient(175deg,#193d37f5,#0a2529fa);container-type:inline-size;scrollbar-width:thin}
#mobile-root[data-orientation='landscape'] .mobile-shell-left{left:0;border-right:1px solid #c6b68340;padding-left:env(safe-area-inset-left)}
#mobile-root[data-orientation='landscape'] .mobile-shell-right{right:0;border-left:1px solid #c6b68340;border-top:0;padding:54px 8px max(8px,env(safe-area-inset-bottom));gap:8px;padding-right:max(8px,env(safe-area-inset-right))}
#mobile-root[data-orientation='landscape'] .mobile-shell-status{padding:8px 8px 7px;min-height:40px;flex:none}
#mobile-root[data-orientation='landscape'] .mobile-shell-status strong{font-size:12px;letter-spacing:.03em}
#mobile-root[data-orientation='landscape'] .mobile-shell-status div{display:none}
#mobile-root[data-orientation='landscape'] .mobile-shell-toolbar{order:1;padding:7px;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;border:0;flex:0 1 auto;min-height:44px;max-height:calc(var(--viewport-height,100dvh) - 180px);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}
#mobile-root[data-orientation='landscape'] .mobile-shell-toolbar button{font-size:12px;padding:4px 1px;min-width:44px;border-radius:10px}
#mobile-root[data-orientation='landscape'] .mobile-shell-sheet{order:2;padding:7px;min-height:0;flex:1}
#mobile-root[data-orientation='landscape'] .mobile-shell-info{font-size:12px;max-height:none;overflow:visible}
#mobile-root[data-orientation='landscape'] .mobile-shell-actions{grid-template-columns:minmax(0,1fr);gap:6px}
#mobile-root[data-orientation='landscape'] .mobile-shell-actions button{font-size:12px;padding:7px;min-width:44px}
#mobile-root[data-orientation='landscape'] .mobile-shell-input span{font-size:12px}
#mobile-root[data-orientation='landscape'] .mobile-shell-input input{padding:5px!important}
#mobile-root[data-orientation='landscape'] .mobile-shell-field{order:3;margin-top:auto;display:flex;flex-direction:column;justify-content:end;align-items:center;flex:none;padding:12px 10px 14px;min-height:132px}
#mobile-root[data-orientation='landscape'] .mobile-shell-controls{display:flex;justify-content:center;width:100%}
#mobile-root[data-orientation='landscape'] .mobile-shell-dpad,#mobile-root[data-orientation='landscape'] .mobile-shell-tools,#mobile-root[data-orientation='landscape'] .mobile-shell-chat{display:none}
#mobile-root[data-orientation='landscape'] .mobile-shell-joystick{display:block;width:min(112px,100%);height:auto}
#mobile-root[data-orientation='landscape'] .mobile-shell-right>*{flex:none}
#mobile-root[data-orientation='landscape'] .mobile-shell-selected{font-size:12px;min-height:36px;max-height:64px;overflow:auto}
#mobile-root[data-orientation='landscape'] .mobile-shell-clicks{display:flex;flex-direction:column;gap:8px}
#mobile-root[data-orientation='landscape'] .mobile-shell-click{min-height:64px!important;width:100%;padding:8px 3px}
#mobile-root[data-orientation='landscape'] .mobile-shell-zoom{margin-top:auto}
#mobile-root[data-orientation='landscape'] .mobile-shell-back{font-size:13px;padding:6px}
@media(orientation:landscape) and (max-width:620px){#mobile-root[data-orientation='landscape'] .mobile-shell-right{padding-top:46px}}
@container(max-width:108px){
.mobile-shell-toolbar{grid-template-columns:minmax(0,1fr)!important}
.mobile-shell-navigation{grid-template-columns:minmax(0,1fr)}
.mobile-shell-selection .mobile-shell-eyebrow{display:none}
#mobile-root[data-orientation='landscape'] .mobile-shell-selected{min-height:24px;max-height:24px;font-size:11px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
#mobile-root[data-orientation='landscape'] .mobile-shell-click{min-height:48px!important;padding:6px 2px}
.mobile-shell-click-title{font-size:14px}.mobile-shell-click small{display:none}
.mobile-shell-zoom{grid-template-columns:minmax(0,1fr)}.mobile-shell-joystick-guide{font-size:9px}
}

`;
    document.head.append(style);
  }
}
