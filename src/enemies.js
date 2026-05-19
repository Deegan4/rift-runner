// Enemy spawning, AI, lifecycle, and shooter projectiles.

import { CONFIG } from './config.js';
import { Pool, enemyHash, TAU, dist2, drawSphere, drawGlowDot } from './utils.js';
import { spawnGem } from './gems.js';
import { spawnBurst, spawnHitSpark, spawnDamageNumber } from './effects.js';

// ---- Pools ----
function makeEnemy() {
  return {
    alive: false, type: 'zombie', aiType: 'chase',
    x: 0, y: 0, hp: 0, maxHp: 0,
    speed: 0, radius: 0, contactDamage: 0, color: '#fff',
    hitFlash: 0,
    // Shooter-only:
    range: 0, fireCooldown: 0,
    projectileSpeed: 0, projectileDamage: 0, projectileRadius: 0,
    projectileColor: '#fff', projectileLifetime: 0,
    gemTier: 'blue',
  };
}
function resetEnemy(e) { e.hp = 0; e.hitFlash = 0; e.fireCooldown = 0; }
export const enemyPool = new Pool(CONFIG.pools.enemies, makeEnemy, resetEnemy);

function makeEnemyProjectile() {
  return { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0, radius: 0, color: '#fff' };
}
function resetEnemyProjectile(p) { p.life = 0; }
export const enemyProjectilePool = new Pool(CONFIG.pools.enemyProjectiles, makeEnemyProjectile, resetEnemyProjectile);

// ---- Internals ----
let _spawnTimer = 0;
let _elapsed = 0;

function scaledHp(baseHp) {
  const minutes = _elapsed / 60;
  return Math.ceil(baseHp * (1 + CONFIG.enemies.hpScalePerMin * minutes));
}

function currentSpawnInterval() {
  const minutes = _elapsed / 60;
  const interval = CONFIG.enemies.spawnIntervalStart * Math.pow(1 - CONFIG.enemies.spawnIntervalDecayPerMin, minutes);
  return Math.max(CONFIG.enemies.spawnIntervalMin, interval);
}

// Pick the most-recent spawn entry whose `time` <= elapsed, then weighted-sample a type.
function pickEnemyType() {
  const table = CONFIG.enemySpawnTable;
  let entry = table[0];
  for (let i = 1; i < table.length; i++) {
    if (table[i].time <= _elapsed) entry = table[i];
    else break;
  }
  const weights = entry.weights;
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = Math.random() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  // Fallback (shouldn't hit)
  return 'zombie';
}

function spawnEnemyAt(x, y, typeId) {
  const def = CONFIG.enemyTypes[typeId];
  if (!def) return;
  enemyPool.spawn((e) => {
    e.type = typeId;
    e.aiType = def.ai;
    e.x = x; e.y = y;
    e.maxHp = scaledHp(def.hp);
    e.hp = e.maxHp;
    e.speed = def.moveSpeed;
    e.radius = def.radius;
    e.contactDamage = def.contactDamage;
    e.color = def.color;
    e.hitFlash = 0;
    e.gemTier = def.gemTier || 'blue';
    // Shooter fields (default safe values for non-shooters)
    e.range = def.range || 0;
    e.fireCooldown = def.fireCooldownSec ? def.fireCooldownSec * (0.5 + Math.random() * 0.5) : 0;
    e.projectileSpeed = def.projectileSpeed || 0;
    e.projectileDamage = def.projectileDamage || 0;
    e.projectileRadius = def.projectileRadius || 0;
    e.projectileColor = def.projectileColor || '#fff';
    e.projectileLifetime = def.projectileLifetimeSec || 0;
  });
}

// Spawn one enemy just outside the camera viewport, type picked from spawn table.
function spawnOne(camera, viewW, viewH) {
  const margin = CONFIG.enemies.spawnOffscreenMargin;
  const angle = Math.random() * TAU;
  const halfW = viewW / 2 + margin;
  const halfH = viewH / 2 + margin;
  const cx = camera.x + viewW / 2;
  const cy = camera.y + viewH / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const tX = halfW / Math.max(0.0001, Math.abs(cos));
  const tY = halfH / Math.max(0.0001, Math.abs(sin));
  const t = Math.min(tX, tY);
  let x = cx + cos * t;
  let y = cy + sin * t;
  x = Math.max(0, Math.min(CONFIG.arena.width, x));
  y = Math.max(0, Math.min(CONFIG.arena.height, y));
  spawnEnemyAt(x, y, pickEnemyType());
}

// ---- Enemy projectile spawning ----
function spawnEnemyProjectile(e, targetX, targetY) {
  const dx = targetX - e.x;
  const dy = targetY - e.y;
  const d = Math.hypot(dx, dy) || 1;
  enemyProjectilePool.spawn((p) => {
    p.x = e.x; p.y = e.y;
    p.vx = (dx / d) * e.projectileSpeed;
    p.vy = (dy / d) * e.projectileSpeed;
    p.life = e.projectileLifetime;
    p.damage = e.projectileDamage;
    p.radius = e.projectileRadius;
    p.color = e.projectileColor;
  });
}

