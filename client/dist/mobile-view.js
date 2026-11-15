// Presentation only: the game, UI and network always use 800 × 600 coordinates.
import { immersiveScene } from "./mobile-camera.js?v=5e4867fa738c689d";



const validMode = (value               )                      => value === "auto" || value === "desktop" || value === "mobile";
const storageKey = "sa-device-mode";
const browser = typeof window !== "undefined" && typeof document !== "undefined";
let mode             = "auto";
try { if (browser) { const saved = localStorage.getItem(storageKey); if (validMode(saved)) mode = saved; } } catch { /* Storage may be unavailable. */ }
const query = new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("device");
if (validMode(query)) mode = query;
let mobile = false, scene = false, loginArtwork = false, zoom = 1, panX = 0, panY = 0, fit = 1, frame = 0;
let display                    = "classic", context                = "lobby";
let focusX = 400, focusY = 300, focusAt = 0;
// Easing is presentation state. Keep the current native subject separately so
// a narrow viewport/rotation never inherits an obsolete interpolation origin.
let targetFocusX = 400, targetFocusY = 300, viewportWidth = 0, viewportHeight = 0;
const validDisplay = (value               )                             => value === "classic" || value === "immersive";
try { if (browser) { const saved = localStorage.getItem("sa-mobile-display"); if (validDisplay(saved)) display = saved; } } catch { /* In-memory mode remains available. */ }
const displayQuery = new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("view");
if (validDisplay(displayQuery)) display = displayQuery;
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
export function isImmersive()          { return mobile && display === "immersive"; }
export function getMobileDisplayMode()                    { return display; }
export function setMobileDisplayMode(value                   )       {
  if (!validDisplay(value) || display === value) return;
  display = value;
  try { localStorage.setItem("sa-mobile-display", value); } catch { /* Apply without persistence. */ }
  resetSceneView();
  if (browser) {
    document.dispatchEvent(new Event("sa-mobile-gesture"));
    document.dispatchEvent(new CustomEvent("sa-mobile-display-change", { detail: { display } }));
  }
}
/** Browser fullscreen requires a user gesture and is unavailable on some phones.
 * The independent immersive viewport remains usable when the platform declines.
 */
export async function requestMobileFullscreen()                   {
  if (!browser || !mobile) return false;
  setMobileDisplayMode("immersive");
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen)
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    return !!document.fullscreenElement;
  } catch { return false; }
  finally { scheduleLayout(); }
}
export async function exitMobileFullscreen()                {
  if (!browser) return;
  try { if (document.fullscreenElement) await document.exitFullscreen(); }
  catch { /* The browser may already have exited fullscreen. */ }
  finally { scheduleLayout(); }
}
export function setMobileContext(value               )       {
  if (context === value) return;
  context = value; scene = value === "field";
  // Dialog content is reflowed by the in-game mobile window. Center its backdrop
  // and reset scene gestures so returning to play cannot retain a menu-era pan.
  zoom = 1; panX = panY = 0; focusAt = 0;
  if (browser) document.dispatchEvent(new Event("sa-mobile-gesture"));
  scheduleLayout();
}
/** Smooth only while the native subject remains visible. A new offscreen
 * subject must be revealed immediately; reduced motion always uses its position.
 */
