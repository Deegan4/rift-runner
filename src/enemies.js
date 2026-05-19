// Enemy spawning, AI, lifecycle, shooter projectiles, elites, and bosses.

import { CONFIG } from './config.js';
import { Pool, enemyHash, TAU, dist2, drawSphere, drawGlowDot } from './utils.js';
import { spawnGem } from './gems.js';
import { spawnBurst, spawnHitSpark, spawnDamageNumber, shakeAdd } from './effects.js';
import { spawnChest } from './chests.js';

// ---- Pools ----
function makeEnemy() {
  return {
    alive: false, type: 'zombie', aiType: 'chase',
    x: 0, y: 0, hp: 0, maxHp: 0,
    speed: 0, radius: 0, contactDamage: 0, color: '#fff',
    hitFlash: 0,
    range: 0, fireCooldown: 0,
    projectileSpeed: 0, projectileDamage: 0, projectileRadius: 0,
    projectileColor: '#fff', projectileLifetime: 0,
    gemTier: 'blue',
    isElite: false,
    // Boss-specific:
    minionTimer: 0,
    waveIx: 0,
  };
}
function resetEnemy(e) { e.hp = 0; e.hitFlash = 0; e.fireCooldown = 0; e.isElite = false; e.minionTimer = 0; }
export const enemyPool = new Pool(CONFIG.pools.enemies, makeEnemy, resetEnemy);

function makeEnemyProjectile() {
  return { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0, radius: 0, color: '#fff' };
}
function resetEnemyProjectile(p) { p.life = 0; }
export const enemyProjectilePool = new Pool(CONFIG.pools.enemyProjectiles, makeEnemyProjectile, resetEnemyProjectile);

// ---- Internals ----
let _spawnTimer = 0;
let _eliteTimer = 0;
let _elapsed = 0;
let _bossesSpawned = 0;
let _bossWarning = 0; // seconds remaining before incoming boss

function scaledHp(baseHp) {
  const minutes = _elapsed / 60;
  return Math.ceil(baseHp * (1 + CONFIG.enemies.hpScalePerMin * minutes));
}

function currentSpawnInterval() {
  const minutes = _elapsed / 60;
  const interval = CONFIG.enemies.spawnIntervalStart * Math.pow(1 - CONFIG.enemies.spawnIntervalDecayPerMin, minutes);
  return Math.max(CONFIG.enemies.spawnIntervalMin, interval);
}

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
  return 'zombie';
}

// Pick a point just outside the camera viewport, projected through a random angle.
function offscreenPoint(camera, viewW, viewH) {
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
  return { x, y };
}

function applyEnemyDefaults(e, typeId, def, x, y) {
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
  e.range = def.range || 0;
  e.fireCooldown = def.fireCooldownSec ? def.fireCooldownSec * (0.5 + Math.random() * 0.5) : 0;
  e.projectileSpeed = def.projectileSpeed || 0;
  e.projectileDamage = def.projectileDamage || 0;
  e.projectileRadius = def.projectileRadius || 0;
  e.projectileColor = def.projectileColor || '#fff';
  e.projectileLifetime = def.projectileLifetimeSec || 0;
  e.isElite = false;
  e.minionTimer = 0;
  e.waveIx = 0;
}

function spawnEnemyAt(x, y, typeId) {
  const def = CONFIG.enemyTypes[typeId];
  if (!def) return;
  enemyPool.spawn((e) => applyEnemyDefaults(e, typeId, def, x, y));
}

function spawnOne(camera, viewW, viewH) {
  const { x, y } = offscreenPoint(camera, viewW, viewH);
  spawnEnemyAt(x, y, pickEnemyType());
}

