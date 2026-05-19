// Weapons: auto-fire logic + projectile pool + collision against enemies.
// Milestone 1: pistol only. Lock target at fire-time, straight-line projectile.

import { CONFIG } from './config.js';
import { Pool, enemyHash, dist2, TAU } from './utils.js';
import { damageEnemy } from './enemies.js';

const P = CONFIG.weapons.pistol;

function makeProjectile() {
  return { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0, radius: 0, color: '#fff' };
}
function resetProjectile(p) { p.life = 0; }

export const projectilePool = new Pool(CONFIG.pools.projectiles, makeProjectile, resetProjectile);

// Per-weapon cooldown timers live here so weapons.js owns the firing schedule.
const weaponState = {
  pistol: { cooldown: 0 },
};

function firePistol(player) {
  const target = enemyHash.findNearest(player.x, player.y, P.range);
  if (!target) return;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const d = Math.hypot(dx, dy) || 1;
  projectilePool.spawn((p) => {
    p.x = player.x; p.y = player.y;
    p.vx = (dx / d) * P.projectileSpeed;
    p.vy = (dy / d) * P.projectileSpeed;
    p.life = P.projectileLifetimeSec;
    p.damage = P.damage;
    p.radius = P.projectileRadius;
    p.color = P.color;
  });
}

export function updateWeapons(dt, player) {
  // Tick cooldowns and fire
  const ps = weaponState.pistol;
  ps.cooldown -= dt;
  if (ps.cooldown <= 0) {
    firePistol(player);
    ps.cooldown += P.cooldownSec;
    if (ps.cooldown < 0) ps.cooldown = 0; // avoid runaway after first frame
  }

  // Move + collide projectiles
  const candidates = [];
  const list = projectilePool.active;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { p.alive = false; continue; }

    // Out of arena? Despawn.
    if (p.x < 0 || p.x > CONFIG.arena.width || p.y < 0 || p.y > CONFIG.arena.height) {
      p.alive = false;
      continue;
    }

    // Hit check against nearby enemies via spatial hash
    enemyHash.queryCircle(p.x, p.y, p.radius + 32, candidates);
    let hit = false;
    for (let j = 0; j < candidates.length; j++) {
      const e = candidates[j];
      if (!e.alive) continue;
      const r = p.radius + e.radius;
      if (dist2(p.x, p.y, e.x, e.y) <= r * r) {
        damageEnemy(e, p.damage);
        hit = true;
        break; // pistol = single-target, no pierce
      }
    }
    if (hit) p.alive = false;
  }
}

export function drawProjectiles(ctx, camera) {
  const list = projectilePool.active;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive) continue;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - camera.x, p.y - camera.y, p.radius, 0, TAU);
    ctx.fill();
  }
}

export function getWeaponCooldown(name) {
  const s = weaponState[name];
  return s ? Math.max(0, s.cooldown) : 0;
}
