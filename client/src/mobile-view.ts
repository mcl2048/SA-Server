// Mobile owns only presentation. All game coordinates remain 800 × 600.
export type DeviceMode = "auto" | "desktop" | "mobile";
const validMode = (value: string | null): value is DeviceMode => value === "auto" || value === "desktop" || value === "mobile";
const storageKey = "sa-device-mode";
// Shared game modules also import UI in Node tests; browser initialization is optional.
const browser = typeof window !== "undefined" && typeof document !== "undefined";
let mode: DeviceMode = "auto";
try { if (browser) { const saved = localStorage.getItem(storageKey); if (validMode(saved)) mode = saved; } } catch { /* Private browsing may deny storage. */ }
const query = new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("device");
if (validMode(query)) mode = query;
let mobile = false;
let scene = false;
let zoom = 0.85;
let panX = 0, panY = 0;
let originalParent: Node | null = null;
let originalNext: ChildNode | null = null;
let frame = 0;

export function isMobile(): boolean { return mobile; }
export function getDeviceMode(): DeviceMode { return mode; }
export function setDeviceMode(value: DeviceMode): void {
  if (!validMode(value)) return;
  mode = value;
  try { localStorage.setItem(storageKey, value); } catch { /* Mode still applies in memory. */ }
  refresh(true);
}
/** Only enable the close-up for an unobstructed field; menus/battle use contain. */
export function setMobileScene(active: boolean): void {
  if (scene === active) return;
  scene = active;
  scheduleLayout();
}
export function setSceneZoom(value: number): void {
  if (!Number.isFinite(value)) return;
  zoom = Math.max(0.55, Math.min(1.4, value));
  scheduleLayout();
}
export function getSceneZoom(): number { return zoom; }
export function resetSceneView(): void { zoom = 0.85; panX = panY = 0; scheduleLayout(); }