// ---- Elite ----
function spawnElite(camera, viewW, viewH) {
  const { x, y } = offscreenPoint(camera, viewW, viewH);
  const typeId = pickEnemyType();
  const def = CONFIG.enemyTypes[typeId];
  if (!def) return;
  enemyPool.spawn((e) => {
    applyEnemyDefaults(e, typeId, def, x, y);
    // Elite overlay
    e.isElite = true;
    e.maxHp = Math.ceil(e.maxHp * CONFIG.elite.hpMult);
    e.hp = e.maxHp;
    e.contactDamage = Math.ceil(e.contactDamage * CONFIG.elite.damageMult);
    e.radius = e.radius * CONFIG.elite.radiusMult;
    e.speed = e.speed * CONFIG.elite.speedMult;
  });
}

// ---- Boss ----
function spawnBoss(camera, viewW, viewH, waveIx) {
  const { x, y } = offscreenPoint(camera, viewW, viewH);
  const def = CONFIG.enemyTypes.bossWarden;
  enemyPool.spawn((e) => {
    applyEnemyDefaults(e, 'bossWarden', def, x, y);
    // Per-wave HP scaling on top of time-based scaling
    const waveMult = 1 + def.hpScalePerWave * waveIx;
    e.maxHp = Math.ceil(scaledHp(def.hp) * waveMult);
    e.hp = e.maxHp;
    e.waveIx = waveIx;
    e.color = def.phases[0].color;
    e.fireCooldown = 1.0; // small grace period before first burst
  });
  // Dramatic entry: big shake + dark burst at spawn point
  shakeAdd(18, 0.45);
  spawnBurst(x, y, 60, '#7a3acb', 80, 320, 0.45, 0.85, 3);
}

function currentBossPhase(e, def) {
  const frac = e.hp / e.maxHp;
  let phase = def.phases[0];
  for (const p of def.phases) {
    if (frac <= p.upToFrac) phase = p;
  }
  return phase;
}

function fireBossBurst(e, player, count) {
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const baseAngle = Math.atan2(dy, dx);
  const spread = Math.PI * 0.35;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = baseAngle - spread / 2 + spread * t;
    enemyProjectilePool.spawn((p) => {
      p.x = e.x; p.y = e.y;
      p.vx = Math.cos(angle) * e.projectileSpeed;
      p.vy = Math.sin(angle) * e.projectileSpeed;
      p.life = e.projectileLifetime;
      p.damage = e.projectileDamage;
      p.radius = e.projectileRadius;
      p.color = e.projectileColor;
    });
  }
}

function updateBoss(e, dt, player) {
  const def = CONFIG.enemyTypes.bossWarden;
  const phase = currentBossPhase(e, def);
  e.color = phase.color;

  // Phase-modified chase
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const speed = def.moveSpeed * phase.speedMult;
  e.x += (dx / d) * speed * dt;
  e.y += (dy / d) * speed * dt;

  // Fire burst
  e.fireCooldown -= dt;
  if (e.fireCooldown <= 0) {
    fireBossBurst(e, player, phase.burstCount);
    e.fireCooldown = def.fireCooldownSec * phase.fireCdMult;
  }

  // Minion spawn (phase 2+)
  if (phase.minionSpawnSec) {
    e.minionTimer -= dt;
    if (e.minionTimer <= 0) {
      for (let i = 0; i < 2; i++) {
        const ang = Math.random() * TAU;
        const r = e.radius + 30;
        spawnEnemyAt(e.x + Math.cos(ang) * r, e.y + Math.sin(ang) * r, 'zombie');
      }
      e.minionTimer = phase.minionSpawnSec;
    }
  }
}

