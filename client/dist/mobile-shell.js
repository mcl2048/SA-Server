import { InputBox,                                    } from "./ui.js?v=9256777782deda32";
import { getDeviceMode, setDeviceMode, isMobile, setMobileContext, setSceneZoom, getSceneZoom, resetSceneView,
  isImmersive, getMobileDisplayMode, setMobileDisplayMode, requestMobileFullscreen, exitMobileFullscreen,
                                                              } from "./mobile-view.js?v=9256777782deda32";
import { createMobileJoystick } from "./mobile-controls.js?v=9256777782deda32";
import { BATTLE_AUTO_ACTIONS } from "./autoplay-sync.js?v=9256777782deda32";
import { MobileNativeSkin } from "./mobile-native-skin.js?v=9256777782deda32";
import { MobileNativeMap } from "./mobile-native-map.js?v=9256777782deda32";

import { MobileNativeCards } from "./mobile-native-cards.js?v=9256777782deda32";
































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
  "fp-menu": "游戏设定", "fp-card": "面对玩家交换名片", "fp-party": "面对玩家组队 / 离队", "fp-trade": "面对玩家交易", "fp-family": "家族功能", "fp-vendor": "摆摊 / 查看摊位", "fp-join": "加入战斗 / 观战", "fp-duel": "面对玩家决斗", "fp-act": "动作 / 表情", "fp-help": "任务查询",
  "eye-": "上一种眼睛 / 鼻子", "eye+": "下一种眼睛 / 鼻子", "mouth-": "上一种嘴巴", "mouth+": "下一种嘴巴", "chr-prev": "上一页角色", "chr-next": "下一页角色",
};
const AUTO_ACTIONS = new Set        (BATTLE_AUTO_ACTIONS);
// These native menus already have a large toolbar command. Other native HUD
// controls retain their exact hit ID in the immersive field's interaction list.
const MIRRORED_FIELD_ACTIONS = new Set(["tb-map", "tb-status", "tb-pet", "tb-item", "tb-system", "fp-help"]);
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

/** Native drawing order may be column-major. Preserve visual rows in the DOM,
 * so labels and their neighboring operations remain together on a narrow screen.
 * Compare vertical centers: native image/text buttons can have different padding.
 */