// ---- Main update ----
export function updateEnemies(dt, player, camera, viewW, viewH) {
  _elapsed += dt;
  _spawnTimer += dt;

  const interval = currentSpawnInterval();
  while (_spawnTimer >= interval && enemyPool.active.length < CONFIG.enemies.maxAlive) {
    _spawnTimer -= interval;
    spawnOne(camera, viewW, viewH);
  }

  const list = enemyPool.active;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.alive) continue;

    if (e.aiType === 'kite') updateShooter(e, dt, player);
    else updateChase(e, dt, player);

    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
  }

  // Rebuild spatial hash for this frame
  enemyHash.clear();
  for (let i = 0; i < list.length; i++) {
    if (list[i].alive) enemyHash.insert(list[i]);
  }

  // Tick enemy projectiles (movement + arena culling). Player hit-test happens in main.js
  // because it needs to consult i-frames and player state.
  const eps = enemyProjectilePool.active;
  for (let i = 0; i < eps.length; i++) {
    const p = eps[i];
    if (!p.alive) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0 || p.x < 0 || p.x > CONFIG.arena.width || p.y < 0 || p.y > CONFIG.arena.height) {
      p.alive = false;
    }
  }
}

function updateChase(e, dt, player) {
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.x += (dx / d) * e.speed * dt;
  e.y += (dy / d) * e.speed * dt;
}

function updateShooter(e, dt, player) {
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const range = e.range;
  // Move toward sweet spot: [range * 0.7, range]. Outside → chase; inside lower bound → back off.
  if (d > range) {
    e.x += (dx / d) * e.speed * dt;
    e.y += (dy / d) * e.speed * dt;
  } else if (d < range * 0.7) {
    e.x -= (dx / d) * e.speed * dt;
    e.y -= (dy / d) * e.speed * dt;
  }
  // Always tick fire cooldown; only fire when in range.
  e.fireCooldown -= dt;
  if (e.fireCooldown <= 0 && d <= range) {
    spawnEnemyProjectile(e, player.x, player.y);
    e.fireCooldown = CONFIG.enemyTypes[e.type].fireCooldownSec;
  }
}

// ---- Damage / death ----
export function damageEnemy(e, dmg) {
  if (!e.alive) return false;
  e.hp -= dmg;
  e.hitFlash = 0.08;
  // Damage number + small hit spark on every hit
  spawnDamageNumber(e.x, e.y - e.radius - 4, dmg, '#ffe680');
  spawnHitSpark(e.x, e.y, '#ffffff', 3);
  if (e.hp <= 0) {
    e.alive = false;
    const dropCfg = CONFIG.enemyTypes[e.type];
    if (dropCfg && Math.random() < dropCfg.xpDropChance) {
      spawnGem(e.x, e.y, e.gemTier);
    }
    // Death burst — scale particle count + colors by type for visual differentiation
    const burst = e.type === 'tank' ? 36 : e.type === 'shooter' ? 22 : 18;
    spawnBurst(e.x, e.y, burst, e.color, 80, 280, 0.3, 0.65, 2);
    return true;
  }
  return false;
}

// ---- Rendering ----
export function drawEnemies(ctx, camera) {
  const list = enemyPool.active;
  const now = performance.now() / 1000;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.alive) continue;
    const sx = e.x - camera.x;
    const sy = e.y - camera.y;

    if (e.hitFlash > 0) {
      // White flash on hit (PRD §11 "white flash on enemy when hit")
      drawSphere(ctx, sx, sy, e.radius, '#ffffff', 'rgba(255,255,255,0.0)', null);
    } else {
      drawSphere(ctx, sx, sy, e.radius, e.color);
    }

    // Per-type silhouette overlays
    switch (e.type) {
      case 'zombie': {
        // Two dark eye dots — instantly readable as a face
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(sx - e.radius * 0.32, sy - e.radius * 0.18, 1.6, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(sx + e.radius * 0.32, sy - e.radius * 0.18, 1.6, 0, TAU); ctx.fill();
        break;
      }
      case 'runner': {
        // Spinning ring around the body — communicates "fast"
        const a = now * 8;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, e.radius + 3, a, a + Math.PI * 1.1);
        ctx.stroke();
        break;
      }
      case 'tank': {
        // Thick dark armor ring + four rivets at cardinal points
        ctx.strokeStyle = '#1a0f3a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, sy, e.radius - 1, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#3a2a6a';
        const r = e.radius - 2;
        for (let k = 0; k < 4; k++) {
          const ang = k * Math.PI / 2;
          ctx.beginPath();
          ctx.arc(sx + Math.cos(ang) * r, sy + Math.sin(ang) * r, 1.4, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'shooter': {
        // Pulsing glow halo — communicates "dangerous from range"
        const pulse = 0.5 + 0.5 * Math.sin(now * 4 + e.x * 0.01);
        ctx.globalAlpha = 0.3 + 0.3 * pulse;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(sx, sy, e.radius + 4 + pulse * 3, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        // Small dark cross in center for "weapon" hint
        ctx.fillStyle = '#3a3a1a';
        ctx.fillRect(sx - 3, sy - 1, 6, 2);
        ctx.fillRect(sx - 1, sy - 3, 2, 6);
        break;
      }
    }
  }
}

export function drawEnemyProjectiles(ctx, camera) {
  const list = enemyProjectilePool.active;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive) continue;
    drawGlowDot(ctx, p.x - camera.x, p.y - camera.y, p.radius, p.color, 2.0);
  }
}

export function getElapsedTime() { return _elapsed; }
export function resetElapsedTime() { _elapsed = 0; _spawnTimer = 0; }
