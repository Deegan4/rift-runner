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
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (!g.alive) continue;
    const sx = g.x - camera.x;
    const sy = g.y - camera.y;
    // Diamond shape — cheap, readable
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.moveTo(sx, sy - CONFIG.gems.radius);
    ctx.lineTo(sx + CONFIG.gems.radius, sy);
    ctx.lineTo(sx, sy + CONFIG.gems.radius);
    ctx.lineTo(sx - CONFIG.gems.radius, sy);
    ctx.closePath();
    ctx.fill();
  }
}
