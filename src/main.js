// Rift Runner — entry point and game loop.
// Milestone 1: movement + auto-fire pistol + one enemy type (zombie).

import { CONFIG } from './config.js';
import { TAU, clamp, dist2 } from './utils.js';
import {
  enemyPool, updateEnemies, drawEnemies,
  getElapsedTime, resetElapsedTime,
} from './enemies.js';
import {
  projectilePool, updateWeapons, drawProjectiles, getWeaponCooldown,
} from './weapons.js';

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
  if (e.key === CONFIG.debug.toggleKey) debugEl.classList.toggle('visible');
  if (e.key.toLowerCase() === 'r' && state.player.dead) startRun();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

if (CONFIG.debug.startVisible) debugEl.classList.add('visible');

// ---- Game state ----
const state = {
  player: {
    x: CONFIG.arena.width / 2,
    y: CONFIG.arena.height / 2,
    radius: CONFIG.player.radius,
    hp: CONFIG.player.startHp,
    maxHp: CONFIG.player.startHp,
    iframes: 0,
    dead: false,
  },
  camera: { x: 0, y: 0 },
  fps: 0,
  frameCount: 0,
  fpsTimer: 0,
  kills: 0,
};

function startRun() {
  state.player.x = CONFIG.arena.width / 2;
  state.player.y = CONFIG.arena.height / 2;
  state.player.hp = CONFIG.player.startHp;
  state.player.iframes = 0;
  state.player.dead = false;
  state.kills = 0;
  // Drain pools
  for (const e of enemyPool.slots) e.alive = false;
  for (const p of projectilePool.slots) p.alive = false;
  enemyPool.active.length = 0;
  projectilePool.active.length = 0;
  resetElapsedTime();
}

// ---- Update ----
function update(dt) {
  if (state.player.dead) return;

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
  state.player.x = clamp(state.player.x, 0, CONFIG.arena.width);
  state.player.y = clamp(state.player.y, 0, CONFIG.arena.height);

  // Camera
  state.camera.x = state.player.x - canvas.width / 2;
  state.camera.y = state.player.y - canvas.height / 2;

  // Systems — order matters: enemies first (rebuilds hash), then weapons (uses hash)
  updateEnemies(dt, state.player, state.camera, canvas.width, canvas.height);
  updateWeapons(dt, state.player);

  // Player vs enemy contact damage
  if (state.player.iframes > 0) state.player.iframes -= dt;
  else {
    const r = state.player.radius;
    const list = enemyPool.active;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const rr = r + e.radius;
      if (dist2(state.player.x, state.player.y, e.x, e.y) <= rr * rr) {
        state.player.hp -= e.contactDamage;
        state.player.iframes = CONFIG.player.iframesSec;
        if (state.player.hp <= 0) { state.player.hp = 0; state.player.dead = true; }
        break;
      }
    }
  }

  // Tally kills from this frame by counting transitions in the active list (dead enemies still in active until compact)
  let killsThisFrame = 0;
  for (let i = 0; i < enemyPool.active.length; i++) if (!enemyPool.active[i].alive) killsThisFrame++;
  state.kills += killsThisFrame;

  // Compact pools at end of frame
  enemyPool.compact();
  projectilePool.compact();
}

// ---- Render ----
function render() {
  ctx.fillStyle = '#1a3d1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Arena bounds
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.strokeRect(-state.camera.x, -state.camera.y, CONFIG.arena.width, CONFIG.arena.height);

  drawEnemies(ctx, state.camera);
  drawProjectiles(ctx, state.camera);

  // Player
  const px = state.player.x - state.camera.x;
  const py = state.player.y - state.camera.y;
  ctx.fillStyle = state.player.iframes > 0 ? '#ffffff' : '#4ec9ff';
  ctx.beginPath();
  ctx.arc(px, py, state.player.radius, 0, TAU);
  ctx.fill();

  // HUD: HP bar (top-left), timer + kills (top-center), game-over banner
  drawHud();
}

function drawHud() {
  // HP bar
  const w = 200, h = 14, pad = 12;
  ctx.fillStyle = '#000a';
  ctx.fillRect(pad, pad, w, h);
  ctx.fillStyle = '#d04040';
  ctx.fillRect(pad, pad, w * (state.player.hp / state.player.maxHp), h);
  ctx.strokeStyle = '#fff8';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, pad, w, h);
  ctx.fillStyle = '#fff';
  ctx.font = '12px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${state.player.hp}/${state.player.maxHp}`, pad + 4, pad + h - 3);

  // Timer + kills, centered
  ctx.textAlign = 'center';
  ctx.font = '18px ui-sans-serif, system-ui';
  const t = getElapsedTime();
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(Math.floor(t % 60)).padStart(2, '0');
  ctx.fillText(`${mm}:${ss}   kills ${state.kills}`, canvas.width / 2, 26);

  if (state.player.dead) {
    ctx.fillStyle = '#000a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '48px ui-sans-serif, system-ui';
    ctx.fillText('YOU DIED', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '18px ui-sans-serif, system-ui';
    ctx.fillStyle = '#fffa';
    ctx.fillText(`Survived ${mm}:${ss} · ${state.kills} kills · press R to retry`,
      canvas.width / 2, canvas.height / 2 + 28);
  }
}

// ---- Debug overlay ----
function updateDebug() {
  if (!debugEl.classList.contains('visible')) return;
  debugEl.textContent =
    `FPS: ${state.fps}\n` +
    `Time: ${getElapsedTime().toFixed(1)}s\n` +
    `Pos: ${state.player.x.toFixed(0)}, ${state.player.y.toFixed(0)}\n` +
    `HP: ${state.player.hp}/${state.player.maxHp}\n` +
    `Enemies: ${enemyPool.active.length}\n` +
    `Projectiles: ${projectilePool.active.length}\n` +
    `Pistol cd: ${getWeaponCooldown('pistol').toFixed(2)}s\n` +
    `Kills: ${state.kills}`;
}

// ---- Loop ----
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

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
startRun();
requestAnimationFrame(loop);
