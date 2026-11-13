/** Screen-space joystick. It emits the existing eight-direction movement intent only. */
export function createMobileJoystick(hooks                                                                      )                                            {
  const element = document.createElement("div");
  element.className = "mobile-shell-joystick";
  element.dataset.mobileControl = "joystick";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", "八方向移动摇杆");
  element.tabIndex = 0;
  const guide = document.createElement("span"); guide.className = "mobile-shell-joystick-guide"; guide.textContent = "移动";
  const knob = document.createElement("span"); knob.className = "mobile-shell-joystick-knob"; knob.setAttribute("aria-hidden", "true");
  element.append(guide, knob);
  let pointer                = null, direction = -1;
  const setDirection = (next        ) => { if (next !== direction) { direction = next; hooks.direction(next); } };
  const release = () => {
    const previous = pointer; pointer = null;
    if (previous !== null && element.hasPointerCapture(previous)) element.releasePointerCapture(previous);
    element.style.setProperty("--stick-x", "0px"); element.style.setProperty("--stick-y", "0px");
    element.dataset.active = "false";
    if (direction !== -1 || previous !== null) { setDirection(-1); hooks.cancel(); }
  };
  const move = (event              ) => {
    const rect = element.getBoundingClientRect();
    const radius = Math.max(1, Math.min(rect.width, rect.height) * .32);
    const dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2;
    const distance = Math.hypot(dx, dy), scale = Math.min(1, radius / Math.max(1, distance));
    element.style.setProperty("--stick-x", `${Math.round(dx * scale)}px`);
    element.style.setProperty("--stick-y", `${Math.round(dy * scale)}px`);
    const sector = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
    setDirection(distance < radius * .24 ? -1 : [6, 7, 0, 1, 2, 3, 4, 5][sector]);
  };
  element.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (!hooks.enabled() || event.isPrimary === false || pointer !== null) { release(); return; }
    hooks.cancel(); pointer = event.pointerId; element.setPointerCapture(pointer); element.dataset.active = "true"; move(event);
  });
  element.addEventListener("pointermove", event => {
    if (event.pointerId !== pointer) return;
    event.preventDefault();
    if (!hooks.enabled()) { release(); return; }
    move(event);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]         ) element.addEventListener(type, event => { if (event.pointerId === pointer) release(); });
  element.addEventListener("keydown", event => {
    const dir = ({ ArrowUp: 4, ArrowLeft: 2, ArrowDown: 0, ArrowRight: 6 }                          )[event.key];
    if (dir !== undefined && hooks.enabled()) { event.preventDefault(); if (!event.repeat) { hooks.cancel(); setDirection(dir); } }
  });
  element.addEventListener("keyup", event => { if (event.key.startsWith("Arrow")) { event.preventDefault(); release(); } });
  element.addEventListener("blur", release);
  addEventListener("blur", release);
  document.addEventListener("sa-device-change", release);
  document.addEventListener("sa-controls-drag", release);
  document.addEventListener("visibilitychange", () => { if (document.hidden) release(); });
  return { element, release };
}