// ---- Main update ----
export function updateEnemies(dt, player, camera, viewW, viewH) {
  _elapsed += dt;
  _spawnTimer += dt;
  _eliteTimer += dt;

  // Regular spawn cadence
  const interval = currentSpawnInterval();
  while (_spawnTimer >= interval && enemyPool.active.length < CONFIG.enemies.maxAlive) {
    _spawnTimer -= interval;
    spawnOne(camera, viewW, viewH);
  }

  // Elite spawn cadence
  if (_eliteTimer >= CONFIG.elite.intervalSec) {
    _eliteTimer -= CONFIG.elite.intervalSec;
    spawnElite(camera, viewW, viewH);
  }

  // Boss schedule (warning window + actual spawn)
  if (_bossesSpawned < CONFIG.enemies.bossSpawnMinutes.length) {
    const bossTime = CONFIG.enemies.bossSpawnMinutes[_bossesSpawned] * 60;
    if (_elapsed >= bossTime) {
      spawnBoss(camera, viewW, viewH, _bossesSpawned);
      _bossesSpawned++;
      _bossWarning = 0;
    } else if (_elapsed >= bossTime - CONFIG.boss.warningSec) {
      _bossWarning = bossTime - _elapsed;
    }
  }

  // Per-enemy AI tick
  const list = enemyPool.active;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.alive) continue;
    if (e.aiType === 'kite') updateShooter(e, dt, player);
    else if (e.aiType === 'boss') updateBoss(e, dt, player);
    else updateChase(e, dt, player);
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
  }

  // Rebuild spatial hash for this frame
  enemyHash.clear();
  for (let i = 0; i < list.length; i++) {
    if (list[i].alive) enemyHash.insert(list[i]);
  }

  // Enemy projectile movement + arena culling. Player hit-test happens in main.js
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
  if (d > range) {
    e.x += (dx / d) * e.speed * dt;
    e.y += (dy / d) * e.speed * dt;
  } else if (d < range * 0.7) {
    e.x -= (dx / d) * e.speed * dt;
    e.y -= (dy / d) * e.speed * dt;
  }
  e.fireCooldown -= dt;
  if (e.fireCooldown <= 0 && d <= range) {
    spawnEnemyProjectileAt(e, player.x, player.y);
    e.fireCooldown = CONFIG.enemyTypes[e.type].fireCooldownSec;
  }
}

