/** Presentation geometry only. Native world, battle and input coordinates stay
 * 800×600; a phone sees an equal-scale window onto that scene, never a stretch.
 * Clamp against all four scene edges so a moving battle focus cannot expose
 * blank space. Menus/lobbies use the existing complete-view geometry instead.
 */
export function immersiveScene(width        , height        , focusX = 400, focusY = 300, zoom = 1) {
  width = Number.isFinite(width) ? Math.max(1, width) : 1;
  height = Number.isFinite(height) ? Math.max(1, height) : 1;
  focusX = Number.isFinite(focusX) ? focusX : 400;
  focusY = Number.isFinite(focusY) ? focusY : 300;
  zoom = Number.isFinite(zoom) ? Math.max(1, Math.min(4, zoom)) : 1;
  const scale = Math.max(1, width / 800, height / 600) * zoom;
  const w = 800 * scale, h = 600 * scale;
  return { scale, width: w, height: h,
    left: Math.max(width - w, Math.min(0, width / 2 - focusX * scale)),
    top: Math.max(height - h, Math.min(0, height / 2 - focusY * scale)) };
}