function detectMobile(): boolean {
  if (!browser) return false;
  // Width alone never converts a narrow desktop window into a phone.
  const touch = navigator.maxTouchPoints > 0;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const hoverless = matchMedia("(hover: none)").matches;
  return touch && coarse && hoverless && Math.min(innerWidth, innerHeight) <= 1000 && Math.max(innerWidth, innerHeight) <= 1600;
}
function refresh(notify = false): void {
  if (!browser) return;
  const next = mode === "mobile" || (mode === "auto" && detectMobile());
  const changed = next !== mobile;
  mobile = next;
  document.documentElement.classList.toggle("sa-mobile", mobile);
  const stage = document.querySelector<HTMLElement>(".stage");
  const viewport = document.getElementById("mobile-viewport");
  if (stage && viewport) {
    if (mobile && stage.parentNode !== viewport) {
      originalParent = stage.parentNode;
      originalNext = stage.nextSibling;
      viewport.append(stage);
    } else if (!mobile && originalParent) {
      originalParent.insertBefore(stage, originalNext?.parentNode === originalParent ? originalNext : null);
      originalParent = null;
      originalNext = null;
      stage.style.removeProperty("--mobile-scale");
      stage.style.removeProperty("--mobile-top");
      stage.style.removeProperty("--mobile-left");
    }
  }
  scheduleLayout();
  if (changed || notify) document.dispatchEvent(new CustomEvent("sa-device-change", { detail: { mobile, mode } }));
}
function scheduleLayout(): void {
  if (!browser) return;
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; layout(); });
}
function layout(): void {
  if (!mobile) return;
  const root = document.getElementById("mobile-root");
  const viewport = document.getElementById("mobile-viewport");
  const stage = document.querySelector<HTMLElement>(".stage");
  if (!root || !viewport || !stage) return;
  // VisualViewport follows the soft keyboard. No maximum-scale/user-scalable restriction:
  // browser zoom remains available on the DOM chrome and outside the game canvas.
  const visual = window.visualViewport;
  root.style.width = `${visual?.width ?? innerWidth}px`;
  root.style.height = `${visual?.height ?? innerHeight}px`;
  root.style.left = `${visual?.offsetLeft ?? 0}px`;
  root.style.top = `${visual?.offsetTop ?? 0}px`;
  const { width, height } = viewport.getBoundingClientRect();
  const scale = scene ? zoom : Math.min(width / 800, height / 600);
  stage.style.setProperty("--mobile-scale", String(scale));
  // Clamp pan to the stage edges, never allow it to be dragged offscreen.
  const baseTop = height / 2 - 324 * scale;
  const limitX = Math.max(0, (800 * scale - width) / 2);
  panX = Math.max(-limitX, Math.min(limitX, panX));
  panY = 600 * scale > height ? Math.max(height - 600 * scale - baseTop, Math.min(-baseTop, panY)) : 0;
  stage.style.setProperty("--mobile-left", `${width / 2 + (scene ? panX : 0)}px`);
  // Field focal point matches the player's logical (400, 324), rather than the HUD.
  stage.style.setProperty("--mobile-top", `${height / 2 - (scene ? 324 : 300) * scale + (scene ? panY : 0)}px`);
  root.dataset.scene = String(scene);
}
if (browser) {
addEventListener("resize", () => refresh());
window.visualViewport?.addEventListener("resize", scheduleLayout);
window.visualViewport?.addEventListener("scroll", scheduleLayout);
for (const feature of ["(pointer: coarse)", "(hover: none)"]) matchMedia(feature).addEventListener("change", () => refresh());
const viewport = document.getElementById("mobile-viewport");
if (viewport) {
  new ResizeObserver(scheduleLayout).observe(viewport);
  const touches = new Map<number, { x: number; y: number }>();
  let gesturing = false;
  let initialDistance = 1, initialZoom = zoom, anchorX = 400, anchorY = 324;
  const pair = () => [...touches.values()].slice(0, 2);
  const clear = () => {
    const ids = [...touches.keys()];
    touches.clear(); gesturing = false;
    for (const id of ids) if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
  };
  viewport.addEventListener("pointerdown", e => {
    if (!mobile || !scene || e.pointerType !== "touch") return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const [a, b] = pair();
      initialDistance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      initialZoom = zoom;
      const stage = document.querySelector<HTMLElement>(".stage")!;
      const rect = stage.getBoundingClientRect();
      anchorX = ((a.x + b.x) / 2 - rect.left) * 800 / rect.width;
      anchorY = ((a.y + b.y) / 2 - rect.top) * 600 / rect.height;
      gesturing = true;
      // Cancel the initial game press before taking capture for both fingers.
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
    if (touches.size < 2) return; // Remaining finger cannot turn into a tap or drag.
    const [a, b] = pair();
    zoom = Math.max(.55, Math.min(1.4, initialZoom * Math.hypot(a.x - b.x, a.y - b.y) / initialDistance));
    const r = viewport.getBoundingClientRect();
    panX = (a.x + b.x) / 2 - r.left - r.width / 2 - (anchorX - 400) * zoom;
    panY = (a.y + b.y) / 2 - r.top - r.height / 2 - (anchorY - 324) * zoom;
    scheduleLayout();
  }, { capture: true });
  const finish = (e: PointerEvent) => {
    if (!touches.has(e.pointerId)) return;
    if (gesturing) { e.preventDefault(); e.stopPropagation(); }
    touches.delete(e.pointerId);
    if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
    if (!touches.size) gesturing = false;
  };
  viewport.addEventListener("pointerup", finish, { capture: true });
  viewport.addEventListener("pointercancel", finish, { capture: true });
  viewport.addEventListener("lostpointercapture", e => {
    if (e.target === viewport && touches.has(e.pointerId)) {
      document.dispatchEvent(new Event("sa-mobile-gesture"));
      clear();
    }
  });
  addEventListener("blur", clear);
  document.addEventListener("sa-device-change", clear);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
}
refresh();
}
