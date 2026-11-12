import { isMobile } from "./mobile-view.js?v=472f28ee5f8169e2";

const MAX_WIDTH = 400;
const MAX_HEIGHT = 300;
const FRAME_INTERVAL = 1000 / 15;
const lastDraw = new WeakMap                           ();

/**
 * Copy the original illustration into a read-only mobile sheet preview. Call this
 * synchronously after renderer.draw()/drawOverlay(): the WebGL source intentionally
 * does not preserve its drawing buffer across browser presentation boundaries.
 * Native game actions remain in the shell's readable buttons, never in this canvas.
 */
export function drawMobilePreview(source                   , overlay                    )       {
  if (!isMobile() || typeof document === "undefined" || !source.width || !source.height) return;
  const now = performance.now();
  for (const preview of document.querySelectorAll                   ("canvas[data-mobile-preview]")) {
    if (preview === source || preview === overlay || preview.closest("[hidden]")) continue;
    const previous = lastDraw.get(preview);
    if (previous !== undefined && now - previous < FRAME_INTERVAL) continue;
    // Check actual layout as well as [hidden]; sheets may be hidden through CSS.
    if (!preview.getClientRects().length) continue;
    const rect = preview.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const ratio = source.width / source.height;
    // Small, independent budget: at most 120k pixels even on high-DPR phones.
    const requested = rect.width * Math.min(1.5, globalThis.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(Math.min(MAX_WIDTH, MAX_HEIGHT * ratio, requested)));
    const height = Math.max(1, Math.round(width / ratio));
    const ctx = preview.getContext("2d", { alpha: false });
    if (!ctx) continue;
    if (preview.width !== width) preview.width = width;
    if (preview.height !== height) preview.height = height;
    preview.style.pointerEvents = "none";
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    if (overlay && overlay.width && overlay.height) ctx.drawImage(overlay, 0, 0, width, height);
    lastDraw.set(preview, now);
  }
}
