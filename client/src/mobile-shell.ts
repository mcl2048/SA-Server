import { InputBox, type Ui, type MobileHit, type Text } from "./ui.ts";
import { getDeviceMode, setDeviceMode, isMobile, setMobileScene, setSceneZoom, getSceneZoom, resetSceneView, type DeviceMode } from "./mobile-view.ts";

export interface MobileShellHooks {
  action(id: string): void;
  command(name: string): void;
  direction(dir: number): void;
  cancel(): void;
}
export interface MobileShellState {
  phase: string;
  panel: boolean;
  status?: string;
  summary?: string[];
  chat?: string[];
  title?: string;
  /** Presentation labels supplied from already received native data; never new actions. */
  actionLabels?: Readonly<Record<string, string>>;
}
type Adopted = { box: InputBox; parent: Node; next: ChildNode | null; style: string | null; aria: string | null; row: HTMLLabelElement; caption: HTMLSpanElement };
const TITLES: Record<string, string> = { login: "欢迎来到石器时代", line: "选择线路", char: "选择角色", make: "创建角色", field: "冒险", battle: "战斗" };
const LABELS: Record<string, string> = {
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
function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function put(el: HTMLElement, value: string): void { if (el.textContent !== value) el.textContent = value; }
function button(label: string, run: () => void): HTMLButtonElement {
  const b = node("button", undefined, label); b.type = "button"; b.addEventListener("click", run); return b;
}
function clean(text: string): string { return text.trim().replace(/[ \t　]+/g, " "); }
function isControl(hit: MobileHit): boolean {
  return !/(?:^|-)(?:block|blocker|wnd|bg|win)$/.test(hit.id)
    && !["colorwin", "login-dlg", "pet-ext", "quest-detail", "status-party"].includes(hit.id)
    && !(hit.x2 - hit.x1 >= 600 && hit.y2 - hit.y1 >= 450);
}

/** DOM presentation only. Action IDs are queued by the host and validated against its next native frame. */
export class MobileShell {
  private readonly root = node("section", "mobile-shell");
  private readonly status = node("header", "mobile-shell-status");
  private readonly heading = node("strong");
  private readonly statusText = node("div");
  private readonly sheet = node("section", "mobile-shell-sheet");
  private readonly preview = node("canvas", "mobile-shell-preview");
  private readonly info = node("div", "mobile-shell-info");
  private readonly inputs = node("div", "mobile-shell-inputs");
  private readonly actions = node("div", "mobile-shell-actions");
  private readonly dismiss = button("返回 / 取消对话", () => this.command("back"));
  private readonly field = node("div", "mobile-shell-field");
  private readonly chat = node("div", "mobile-shell-chat");
  private readonly toolbar = node("nav", "mobile-shell-toolbar");
  private readonly mode = node("details");
  private readonly modeSelect = node("select");
  private readonly adopted = new Map<HTMLInputElement, Adopted>();
  private readonly actionNodes = new Map<string, HTMLButtonElement>();
  private readonly textNodes = new Map<string, HTMLElement>();
  private readonly chatNodes = new Map<string, HTMLElement>();
  private state: MobileShellState = { phase: "login", panel: false };
  private activeActions = new Set<string>();
  private layout = "";
  private focusBeforeSheet: HTMLElement | null = null;
  private mobile = false;

  private readonly ui: Ui;
  private readonly hooks: MobileShellHooks;

  constructor(ui: Ui, hooks: MobileShellHooks) {
    this.ui = ui;
    this.hooks = hooks;
    this.installStyle();
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "游戏移动界面");
    this.heading.id = "mobile-shell-title";
    this.status.append(this.heading, this.statusText);
    this.sheet.setAttribute("aria-labelledby", this.heading.id);
    this.sheet.tabIndex = -1;
    this.preview.width = 800; this.preview.height = 600;
    this.preview.dataset.mobilePreview = "true";
    this.preview.setAttribute("role", "img"); this.preview.setAttribute("aria-label", "游戏画面预览");
    this.sheet.append(this.preview, this.info, this.inputs, this.actions, this.dismiss);
    this.chat.setAttribute("role", "log"); this.chat.setAttribute("aria-label", "最近聊天");
    // Deliberately not live: the native scene can change text every animation frame.
    this.field.append(this.chat, this.makeFieldControls());
    this.toolbar.setAttribute("aria-label", "游戏菜单");
    for (const [command, label] of [["status", "状态"], ["items", "道具"], ["pets", "宠物"], ["quests", "任务"], ["map", "地图"], ["chat", "聊天"], ["system", "系统"], ["back", "返回"]]) {
      this.toolbar.append(button(label, () => this.command(command)));
    }
    this.root.append(this.status, this.sheet, this.field, this.toolbar);
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
    this.modeSelect.addEventListener("change", () => { this.hooks.cancel(); setDeviceMode(this.modeSelect.value as DeviceMode); this.frame(this.state); });
    label.append(this.modeSelect); this.mode.append(toggle, label); document.body.append(this.mode);
    // Chrome must never turn an input/button gesture into a canvas click or global hotkey.
    for (const el of [this.root, this.mode]) {
      for (const event of ["pointerdown", "pointerup", "pointermove", "click", "dblclick", "contextmenu"]) el.addEventListener(event, e => e.stopPropagation());
      el.addEventListener("keydown", e => {
        e.stopPropagation();
        if (e.key === "Escape" && isMobile()) { e.preventDefault(); this.command("back"); }
        if (e.key === "Tab" && this.layout === "full") this.trapFocus(e);
      });
      el.addEventListener("keyup", e => e.stopPropagation());
    }
    document.addEventListener("sa-device-change", () => { this.modeSelect.value = getDeviceMode(); this.hooks.cancel(); this.frame(this.state); });
    addEventListener("blur", () => this.hooks.cancel());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.hooks.cancel(); });
  }

  frame(state: MobileShellState): void {
    this.state = state;
    const mobile = isMobile();
    this.modeSelect.value = getDeviceMode();
    if (!mobile) {
      if (this.mobile) { this.hooks.cancel(); this.restoreInputs(); }
      this.mobile = false; this.root.hidden = true; this.layout = ""; setMobileScene(false); return;
    }
    this.mobile = true; this.root.hidden = false;
    this.root.dataset.phase = state.phase;
    const all = this.ui.getMobileActions().filter(isControl);
    const npc = all.some(h => /^(?:npc-|psel-)/.test(h.id));
    const modal = all.some(h => /^modal-/.test(h.id));
    this.dismiss.hidden = !npc;
    const fieldNormal = state.phase === "field" && !state.panel && !npc && !modal;
    const layout = fieldNormal ? "field" : state.phase === "battle" && !npc && !modal ? "battle" : "full";
    const changed = layout !== this.layout;
    if (changed) {
      this.hooks.cancel();
      if (layout === "full") this.focusBeforeSheet = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.layout = layout; this.root.dataset.layout = layout;
    }
    // Chrome has position:relative and may have zero height before a full sheet opens.
    // Anchor full screens to the visual viewport, not that collapsed containing block.
    const visual = window.visualViewport;
    for (const [key, value] of Object.entries({ left: `${visual?.offsetLeft ?? 0}px`, top: `${visual?.offsetTop ?? 0}px`, width: `${visual?.width ?? innerWidth}px`, height: `${visual?.height ?? innerHeight}px`, maxHeight: `${visual?.height ?? innerHeight}px` })) {
      if (layout === "full") this.root.style.setProperty(key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`), value);
      else this.root.style.removeProperty(key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`));
    }
    setMobileScene(fieldNormal);
    this.sheet.hidden = fieldNormal && ![...InputBox.live].some(b => b.el.style.display !== "none");
    this.field.hidden = !fieldNormal;
    this.preview.hidden = !["login", "char", "make"].includes(state.phase) || npc || modal;
    this.toolbar.hidden = state.phase !== "field" || npc || modal;
    this.sheet.setAttribute("role", layout === "full" ? "dialog" : "region");
    if (layout === "full") this.sheet.setAttribute("aria-modal", "true"); else this.sheet.removeAttribute("aria-modal");
    put(this.heading, npc ? "对话" : modal ? "提示" : state.title || (state.panel ? "游戏菜单" : TITLES[state.phase]) || "石器时代");
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
    if (changed && layout === "full" && !this.sheet.contains(document.activeElement)) {
      // Do not steal focus from an original input newly focused by a native screen.
      const first = this.sheet.querySelector<HTMLElement>("input:not([disabled]),button");
      (first ?? this.sheet).focus({ preventScroll: true });
    } else if (changed && layout === "field" && this.focusBeforeSheet?.isConnected && !this.sheet.contains(document.activeElement)) {
      this.focusBeforeSheet.focus({ preventScroll: true }); this.focusBeforeSheet = null;
    }
  }

  private command(name: string): void { this.hooks.cancel(); this.hooks.command(name); }

  private makeFieldControls(): HTMLElement {
    const controls = node("div", "mobile-shell-controls");
    const pad = node("div", "mobile-shell-dpad"); pad.setAttribute("role", "group"); pad.setAttribute("aria-label", "移动方向");
    for (const [dir, glyph, label, area] of [[4, "↑", "向上移动", "up"], [2, "←", "向左移动", "left"], [0, "↓", "向下移动", "down"], [6, "→", "向右移动", "right"]] as const) {
      const b = button(glyph, () => {});
      b.setAttribute("aria-label", label); b.style.gridArea = area;
      const release = () => { this.hooks.direction(-1); this.hooks.cancel(); };
      b.addEventListener("pointerdown", e => {
        e.preventDefault();
        if (this.layout !== "field" || !e.isPrimary) { release(); return; }
        this.hooks.cancel(); b.setPointerCapture(e.pointerId); this.hooks.direction(dir);
      });
      for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(name, release);
      b.addEventListener("keydown", e => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat && this.layout === "field") { e.preventDefault(); this.hooks.direction(dir); }
      });
      b.addEventListener("keyup", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); release(); } });
      b.addEventListener("blur", release);
      pad.append(b);
    }
    const tools = node("div", "mobile-shell-tools");
    tools.append(button("交互", () => this.command("interact")), button("返回 / 取消", () => this.command("back")));
    const zoom = node("div", "mobile-shell-zoom"); zoom.setAttribute("role", "group"); zoom.setAttribute("aria-label", "场景缩放");
    zoom.append(button("−", () => setSceneZoom(Math.max(.55, getSceneZoom() - .1))), button("复位", () => resetSceneView()), button("＋", () => setSceneZoom(Math.min(1.4, getSceneZoom() + .1))));
    zoom.firstElementChild?.setAttribute("aria-label", "缩小场景"); zoom.lastElementChild?.setAttribute("aria-label", "放大场景");
    tools.append(zoom); controls.append(pad, tools); return controls;
  }

  private diffLines(container: HTMLElement, nodes: Map<string, HTMLElement>, lines: string[]): void {
    const counts = new Map<string, number>(), keep = new Set<string>(); let previous: ChildNode | null = null;
    for (const value of lines) {
      const text = clean(value); if (!text) continue;
      const occurrence = counts.get(text) ?? 0; counts.set(text, occurrence + 1);
      const key = `${text}\0${occurrence}`; keep.add(key);
      let el = nodes.get(key); if (!el) { el = node("p", undefined, text); nodes.set(key, el); }
      const next: ChildNode | null = previous ? previous.nextSibling : container.firstChild;
      if (next !== el) container.insertBefore(el, next); previous = el;
    }
    for (const [key, el] of nodes) if (!keep.has(key)) { el.remove(); nodes.delete(key); }
  }

  private readableTexts(state: MobileShellState, hits: MobileHit[], npc: boolean, modal: boolean, field: boolean): string[] {
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
    const seenPosition = new Set<string>();
    const rows: { y: number; values: string[] }[] = [];
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

  private describeText(t: Text, state: MobileShellState): string {
    const value = clean(t.text);
    if (state.phase === "field" && this.activeActions.has("st-group") && /^\d+$/.test(value) && t.x < 280) {
      const labels: Record<number, string> = { 72: "等级", 93: "经验", 114: "下级经验", 135: t.x > 100 ? "最大 HP" : "HP", 156: "MP", 177: "攻击", 198: "防御", 219: "敏捷", 240: "魅力", 290: t.x > 150 ? "腕力" : "体力", 310: t.x > 150 ? "敏捷点" : "耐力" };
      if (labels[t.y]) return `${labels[t.y]}：${value}`;
      if (t.y === 30 && t.x > 170) return `DP：${value}`;
    }
    if (state.phase === "char" && /^\d+$/.test(value)) {
      const names: Record<number, string> = { 212: "等级", 234: "耐久", 256: "攻击", 278: "防御", 300: "敏捷", 322: t.x % 304 > 240 ? "DP" : "魅力", 344: "登入次数" };
      if (names[t.y]) return `${t.x >= 384 ? "角色 2" : "角色 1"} ${names[t.y]}：${value}`;
    }
    if (state.phase === "make" && /^\d+$/.test(value)) {
      if (t.y === 284) return `${t.x < 400 ? "可分配状态点" : "可分配属性点"}：${value}`;
      const stat = ({ 310: "体力", 338: "腕力", 365: "耐力", 394: "敏捷" } as Record<number, string>)[t.y];
      if (stat && t.x < 350) return `${stat}：${value}`;
    }
    return value;
  }

  private isInputHit(h: MobileHit): boolean {
    for (const entry of this.adopted.values()) {
      if (entry.row.hidden) continue;
      const x = Number(entry.box.el.dataset.logicalX), y = Number(entry.box.el.dataset.logicalY);
      const w = Number(entry.box.el.dataset.logicalWidth), ht = Number(entry.box.el.dataset.logicalHeight);
      if (x + w / 2 >= h.x1 && x + w / 2 <= h.x2 && y + ht / 2 >= h.y1 && y + ht / 2 <= h.y2 && h.x2 - h.x1 < w + 40 && h.y2 - h.y1 < ht + 40) return true;
    }
    return false;
  }

  private syncInputs(state: MobileShellState, npc: boolean, modal: boolean, field: boolean): void {
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
    let send = this.inputs.querySelector<HTMLButtonElement>("button");
    if (state.phase === "field" && !npc && !modal && [...this.adopted.values()].some(e => !e.row.hidden && Number(e.box.el.dataset.logicalY) >= 530)) {
      if (!send) { send = button("发送聊天", () => this.command("send-chat")); this.inputs.append(send); }
      send.hidden = false;
    } else if (send) send.hidden = true;
  }

  private inputLabel(el: HTMLInputElement, state: MobileShellState, npc: boolean): string {
    const x = Number(el.dataset.logicalX), y = Number(el.dataset.logicalY);
    if (state.phase === "field" && y >= 530) return "聊天消息";
    if (npc) return "输入内容";
    if (state.phase === "login" && x > 440) return el.type === "password" ? "密码" : "账号";
    const nearby = this.ui.texts.filter(t => t.x < x && Math.abs(t.y - y) < 12 && x - t.x < 250).sort((a, b) => b.x - a.x)[0];
    if (nearby && /[\u3400-\u9fffA-Za-z]/.test(nearby.text)) return clean(nearby.text);
    if (state.phase === "make") return "角色姓名";
    return el.type === "password" ? "密码 / 安全码" : "输入内容";
  }

  private restoreInputs(): void {
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

  private syncActions(hits: MobileHit[], state: MobileShellState): void {
    const keep = new Set<string>(); let previous: ChildNode | null = null;
    for (const hit of hits) {
      if (keep.has(hit.id)) continue; keep.add(hit.id);
      let b = this.actionNodes.get(hit.id);
      if (!b) {
        const id = hit.id;
        b = button("", () => { if (isMobile() && this.activeActions.has(id)) { this.hooks.cancel(); this.hooks.action(id); } });
        b.dataset.action = id; this.actionNodes.set(id, b);
      }
      put(b, this.actionLabel(hit, state));
      const next: ChildNode | null = previous ? previous.nextSibling : this.actions.firstChild;
      if (next !== b) this.actions.insertBefore(b, next); previous = b;
    }
    for (const [id, b] of this.actionNodes) if (!keep.has(id)) { b.remove(); this.actionNodes.delete(id); }
  }

  private actionLabel(h: MobileHit, state: MobileShellState): string {
    const id = h.id;
    if (state.actionLabels?.[id]) return clean(state.actionLabels[id]);
    if (id === "ok" && state.phase === "login") return "进入游戏";
    if (LABELS[id]) return LABELS[id];
    if (h.label && /[^\d\s]/.test(h.label) && !/^inv-page/.test(id)) return clean(h.label);
    let m: RegExpMatchArray | null;
    if ((m = id.match(/^(new|login|del)(\d+)$/))) return `${({ new: "创建角色", login: "进入角色", del: "删除角色" } as Record<string, string>)[m[1]]} ${Number(m[2]) + 1}`;
    if ((m = id.match(/^chr(\d+)$/))) return `选择人物形象 ${Number(m[1]) + 1}`;
    if ((m = id.match(/^town(\d+)$/))) return ["萨姆吉尔村", "玛丽娜丝村", "加加村", "卡鲁它那村"][Number(m[1])] || "选择出生地";
    if ((m = id.match(/^inv-(\d+)$/))) return `物品格 ${Number(m[1]) + 1}${h.label ? ` · ${clean(h.label)}` : ""}`;
    if ((m = id.match(/^inv-page(\d+)$/))) return `道具第 ${Number(m[1]) + 1} 页`;
    if ((m = id.match(/^st-up(\d)$/))) return `增加${["体力", "腕力", "耐力", "敏捷"][Number(m[1])]}点数`;
    if ((m = id.match(/^st-kick(\d+)$/))) return `移出队伍成员 ${Number(m[1]) + 1}`;
    if ((m = id.match(/^pet-(name|st|ride|skill)(\d+)$/))) return `${({ name: "宠物", st: "切换宠物状态", ride: "骑乘 / 下骑", skill: "宠物技能" } as Record<string, string>)[m[1]]} ${Number(m[2]) + 1}`;
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

  private nearText(hit: MobileHit): string | undefined {
    const cx = (hit.x1 + hit.x2) / 2, cy = (hit.y1 + hit.y2) / 2;
    const text = this.ui.texts.filter(t => clean(t.text) && /[^\d\s]/.test(t.text)).sort((a: Text, b: Text) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
    return text && Math.hypot(text.x - cx, text.y - cy) < 55 ? clean(text.text) : undefined;
  }

  private trapFocus(event: KeyboardEvent): void {
    const targets = Array.from(this.root.querySelectorAll<HTMLElement>("button,input,select,[tabindex='0']")).filter(el => !el.closest("[hidden]") && !el.hasAttribute("disabled"));
    const first = targets[0], last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  private installStyle(): void {
    if (document.getElementById("mobile-shell-style")) return;
    const style = node("style"); style.id = "mobile-shell-style";
    style.textContent = `
.mobile-shell{color:#eff7ed;background:#10292deF;font:16px/1.5 system-ui,sans-serif;box-sizing:border-box;display:flex;flex-direction:column;max-height:100%;min-height:0;padding-bottom:env(safe-area-inset-bottom);isolation:isolate}
.mobile-shell [hidden]{display:none!important}.mobile-shell[hidden]{display:none!important}
.mobile-shell *{box-sizing:border-box}.mobile-shell button,.mobile-shell select{font:inherit;min-height:44px;min-width:44px;color:#f7f2d7;border:1px solid #73938a;border-radius:9px;background:#24464a;padding:8px 12px;touch-action:manipulation;cursor:pointer}
.mobile-shell button:active{background:#47675a}.mobile-shell :focus-visible,#mobile-mode-switch :focus-visible{outline:3px solid #ffd77d;outline-offset:2px}
.mobile-shell-status{padding:8px 62px 8px 12px;border-bottom:1px solid #6b8b7e;flex:none}.mobile-shell-status strong{font-size:17px;color:#ffdf97}.mobile-shell-status div{white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px}
.mobile-shell-sheet{min-height:0;overflow:auto;overscroll-behavior:contain;padding:10px 12px;scroll-padding:12px;flex:1}.mobile-shell-info p,.mobile-shell-chat p{margin:0 0 5px;white-space:pre-wrap;overflow-wrap:anywhere}.mobile-shell-info{margin-bottom:8px;max-height:32vh;max-height:32dvh;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.mobile-shell-preview{display:block;width:100%;height:200px;max-height:25dvh;object-fit:contain;background:#071d21;border-radius:9px;margin-bottom:10px;pointer-events:none}.mobile-shell[data-phase='login'] .mobile-shell-preview{height:140px;max-height:18dvh}.mobile-shell[data-layout='battle'] .mobile-shell-info{max-height:18dvh}
.mobile-shell-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mobile-shell-actions button{white-space:normal;overflow-wrap:anywhere;text-align:left}
.mobile-shell-input{display:block;margin-bottom:12px}.mobile-shell-input span{display:block;margin-bottom:4px;color:#ffdf97}.mobile-shell-input input{font-family:inherit!important;min-height:46px;max-width:100%}.mobile-shell-inputs>button{margin-bottom:8px;width:100%}
.mobile-shell-toolbar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;padding:6px 8px;border-top:1px solid #69877b;flex:none}.mobile-shell-toolbar button{padding:6px 2px}
.mobile-shell-field{padding:6px 10px;flex:none}.mobile-shell-chat{max-height:76px;overflow:auto;font-size:16px;color:#cde2cf}.mobile-shell-controls{display:flex;align-items:center;justify-content:space-between;gap:12px}.mobile-shell-dpad{display:grid;grid-template-areas:'. up .' 'left down right';grid-template-columns:44px 44px 44px;gap:4px}.mobile-shell-dpad button{padding:4px;font-size:23px}.mobile-shell-tools{display:grid;gap:4px}.mobile-shell-zoom{display:flex;gap:4px}.mobile-shell-zoom button{padding:6px 8px;flex:1}
.mobile-shell[data-layout='full']{position:fixed;inset:0;z-index:10;background:#10292d}.mobile-shell[data-layout='full'] .mobile-shell-sheet{flex:1}.mobile-shell[data-layout='battle']{max-height:55vh;max-height:55dvh}.mobile-shell[data-layout='battle'] .mobile-shell-sheet{max-height:calc(55dvh - 65px)}
.mobile-shell[data-layout='field'] .mobile-shell-sheet{max-height:150px;flex:none;padding:6px 10px}.mobile-shell[data-layout='field'] .mobile-shell-info{display:none}.mobile-shell[data-layout='field'] .mobile-shell-inputs{display:flex;align-items:end;gap:6px}.mobile-shell[data-layout='field'] .mobile-shell-input{flex:1;min-width:0;margin:0}.mobile-shell[data-layout='field'] .mobile-shell-input span{display:none}.mobile-shell[data-layout='field'] .mobile-shell-inputs>button{width:auto;margin:0}
#mobile-mode-switch{position:fixed;right:6px;bottom:6px;z-index:1000;color:#eee;background:#163236eF;border:1px solid #84988d;border-radius:8px;font:13px/1.4 system-ui,sans-serif;padding:3px 6px}#mobile-mode-switch summary{cursor:pointer;min-height:26px;display:flex;align-items:center}#mobile-mode-switch label{display:block;padding:8px 0}#mobile-mode-switch select{font:16px system-ui,sans-serif;min-height:44px;color:#fff;background:#24464a;border:1px solid #91a597;border-radius:6px}html.sa-mobile #mobile-mode-switch{top:6px;bottom:auto}html.sa-mobile #mobile-mode-switch summary{min-height:44px;min-width:44px}
@media(max-height:580px){.mobile-shell[data-layout='field'] .mobile-shell-chat{display:none}.mobile-shell-controls{gap:6px}.mobile-shell-toolbar{grid-template-columns:repeat(8,minmax(0,1fr))}.mobile-shell-toolbar button{font-size:13px;padding:4px 0}.mobile-shell-dpad{grid-template-areas:'left up down right';grid-template-columns:repeat(4,44px)}}
`;
    document.head.append(style);
  }
}
