// Chests: dropped by elites and bosses. Walking over one triggers an immediate level-up
// (a 3-card legendary pick, per PRD §5.4). Pulsing glow draws the eye.

import { CONFIG } from './config.js';
import { Pool, TAU, dist2 } from './utils.js';
import { spawnBurst, shakeAdd, spawnDamageNumber } from './effects.js';

function makeChest() {
  return { alive: false, x: 0, y: 0, spawnT: 0 };
}
function resetChest(c) { c.spawnT = 0; }
export const chestPool = new Pool(CONFIG.pools.chests, makeChest, resetChest);

export function spawnChest(x, y) {
  chestPool.spawn((c) => { c.x = x; c.y = y; c.spawnT = 0; });
}

// Returns the number of chests collected this frame (each grants one level-up).
export function updateChests(dt, player) {
  const list = chestPool.active;
  const collectR = player.radius + CONFIG.chest.radius;
  const collectR2 = collectR * collectR;
  let collected = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.alive) continue;
    c.spawnT += dt;
    if (dist2(c.x, c.y, player.x, player.y) <= collectR2) {
      collected++;
      c.alive = false;
      // Big celebratory burst + shake + on-screen text
      spawnBurst(c.x, c.y, 50, CONFIG.chest.color, 120, 360, 0.4, 0.8, 3);
      spawnDamageNumber(c.x, c.y - 18, 'CHEST!', '#ffd76b', true);
      shakeAdd(8, 0.25);
    }
  }
  return collected;
}

export function drawChests(ctx, camera) {
  const list = chestPool.active;
  const now = performance.now() / 1000;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.alive) continue;
    const sx = c.x - camera.x;
    const sy = c.y - camera.y;
    const pulse = 0.5 + 0.5 * Math.sin(now * CONFIG.chest.pulseSpeed);
    const r = CONFIG.chest.radius;

    // Glow halo
    ctx.globalAlpha = 0.35 + 0.25 * pulse;
    ctx.fillStyle = CONFIG.chest.color;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 2.0 + 4 * pulse, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Chest body (rounded square)
    ctx.fillStyle = '#8b5a16';
    ctx.fillRect(sx - r, sy - r * 0.6, r * 2, r * 1.2);
    // Lid (top half lighter)
    ctx.fillStyle = '#c8861f';
    ctx.fillRect(sx - r, sy - r * 0.6, r * 2, r * 0.55);
    // Lid line
    ctx.strokeStyle = '#5a3a08';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx - r, sy - r * 0.05);
    ctx.lineTo(sx + r, sy - r * 0.05);
    ctx.stroke();
    // Latch
    ctx.fillStyle = '#ffd76b';
    ctx.fillRect(sx - 2, sy - r * 0.3, 4, r * 0.45);
    // Outline
    ctx.strokeStyle = CONFIG.chest.accentColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - r, sy - r * 0.6, r * 2, r * 1.2);
  }
}

export function resetChests() {
  for (const c of chestPool.slots) c.alive = false;
  chestPool.active.length = 0;
}