export function setSceneFocus(x        , y        , now = typeof performance === "undefined" ? 0 : performance.now())       {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  targetFocusX=x;targetFocusY=y;
  let snap = focusAt === 0;
  if(!snap && isImmersive() && (context==="field" || context==="battle")){
    const width=window.visualViewport?.width ?? innerWidth,height=window.visualViewport?.height ?? innerHeight;
    const current=immersiveScene(width,height,focusX,focusY,zoom);
    const px=current.left+x*current.scale,py=current.top+y*current.scale,margin=Math.min(48,width/4,height/4);
    snap=px<margin || px>width-margin || py<margin || py>height-margin;
  }
  const dt = focusAt ? Math.max(0, Math.min(80, now - focusAt)) : 80;
  focusAt = now;
  const k = snap || browser && matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 1 - Math.exp(-dt / 140);
  const nx = focusX + (x - focusX) * k, ny = focusY + (y - focusY) * k;
  if (Math.abs(nx - focusX) < .1 && Math.abs(ny - focusY) < .1) return;
  focusX = nx; focusY = ny;
  if (isImmersive() && (context === "field" || context === "battle")) scheduleLayout();
}
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
  if (scene !== active) { scene = active; context = active ? "field" : "lobby"; scheduleLayout(); }
}
/** Zoom is relative to fit: 1 always means full width/height for this orientation. */
export function setSceneZoom(value        )       {
  if (Number.isFinite(value)) {
    zoom = Math.max(isImmersive() ? 1 : .5, Math.min(4, value));
    if(isImmersive()){focusX=targetFocusX;focusY=targetFocusY;panX=panY=0;}
    scheduleLayout();
  }
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
  // Keep the control surface in the visual viewport, including browser keyboard
  // and page magnification changes. Fullscreen game zoom uses buttons only.
  const width = visual?.width ?? innerWidth, height = visual?.height ?? innerHeight;
  const resized=width!==viewportWidth || height!==viewportHeight;
  viewportWidth=width;viewportHeight=height;
  root.style.width = `${width}px`; root.style.height = `${height}px`;
  root.style.left = `${visual?.offsetLeft ?? 0}px`; root.style.top = `${visual?.offsetTop ?? 0}px`;
  // Fullscreen is a device-space presentation, including NPC/menu/login panels.
  // Native content is reflowed inside its game window by MobileShell; returning
  // to 4:3 rails here would turn every dialog into an outside webpage again.
  const cropped = isImmersive();
  if(cropped && resized){focusX=targetFocusX;focusY=targetFocusY;panX=panY=0;focusAt=0;}
  const g = cropped ? { landscape: width > height, width, height, left: 0, top: 0, rail: 0 } : mobileGeometry(width, height);
  const nextOrientation = g.landscape ? "landscape" : "portrait";
  if (orientation !== nextOrientation) {
    orientation = nextOrientation;
    document.dispatchEvent(new Event("sa-mobile-gesture"));
  }
  // Camera movement changes only the transform. Rewriting an identical mode
  // attribute would wake the position editor and cancel its long-press timer.
  if (root.dataset.orientation !== orientation) root.dataset.orientation = orientation;
  if (root.dataset.display !== display) root.dataset.display = display;
  if (root.dataset.context !== context) root.dataset.context = context;
  for (const [key, value] of Object.entries({ "game-left": g.left, "game-top": g.top, "game-width": g.width,
    "game-height": g.height, "rail-width": g.rail, "viewport-width": width, "viewport-height": height })) root.style.setProperty(`--${key}`, `${value}px`);
  fit = cropped ? Math.max(1, width / 800, height / 600) : g.width / (loginArtwork ? 640 : 800);
  if (cropped) {
    const inScene = context === "field" || context === "battle";
    const c = immersiveScene(width, height, inScene ? focusX - panX / (fit * zoom) : 400,
      inScene ? focusY - panY / (fit * zoom) : 300, zoom);
    // The CSS stage is center-origin in x; geometry.left is its actual corner.
    // Do not feed edge clamping back into pan: an automatic target at an edge
    // must not leave a manual-pan offset when the next target is in the center.
    stage.style.setProperty("--mobile-scale", String(c.scale));
    stage.style.setProperty("--mobile-left", `${c.left + 400 * c.scale}px`);
    stage.style.setProperty("--mobile-top", `${c.top}px`);
    if (root.dataset.scene !== String(scene)) root.dataset.scene = String(scene);
    return;
  }
  const scale = fit * zoom, w = (loginArtwork ? 640 : 800) * scale, h = (loginArtwork ? 480 : 600) * scale;
  // Keep the image within its own clipping surface. Zoom never changes rail or
  // chrome geometry; fitting back to 1 restores all 800 × 600 logical pixels.
  panX = Math.max(-Math.max(0, (w - g.width) / 2), Math.min(Math.max(0, (w - g.width) / 2), panX));
  panY = Math.max(-Math.max(0, (h - g.height) / 2), Math.min(Math.max(0, (h - g.height) / 2), panY));
  stage.style.setProperty("--mobile-scale", String(scale));
  stage.style.setProperty("--mobile-left", `${g.width / 2 + panX}px`);
  stage.style.setProperty("--mobile-top", `${g.height / 2 - 300 * scale + panY}px`);
  if (root.dataset.scene !== String(scene)) root.dataset.scene = String(scene);
}
if (browser) {
  addEventListener("resize", () => refresh());
  window.visualViewport?.addEventListener("resize", scheduleLayout);
  window.visualViewport?.addEventListener("scroll", scheduleLayout);
  document.addEventListener("fullscreenchange", () => { document.dispatchEvent(new Event("sa-mobile-gesture")); scheduleLayout(); });
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
        if(!isImmersive()){
          const [a, b] = pair();
          initialDistance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); initialZoom = zoom;
          const rect = document.querySelector             (".stage") .getBoundingClientRect();
          anchorX = ((a.x + b.x) / 2 - rect.left) * 800 / rect.width;
          anchorY = ((a.y + b.y) / 2 - rect.top) * 600 / rect.height;
        }
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
      // Consume two-finger input and cancel native holds, but leave fullscreen
      // camera zoom/pan untouched. Only explicit zoom buttons can change it.
      if(isImmersive())return;
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
