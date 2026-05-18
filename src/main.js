// Rift Runner — entry point and game loop.
// Milestone 1: get a square moving on screen. That's it.

import { CONFIG } from './config.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const debugEl = document.getElementById('debug');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---- Input ----
const keys = new Set();
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key === CONFIG.debug.toggleKey) {
    debugEl.classList.toggle('visible');
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

if (CONFIG.debug.startVisible) debugEl.classList.add('visible');

// ---- Game state ----
const state = {
  player: {
    x: CONFIG.arena.width / 2,
    y: CONFIG.arena.height / 2,
    radius: CONFIG.player.radius,
  },
  camera: { x: 0, y: 0 },
  time: 0,
  fps: 0,
  frameCount: 0,
  fpsTimer: 0,
};

// ---- Update ----
function update(dt) {
  // Movement input
  let dx = 0, dy = 0;
  if (keys.has('w') || keys.has('arrowup')) dy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dy += 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len; dy /= len;
    state.player.x += dx * CONFIG.player.moveSpeed * dt;
    state.player.y += dy * CONFIG.player.moveSpeed * dt;
  }

  // Clamp to arena
  state.player.x = Math.max(0, Math.min(CONFIG.arena.width, state.player.x));
  state.player.y = Math.max(0, Math.min(CONFIG.arena.height, state.player.y));

  // Camera follows player
  state.camera.x = state.player.x - canvas.width / 2;
  state.camera.y = state.player.y - canvas.height / 2;

  state.time += dt;
}

// ---- Render ----
function render() {
  ctx.fillStyle = '#1a3d1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Arena bounds
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.strokeRect(-state.camera.x, -state.camera.y, CONFIG.arena.width, CONFIG.arena.height);

  // Player
  const px = state.player.x - state.camera.x;
  const py = state.player.y - state.camera.y;
  ctx.fillStyle = '#4ec9ff';
  ctx.beginPath();
  ctx.arc(px, py, state.player.radius, 0, Math.PI * 2);
  ctx.fill();
}

// ---- Debug overlay ----
function updateDebug() {
  if (!debugEl.classList.contains('visible')) return;
  debugEl.textContent =
    `FPS: ${state.fps}\n` +
    `Time: ${state.time.toFixed(1)}s\n` +
    `Pos: ${state.player.x.toFixed(0)}, ${state.player.y.toFixed(0)}\n` +
    `Keys: ${[...keys].join(',')}`;
}

// ---- Loop ----
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1); // cap at 100ms to avoid huge jumps
  lastTime = now;

  // FPS counter
  state.frameCount++;
  state.fpsTimer += dt;
  if (state.fpsTimer >= 1) {
    state.fps = state.frameCount;
    state.frameCount = 0;
    state.fpsTimer = 0;
  }

  update(dt);
  render();
  updateDebug();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