function spawnEnemyProjectileAt(e, targetX, targetY) {
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

// ---- Damage / death ----
export function damageEnemy(e, dmg) {
  if (!e.alive) return false;
  e.hp -= dmg;
  e.hitFlash = 0.08;
  // Damage number + small hit spark on every hit
  spawnDamageNumber(e.x, e.y - e.radius - 4, dmg, e.aiType === 'boss' ? '#ff9c9c' : '#ffe680');
  spawnHitSpark(e.x, e.y, '#ffffff', e.aiType === 'boss' ? 5 : 3);
  if (e.hp <= 0) {
    e.alive = false;
    onEnemyDeath(e);
    return true;
  }
  return false;
}

function onEnemyDeath(e) {
  if (e.aiType === 'boss') {
    const def = CONFIG.enemyTypes.bossWarden;
    // Drop a fan of red gems
    for (let i = 0; i < def.deathRedGems; i++) {
      const ang = Math.random() * TAU;
      const r = 30 + Math.random() * 40;
      spawnGem(e.x + Math.cos(ang) * r, e.y + Math.sin(ang) * r, 'red');
    }
    for (let i = 0; i < def.deathChests; i++) spawnChest(e.x, e.y);
    // Massive death burst + heavy shake
    spawnBurst(e.x, e.y, 120, e.color, 120, 420, 0.5, 1.0, 3.5);
    shakeAdd(22, 0.5);
    return;
  }
  if (e.isElite) {
    for (let i = 0; i < CONFIG.elite.dropGreenGems; i++) {
      const ang = Math.random() * TAU;
      const r = 10 + Math.random() * 18;
      spawnGem(e.x + Math.cos(ang) * r, e.y + Math.sin(ang) * r, 'green');
    }
    if (Math.random() < CONFIG.elite.dropChestChance) spawnChest(e.x, e.y);
    spawnBurst(e.x, e.y, 50, CONFIG.elite.glowColor, 100, 320, 0.4, 0.75, 3);
    shakeAdd(7, 0.2);
    return;
  }
  // Regular enemy: single gem + small burst
  const dropCfg = CONFIG.enemyTypes[e.type];
  if (dropCfg && Math.random() < dropCfg.xpDropChance) {
    spawnGem(e.x, e.y, e.gemTier);
  }
  const burst = e.type === 'tank' ? 36 : e.type === 'shooter' ? 22 : 18;
  spawnBurst(e.x, e.y, burst, e.color, 80, 280, 0.3, 0.65, 2);
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

    // Boss: concentric phase-colored rings around the body
    if (e.aiType === 'boss') {
      const def = CONFIG.enemyTypes.bossWarden;
      // Outer pulsing aura
      const pulse = 0.5 + 0.5 * Math.sin(now * 4);
      ctx.globalAlpha = 0.18 + 0.12 * pulse;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(sx, sy, e.radius + 18 + 6 * pulse, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      drawSphere(ctx, sx, sy, e.radius, e.hitFlash > 0 ? '#ffffff' : e.color);
      // Phase rings — show how many phases left
      const phase = currentBossPhase(e, def);
      const phaseIx = def.phases.indexOf(phase);
      for (let k = 0; k < def.phases.length; k++) {
        ctx.strokeStyle = k <= phaseIx ? '#ffffff80' : '#ffffff20';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, e.radius - 6 - k * 6, 0, TAU);
        ctx.stroke();
      }
      // Crown notch
      ctx.fillStyle = '#fff';
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k - 1) * 0.35;
        const r1 = e.radius * 0.95, r2 = e.radius * 1.18;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1);
        ctx.lineTo(sx + Math.cos(a) * r2, sy + Math.sin(a) * r2);
        ctx.lineTo(sx + Math.cos(a + 0.18) * r1, sy + Math.sin(a + 0.18) * r1);
        ctx.closePath();
        ctx.fill();
      }
      continue;
    }

    // Elite glow halo + outline (drawn before the body so it sits behind)
    if (e.isElite) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 6 + e.x * 0.02);
      ctx.globalAlpha = 0.3 + 0.25 * pulse;
      ctx.fillStyle = CONFIG.elite.glowColor;
      ctx.beginPath();
      ctx.arc(sx, sy, e.radius + 5 + 4 * pulse, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (e.hitFlash > 0) {
      drawSphere(ctx, sx, sy, e.radius, '#ffffff', 'rgba(255,255,255,0.0)', null);
    } else {
      drawSphere(ctx, sx, sy, e.radius, e.color);
    }

    // Elite outline ring on top
    if (e.isElite) {
      ctx.strokeStyle = CONFIG.elite.glowColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, e.radius + 2, 0, TAU);
      ctx.stroke();
    }

    // Per-type silhouette overlays
    switch (e.type) {
      case 'zombie': {
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(sx - e.radius * 0.32, sy - e.radius * 0.18, 1.6, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(sx + e.radius * 0.32, sy - e.radius * 0.18, 1.6, 0, TAU); ctx.fill();
        break;
      }
      case 'runner': {
        const a = now * 8;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, e.radius + 3, a, a + Math.PI * 1.1);
        ctx.stroke();
        break;
      }
      case 'tank': {
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
        const pulse = 0.5 + 0.5 * Math.sin(now * 4 + e.x * 0.01);
        ctx.globalAlpha = 0.3 + 0.3 * pulse;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(sx, sy, e.radius + 4 + pulse * 3, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
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
export function resetElapsedTime() {
  _elapsed = 0; _spawnTimer = 0; _eliteTimer = 0;
  _bossesSpawned = 0; _bossWarning = 0;
}

// Returns the alive boss with the most HP remaining, or null. Used by HUD.
export function getCurrentBoss() {
  const list = enemyPool.active;
  let best = null;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.alive && e.aiType === 'boss' && (!best || e.hp > best.hp)) best = e;
  }
  return best;
}

export function getBossWarningSec() { return _bossWarning; }
