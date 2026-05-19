// Weapons: auto-fire logic + projectile pool + collision against enemies.
// Reads `ownedWeapons` (map id->level, 0 = not owned) and stat table from passives.

import { CONFIG } from './config.js';
import { Pool, enemyHash, dist2, TAU } from './utils.js';
import { damageEnemy } from './enemies.js';

// ---- Level-scaled stat helper. value = base[key] + perLevel[key] * (level - 1). ----
export function weaponStat(weaponId, key, level) {
  const def = CONFIG.weapons[weaponId];
  const base = def.base[key];
  const per = def.perLevel ? (def.perLevel[key] || 0) : 0;
  return base + per * (level - 1);
}

// ---- Projectiles ----
function makeProjectile() {
  return { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0, radius: 0, color: '#fff' };
}
function resetProjectile(p) { p.life = 0; }
export const projectilePool = new Pool(CONFIG.pools.projectiles, makeProjectile, resetProjectile);

// ---- Persistent per-weapon state ----
const weaponState = {
  pistol:     { cooldown: 0 },
  orbitBlade: { angle: 0, blades: [], hitCooldowns: new Map() },
  shockwave:  { cooldown: 0, pulses: [] }, // pulses = visual rings expanding
};

// Visual pulse for shockwave hits (purely cosmetic; pooled lightly)
const PULSE_MAX = 8;
function ensurePulse(weapon, x, y, radius, color) {
  // Cheap fixed-size ring buffer
  const arr = weapon.pulses;
  if (arr.length < PULSE_MAX) arr.push({ x, y, r0: 0, r1: radius, t: 0, dur: 0.35, color });
  else { // overwrite oldest
    let oldestIx = 0, oldestT = -1;
    for (let i = 0; i < arr.length; i++) if (arr[i].t > oldestT) { oldestT = arr[i].t; oldestIx = i; }
    arr[oldestIx] = { x, y, r0: 0, r1: radius, t: 0, dur: 0.35, color };
  }
}

// ---- Pistol ----
function firePistol(player, ownedLevel, statTable) {
  const range = CONFIG.weapons.pistol.base.range;
  const target = enemyHash.findNearest(player.x, player.y, range);
  if (!target) return;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const d = Math.hypot(dx, dy) || 1;
  const speed = CONFIG.weapons.pistol.base.projectileSpeed;
  projectilePool.spawn((p) => {
    p.x = player.x; p.y = player.y;
    p.vx = (dx / d) * speed;
    p.vy = (dy / d) * speed;
    p.life = CONFIG.weapons.pistol.base.projectileLifetimeSec;
    p.damage = weaponStat('pistol', 'damage', ownedLevel) * statTable.weaponDamage.mult;
    p.radius = CONFIG.weapons.pistol.base.projectileRadius;
    p.color = CONFIG.weapons.pistol.base.color;
  });
}

function updatePistol(dt, player, level, statTable) {
  const s = weaponState.pistol;
  s.cooldown -= dt;
  const cd = Math.max(0.05, weaponStat('pistol', 'cooldownSec', level));
  if (s.cooldown <= 0) {
    firePistol(player, level, statTable);
    s.cooldown += cd;
    if (s.cooldown < 0) s.cooldown = 0;
  }
}

// ---- Orbit Blade ----
// Blades rotate around the player; each blade tracks per-enemy hit cooldowns
// so a single blade can't multi-hit a stationary enemy every frame.
function updateOrbitBlade(dt, player, level, statTable) {
  const s = weaponState.orbitBlade;
  const def = CONFIG.weapons.orbitBlade.base;
  const desiredCount = CONFIG.weapons.orbitBlade.bladeAtLevel[Math.min(level - 1, CONFIG.weapons.orbitBlade.bladeAtLevel.length - 1)];

  s.angle = (s.angle + def.rotateSpeed * dt) % TAU;
  // Ensure blade slot array matches desired count
  while (s.blades.length < desiredCount) s.blades.push({ phase: (TAU * s.blades.length) / desiredCount });
  while (s.blades.length > desiredCount) s.blades.pop();

  // Damage check + visual placement
  const dmg = weaponStat('orbitBlade', 'damage', level) * statTable.weaponDamage.mult;
  const candidates = [];
  for (let i = 0; i < s.blades.length; i++) {
    const b = s.blades[i];
    const a = s.angle + (TAU * i) / s.blades.length;
    b.x = player.x + Math.cos(a) * def.orbitRadius;
    b.y = player.y + Math.sin(a) * def.orbitRadius;

    enemyHash.queryCircle(b.x, b.y, def.bladeRadius + 32, candidates);
    for (let j = 0; j < candidates.length; j++) {
      const e = candidates[j];
      if (!e.alive) continue;
      const r = def.bladeRadius + e.radius;
      if (dist2(b.x, b.y, e.x, e.y) > r * r) continue;
      const key = e; // identity-based; map clears when entity reused for new spawn
      const until = s.hitCooldowns.get(key) || 0;
      if (until > 0) continue;
      damageEnemy(e, dmg);
      s.hitCooldowns.set(key, def.hitCooldownSec);
    }
  }

  // Decay hit cooldowns. Map iteration order is insertion; we mutate values, prune zeros.
  for (const [e, t] of s.hitCooldowns) {
    if (!e.alive) { s.hitCooldowns.delete(e); continue; }
    const nt = t - dt;
    if (nt <= 0) s.hitCooldowns.delete(e);
    else s.hitCooldowns.set(e, nt);
  }
}

