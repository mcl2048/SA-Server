// Presentation only: the game, UI and network always use 800 × 600 coordinates.

const validMode = (value               )                      => value === "auto" || value === "desktop" || value === "mobile";
const storageKey = "sa-device-mode";
const browser = typeof window !== "undefined" && typeof document !== "undefined";
let mode             = "auto";
try { if (browser) { const saved = localStorage.getItem(storageKey); if (validMode(saved)) mode = saved; } } catch { /* Storage may be unavailable. */ }
const query = new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("device");
if (validMode(query)) mode = query;
let mobile = false, scene = false, loginArtwork = false, zoom = 1, panX = 0, panY = 0, fit = 1, frame = 0;
let orientation = "";
let originalParent              = null, originalNext                   = null;

/** Fit geometry includes independent control rails, never a shrunken thumbnail. */
export function mobileGeometry(width        , height        ) {
  const landscape = width > height;
  const gameWidth = landscape ? Math.min(height * 4 / 3, Math.max(1, width - 144)) : width;
  const gameHeight = gameWidth * 3 / 4;
  return { landscape, width: gameWidth, height: gameHeight, left: (width - gameWidth) / 2,
    top: landscape ? (height - gameHeight) / 2 : 0, rail: landscape ? (width - gameWidth) / 2 : 0 };
}
export function isMobile()          { return mobile; }
export function getDeviceMode()             { return mode; }
export function setDeviceMode(value            )       {
  if (!validMode(value)) return;
  mode = value;
  try { localStorage.setItem(storageKey, value); } catch { /* Apply in memory. */ }
  refresh(true);
}
/** The original login illustration has an empty 80/60 border, not game content. */
export function setMobileLoginArtwork(active         )       {
  if (loginArtwork !== active) { loginArtwork = active; scheduleLayout(); }
}
export function setMobileScene(active         )       {
  if (scene !== active) { scene = active; scheduleLayout(); }
}
/** Zoom is relative to fit: 1 always means full width/height for this orientation. */
export function setSceneZoom(value        )       {
  if (Number.isFinite(value)) { zoom = Math.max(.5, Math.min(4, value)); scheduleLayout(); }
}
export function getSceneZoom()         { return zoom; }
export function resetSceneView()       { zoom = 1; panX = panY = 0; scheduleLayout(); }
function detectMobile()          {
  return browser && navigator.maxTouchPoints > 0 && matchMedia("(pointer: coarse)").matches
    && matchMedia("(hover: none)").matches && Math.min(innerWidth, innerHeight) <= 1000 && Math.max(innerWidth, innerHeight) <= 1600;
}
function refresh(notify = false)       {
  if (!browser) return;
  const next = mode === "mobile" || (mode === "auto" && detectMobile()), changed = next !== mobile;
  mobile = next;
  document.documentElement.classList.toggle("sa-mobile", mobile);
  const stage = document.querySelector             (".stage"), viewport = document.getElementById("mobile-viewport");
  if (stage && viewport) {
    if (mobile && stage.parentNode !== viewport) {
      originalParent = stage.parentNode; originalNext = stage.nextSibling; viewport.append(stage);
    } else if (!mobile && originalParent) {
      originalParent.insertBefore(stage, originalNext?.parentNode === originalParent ? originalNext : null);
      originalParent = originalNext = null;
      for (const key of ["--mobile-scale", "--mobile-top", "--mobile-left"]) stage.style.removeProperty(key);
    }
  }
  scheduleLayout();
  if (changed || notify) document.dispatchEvent(new CustomEvent("sa-device-change", { detail: { mobile, mode } }));
}
function scheduleLayout()       {
  if (browser && !frame) frame = requestAnimationFrame(() => { frame = 0; layout(); });
}
function layout()       {
  if (!mobile) return;
  const root = document.getElementById("mobile-root"), viewport = document.getElementById("mobile-viewport"), stage = document.querySelector             (".stage");
  if (!root || !viewport || !stage) return;
  const visual = window.visualViewport;
  // Counter browser page magnification for the control surface. Two-finger game
  // gestures below instead magnify just the stage, leaving every control fixed.
  const width = visual?.width ?? innerWidth, height = visual?.height ?? innerHeight;
  root.style.width = `${width}px`; root.style.height = `${height}px`;
  root.style.left = `${visual?.offsetLeft ?? 0}px`; root.style.top = `${visual?.offsetTop ?? 0}px`;
  const g = mobileGeometry(width, height), nextOrientation = g.landscape ? "landscape" : "portrait";
  if (orientation !== nextOrientation) {
    orientation = nextOrientation;
    document.dispatchEvent(new Event("sa-mobile-gesture"));
  }
  root.dataset.orientation = orientation;
  for (const [key, value] of Object.entries({ "game-left": g.left, "game-top": g.top, "game-width": g.width,
    "game-height": g.height, "rail-width": g.rail, "viewport-width": width, "viewport-height": height })) root.style.setProperty(`--${key}`, `${value}px`);
  fit = g.width / (loginArtwork ? 640 : 800);
  const scale = fit * zoom, w = (loginArtwork ? 640 : 800) * scale, h = (loginArtwork ? 480 : 600) * scale;
  // Keep the image within its own clipping surface. Zoom never changes rail or
  // chrome geometry; fitting back to 1 restores all 800 × 600 logical pixels.
  panX = Math.max(-Math.max(0, (w - g.width) / 2), Math.min(Math.max(0, (w - g.width) / 2), panX));
  panY = Math.max(-Math.max(0, (h - g.height) / 2), Math.min(Math.max(0, (h - g.height) / 2), panY));
  stage.style.setProperty("--mobile-scale", String(scale));
  stage.style.setProperty("--mobile-left", `${g.width / 2 + panX}px`);
  stage.style.setProperty("--mobile-top", `${g.height / 2 - 300 * scale + panY}px`);
  root.dataset.scene = String(scene);
}
if (browser) {
  addEventListener("resize", () => refresh());
  window.visualViewport?.addEventListener("resize", scheduleLayout);
  window.visualViewport?.addEventListener("scroll", scheduleLayout);
  for (const feature of ["(pointer: coarse)", "(hover: none)"]) matchMedia(feature).addEventListener("change", () => refresh());
  const viewport = document.getElementById("mobile-viewport");
  if (viewport) {
    const touches = new Map                                  ();
    let gesturing = false, initialDistance = 1, initialZoom = 1, anchorX = 400, anchorY = 300;
    const pair = () => [...touches.values()].slice(0, 2);
    const clear = () => {
      const ids = [...touches.keys()]; touches.clear(); gesturing = false;
      for (const id of ids) if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    };
    viewport.addEventListener("pointerdown", e => {
      if (!mobile || e.pointerType !== "touch") return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const [a, b] = pair();
        initialDistance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); initialZoom = zoom;
        const rect = document.querySelector             (".stage") .getBoundingClientRect();
        anchorX = ((a.x + b.x) / 2 - rect.left) * 800 / rect.width;
        anchorY = ((a.y + b.y) / 2 - rect.top) * 600 / rect.height;
        gesturing = true;
        document.dispatchEvent(new Event("sa-mobile-gesture"));
        for (const id of touches.keys()) viewport.setPointerCapture(id);
      }
      if (gesturing) { e.preventDefault(); e.stopPropagation(); }
    }, { capture: true });
    viewport.addEventListener("pointermove", e => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!gesturing) return;
      e.preventDefault(); e.stopPropagation();
      if (touches.size < 2) return;
      const [a, b] = pair();
      zoom = Math.max(.5, Math.min(4, initialZoom * Math.hypot(a.x - b.x, a.y - b.y) / initialDistance));
      const r = viewport.getBoundingClientRect(), scale = fit * zoom;
      panX = (a.x + b.x) / 2 - r.left - r.width / 2 - (anchorX - 400) * scale;
      panY = (a.y + b.y) / 2 - r.top - r.height / 2 - (anchorY - 300) * scale;
      scheduleLayout();
    }, { capture: true });
    const finish = (e              ) => {
      if (!touches.has(e.pointerId)) return;
      if (gesturing) { e.preventDefault(); e.stopPropagation(); }
      touches.delete(e.pointerId);
      if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
      if (!touches.size) gesturing = false;
    };
    viewport.addEventListener("pointerup", finish, { capture: true });
    viewport.addEventListener("pointercancel", finish, { capture: true });
    viewport.addEventListener("lostpointercapture", e => {
      if (e.target === viewport && touches.has(e.pointerId)) { document.dispatchEvent(new Event("sa-mobile-gesture")); clear(); }
    });
    addEventListener("blur", clear);
    document.addEventListener("sa-device-change", clear);
    document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
  }
  refresh();
}
