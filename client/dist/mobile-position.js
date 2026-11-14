import { isMobile, getMobileDisplayMode } from "./mobile-view.js?v=abae3f174fa9bed4";

const STORAGE = "sa-control-positions-v1";

const finite = (value         )                  => typeof value === "number" && Number.isFinite(value);
export function clampControlOffset(rect                                                              , offset        , width        , height        )         {
  return { x: Math.max(-rect.left, Math.min(width - rect.left - rect.width, offset.x)),
    y: Math.max(-rect.top, Math.min(height - rect.top - rect.height, offset.y)) };
}

/** Ordinary taps keep their native meaning. Long-press explicitly edits position. */
export function installControlPositions(cancelGameInput            )       {
  const root = document.getElementById("mobile-root"); if (!root) return;
  let saved                         = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE) || "{}");
    if (parsed && typeof parsed === "object") for (const [key, p] of Object.entries(parsed)) {
      if (p && typeof p === "object" && finite((p          ).x) && finite((p          ).y)) saved[key] = p          ;
    }
  } catch { /* Storage is optional. */ }
  const write = () => { try { localStorage.setItem(STORAGE, JSON.stringify(saved)); } catch { /* Keep session positions. */ } };
  // Preserve every legacy classic key. The immersive layout has independent
  // preferences, so temporary clamping or a new drag cannot overwrite classic.
  const key = (el             ) => `${root.dataset.orientation || "portrait"}${getMobileDisplayMode() === "immersive" ? ":immersive" : ""}:${el.dataset.mobileControl}`;
  const inCurrentMode = (value        ) => value.includes(":immersive:") === (getMobileDisplayMode() === "immersive");
  const controls = [...root.querySelectorAll             ("[data-mobile-control]")];
  // A portal avoids clipping by scrolling control rails and their container-query
  // containing blocks. Placeholders keep every original grid/flex slot unchanged.
  const floating = document.createElement("div"); floating.className = "mobile-shell mobile-floating-controls"; root.append(floating);
  for (const event of ["pointerdown", "pointerup", "pointermove", "click", "contextmenu", "keydown"]) floating.addEventListener(event, e => e.stopPropagation());
  const reset = document.createElement("button"); reset.type = "button"; reset.textContent = "重置按钮位置";
  reset.className = "mobile-position-reset"; reset.hidden = true; reset.setAttribute("aria-label", "重置按钮位置"); root.append(reset);
  const style = document.createElement("style");
  style.textContent = `#mobile-root .mobile-floating-controls{display:block!important;position:fixed;inset:0;z-index:1100;overflow:visible;pointer-events:none;background:none;padding:0;margin:0;border:0;contain:none;isolation:auto}#mobile-root .mobile-floating-controls>[data-mobile-control]{position:fixed!important;pointer-events:auto;margin:0!important;max-width:none!important}.mobile-position-reset{position:fixed;z-index:1200;left:50%;bottom:calc(env(safe-area-inset-bottom) + 12px);transform:translateX(-50%);padding:12px 20px;border:1px solid #f3d48d;border-radius:999px;background:#143630;color:#ffe6a8;box-shadow:0 8px 30px #0008;font:600 14px system-ui;min-height:44px;touch-action:none;pointer-events:auto}.mobile-position-reset[hidden]{display:none!important}[data-mobile-control]{touch-action:none!important}[data-mobile-control].is-positioning{outline:2px dashed #f0ce87;outline-offset:5px;cursor:grabbing;transition:none!important}html:not(.sa-mobile) .mobile-position-reset,html:not(.sa-mobile) .mobile-floating-controls{display:none!important}`;
  document.head.append(style);
  // Drawer controls belong to a scrolling menu. Keep their native pan gesture;
  // external floating controls (stick/camera/menu) retain long-press editing.
  const drawerStyle = document.createElement("style");
  drawerStyle.textContent = "#mobile-root .mobile-shell-drawer [data-mobile-control]{touch-action:pan-y!important}";
  document.head.append(drawerStyle);

  const moved = new Map                       ();
  function detach(el             ) {
    const existing = moved.get(el); if (existing) return existing;
    const rect = el.getBoundingClientRect(), computed = getComputedStyle(el), originalStyle = el.getAttribute("style");
    const placeholder = document.createElement("div"); placeholder.setAttribute("aria-hidden", "true");
    Object.assign(placeholder.style, { width: `${rect.width}px`, height: `${rect.height}px`, visibility: "hidden", flex: "none", gridArea: computed.gridArea, margin: computed.margin });
    el.parentNode .insertBefore(placeholder, el);
    const preserved = ["font", "color", "background", "border", "border-radius", "box-shadow", "padding", "display", "flex-direction", "align-items", "justify-content", "gap", "grid-template-columns"];
    for (const prop of preserved) el.style.setProperty(prop, computed.getPropertyValue(prop));
    floating.append(el);
    Object.assign(el.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, minWidth: "0", minHeight: "0" });
    const record = { placeholder, originalStyle, base: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, offset: { x: 0, y: 0 } };
    moved.set(el, record); return record;
  }
  function reattach() {
    for (const [el, record] of moved) {
      record.placeholder.parentNode?.insertBefore(el, record.placeholder); record.placeholder.remove();
      if (record.originalStyle === null) el.removeAttribute("style"); else el.setAttribute("style", record.originalStyle);
    }
    moved.clear();
  }
  function restore() {
    reattach(); if (!isMobile()) { reset.hidden = true; return; }
    for (const el of controls) {
      if (el.closest(".mobile-shell-drawer")) continue;
      const p = saved[key(el)];
      if (!p || (!p.x && !p.y) || !el.getClientRects().length) continue;
      const record = detach(el), clamped = clampControlOffset(record.base, p, innerWidth, innerHeight);
      // Clamp the live rendering only. Viewport/panel changes are not a user edit.
      record.offset = clamped; el.style.translate = `${clamped.x}px ${clamped.y}px`;
    }
    reset.hidden = !Object.entries(saved).some(([key, p]) => inCurrentMode(key) && (p.x || p.y));
  }

  let gesture                 = null, suppressClick                     = null;
  const pointers = new Set        ();
  function finish() {
    if (!gesture) return;
    const current = gesture; gesture = null;
    if (current.timer) clearTimeout(current.timer);
    current.el.classList.remove("is-positioning");
    if (current.dragging) { suppressClick = current.el; write(); }
    if (current.dragging && current.el.hasPointerCapture(current.id)) current.el.releasePointerCapture(current.id);
  }
  // A second finger can never turn a pending control hold into a layout edit.
  document.addEventListener("pointerdown", e => {
    pointers.add(e.pointerId);
    if (pointers.size > 1) { const editing = gesture?.dragging; finish(); if (editing) cancelGameInput(); }
  }, { capture: true });
  const globalUp = (e              ) => {
    pointers.delete(e.pointerId);
    if (gesture?.id === e.pointerId && !gesture.dragging) finish();
    queueMicrotask(() => { if (gesture?.id === e.pointerId) finish(); });
  };
  document.addEventListener("pointerup", globalUp, { capture: true }); document.addEventListener("pointercancel", globalUp, { capture: true });
  reset.addEventListener("click", () => {
    finish();
    for (const k of Object.keys(saved)) if (inCurrentMode(k)) delete saved[k];
    write(); restore(); reset.hidden = true; cancelGameInput();
  });
  for (const el of controls) {
    el.addEventListener("pointerdown", e => {
      if (!isMobile() || !e.isPrimary || e.button !== 0 || pointers.size > 1) return;
      finish(); suppressClick = null;
      if (el.closest(".mobile-shell-drawer")) return; // Scroll, without starting a position timer.
      const r = el.getBoundingClientRect();
      // Exactly the joystick's neutral dead zone: sustained directional holds
      // remain movement, however long the user holds the stick.
      if (el.dataset.mobileControl === "joystick" && Math.hypot(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2) > Math.max(1, Math.min(r.width, r.height) * .32) * .24) return;
      const current          = { el, id: e.pointerId, x: e.clientX, y: e.clientY, offset: moved.get(el)?.offset ?? saved[key(el)] ?? { x: 0, y: 0 }, dragging: false, timer: null };
      gesture = current;
      current.timer = setTimeout(() => {
        if (gesture !== current || pointers.size !== 1) return;
        current.timer = null; cancelGameInput();
        gesture = null; document.dispatchEvent(new Event("sa-controls-drag"));
        // Detaching/reparenting can release an old pointer capture; only after
        // that lifecycle finishes does the position editor capture the pointer.
        detach(el); gesture = current; current.dragging = true;
        el.setPointerCapture(current.id); el.classList.add("is-positioning"); reset.hidden = false;
      }, 650);
    }, { capture: true });
    el.addEventListener("pointermove", e => {
      const g = gesture; if (!g || g.el !== el || g.id !== e.pointerId) return;
      if (!g.dragging) { if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 9) finish(); return; }
      e.preventDefault(); e.stopImmediatePropagation();
      const base = moved.get(el) .base;
      const p = clampControlOffset(base, { x: g.offset.x + e.clientX - g.x, y: g.offset.y + e.clientY - g.y }, innerWidth, innerHeight);
      saved[key(el)] = p; moved.get(el) .offset = p; el.style.translate = `${p.x}px ${p.y}px`;
    }, { capture: true });
    const up = (e              ) => {
      if (gesture?.el !== el || gesture.id !== e.pointerId) return;
      if (gesture.dragging) { e.preventDefault(); e.stopImmediatePropagation(); }
      finish();
    };
    el.addEventListener("pointerup", up, { capture: true }); el.addEventListener("pointercancel", up, { capture: true });
    el.addEventListener("lostpointercapture", () => { if (gesture?.el === el) finish(); });
    el.addEventListener("click", e => { if (suppressClick === el) { e.preventDefault(); e.stopImmediatePropagation(); suppressClick = null; } }, { capture: true });
  }
  let pending = false;
  const resize = () => { finish(); if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; restore(); }); } };
  const blur = () => { pointers.clear(); finish(); };
  addEventListener("resize", resize); addEventListener("blur", blur);
  document.addEventListener("visibilitychange", () => { if (document.hidden) blur(); });
  document.addEventListener("sa-device-change", resize); document.addEventListener("sa-controls-layout", resize);
  document.addEventListener("sa-mobile-display-change", resize);
  new MutationObserver(resize).observe(root, { attributes: true, attributeFilter: ["data-orientation", "data-display"] });
  restore();
}