// ---- Shockwave ----
function updateShockwave(dt, player, level, statTable) {
  const s = weaponState.shockwave;
  s.cooldown -= dt;
  const interval = Math.max(0.3, weaponStat('shockwave', 'intervalSec', level));
  if (s.cooldown <= 0) {
    const radius = weaponStat('shockwave', 'radius', level);
    const dmg = weaponStat('shockwave', 'damage', level) * statTable.weaponDamage.mult;
    const candidates = [];
    enemyHash.queryCircle(player.x, player.y, radius, candidates);
    for (let j = 0; j < candidates.length; j++) {
      const e = candidates[j];
      if (!e.alive) continue;
      if (dist2(player.x, player.y, e.x, e.y) <= radius * radius) damageEnemy(e, dmg);
    }
    ensurePulse(s, player.x, player.y, radius, CONFIG.weapons.shockwave.base.color);
    s.cooldown += interval;
  }
  // Tick pulses (cosmetic)
  for (let i = 0; i < s.pulses.length; i++) {
    s.pulses[i].t += dt;
  }
  s.pulses = s.pulses.filter(p => p.t < p.dur);
}

// ---- Projectile update (pistol's bullets) ----
function updateProjectiles(dt) {
  const candidates = [];
  const list = projectilePool.active;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { p.alive = false; continue; }
    if (p.x < 0 || p.x > CONFIG.arena.width || p.y < 0 || p.y > CONFIG.arena.height) {
      p.alive = false;
      continue;
    }
    enemyHash.queryCircle(p.x, p.y, p.radius + 32, candidates);
    for (let j = 0; j < candidates.length; j++) {
      const e = candidates[j];
      if (!e.alive) continue;
      const r = p.radius + e.radius;
      if (dist2(p.x, p.y, e.x, e.y) <= r * r) {
        damageEnemy(e, p.damage);
        p.alive = false;
        break;
      }
    }
  }
}

// ---- Public update ----
export function updateWeapons(dt, player, ownedWeapons, statTable) {
  if (ownedWeapons.pistol > 0)     updatePistol(dt, player, ownedWeapons.pistol, statTable);
  if (ownedWeapons.orbitBlade > 0) updateOrbitBlade(dt, player, ownedWeapons.orbitBlade, statTable);
  if (ownedWeapons.shockwave > 0)  updateShockwave(dt, player, ownedWeapons.shockwave, statTable);
  updateProjectiles(dt);
}

// ---- Rendering ----
export function drawWeapons(ctx, camera, ownedWeapons) {
  // Projectiles
  const list = projectilePool.active;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive) continue;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - camera.x, p.y - camera.y, p.radius, 0, TAU);
    ctx.fill();
  }
  // Orbit blades
  if (ownedWeapons.orbitBlade > 0) {
    const blades = weaponState.orbitBlade.blades;
    const def = CONFIG.weapons.orbitBlade.base;
    ctx.fillStyle = def.color;
    for (let i = 0; i < blades.length; i++) {
      const b = blades[i];
      ctx.beginPath();
      ctx.arc(b.x - camera.x, b.y - camera.y, def.bladeRadius, 0, TAU);
      ctx.fill();
    }
  }
  // Shockwave pulses (expanding ring)
  if (ownedWeapons.shockwave > 0) {
    const pulses = weaponState.shockwave.pulses;
    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      const k = Math.min(1, p.t / p.dur);
      const r = p.r0 + (p.r1 - p.r0) * k;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x - camera.x, p.y - camera.y, r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

// Drain state on retry. Called from main.js startRun.
export function resetWeapons() {
  weaponState.pistol.cooldown = 0;
  weaponState.orbitBlade.angle = 0;
  weaponState.orbitBlade.blades.length = 0;
  weaponState.orbitBlade.hitCooldowns.clear();
  weaponState.shockwave.cooldown = 0;
  weaponState.shockwave.pulses.length = 0;
  for (const p of projectilePool.slots) p.alive = false;
  projectilePool.active.length = 0;
}

export function getWeaponCooldown(name) {
  const s = weaponState[name];
  if (!s) return 0;
  return Math.max(0, s.cooldown || 0);
}