function actionRows(hits             )                {
  const rows                = [];
  const unique = [...new Map(hits.map(hit => [hit.id, hit])).values()];
  for (const hit of unique.sort((a, b) => (a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2 || a.x1 - b.x1)) {
    const row = rows[rows.length - 1];
    if (row && Math.abs((row[0].y1 + row[0].y2 - hit.y1 - hit.y2) / 2) <= 8) row.push(hit);
    else rows.push([hit]);
  }
  for (const row of rows) row.sort((a, b) => a.x1 - b.x1);
  return rows;
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
                   advanced = node("details", "mobile-shell-advanced");
                   selected = node("div", "mobile-shell-selected");
                   joystick                                         ;
                   info = node("div", "mobile-shell-info");
                   inputs = node("div", "mobile-shell-inputs");
                   content = node("div", "mobile-shell-content");
                   portrait = node("img", "mobile-shell-native-portrait");
                   nativeStats = node("div", "mobile-native-stats");
                   statRows = new Map                                                 ();
                   actions = node("div", "mobile-shell-actions");
                   dismiss = button("返回 / 取消对话", () => this.command("back"));
                   sheetBack = button("返回", () => this.command("back"));
                   field = node("div", "mobile-shell-field");
                   encounter = button("自动遇敌：关", () => this.command("auto-encounter"));
                   chat = node("div", "mobile-shell-chat");
                   toolbar = node("nav", "mobile-shell-toolbar");
                   mode = node("details");
                   modeSelect = node("select");
                   displayLabel = node("label", undefined, "游戏画面 ");
                   displaySelect = node("select");
                   fullscreen = button("进入全屏", () => { void this.toggleFullscreen(); });
                   displayHelp = node("p", "mobile-shell-display-help", "场景铺满屏幕，游戏窗口随横竖屏重新排版。");
                   tray = node("section", "mobile-shell-drawer");
                   trayToggle = button("菜单", () => this.toggleTray());
                   camera = node("div", "mobile-shell-camera");
                   fieldExtras = node("section", "mobile-shell-field-extras");
                   extraActions = node("div", "mobile-shell-actions");
                   battleFooter = node("div", "mobile-shell-battle-footer");
                   battleAutos = node("div", "mobile-shell-battle-autos");
                   battleCommands = button("指令", () => this.toggleBattleCommands());
                   adopted = new Map                           ();
                   actionNodes = new Map                           ();
                   actionRowNodes = new Map                     ();
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
          sceneImmersive = false;
          trayOpen = false;
          battleCommandsOpen = false;
                   nativeSkin                         ;
                   nativeMap                 ;
                   nativeCards = new MobileNativeCards();
          portraitKey = "";
          paneKey = "";

                   ui    ;
                   hooks                  ;

  constructor(ui    , hooks                  ) {
    this.ui = ui;
    this.hooks = hooks;
    this.nativeSkin = typeof ui.assets?.imageCanvas === "function" ? new MobileNativeSkin(ui.assets) : null;
    this.nativeMap = new MobileNativeMap(this.content,(id,x,y)=>{
      if(!isMobile() || !this.activeActions.has(id))return;
      this.hooks.cancel();this.hooks.point?.(id,x,y);
    },(id,x,y,phase)=>{
      if(phase!=="cancel" && (!isMobile() || !this.activeActions.has(id)))return;
      if(phase==="start")this.hooks.cancel();
      this.hooks.pointer?.(id,x,y,phase);
    });
    this.installStyle();
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "游戏移动界面");
    this.heading.id = "mobile-shell-title";
    this.status.append(this.heading, this.statusText);
    this.sheet.setAttribute("aria-labelledby", this.heading.id);
    this.sheet.tabIndex = -1;
    this.sheetBack.className = "mobile-shell-back";
    this.dismiss.className = "mobile-shell-dismiss";
    this.portrait.hidden=true;this.portrait.alt="选中宠物的形象";
    this.content.append(this.portrait, this.nativeStats, this.nativeCards.element, this.info, this.inputs);
    this.sheet.append(this.sheetBack, this.content, this.actions, this.dismiss);
    this.joystick = createMobileJoystick({ direction: dir => this.hooks.direction(dir), cancel: () => this.hooks.cancel(), enabled: () => isMobile() && this.layout === "field" && !this.trayOpen });
    this.chat.setAttribute("role", "log"); this.chat.setAttribute("aria-label", "最近聊天");
    // Deliberately not live: the native scene can change text every animation frame.
    this.field.append(this.makeFieldControls(), this.chat);
    this.toolbar.setAttribute("aria-label", "游戏菜单");
    for (const [command, label] of [["status", "状态"], ["items", "道具"], ["pets", "宠物"], ["quests", "任务"], ["map", "地图"], ["chat", "聊天"], ["system", "系统"], ["back", "返回"]]) {
      const b = button(label, () => this.command(command)); b.dataset.mobileControl = `menu-${command}`;
      this.toolbar.append(b);
    }
    this.left.append(this.field, this.status, this.toolbar, this.sheet);
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
    this.advanced.append(node("summary", undefined, "更多操作：鼠标与缩放"));
    this.tray.id = "mobile-shell-drawer"; this.tray.setAttribute("aria-label", "游戏菜单与操作"); this.tray.hidden = true;
    this.trayToggle.className = "mobile-shell-tray-toggle"; this.trayToggle.dataset.mobileControl = "menu-tray";
    this.trayToggle.setAttribute("aria-controls", this.tray.id); this.trayToggle.hidden = true;
    this.camera.setAttribute("role", "group"); this.camera.setAttribute("aria-label", "战斗镜头"); this.camera.hidden = true;
    for (const [name, label] of [["camera-self", "我方"], ["camera-enemy", "敌方"], ["camera-follow", "跟随"]]) {
      const b = button(label, () => this.command(name)); b.dataset.mobileControl = name; this.camera.append(b);
    }
    this.fieldExtras.append(node("strong", undefined, "附近互动与社交"), this.extraActions); this.fieldExtras.hidden = true;
    this.battleCommands.dataset.mobileControl = "battle-commands"; this.battleCommands.setAttribute("aria-controls", "mobile-shell-command-sheet");
    this.battleCommands.className = "mobile-shell-battle-command-toggle";
    this.sheet.id = "mobile-shell-command-sheet";
    this.battleFooter.append(this.battleAutos, this.battleCommands); this.battleFooter.hidden = true;
    this.root.append(this.left, this.right, this.tray, this.trayToggle, this.battleFooter);
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
    this.displaySelect.setAttribute("aria-label", "游戏画面");
    for (const [value, text] of [["classic", "经典完整画面"], ["immersive", "全屏游戏界面"]]) {
      const option = node("option", undefined, text); option.value = value; this.displaySelect.append(option);
    }
    this.displaySelect.addEventListener("change", () => {
      this.hooks.cancel(); setMobileDisplayMode(this.displaySelect.value                     );
      put(this.displayHelp, getMobileDisplayMode() === "immersive" ? "场景铺满屏幕，游戏窗口随横竖屏重新排版。" : "完整显示场景，控制器位于画面外。");
      this.frame(this.state);
    });
    this.fullscreen.dataset.mobileControl = "fullscreen";
    this.displayHelp.setAttribute("role", "status");
    this.displayLabel.append(this.displaySelect);
    label.append(this.modeSelect); this.mode.append(toggle, label, this.displayLabel, this.fullscreen, this.displayHelp); document.body.append(this.mode);
    this.syncSettings();
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
    document.addEventListener("sa-mobile-display-change", () => {
      this.trayOpen = false; this.joystick.release(); this.hooks.cancel(); this.presentation = ""; this.frame(this.state);
    });
    document.addEventListener("fullscreenchange", () => this.syncSettings());
    addEventListener("blur", () => this.hooks.cancel());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.hooks.cancel(); });
  }

  frame(state                  )       {
    const previousPhase = this.state.phase;
    const previousLayout = this.layout;
    const wasImmersive = this.sceneImmersive;
    this.state = state;
    const mobile = isMobile();
    this.syncSettings();
    if (this.modeSelect.value !== getDeviceMode()) this.modeSelect.value = getDeviceMode();
    if (!mobile) {
      this.nativeSkin?.clearPortrait();this.portrait.hidden=true;this.portraitKey="";
      if (this.mobile) { this.joystick.release(); this.hooks.cancel(); this.restoreInputs(); }
      this.mobile = false;
      if (!this.root.hidden) this.root.hidden = true;
      this.layout = ""; this.presentation = ""; this.inputSnapshot = [];
      this.syncSceneMode(false);
      setMobileContext("lobby"); return;
    }
    const wasMobile = this.mobile;
    const visibilityBefore = [this.sheet.hidden, this.field.hidden, this.toolbar.hidden];
    const all = this.ui.getMobileActions().filter(isControl);
    // Map marks may change while every text/action remains identical. Reuse the
    // native layers before the retained-DOM early return, at a bounded 20 Hz.
    this.nativeMap.sync(this.ui,all,isImmersive());
    const boxes = [...InputBox.live];
    const visual = window.visualViewport;
    // Native UI is immediate-mode, but the DOM is retained. Unchanged native
    // frames must not rewrite attributes, invalidate styles or sort text again.
    // Input identity is checked separately so replacement fields at the same
    // logical coordinates are still adopted immediately.
    const signature = JSON.stringify([state, all, this.ui.texts, this.ui.bottomLine, this.ui.portraits, this.ui.cards, this.ui.panelInfo,
      boxes.map(b => [b.el.style.display, b.el.type]),
      document.getElementById("mobile-root")?.dataset.orientation,
      visual?.offsetLeft ?? 0, visual?.offsetTop ?? 0, visual?.width ?? innerWidth, visual?.height ?? innerHeight,
      getMobileDisplayMode(), this.trayOpen, this.battleCommandsOpen]);
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
    const context                = state.panel || npc || modal ? "panel" : state.context
      ?? (state.phase === "field" ? "field" : state.phase === "battle" ? "battle" : "lobby");
    const fieldNormal = state.phase === "field" && context !== "panel" && !state.panel && !npc && !modal;
    const layout = fieldNormal ? "field" : state.phase === "battle" && context !== "panel" && !state.panel && !npc && !modal ? "battle" : "full";
    const changed = layout !== this.layout;
    if (changed) {
      this.joystick.release();
      this.hooks.cancel();
      if (layout === "full") this.focusBeforeSheet = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.layout = layout; this.root.dataset.layout = layout;
    }
    this.syncSceneMode(isImmersive());
    if (this.sceneImmersive) {
      const parent = layout === "full" ? this.sheet : this.tray;
      if (this.advanced.parentNode !== parent) parent.append(this.advanced);
    }
    const immersiveBattle = this.sceneImmersive && layout === "battle";
    // Remembered attacks can expose native t-* immediately on a fresh battle.
    // They must not reopen an opaque sheet over the actor without a user action.
    // Returning from a native item/magic/pet pane is a deliberate target choice.
    if (immersiveBattle && changed && previousPhase === "battle" && previousLayout === "full"
      && all.some(h => /^(?:t|mt|pt)-\d+$/.test(h.id))) this.battleCommandsOpen = true;
    // The game viewport owns its size. Chrome stays in the remaining portrait
    // space or in the landscape rails; opening a native panel never covers it.
    setMobileContext(context);
    this.sheet.hidden = (fieldNormal && ![...InputBox.live].some(b => b.el.style.display !== "none"))
      || (immersiveBattle && !this.battleCommandsOpen);
    // Keep movement above native long lists; disabled stick never consumes menu movement.
    this.field.hidden = state.phase !== "field" || npc || modal || this.sceneImmersive && !fieldNormal;
    this.encounter.hidden = !state.canEncounter;
    this.encounter.disabled = !fieldNormal;
    this.encounter.setAttribute("aria-pressed", String(!!state.encounter));
    put(this.encounter, `自动遇敌：${state.encounter ? "开" : "关"}`);
    this.toolbar.hidden = state.phase !== "field" || !fieldNormal || (this.sceneImmersive && !this.trayOpen);
    this.tray.hidden = !this.sceneImmersive || !this.trayOpen;
    this.trayToggle.hidden = !this.sceneImmersive || layout === "full";
    this.trayToggle.setAttribute("aria-expanded", String(this.trayOpen));
    put(this.trayToggle, this.trayOpen ? "收起" : layout === "battle" ? "操作" : "菜单");
    this.root.dataset.tray = this.trayOpen ? "open" : "closed";
    this.camera.hidden = !this.sceneImmersive || layout !== "battle" || state.cameraAvailable === false;
    this.battleFooter.hidden = !immersiveBattle;
    this.battleCommands.setAttribute("aria-expanded", String(this.battleCommandsOpen));
    put(this.battleCommands, this.battleCommandsOpen ? "收起指令" : "指令");
    this.fieldExtras.hidden = !this.sceneImmersive || layout !== "field";
    this.joystick.element.setAttribute("aria-disabled", String(layout !== "field" || this.trayOpen));
    this.sheet.setAttribute("role", this.sceneImmersive && layout === "full" ? "dialog" : "region");
    if (this.sceneImmersive && layout === "full") this.sheet.setAttribute("aria-modal", "true");
    else this.sheet.removeAttribute("aria-modal");
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
    const hits = fieldNormal ? this.sceneImmersive ? all.filter(h => !this.isInputHit(h) && !MIRRORED_FIELD_ACTIONS.has(h.id)
      && !/^chat-(?:up|down|reset)$/.test(h.id)) : [] : all.filter(h => !this.isInputHit(h)
      && !(state.phase === "field" && (/^tb-/.test(h.id) || /^chat-(?:all|up|down|reset)$/.test(h.id)))
      && !(state.phase === "battle" && state.cameraAvailable === false && context === "field" && !AUTO_ACTIONS.has(h.id)));
    this.syncActions(hits, state);
    // The same retained sheet hosts successive native windows. A previous
    // deep list must never leave a newly opened map or dialog above the screen.
    const paneKey=this.sceneImmersive && layout==="full"
      ? JSON.stringify([state.phase,state.title,npc,modal,this.ui.cards?.[0]?.kind,!!this.ui.panelInfo,!!this.ui.portraits?.length]) : "";
    if(paneKey!==this.paneKey){
      this.paneKey=paneKey;this.sheet.scrollTop=0;this.content.scrollTop=0;this.actions.scrollTop=0;
    }
    const pose=this.sceneImmersive && layout==="full" ? this.ui.portraits?.[0] : undefined;
    const portraitKey=pose ? `${pose.rawIndex}:${pose.image}:${pose.animation?.key??""}` : "";
    this.portrait.alt=state.title==="状态" ? "人物头像" : "选中宠物的形象";
    if(portraitKey!==this.portraitKey){this.portraitKey=portraitKey;this.portrait.hidden=true;}
    if (this.sceneImmersive) void this.nativeSkin?.sync(this.root,pose ? {...pose,target:this.portrait} : null);
    else this.nativeSkin?.clearPortrait();
    if (this.sceneImmersive && layout === "field") this.fieldExtras.hidden = hits.length === 0;
    this.battleCommands.disabled = immersiveBattle && !hits.some(h => !AUTO_ACTIONS.has(h.id));
    if (!wasMobile || changed || wasImmersive !== this.sceneImmersive || previousPhase !== state.phase
      || visibilityBefore.some((hidden, i) => hidden !== [this.sheet.hidden, this.field.hidden, this.toolbar.hidden][i])) {
      document.dispatchEvent(new Event("sa-controls-layout"));
    }
    if (changed && layout === "full" && !this.sheet.contains(document.activeElement)) {
      // Do not steal focus from an original input newly focused by a native screen.
      const first = [...this.sheet.querySelectorAll             ("input,button")].find(el => !el.closest("[hidden]") && !el.hasAttribute("disabled")
        && (!el.getClientRects || el.getClientRects().length > 0));
      (first ?? this.sheet).focus({ preventScroll: true });
    } else if (changed && layout === "field" && this.focusBeforeSheet?.isConnected && !this.sheet.contains(document.activeElement)) {
      this.focusBeforeSheet.focus({ preventScroll: true }); this.focusBeforeSheet = null;
    }
  }

          command(name        )       {
    // Opening a native menu closes the local tray. It still goes through the
    // host's original command path; the shell never invents game state.
    this.trayOpen = false;
    if (name === "back") this.battleCommandsOpen = false;
    this.hooks.cancel(); this.hooks.command(name);
  }

          syncSettings()       {
    const mobile = isMobile(), display = getMobileDisplayMode();
    if (this.displaySelect.value !== display) this.displaySelect.value = display;
    for (const el of [this.displayLabel, this.displayHelp]) if (el.hidden !== !mobile) el.hidden = !mobile;
    // Switching presentation does not necessarily make the platform leave
    // fullscreen. Keep its explicit exit reachable on touchscreens in any mode.
    const hideFullscreen = !mobile && !document.fullscreenElement;
    if (this.fullscreen.hidden !== hideFullscreen) this.fullscreen.hidden = hideFullscreen;
    put(this.fullscreen, document.fullscreenElement ? "退出全屏" : "进入全屏");
  }

          async toggleFullscreen()                {
    this.joystick.release(); this.hooks.cancel();
    if (document.fullscreenElement) {
      await exitMobileFullscreen(); put(this.displayHelp, "已退出浏览器全屏，游戏布局继续铺满可见区域。");
    } else {
      const entered = await requestMobileFullscreen();
      put(this.displayHelp, entered ? "已进入浏览器全屏。" : "游戏布局已铺满可见区域，此浏览器暂未提供页面全屏。");
    }
    this.syncSettings(); this.frame(this.state);
  }

          toggleTray()       {
    if (!this.sceneImmersive) return;
    this.trayOpen = !this.trayOpen; this.joystick.release(); this.hooks.cancel(); this.frame(this.state);
  }

          toggleBattleCommands()       {
    if (!this.sceneImmersive || this.layout !== "battle") return;
    this.trayOpen = false; this.battleCommandsOpen = !this.battleCommandsOpen;
    this.hooks.cancel(); this.frame(this.state);
  }

          syncSceneMode(active         )       {
    if (active === this.sceneImmersive) return;
    this.sceneImmersive = active; this.trayOpen = false; this.battleCommandsOpen = false;
    this.joystick.release(); this.hooks.cancel();
    this.root.dataset.immersive = String(active);
    // Only control groups move; native InputBox nodes stay in the original
    // adopted-input sheet. Returning to classic restores the exact parent order.
    if (active) {
      this.advanced.append(this.right);
      this.tray.append(this.toolbar, this.fieldExtras, this.camera, this.advanced);
    }
    else {
      this.left.insertBefore(this.toolbar, this.sheet); this.root.insertBefore(this.right, this.tray);
      this.tray.hidden = true; this.trayToggle.hidden = true; this.camera.hidden = true;
      this.fieldExtras.hidden = true; this.battleFooter.hidden = true;
    }
  }

          makeFieldControls()              {
    const controls = node("div", "mobile-shell-controls");
    const tools = node("div", "mobile-shell-tools");
    for (const [command, label] of [["interact", "交互"], ["back", "返回 / 取消"]]) {
      const b = button(label, () => this.command(command)); b.dataset.mobileControl = `field-${command}`; tools.append(b);
    }
    this.encounter.dataset.mobileControl = "auto-encounter";
    tools.append(this.encounter);
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
    if(this.sceneImmersive && !npc && !modal && this.ui.panelInfo){
      const info=this.ui.panelInfo;
      return [...info.lines,...(info.nativeTextX===undefined ? [] : this.ui.texts.filter(t=>t.x===info.nativeTextX && t.y<550).map(t=>t.text))];
    }
    // Collection records replace the native slot text and the old all-items
    // summary. Never put a second inventory above the real interactive slots.
    if(this.sceneImmersive && !npc && !modal && this.ui.cards?.some(card=>card.actions.some(id=>hits.some(hit=>hit.id===id)))) {
      return this.ui.bottomLine ? [this.ui.bottomLine] : [];
    }
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
    const compact = this.sceneImmersive && this.layout === "battle";
    const autoHits = compact ? hits.filter(h => AUTO_ACTIONS.has(h.id)) : [];
    const collection=this.nativeCards.sync(this.sceneImmersive && this.layout==="full" ? this.ui.cards ?? [] : [],hits,hit=>this.actionButton(hit,state));
    for(const id of this.syncStats(hits,state))collection.add(id);
    const rows = hits.filter(h=>!collection.has(h.id) && !(compact && AUTO_ACTIONS.has(h.id)));
    const container = this.sceneImmersive && this.layout === "field" ? this.extraActions : this.actions;
    const keep = new Set(hits.map(h => h.id)), rowKeep = new Set        ();
    const focused = document.activeElement;
    let previous                   = null;
    for (const hitsInRow of actionRows(rows)) {
      const key = hitsInRow.map(hit => hit.id).join("\0"); rowKeep.add(key);
      let row = this.actionRowNodes.get(key);
      if (!row) { row = node("div", "mobile-shell-action-row"); this.actionRowNodes.set(key, row); }
      let priorButton                   = null;
      for (const hit of hitsInRow) {
        const b = this.actionButton(hit, state);
        const nextButton                   = priorButton ? priorButton.nextSibling : row.firstChild;
        if (nextButton !== b) row.insertBefore(b, nextButton); priorButton = b;
      }
      const next                   = previous ? previous.nextSibling : container.firstChild;
      if (next !== row) container.insertBefore(row, next); previous = row;
    }
    let lastAuto                   = null;
    for (const hit of autoHits) {
      const b = this.actionButton(hit, state), next                   = lastAuto ? lastAuto.nextSibling : this.battleAutos.firstChild;
      if (next !== b) this.battleAutos.insertBefore(b, next); lastAuto = b;
    }
    this.battleAutos.hidden = autoHits.length === 0;
    for (const [id, b] of this.actionNodes) if (!keep.has(id)) { b.remove(); this.actionNodes.delete(id); }
    for (const [key, row] of this.actionRowNodes) if (!rowKeep.has(key)) { row.remove(); this.actionRowNodes.delete(key); }
    // A native row regroup may reparent a surviving focused button. Do not lose
    // keyboard selection or scroll the list when its neighboring actions change.
    if (focused instanceof HTMLElement && this.root.contains(focused) && [...this.actionNodes.values()].includes(focused                     )
      && document.activeElement !== focused) focused.focus({ preventScroll: true });
  }

  /** Attribute values and +1 retain the same live native action. No local point
   * balance or batch requests: each tap waits for ordinary server Status data. */
          syncStats(hits            ,state                 )            {
    const stats=this.sceneImmersive && this.layout==="full" ? this.ui.panelInfo?.stats??[] : [];
    const keep=new Set        (),used=new Set        ();let previous               =null;
    for(const stat of stats){
      keep.add(stat.label);let row=this.statRows.get(stat.label);
      if(!row){const element=node("div","mobile-native-stat"),label=node("span");element.append(label);row={element,label};this.statRows.set(stat.label,row);}
      put(row.label,`${stat.label} ${stat.value}`);
      const hit=stat.action ? hits.find(h=>h.id===stat.action) : undefined;
      for(const child of Array.from(row.element.children))if(child!==row.label && (child               ).dataset.action!==hit?.id)child.remove();
      if(hit){const control=this.actionButton(hit,state);put(control,"+1");control.setAttribute("aria-label",`${stat.label}增加 1 点`);
        if(control.parentElement!==row.element)row.element.append(control);used.add(hit.id);}
      const next               =previous ? previous.nextSibling : this.nativeStats.firstChild;
      if(next!==row.element)this.nativeStats.insertBefore(row.element,next);previous=row.element;
    }
    for(const [id,row]of this.statRows)if(!keep.has(id)){row.element.remove();this.statRows.delete(id);}
    this.nativeStats.hidden=!stats.length;return used;
  }

          actionButton(hit           , state                  )                    {
    let b = this.actionNodes.get(hit.id);
    if (!b) {
      const id = hit.id;
      const created                    = button("", () => {
        if (!isMobile() || !this.activeActions.has(id) || this.actionNodes.get(id) !== created) return;
        if (this.sceneImmersive) {
          if (this.layout === "field") this.trayOpen = false;
          else if (/^(?:t|mt|pt)-\d+$/.test(id) || ["b-guard", "b-escape", "watch-leave"].includes(id) || AUTO_ACTIONS.has(id)) this.battleCommandsOpen = false;
        }
        this.hooks.cancel(); this.hooks.action(id);
      });
      b = created; b.dataset.action = id; this.actionNodes.set(id, b);
    }
    put(b, this.actionLabel(hit, state));
    b.removeAttribute("aria-label");delete b.dataset.primaryAction;
    const selected = state.selectedId === hit.id;
    if (b.getAttribute("aria-current") !== String(selected)) b.setAttribute("aria-current", String(selected));
    return b;
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
    if (/^(?:[bmp]?t-|.*target)/.test(id)) {
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
    const targets = Array.from(this.sheet.querySelectorAll             ("button,input,select,summary,[tabindex='0']")).filter(el => !el.closest("[hidden]") && !el.hasAttribute("disabled")
      && (!el.getClientRects || el.getClientRects().length > 0));
    const first = targets[0], last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

          installStyle()       {
    if (document.getElementById("mobile-shell-style")) return;
    const style = node("style"); style.id = "mobile-shell-style";
    style.textContent = `
.mobile-shell{--jade:#214c4b;--gold:#e2cca0;--ink:#f4eee0;--leaf:#b7d3c7;color:var(--ink);background:linear-gradient(165deg,#204a4b,#13343c);font:15px/1.5 "PingFang SC","Microsoft YaHei",system-ui,sans-serif;box-sizing:border-box;display:flex;flex-direction:column;min-height:0;max-width:100%;padding-bottom:env(safe-area-inset-bottom);isolation:isolate}
.mobile-shell [hidden],.mobile-shell[hidden]{display:none!important}.mobile-shell *{box-sizing:border-box}
.mobile-shell-left{display:contents}.mobile-shell button,.mobile-shell select{font:inherit;min-height:44px;min-width:44px;color:var(--ink);border:1px solid #71918a;border-radius:9px;background:linear-gradient(#2f5a53,#21443f);box-shadow:inset 0 1px #ffffff20,0 2px 4px #0003;padding:9px 12px;touch-action:manipulation;cursor:pointer;-webkit-tap-highlight-color:transparent}
.mobile-shell button:disabled{opacity:.5;cursor:default}.mobile-shell-actions button:is([data-action='ok'],[data-action='modal-ok'],[data-action='modal-yes'],[data-action='dlg-ok'],[data-action='npc-btn0']){background:linear-gradient(#ead8ae,#c4a571);border-color:#f1dcb0;color:#253b37;font-weight:600}
.mobile-shell button:active{background:#42685b;box-shadow:inset 0 2px 5px #0005}.mobile-shell button[aria-current='true']{border-color:var(--gold);box-shadow:inset 0 0 0 1px var(--gold),0 0 12px #e7c68622}.mobile-shell :focus-visible,#mobile-mode-switch :focus-visible{outline:3px solid #f7d48a;outline-offset:2px}
.mobile-shell-status{order:0;padding:12px 16px 10px;border-bottom:1px solid #e7c68638;flex:none}.mobile-shell-status strong{font-size:18px;color:var(--gold)}.mobile-shell-status div{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;color:var(--leaf);margin-top:3px}
.mobile-shell-sheet{order:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px 14px;scroll-padding:12px;flex:1}.mobile-shell-back{width:100%;margin-bottom:10px;color:var(--gold)!important}.mobile-shell-info p,.mobile-shell-chat p{margin:0 0 6px;white-space:pre-wrap;overflow-wrap:anywhere}.mobile-shell-info{margin-bottom:10px;max-height:24dvh;overflow:auto;overscroll-behavior:contain;font-size:14px;color:#c6dacf;scrollbar-gutter:stable}
.mobile-shell-actions{display:flex;flex-direction:column;gap:8px}.mobile-shell-action-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:stretch;min-width:0}.mobile-shell-action-row>button:last-child:nth-child(odd){grid-column:1/-1}.mobile-shell-actions button{min-width:0;min-height:44px;white-space:normal;overflow-wrap:anywhere;text-align:left;line-height:1.4}.mobile-shell-input{display:block;margin-bottom:12px}.mobile-shell-input span{display:block;margin-bottom:5px;font-size:13px;color:var(--gold)}.mobile-shell-input input{font-family:inherit!important;min-height:46px;max-width:100%;box-shadow:inset 0 2px 4px #0003}.mobile-shell-inputs>button{margin-bottom:8px;width:100%}
.mobile-shell-toolbar{order:3;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:10px 12px;border-top:1px solid #e7c68626;flex:none}.mobile-shell-toolbar button{padding:6px 2px;font-size:13px}.mobile-shell-field{order:2;padding:8px 14px;flex:none}.mobile-shell-chat{max-height:60px;overflow:auto;font-size:13px;color:#adcbbe}.mobile-shell-controls{display:flex;align-items:center;justify-content:space-between;gap:12px}.mobile-shell-dpad{display:grid;grid-template-areas:'. up .' 'left down right';grid-template-columns:44px 44px 44px;gap:4px}.mobile-shell-dpad button{padding:4px;font-size:23px}.mobile-shell-tools{display:grid;gap:6px}
.mobile-shell-right{order:4;padding:12px;display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:8px;border-top:1px solid #e7c68626;flex:none}.mobile-shell-selection{min-width:0;padding:0 2px}.mobile-shell-eyebrow{font-size:10px;color:#95b5a8;letter-spacing:.16em}.mobile-shell-selected{font-size:13px;color:var(--gold);min-height:22px;overflow-wrap:anywhere}.mobile-shell-navigation{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.mobile-shell-navigation button{font-size:26px;padding:0;line-height:1}
.mobile-shell-clicks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;grid-column:1/-1}.mobile-shell-click{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:60px!important}.mobile-shell-click-title{font-size:16px;font-weight:650;letter-spacing:.1em}.mobile-shell-click small{font-size:10px;color:#c3d5c9}.mobile-shell-click-0{background:linear-gradient(#e6c78b,#bc955a)!important;color:#24352b!important;border-color:#e5c994!important}.mobile-shell-click-0 small{color:#344c3e}.mobile-shell-click-2{border-color:#809b86!important}
.mobile-shell-zoom{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;grid-column:1/-1}.mobile-shell-zoom button{padding:5px;font-size:14px}.mobile-shell-joystick{display:block;position:relative;width:112px;height:112px;max-width:100%;aspect-ratio:1;flex:none;border-radius:50%;border:1px solid #c8b88066;background:radial-gradient(circle at 45% 40%,#294d47 0 28%,#173632 65%,#092024 100%);box-shadow:inset 0 3px 12px #0008,0 0 0 5px #081e22,0 0 0 6px #87a18444,0 6px 15px #0006;touch-action:none;user-select:none;-webkit-user-select:none}
.mobile-shell-joystick::before,.mobile-shell-joystick::after{content:'';position:absolute;background:#c4b68025;pointer-events:none}.mobile-shell-joystick::before{width:1px;top:13%;bottom:13%;left:50%}.mobile-shell-joystick::after{height:1px;left:13%;right:13%;top:50%}.mobile-shell-joystick-knob{position:absolute;left:50%;top:50%;width:46%;height:46%;border:1px solid #a6b894;border-radius:50%;background:radial-gradient(circle at 35% 25%,#729780,#2b5145 70%);box-shadow:0 4px 8px #0007,inset 0 1px #e9e8be55;transform:translate(calc(-50% + var(--stick-x,0px)),calc(-50% + var(--stick-y,0px)));pointer-events:none;z-index:1}.mobile-shell-joystick-guide{position:absolute;left:0;right:0;bottom:8px;text-align:center;font-size:10px;color:#acc2b2;pointer-events:none}.mobile-shell-joystick[data-active='true']{border-color:var(--gold)}
#mobile-mode-switch{position:fixed;right:6px;bottom:6px;z-index:1000;color:#e6e9df;background:#143632ed;border:1px solid #91a68a;border-radius:10px;box-shadow:0 3px 12px #0004;font:12px/1.4 system-ui,sans-serif;padding:3px 6px}#mobile-mode-switch summary{cursor:pointer;min-height:26px;display:flex;align-items:center;justify-content:center}#mobile-mode-switch label{display:block;padding:8px 0}#mobile-mode-switch select{font:16px system-ui,sans-serif;min-height:44px;color:#fff;background:#24483d;border:1px solid #91a597;border-radius:6px}html.sa-mobile #mobile-mode-switch{top:calc(env(safe-area-inset-top) + 6px);right:calc(env(safe-area-inset-right) + 6px);bottom:auto}html.sa-mobile #mobile-mode-switch summary{min-height:44px;min-width:44px}
#mobile-mode-switch [hidden]{display:none!important}#mobile-mode-switch button{width:100%;min-height:44px;font:14px system-ui,sans-serif;color:#253b37;border:1px solid #e2cca0;border-radius:8px;background:linear-gradient(#ead8ae,#c4a571);padding:8px;cursor:pointer;touch-action:manipulation}#mobile-mode-switch .mobile-shell-display-help{max-width:240px;margin:8px 0 3px;color:#cbded3;font-size:12px;line-height:1.5;white-space:normal}#mobile-mode-switch label select{max-width:calc(100vw - 42px)}
#mobile-root[data-orientation='portrait'] .mobile-shell-status{padding-right:84px;min-height:58px}
#mobile-root[data-orientation='portrait'] .mobile-shell-status strong{font-size:16px;overflow-wrap:anywhere}
/* The portrait list has its own bounded scroll surface. An unbounded overflow
   element with overscroll containment can swallow a drag before chrome scrolls. */
#mobile-root:not([data-orientation='landscape']) .mobile-shell-sheet{flex:none;max-height:max(160px,calc(var(--viewport-height,100dvh) - var(--game-height,75vw) - 260px))}
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
#mobile-root[data-orientation='landscape'] .mobile-shell-actions{gap:6px}
#mobile-root[data-orientation='landscape'] .mobile-shell-action-row{grid-template-columns:minmax(0,1fr);gap:6px}
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


/* Stick and lists occupy separate rows; only the stick owns touch drags. */
.mobile-shell-field{order:-1}.mobile-shell-sheet{touch-action:pan-y}.mobile-shell-actions button{touch-action:pan-y}
#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-phase='field']{display:flex;flex-direction:column}
#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-phase='field'] .mobile-shell-field{order:-1;width:100%;padding:12px 16px}
#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-phase='field'] .mobile-shell-controls{flex-direction:row}
#mobile-root:not([data-orientation='landscape']) .mobile-shell[data-phase='field'] .mobile-shell-right{order:4;width:100%;padding:12px}
#mobile-root[data-orientation='landscape'] .mobile-shell-field{order:-1;margin-top:0;justify-content:start;padding:8px;min-height:0}
#mobile-root[data-orientation='landscape'] .mobile-shell-controls{flex-direction:column;gap:8px}
#mobile-root[data-orientation='landscape'] .mobile-shell-tools{display:grid;width:100%}
#mobile-root[data-orientation='landscape'] .mobile-shell-tools button{font-size:12px;padding:4px;min-height:44px}
#mobile-root[data-orientation='landscape'] .mobile-shell-tools button:not([data-mobile-control='auto-encounter']){display:none}

/* Opt-in scene presentation: the full-sized game owns the viewport. Native
   panels/lobby keep the classic complete canvas and readable sheet above. */
html.sa-mobile #mobile-root[data-display='immersive']:is([data-context='field'],[data-context='battle']) #mobile-viewport{position:absolute;inset:0;width:100%;height:100%}
html.sa-mobile #mobile-root[data-display='immersive']:is([data-context='field'],[data-context='battle']) #mobile-chrome{position:absolute;inset:0;overflow:visible;pointer-events:none;touch-action:auto}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true']{display:contents;background:none;padding:0}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-left{display:contents;position:static;width:auto;padding:0;background:none;border:0;overflow:visible}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-status{position:absolute;left:calc(12px + env(safe-area-inset-left));right:calc(78px + env(safe-area-inset-right));top:calc(8px + env(safe-area-inset-top));min-height:0;max-height:78px;overflow:hidden;padding:7px 10px;border:1px solid #d8c39755;border-radius:10px;background:#13343ce8;pointer-events:none;z-index:3}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-status strong{display:none}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-status div{display:block;margin:0;font-size:12px;line-height:1.5;color:#f4eee0}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-field{position:absolute;left:calc(12px + env(safe-area-inset-left));right:calc(80px + env(safe-area-inset-right));bottom:calc(12px + env(safe-area-inset-bottom));width:auto;max-width:none;margin:0;padding:0;min-height:0;background:none;pointer-events:auto;z-index:4}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-controls{display:flex;flex-direction:row;align-items:end;justify-content:space-between;gap:12px;width:100%}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-joystick{width:96px;height:96px;flex:none;background:radial-gradient(circle at 45% 40%,#3b615ae8 0 28%,#173632e8 65%,#092024e8 100%)}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-tools{display:grid;grid-template-columns:minmax(0,1fr);width:min(140px,100%);gap:8px}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-tools button{display:block;min-height:44px;padding:7px 8px;font-size:13px;line-height:1.3;background:#214c4bec}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-tools button[data-mobile-control='field-back']{display:none}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-chat{display:none}
.mobile-shell-joystick[aria-disabled='true']{opacity:.5}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-tray-toggle{position:absolute;right:calc(12px + env(safe-area-inset-right));bottom:calc(12px + env(safe-area-inset-bottom));width:56px;height:56px;min-height:44px;padding:7px;border:1px solid #efd9aa;background:linear-gradient(#e6d1a7,#b48b54);color:#253b37;font-size:14px;font-weight:600;box-shadow:inset 0 1px #fff6,0 4px 10px #0004;pointer-events:auto;z-index:6}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer{position:absolute;left:calc(12px + env(safe-area-inset-left));right:calc(12px + env(safe-area-inset-right));bottom:calc(126px + env(safe-area-inset-bottom));max-height:min(55dvh,calc(var(--viewport-height,100dvh) - 190px));min-height:0;display:flex;flex-direction:column;overflow:auto;overscroll-behavior:contain;touch-action:pan-y;padding:8px;border:1px solid #d8c397aa;border-radius:12px;background:#173f40fa;box-shadow:0 8px 24px #0006;pointer-events:auto;z-index:5;scrollbar-width:thin}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer .mobile-shell-toolbar{order:0;display:grid;position:static;width:auto;grid-template-columns:repeat(4,minmax(0,1fr));padding:4px;gap:6px;border:0;max-height:none;overflow:visible;flex:none;min-height:0}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer .mobile-shell-toolbar button{min-width:44px;min-height:44px;font-size:13px;padding:7px 2px}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer .mobile-shell-right{order:3;position:static;inset:auto;width:auto;display:grid;grid-template-columns:minmax(0,1fr) 88px;min-height:0;overflow:visible;padding:8px 4px 4px;background:none;border:0;gap:8px;flex:none}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer .mobile-shell-selected{min-height:22px;max-height:none;white-space:normal;font-size:13px;overflow:visible}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer .mobile-shell-navigation{grid-template-columns:repeat(2,minmax(0,1fr))}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer .mobile-shell-clicks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer .mobile-shell-click{min-height:48px!important;padding:7px 4px;width:100%}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer .mobile-shell-zoom{grid-template-columns:repeat(3,minmax(0,1fr));margin:0}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-field-extras{order:1;margin:8px 4px 4px;flex:none;min-width:0}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-field-extras>strong{display:block;margin-bottom:8px;color:var(--gold);font-size:13px;font-weight:600}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-field-extras .mobile-shell-action-row{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-field-extras button{min-height:44px;font-size:13px;padding:8px;touch-action:pan-y}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer .mobile-shell-camera{order:2;position:static;inset:auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:4px;flex:none;padding:0}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-battle-footer{position:absolute;left:calc(12px + env(safe-area-inset-left));right:calc(80px + env(safe-area-inset-right));bottom:calc(12px + env(safe-area-inset-bottom));display:grid;grid-template-columns:minmax(0,1fr) 66px;gap:6px;align-items:end;pointer-events:auto;z-index:4;min-width:0}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-battle-autos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;min-width:0}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-battle-footer button{min-width:44px;min-height:44px;padding:7px 4px;font-size:13px;white-space:normal;overflow-wrap:anywhere;background:#214c4bed}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-battle-footer .mobile-shell-battle-command-toggle{border-color:#e2cca0;color:#253b37;background:linear-gradient(#e6d1a7,#b48b54);font-weight:600}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-camera{position:absolute;left:calc(12px + env(safe-area-inset-left));right:calc(78px + env(safe-area-inset-right));top:calc(68px + env(safe-area-inset-top));display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;pointer-events:auto;z-index:4}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-camera button{min-height:44px;min-width:44px;padding:6px 4px;background:#214c4bec;font-size:13px}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='battle'] .mobile-shell-sheet{position:absolute;left:calc(12px + env(safe-area-inset-left));right:calc(12px + env(safe-area-inset-right));bottom:calc(80px + env(safe-area-inset-bottom));max-height:min(35dvh,calc(var(--viewport-height,100dvh) - 160px));min-height:0;overflow:auto;overscroll-behavior:contain;touch-action:pan-y;padding:10px;border:1px solid #d8c39788;border-radius:12px;background:#153b3de8;pointer-events:auto;z-index:4}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='battle'] .mobile-shell-info{max-height:64px;margin-bottom:8px;font-size:13px;overflow:auto}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='battle'] .mobile-shell-action-row{grid-template-columns:repeat(2,minmax(0,1fr))}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='battle'] .mobile-shell-drawer{bottom:calc(80px + env(safe-area-inset-bottom))}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-tray='open'] .mobile-shell-sheet{visibility:hidden;pointer-events:none}
html.sa-mobile:has(#mobile-root[data-display='immersive']:is([data-context='field'],[data-context='battle'])) #mobile-mode-switch{top:calc(8px + env(safe-area-inset-top));right:calc(8px + env(safe-area-inset-right));bottom:auto}

/* Mobile fullscreen owns one game viewport in every phase. Dialogs are native
   game windows inside that viewport; no webpage rails or document scrolling. */
html.sa-mobile #mobile-root[data-display='immersive'] #mobile-viewport{position:absolute;inset:0;width:100%;height:100%}
html.sa-mobile #mobile-root[data-display='immersive'] #mobile-chrome{position:absolute;inset:0;overflow:visible;pointer-events:none;touch-action:auto}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true']{--ink:#fff;--gold:#ffe996;--leaf:#c9dddc;font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] :is(.mobile-shell-sheet,.mobile-shell-drawer){border:solid transparent;border-width:18px 24px;border-image-source:var(--native-window);border-image-slice:48 64 fill;border-image-width:18px 24px;border-image-repeat:stretch;background:#253d4bf5;border-radius:0;box-shadow:0 4px 14px #0007;padding:8px}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] button{border-radius:3px;background:#193445e8;border-color:#8ea4b2;color:#fff;box-shadow:inset 0 1px #ffffff28,0 1px 2px #0006;text-shadow:1px 1px #0008}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] button:active{background:#435f6e}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] button[aria-current='true']{border-color:#ffe996;box-shadow:inset 0 0 0 1px #ffe996}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] button[data-native-icon='true']{display:flex;align-items:center;gap:7px}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] button[data-native-icon='true']::before{content:'';display:block;flex:none;width:32px;height:28px;background-image:var(--native-icon);background-repeat:no-repeat;background-size:contain;background-position:center;image-rendering:pixelated;pointer-events:none}
.mobile-native-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px;min-width:0}
.mobile-native-cards[data-kind='pet']{grid-template-columns:minmax(0,1fr)}
.mobile-native-card{min-width:0;border:1px solid #a5b3b76b;background:#0e2937ee;padding:8px;box-shadow:inset 0 1px #ffffff1a}
.mobile-native-card small{display:block;font-size:12px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;color:#c6d9dc;margin-top:6px}
.mobile-native-card-category{display:block;font-size:11px;line-height:1.5;color:#e9d99e;margin-bottom:5px}
.mobile-native-card>button[data-primary-action]{width:100%;min-height:44px;margin-top:8px;color:#ffe996!important;border-color:#a99a67!important}
.mobile-native-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}
.mobile-native-stat{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;min-width:0;background:#0e2937ee;border:1px solid #a5b3b76b}
.mobile-native-stat span{font-size:14px;overflow-wrap:anywhere}
.mobile-native-stat button{min-width:44px!important;min-height:44px!important;flex-shrink:0;color:#ffe996!important}
@media(max-width:359px){.mobile-native-stats{grid-template-columns:minmax(0,1fr)}}
.mobile-native-card-controls{display:flex;flex-wrap:wrap;gap:6px}
.mobile-native-card-controls button{flex:1;min-width:0!important;font-size:13px!important;white-space:normal;overflow-wrap:anywhere;line-height:1.4;text-align:left}
.mobile-native-card[data-kind='item'] .mobile-native-card-controls button{width:100%;min-height:72px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:6px}
.mobile-native-card[data-kind='pet'] .mobile-native-card-controls button:first-child{flex-basis:100%;color:#ffe996!important;font-size:16px!important}
.mobile-native-card button[data-native-icon='true']::before{width:36px!important;height:36px!important}
@media(min-width:390px){.mobile-native-cards[data-kind='item']{grid-template-columns:repeat(3,minmax(0,1fr))}}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-status{background:#142d40df;border-radius:3px;border-color:#a5b3b7a0;color:#fff}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-status{left:calc(12px + env(safe-area-inset-left));right:calc(78px + env(safe-area-inset-right));max-height:72px;padding:8px 12px}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-status strong{display:block;font-size:17px;color:#ffe996}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-status div{max-height:20px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-sheet{position:absolute;left:calc(10px + env(safe-area-inset-left));right:calc(10px + env(safe-area-inset-right));top:calc(92px + env(safe-area-inset-top));bottom:calc(10px + env(safe-area-inset-bottom));max-height:none;min-height:0;overflow:auto;overscroll-behavior:contain;pointer-events:auto;z-index:5;scroll-padding:64px 8px 12px;touch-action:pan-y}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-back{position:sticky;top:0;z-index:2;margin:0 0 10px;min-height:44px;width:100%;background:#1d3748;color:#ffe996!important}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-info{max-height:none;overflow:visible;margin:0 0 12px;font-size:15px;line-height:1.7;color:#e3edef;scrollbar-gutter:auto}
.mobile-shell-native-map{display:block;width:100%;height:auto;margin:0 auto 12px;border:1px solid #a5b3b7;background:#0a0f1c;image-rendering:pixelated;touch-action:none}
.mobile-shell-native-portrait{display:block;width:192px;max-width:100%;height:176px;object-fit:contain;image-rendering:pixelated;margin:0 auto 12px;pointer-events:none}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-action-row{grid-template-columns:repeat(2,minmax(0,1fr))}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-actions button{font-size:14px;min-height:48px;padding:9px 10px}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-input input{background:#102d40!important;border-color:#a2b2bd!important;border-radius:2px!important;color:#fff!important}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-tray-toggle{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;background:#24455bec;color:#ffe996;border-color:#b7c0bd;text-shadow:1px 1px #0008}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-tray-toggle::before{width:26px!important;height:22px!important}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer .mobile-shell-toolbar{grid-template-columns:repeat(4,minmax(0,1fr))}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer .mobile-shell-toolbar button{flex-direction:column;justify-content:center;gap:3px;min-height:66px}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer .mobile-shell-toolbar button::before{width:36px;height:28px}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-advanced{order:4;grid-column:1/-1;min-width:0;padding:5px 4px;color:#d2e1e6;font-size:13px;flex:none}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-advanced>summary{min-height:44px;padding:10px 6px;cursor:pointer;color:#ffe996;touch-action:pan-y;border-top:1px solid #9daeb255}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-advanced .mobile-shell-right{position:static;inset:auto;width:auto;display:grid;grid-template-columns:minmax(0,1fr) 88px;min-height:0;overflow:visible;padding:8px 4px;background:none;border:0;gap:8px;max-height:none}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-advanced .mobile-shell-clicks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-advanced .mobile-shell-navigation{grid-template-columns:repeat(2,minmax(0,1fr))}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-advanced .mobile-shell-zoom{grid-template-columns:repeat(3,minmax(0,1fr))}
#mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-field{display:none}
html.sa-mobile:has(#mobile-root[data-display='immersive']) #mobile-mode-switch{top:calc(8px + env(safe-area-inset-top));right:calc(8px + env(safe-area-inset-right));bottom:auto;border-radius:3px;background:#193748ed}
@media (min-width:700px) and (orientation:landscape){
  #mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-sheet{top:calc(78px + env(safe-area-inset-top));display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,1fr);grid-template-rows:auto minmax(0,1fr) auto auto;gap:10px 18px;overflow:hidden}
  #mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-back{position:static;grid-column:1/-1;margin:0}
  #mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-content{grid-column:1;grid-row:2;min-height:0;overflow:auto;overscroll-behavior:contain;padding-right:8px}
  #mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-info{margin:0 0 12px;font-size:14px}
  #mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-actions{grid-column:2;grid-row:2/4;min-height:0;overflow:auto;overscroll-behavior:contain;align-self:stretch;padding:0 3px}
  #mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-dismiss{grid-column:1;grid-row:3}
  #mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-advanced{grid-column:1/-1;grid-row:4;max-height:35dvh;overflow:auto;padding:0}
  #mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'] .mobile-shell-drawer{left:auto;width:min(460px,70vw);max-height:calc(var(--viewport-height,100dvh) - 108px);bottom:calc(78px + env(safe-area-inset-bottom))}
}
@media (max-height:460px){
  #mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-status{padding:4px 10px;max-height:48px}
  #mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-status div{display:none}
  #mobile-root[data-display='immersive'] .mobile-shell[data-immersive='true'][data-layout='full'] .mobile-shell-sheet{top:calc(62px + env(safe-area-inset-top))}
}
`;
    document.head.append(style);
  }
}
