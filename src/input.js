// Cross-input layer: WASD/arrows + spawn-on-touch virtual joystick.
// Pointer Events unify mouse, touch, and pen — works on iPad without per-event-type branching.

import { CONFIG } from './config.js';

// ---- Keyboard ----
const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

export function isKeyDown(k) { return keys.has(k.toLowerCase()); }

// ---- Joystick ----
// A touch in the left half of the screen spawns a joystick at the touch point.
// The knob follows the finger up to JOYSTICK_RADIUS px from the spawn point; beyond that,
// the input is clamped (max-magnitude direction). Lifting the finger clears it.

export const JOYSTICK_RADIUS = 70;       // visual + clamp radius (logical px)
export const KNOB_RADIUS = 28;

export const joystick = {
  active: false,
  pointerId: -1,
  cx: 0, cy: 0,    // spawn center (screen-space, logical px)
  px: 0, py: 0,    // current pointer position
  dx: 0, dy: 0,    // normalized direction in [-1, 1]
};

// Click-zone callbacks: main.js registers card / reroll hit rects.
// We invoke onTap(x, y) on a *tap* (down + up in same place, no drag).
let onTap = null;
export function setTapHandler(fn) { onTap = fn; }
const TAP_MAX_MOVE = 12;   // logical px
const TAP_MAX_DURATION = 400; // ms
const tapStarts = new Map(); // pointerId -> {x, y, t}

function attachPointerHandlers(canvas) {
  canvas.style.touchAction = 'none';

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Record for tap detection regardless of zone
    tapStarts.set(e.pointerId, { x, y, t: performance.now() });

    // Start joystick only if in left half AND no joystick already active.
    if (!joystick.active && x < rect.width / 2) {
      joystick.active = true;
      joystick.pointerId = e.pointerId;
      joystick.cx = x; joystick.cy = y;
      joystick.px = x; joystick.py = y;
      joystick.dx = 0; joystick.dy = 0;
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (joystick.active && e.pointerId === joystick.pointerId) {
      const rect = canvas.getBoundingClientRect();
      joystick.px = e.clientX - rect.left;
      joystick.py = e.clientY - rect.top;
      const dx = joystick.px - joystick.cx;
      const dy = joystick.py - joystick.cy;
      const d = Math.hypot(dx, dy);
      if (d > JOYSTICK_RADIUS) {
        joystick.dx = dx / d;
        joystick.dy = dy / d;
      } else {
        joystick.dx = dx / JOYSTICK_RADIUS;
        joystick.dy = dy / JOYSTICK_RADIUS;
      }
    }
  });

  const endHandler = (e) => {
    const start = tapStarts.get(e.pointerId);
    tapStarts.delete(e.pointerId);

    if (joystick.active && e.pointerId === joystick.pointerId) {
      joystick.active = false;
      joystick.dx = 0; joystick.dy = 0;
      try { canvas.releasePointerCapture(e.pointerId); } catch {}
    }

    // Tap detection: same pointer, small movement, short duration
    if (start && onTap) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const moved = Math.hypot(x - start.x, y - start.y);
      const dur = performance.now() - start.t;
      if (moved <= TAP_MAX_MOVE && dur <= TAP_MAX_DURATION) onTap(x, y);
    }
  };
  canvas.addEventListener('pointerup', endHandler);
  canvas.addEventListener('pointercancel', endHandler);
}

// ---- Public ----
export function initInput(canvas) {
  attachPointerHandlers(canvas);
}

// Returns normalized {dx, dy} from whichever source is active. Joystick wins if present.
export function moveVector() {
  if (joystick.active && (joystick.dx !== 0 || joystick.dy !== 0)) {
    return { dx: joystick.dx, dy: joystick.dy };
  }
  let dx = 0, dy = 0;
  if (keys.has('w') || keys.has('arrowup')) dy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dy += 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  const len = Math.hypot(dx, dy);
  if (len > 0) { dx /= len; dy /= len; }
  return { dx, dy };
}
