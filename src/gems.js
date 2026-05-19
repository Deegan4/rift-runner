// XP gems: drop on enemy death, fly to player when within pickup radius, grant XP on touch.

import { CONFIG } from './config.js';
import { Pool, TAU, dist2 } from './utils.js';

const TIER = {
  blue:  { value: CONFIG.xp.gemValues.blue,  color: '#5ec8ff' },
  green: { value: CONFIG.xp.gemValues.green, color: '#7bff8a' },
  red:   { value: CONFIG.xp.gemValues.red,   color: '#ff5a5a' },
};

function makeGem() {
  return { alive: false, x: 0, y: 0, vx: 0, vy: 0, value: 0, color: '#fff', magneted: false };
}
function resetGem(g) { g.magneted = false; g.vx = 0; g.vy = 0; }

export const gemPool = new Pool(CONFIG.pools.gems, makeGem, resetGem);

export function spawnGem(x, y, tier = 'blue') {
  const t = TIER[tier];
  gemPool.spawn((g) => {
    g.x = x; g.y = y;
    g.vx = 0; g.vy = 0;
    g.value = t.value;
    g.color = t.color;
    g.magneted = false;
  });
}

// Player pickup-radius is derived per-frame from passives — pass it in.
export function updateGems(dt, player, pickupRadius) {
  const list = gemPool.active;
  const pickupR2 = pickupRadius * pickupRadius;
  const collectR = player.radius + CONFIG.gems.radius;
  const collectR2 = collectR * collectR;
  let xpGained = 0;

  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (!g.alive) continue;
    const d2 = dist2(g.x, g.y, player.x, player.y);

    if (!g.magneted && d2 <= pickupR2) g.magneted = true;

    if (g.magneted) {
      // Eased velocity toward player + speed floor, so closer = faster (feels like a snap)
      const dx = player.x - g.x;
      const dy = player.y - g.y;
      const d = Math.sqrt(d2) || 1;
      // Exponential lerp of velocity toward target direction at increasing speed
      const desiredSpeed = Math.max(CONFIG.gems.magnetMinSpeed, CONFIG.gems.magnetMinSpeed + 600 / Math.max(20, d));
      const targetVx = (dx / d) * desiredSpeed;
      const targetVy = (dy / d) * desiredSpeed;
      const k = 1 - Math.exp(-CONFIG.gems.magnetEase * dt);
      g.vx += (targetVx - g.vx) * k;
      g.vy += (targetVy - g.vy) * k;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
    }

    if (d2 <= collectR2) {
      xpGained += g.value;
      g.alive = false;
    }
  }

  return xpGained;
}

export function drawGems(ctx, camera) {
  const list = gemPool.active;
  const now = performance.now() / 1000;
  const baseR = CONFIG.gems.radius;
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (!g.alive) continue;
    const sx = g.x - camera.x;
    const sy = g.y - camera.y;
    // Position-based phase so each gem pulses independently, no stored state.
    const phase = Math.sin(now * 4 + g.x * 0.1 + g.y * 0.1);
    const r = baseR * (1 + 0.18 * phase);

    // Glow halo
    ctx.globalAlpha = 0.25 + 0.15 * (1 + phase) / 2;
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 2.2, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Diamond body
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.moveTo(sx, sy - r);
    ctx.lineTo(sx + r, sy);
    ctx.lineTo(sx, sy + r);
    ctx.lineTo(sx - r, sy);
    ctx.closePath();
    ctx.fill();

    // Inner highlight — top-left triangle slice for "facet" feel
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(sx, sy - r * 0.85);
    ctx.lineTo(sx + r * 0.35, sy - r * 0.15);
    ctx.lineTo(sx - r * 0.35, sy - r * 0.15);
    ctx.closePath();
    ctx.fill();
  }
}
