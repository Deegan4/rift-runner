// Weapons: per-weapon update + render functions, projectile/minion/explosion/beam pools.
// All weapons read `ownedWeapons` (id->level, 0 = not owned) and a passive stat table.
// Evolved weapons reuse base-weapon update functions configured via CONFIG.weapons[id].

import { CONFIG } from './config.js';
import { Pool, enemyHash, dist2, TAU, drawSphere, drawGlowDot } from './utils.js';
import { damageEnemy } from './enemies.js';

// ---- Level-scaled stat helper. value = base[key] + perLevel[key] * (level - 1). ----
export function weaponStat(weaponId, key, level) {
  const def = CONFIG.weapons[weaponId];
  const base = def.base[key];
  if (base === undefined) return 0;
  const per = def.perLevel ? (def.perLevel[key] || 0) : 0;
  return base + per * (level - 1);
}

// ---- Pools ----
function makeProjectile() {
  return {
    alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0,
    damage: 0, radius: 0, color: '#fff',
    pierce: 0, hitEnemies: null,         // pierce: remaining pass-throughs after first hit; hitEnemies: Set to dedupe
    // Grenade-specific:
    isGrenade: false, sourceId: '',
    startX: 0, startY: 0, totalLife: 0,
    arcHeight: 0, targetX: 0, targetY: 0,
  };
}
function resetProjectile(p) { p.life = 0; if (p.hitEnemies) p.hitEnemies.clear(); }
export const projectilePool = new Pool(CONFIG.pools.projectiles, makeProjectile, resetProjectile);

function makeMinion() {
  return {
    alive: false, sourceId: '',
    x: 0, y: 0, vx: 0, vy: 0,
    speed: 0, radius: 0, damage: 0, hitCooldownSec: 0, color: '#fff',
    hitCooldowns: new Map(),
  };
}
function resetMinion(m) { m.hitCooldowns.clear(); }
export const minionPool = new Pool(CONFIG.pools.minions, makeMinion, resetMinion);

function makeExplosion() {
  return { alive: false, x: 0, y: 0, radius: 0, damage: 0, color: '#fff', t: 0, dur: 0.35 };
}
function resetExplosion(e) { e.t = 0; }
export const explosionPool = new Pool(CONFIG.pools.explosions, makeExplosion, resetExplosion);

function makeBeam() {
  return { alive: false, x0: 0, y0: 0, x1: 0, y1: 0, halfWidth: 0, color: '#fff', t: 0, dur: 0.2 };
}
function resetBeam(b) { b.t = 0; }
export const beamPool = new Pool(CONFIG.pools.beams, makeBeam, resetBeam);

// ---- Persistent per-weapon state ----
const weaponState = {
  pistol:     { cooldown: 0 },
  orbitBlade: { angle: 0, blades: [], hitCooldowns: new Map() },
  shockwave:  { cooldown: 0, pulses: [] },
  grenade:    { cooldown: 0 },
  beam:       { cooldown: 0 },
  spiritWolf: { spawnedFor: 0 }, // tracks how many wolves we've spawned so we can scale up
  // Evolutions share state with their base where useful, but we keep separate entries for clarity
  autoRifle:  { cooldown: 0, burstRemaining: 0, burstTimer: 0 },
  whirlwind:  { angle: 0, blades: [], hitCooldowns: new Map() },
  nova:       { cooldown: 0, pulses: [] },
  clusterBomb: { cooldown: 0 },
  deathRay:   { cooldown: 0 },
  wolfPack:   { spawnedFor: 0 },
};

// ---- Visual pulse helper (shockwave / nova rings) ----
function pushPulse(arr, x, y, r, color, dur = 0.35) {
  const MAX = 8;
  const entry = { x, y, r1: r, t: 0, dur, color };
  if (arr.length < MAX) arr.push(entry);
  else {
    let oldestIx = 0, oldestT = -1;
    for (let i = 0; i < arr.length; i++) if (arr[i].t > oldestT) { oldestT = arr[i].t; oldestIx = i; }
    arr[oldestIx] = entry;
  }
}

// ============================================================================
// ============================ WEAPON IMPLEMENTATIONS ========================
// ============================================================================

// ---- Pistol & Auto-Rifle (evolved) ----
function fireSingleProjectile(player, weaponId, level, st, opts = {}) {
  const def = CONFIG.weapons[weaponId];
  const range = weaponStat(weaponId, 'range', level);
  const target = opts.target || enemyHash.findNearest(player.x, player.y, range);
  if (!target) return false;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const d = Math.hypot(dx, dy) || 1;
  const speedMult = st.weaponProjectileSpeed.mult;
  const speed = weaponStat(weaponId, 'projectileSpeed', level) * speedMult;
  const dmg = weaponStat(weaponId, 'damage', level) * st.weaponDamage.mult;
  projectilePool.spawn((p) => {
    p.x = player.x; p.y = player.y;
    p.vx = (dx / d) * speed;
    p.vy = (dy / d) * speed;
    p.life = weaponStat(weaponId, 'projectileLifetimeSec', level);
    p.damage = dmg;
    p.radius = weaponStat(weaponId, 'projectileRadius', level);
    p.color = def.base.color;
    p.pierce = Math.round(st.weaponPierce.flat);
    if (!p.hitEnemies) p.hitEnemies = new Set();
    else p.hitEnemies.clear();
    p.isGrenade = false;
  });
  return true;
}

function updatePistol(dt, player, level, st) {
  const s = weaponState.pistol;
  s.cooldown -= dt;
  if (s.cooldown <= 0) {
    const baseCd = weaponStat('pistol', 'cooldownSec', level);
    const cd = Math.max(0.05, baseCd / st.weaponFireRate.mult);
    if (fireSingleProjectile(player, 'pistol', level, st)) {
      s.cooldown += cd;
      if (s.cooldown < 0) s.cooldown = 0;
    } else {
      // No target — wait a short tick before retrying
      s.cooldown = 0.1;
    }
  }
}

function updateAutoRifle(dt, player, level, st) {
  const s = weaponState.autoRifle;
  if (s.burstRemaining > 0) {
    s.burstTimer -= dt;
    if (s.burstTimer <= 0) {
      fireSingleProjectile(player, 'autoRifle', level, st);
      s.burstRemaining--;
      s.burstTimer = CONFIG.weapons.autoRifle.base.burstIntervalSec;
    }
    return;
  }
  s.cooldown -= dt;
  if (s.cooldown <= 0) {
    const cd = Math.max(0.1, CONFIG.weapons.autoRifle.base.cooldownSec / st.weaponFireRate.mult);
    if (fireSingleProjectile(player, 'autoRifle', level, st)) {
      s.burstRemaining = CONFIG.weapons.autoRifle.base.burstCount - 1;
      s.burstTimer = CONFIG.weapons.autoRifle.base.burstIntervalSec;
      s.cooldown += cd;
    } else {
      s.cooldown = 0.1;
    }
  }
}

// ---- Orbit Blade & Whirlwind ----
function updateOrbitalWeapon(dt, player, weaponId, level, st, stateRef) {
  const def = CONFIG.weapons[weaponId].base;
  let count = def.bladeCount || 1;
  // Orbit Blade specifically uses bladeAtLevel array
  if (weaponId === 'orbitBlade') {
    const arr = CONFIG.weapons.orbitBlade.bladeAtLevel;
    count = arr[Math.min(level - 1, arr.length - 1)];
  }
  const radius = def.orbitRadius * st.weaponArea.mult;
  stateRef.angle = (stateRef.angle + def.rotateSpeed * dt) % TAU;
  while (stateRef.blades.length < count) stateRef.blades.push({ x: 0, y: 0 });
  while (stateRef.blades.length > count) stateRef.blades.pop();

  const dmg = weaponStat(weaponId, 'damage', level) * st.weaponDamage.mult;
  const candidates = [];
  for (let i = 0; i < stateRef.blades.length; i++) {
    const b = stateRef.blades[i];
    const a = stateRef.angle + (TAU * i) / stateRef.blades.length;
    b.x = player.x + Math.cos(a) * radius;
    b.y = player.y + Math.sin(a) * radius;
    enemyHash.queryCircle(b.x, b.y, def.bladeRadius + 32, candidates);
    for (let j = 0; j < candidates.length; j++) {
      const e = candidates[j];
      if (!e.alive) continue;
      const r = def.bladeRadius + e.radius;
      if (dist2(b.x, b.y, e.x, e.y) > r * r) continue;
      const until = stateRef.hitCooldowns.get(e) || 0;
      if (until > 0) continue;
      damageEnemy(e, dmg);
      stateRef.hitCooldowns.set(e, def.hitCooldownSec);
    }
  }
  for (const [e, t] of stateRef.hitCooldowns) {
    if (!e.alive) { stateRef.hitCooldowns.delete(e); continue; }
    const nt = t - dt;
    if (nt <= 0) stateRef.hitCooldowns.delete(e);
    else stateRef.hitCooldowns.set(e, nt);
  }
}

// ---- Shockwave & Nova ----
function updateRadialWeapon(dt, player, weaponId, level, st, stateRef) {
  const def = CONFIG.weapons[weaponId].base;
  stateRef.cooldown -= dt;
  const interval = Math.max(0.3, weaponStat(weaponId, 'intervalSec', level) / st.weaponFireRate.mult);
  if (stateRef.cooldown <= 0) {
    const radius = weaponStat(weaponId, 'radius', level) * st.weaponArea.mult;
    const dmg = weaponStat(weaponId, 'damage', level) * st.weaponDamage.mult;
    const candidates = [];
    enemyHash.queryCircle(player.x, player.y, radius, candidates);
    const hit = [];
    for (let j = 0; j < candidates.length; j++) {
      const e = candidates[j];
      if (!e.alive) continue;
      if (dist2(player.x, player.y, e.x, e.y) <= radius * radius) {
        damageEnemy(e, dmg);
        hit.push(e);
      }
    }
    pushPulse(stateRef.pulses, player.x, player.y, radius, def.color);
    // Nova chain-lightning
    if (weaponId === 'nova') {
      novaChain(hit, dmg * def.chainFalloff, def, st);
    }
    stateRef.cooldown += interval;
  }
  for (let i = 0; i < stateRef.pulses.length; i++) stateRef.pulses[i].t += dt;
  stateRef.pulses = stateRef.pulses.filter(p => p.t < p.dur);
}

function novaChain(initialHits, dmg, def, st) {
  if (initialHits.length === 0) return;
  const visited = new Set(initialHits);
  let frontier = initialHits.slice();
  for (let hop = 0; hop < def.chainCount && frontier.length > 0; hop++) {
    const nextFrontier = [];
    for (const source of frontier) {
      const cand = enemyHash.findNearest(source.x, source.y, def.chainRange);
      if (cand && !visited.has(cand) && cand.alive) {
        damageEnemy(cand, dmg);
        visited.add(cand);
        nextFrontier.push(cand);
      }
    }
    frontier = nextFrontier;
    dmg *= def.chainFalloff;
  }
}

// ---- Grenade & Cluster Bomb ----
function updateGrenadeWeapon(dt, player, weaponId, level, st, stateRef) {
  const def = CONFIG.weapons[weaponId].base;
  stateRef.cooldown -= dt;
  const cd = Math.max(0.3, weaponStat(weaponId, 'cooldownSec', level) / st.weaponFireRate.mult);
  if (stateRef.cooldown <= 0) {
    const range = def.range;
    // Random enemy within range per PRD §5.2 "lobs at random enemy"
    const candidates = [];
    enemyHash.queryCircle(player.x, player.y, range, candidates);
    const live = candidates.filter(e => e.alive);
    if (live.length > 0) {
      const target = live[Math.floor(Math.random() * live.length)];
      lobGrenade(player, target.x, target.y, weaponId, level, st);
      stateRef.cooldown += cd;
    } else {
      stateRef.cooldown = 0.1;
    }
  }
}

function lobGrenade(player, tx, ty, weaponId, level, st) {
  const def = CONFIG.weapons[weaponId].base;
  const dx = tx - player.x;
  const dy = ty - player.y;
  const d = Math.hypot(dx, dy) || 1;
  const speed = def.projectileSpeed * st.weaponProjectileSpeed.mult;
  const lifeNeeded = d / speed;
  projectilePool.spawn((p) => {
    p.x = player.x; p.y = player.y;
    p.startX = player.x; p.startY = player.y;
    p.targetX = tx; p.targetY = ty;
    p.vx = (dx / d) * speed;
    p.vy = (dy / d) * speed;
    p.life = lifeNeeded;
    p.totalLife = lifeNeeded;
    p.arcHeight = def.arcHeight;
    p.damage = weaponStat(weaponId, 'damage', level) * st.weaponDamage.mult;
    p.radius = def.projectileRadius;
    p.color = def.color;
    p.isGrenade = true;
    p.sourceId = weaponId;
    if (!p.hitEnemies) p.hitEnemies = new Set();
    else p.hitEnemies.clear();
  });
}

// Called when a grenade reaches its target (handled in updateProjectiles)
function detonateGrenade(p, st) {
  const def = CONFIG.weapons[p.sourceId].base;
  const aoeRadius = def.aoeRadius * st.weaponArea.mult;
  spawnExplosion(p.targetX, p.targetY, aoeRadius, p.damage, def.color);
  // Cluster Bomb: spawn child explosions around the impact point
  if (p.sourceId === 'clusterBomb') {
    for (let i = 0; i < def.childCount; i++) {
      const a = (TAU * i) / def.childCount + Math.random() * 0.3;
      const dist = def.aoeRadius * 0.6;
      spawnExplosion(p.targetX + Math.cos(a) * dist, p.targetY + Math.sin(a) * dist,
        def.childAoeRadius * st.weaponArea.mult, p.damage * def.childDamageFrac, def.color);
    }
  }
}

function spawnExplosion(x, y, radius, damage, color) {
  // Apply damage immediately to enemies inside the radius, then queue a visual.
  const candidates = [];
  enemyHash.queryCircle(x, y, radius, candidates);
  for (let i = 0; i < candidates.length; i++) {
    const e = candidates[i];
    if (!e.alive) continue;
    if (dist2(x, y, e.x, e.y) <= radius * radius) damageEnemy(e, damage);
  }
  explosionPool.spawn((ex) => {
    ex.x = x; ex.y = y; ex.radius = radius; ex.damage = damage; ex.color = color;
    ex.t = 0; ex.dur = 0.35;
  });
}

// ---- Beam & Death Ray ----
function updateBeamWeapon(dt, player, weaponId, level, st, stateRef) {
  const def = CONFIG.weapons[weaponId].base;
  stateRef.cooldown -= dt;
  const interval = Math.max(0.2, weaponStat(weaponId, 'intervalSec', level) / st.weaponFireRate.mult);
  if (stateRef.cooldown <= 0) {
    // Aim at nearest enemy in range; if none, skip and retry shortly.
    const target = enemyHash.findNearest(player.x, player.y, def.range);
    if (!target) { stateRef.cooldown = 0.1; return; }
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const length = def.length;
    const halfWidth = weaponStat(weaponId, 'halfWidth', level) * st.weaponArea.mult;
    const x1 = player.x + ux * length;
    const y1 = player.y + uy * length;
    const dmg = weaponStat(weaponId, 'damage', level) * st.weaponDamage.mult;
    // Damage all enemies within `halfWidth` of the segment (player→x1,y1)
    damageAlongSegment(player.x, player.y, x1, y1, halfWidth, dmg);
    // Visual
    beamPool.spawn((b) => {
      b.x0 = player.x; b.y0 = player.y;
      b.x1 = x1; b.y1 = y1;
      b.halfWidth = halfWidth; b.color = def.color;
      b.t = 0; b.dur = def.visualDurationSec;
    });
    stateRef.cooldown += interval;
  }
  // Tick visuals
  const blist = beamPool.active;
  for (let i = 0; i < blist.length; i++) {
    const b = blist[i];
    if (!b.alive) continue;
    b.t += dt;
    if (b.t >= b.dur) b.alive = false;
  }
}

function damageAlongSegment(x0, y0, x1, y1, halfWidth, dmg) {
  const dx = x1 - x0, dy = y1 - y0;
  const segLen2 = dx * dx + dy * dy;
  if (segLen2 === 0) return;
  // Query a bounding box around the segment by sampling along it
  const sampleCount = Math.max(2, Math.ceil(Math.sqrt(segLen2) / 64));
  const candidates = [];
  const seen = new Set();
  for (let s = 0; s <= sampleCount; s++) {
    const t = s / sampleCount;
    const sx = x0 + dx * t;
    const sy = y0 + dy * t;
    const local = [];
    enemyHash.queryCircle(sx, sy, halfWidth + 64, local);
    for (let i = 0; i < local.length; i++) {
      const e = local[i];
      if (seen.has(e)) continue;
      seen.add(e);
      candidates.push(e);
    }
  }
  for (let i = 0; i < candidates.length; i++) {
    const e = candidates[i];
    if (!e.alive) continue;
    // Closest point on segment to (e.x, e.y)
    const ex = e.x - x0, ey = e.y - y0;
    const proj = Math.max(0, Math.min(1, (ex * dx + ey * dy) / segLen2));
    const cx = x0 + dx * proj;
    const cy = y0 + dy * proj;
    const r = halfWidth + e.radius;
    if (dist2(cx, cy, e.x, e.y) <= r * r) damageEnemy(e, dmg);
  }
}

// ---- Spirit Wolf & Wolf Pack ----
function updateSpiritWolfWeapon(dt, player, weaponId, level, st, stateRef) {
  const def = CONFIG.weapons[weaponId].base;
  const baseCount = def.baseCount;
  // Spirit Wolf adds extra wolves at specific levels; Wolf Pack is fixed baseline
  let extra = 0;
  if (weaponId === 'spiritWolf') {
    for (const lv of CONFIG.weapons.spiritWolf.extraWolfAtLevel) if (level >= lv) extra++;
  }
  const fromPassive = Math.round(st.minionCount.flat);
  const desired = baseCount + extra + fromPassive;

  // Count alive minions sourced to this weapon id
  const list = minionPool.active;
  let alive = 0;
  for (let i = 0; i < list.length; i++) if (list[i].alive && list[i].sourceId === weaponId) alive++;

  // Spawn missing
  while (alive < desired) {
    const ok = minionPool.spawn((m) => {
      m.sourceId = weaponId;
      m.x = player.x + (Math.random() - 0.5) * 40;
      m.y = player.y + (Math.random() - 0.5) * 40;
      m.vx = 0; m.vy = 0;
      m.speed = weaponStat(weaponId, 'moveSpeed', level);
      m.radius = def.radius;
      m.damage = weaponStat(weaponId, 'damage', level) * st.weaponDamage.mult;
      m.hitCooldownSec = def.hitCooldownSec;
      m.color = def.color;
      m.hitCooldowns.clear();
    });
    if (!ok) break;
    alive++;
  }
}

function updateMinions(dt) {
  const list = minionPool.active;
  const candidates = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (!m.alive) continue;
    // Find nearest enemy
    const target = enemyHash.findNearest(m.x, m.y, 800);
    if (target) {
      const dx = target.x - m.x;
      const dy = target.y - m.y;
      const d = Math.hypot(dx, dy) || 1;
      m.x += (dx / d) * m.speed * dt;
      m.y += (dy / d) * m.speed * dt;
    }
    // Hit check
    enemyHash.queryCircle(m.x, m.y, m.radius + 32, candidates);
    for (let j = 0; j < candidates.length; j++) {
      const e = candidates[j];
      if (!e.alive) continue;
      const r = m.radius + e.radius;
      if (dist2(m.x, m.y, e.x, e.y) > r * r) continue;
      const until = m.hitCooldowns.get(e) || 0;
      if (until > 0) continue;
      damageEnemy(e, m.damage);
      m.hitCooldowns.set(e, m.hitCooldownSec);
    }
    // Decay cooldowns
    for (const [e, t] of m.hitCooldowns) {
      if (!e.alive) { m.hitCooldowns.delete(e); continue; }
      const nt = t - dt;
      if (nt <= 0) m.hitCooldowns.delete(e);
      else m.hitCooldowns.set(e, nt);
    }
  }
}

// ---- Projectile movement & collisions (player projectiles only) ----
function updateProjectiles(dt, st) {
  const candidates = [];
  const list = projectilePool.active;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive) continue;

    if (p.isGrenade) {
      // Linear horizontal movement + parabolic visual handled in draw step
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        detonateGrenade(p, st);
        p.alive = false;
      }
      continue;
    }

    // Regular projectile
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { p.alive = false; continue; }
    if (p.x < 0 || p.x > CONFIG.arena.width || p.y < 0 || p.y > CONFIG.arena.height) {
      p.alive = false; continue;
    }

    enemyHash.queryCircle(p.x, p.y, p.radius + 32, candidates);
    for (let j = 0; j < candidates.length; j++) {
      const e = candidates[j];
      if (!e.alive) continue;
      if (p.hitEnemies && p.hitEnemies.has(e)) continue;
      const r = p.radius + e.radius;
      if (dist2(p.x, p.y, e.x, e.y) <= r * r) {
        damageEnemy(e, p.damage);
        if (p.hitEnemies) p.hitEnemies.add(e);
        if (p.pierce > 0) { p.pierce--; continue; }
        p.alive = false;
        break;
      }
    }
  }
}

// ---- Explosion lifecycle (visual fade; damage already applied at spawn) ----
function updateExplosions(dt) {
  const list = explosionPool.active;
  for (let i = 0; i < list.length; i++) {
    const ex = list[i];
    if (!ex.alive) continue;
    ex.t += dt;
    if (ex.t >= ex.dur) ex.alive = false;
  }
}

// ============================================================================
// ============================ PUBLIC: UPDATE ================================
// ============================================================================

export function updateWeapons(dt, player, ownedWeapons, st) {
  if (ownedWeapons.pistol > 0)      updatePistol(dt, player, ownedWeapons.pistol, st);
  if (ownedWeapons.autoRifle > 0)   updateAutoRifle(dt, player, ownedWeapons.autoRifle, st);
  if (ownedWeapons.orbitBlade > 0)  updateOrbitalWeapon(dt, player, 'orbitBlade', ownedWeapons.orbitBlade, st, weaponState.orbitBlade);
  if (ownedWeapons.whirlwind > 0)   updateOrbitalWeapon(dt, player, 'whirlwind', ownedWeapons.whirlwind, st, weaponState.whirlwind);
  if (ownedWeapons.shockwave > 0)   updateRadialWeapon(dt, player, 'shockwave', ownedWeapons.shockwave, st, weaponState.shockwave);
  if (ownedWeapons.nova > 0)        updateRadialWeapon(dt, player, 'nova', ownedWeapons.nova, st, weaponState.nova);
  if (ownedWeapons.grenade > 0)     updateGrenadeWeapon(dt, player, 'grenade', ownedWeapons.grenade, st, weaponState.grenade);
  if (ownedWeapons.clusterBomb > 0) updateGrenadeWeapon(dt, player, 'clusterBomb', ownedWeapons.clusterBomb, st, weaponState.clusterBomb);
  if (ownedWeapons.beam > 0)        updateBeamWeapon(dt, player, 'beam', ownedWeapons.beam, st, weaponState.beam);
  if (ownedWeapons.deathRay > 0)    updateBeamWeapon(dt, player, 'deathRay', ownedWeapons.deathRay, st, weaponState.deathRay);
  if (ownedWeapons.spiritWolf > 0)  updateSpiritWolfWeapon(dt, player, 'spiritWolf', ownedWeapons.spiritWolf, st, weaponState.spiritWolf);
  if (ownedWeapons.wolfPack > 0)    updateSpiritWolfWeapon(dt, player, 'wolfPack', ownedWeapons.wolfPack, st, weaponState.wolfPack);

  updateProjectiles(dt, st);
  updateMinions(dt);
  updateExplosions(dt);
}

// ============================================================================
// ============================ PUBLIC: RENDER ================================
// ============================================================================

export function drawWeapons(ctx, camera, ownedWeapons) {
  // Projectiles (regular = glow dot; grenades = sphere with parabolic arc + faint shadow)
  const plist = projectilePool.active;
  for (let i = 0; i < plist.length; i++) {
    const p = plist[i];
    if (!p.alive) continue;
    let sx = p.x - camera.x;
    let sy = p.y - camera.y;
    if (p.isGrenade) {
      const tNorm = 1 - (p.life / p.totalLife);
      const arc = Math.sin(tNorm * Math.PI) * p.arcHeight;
      // Shadow on ground (where it will land)
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(sx, sy, p.radius * 0.9, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Grenade body lifted by arc
      drawSphere(ctx, sx, sy - arc, p.radius, p.color);
    } else {
      drawGlowDot(ctx, sx, sy, p.radius, p.color);
    }
  }

  // Explosions (expanding alpha ring + filled disk)
  const elist = explosionPool.active;
  for (let i = 0; i < elist.length; i++) {
    const ex = elist[i];
    if (!ex.alive) continue;
    const k = ex.t / ex.dur;
    const sx = ex.x - camera.x;
    const sy = ex.y - camera.y;
    ctx.globalAlpha = (1 - k) * 0.5;
    ctx.fillStyle = ex.color;
    ctx.beginPath();
    ctx.arc(sx, sy, ex.radius * (0.6 + k * 0.4), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = (1 - k);
    ctx.strokeStyle = ex.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, ex.radius, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Beams: thick translucent body + bright thin core line (lasery look)
  const blist = beamPool.active;
  for (let i = 0; i < blist.length; i++) {
    const b = blist[i];
    if (!b.alive) continue;
    const k = b.t / b.dur;
    const fade = 1 - k;
    const x0 = b.x0 - camera.x, y0 = b.y0 - camera.y;
    const x1 = b.x1 - camera.x, y1 = b.y1 - camera.y;
    ctx.lineCap = 'round';
    // Outer halo
    ctx.globalAlpha = fade * 0.4;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.halfWidth * 2.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    // Body
    ctx.globalAlpha = fade * 0.9;
    ctx.lineWidth = b.halfWidth * 1.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    // Bright core
    ctx.globalAlpha = fade;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, b.halfWidth * 0.4);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  // Orbit blades & Whirlwind
  drawOrbiters(ctx, camera, 'orbitBlade', ownedWeapons.orbitBlade, weaponState.orbitBlade);
  drawOrbiters(ctx, camera, 'whirlwind', ownedWeapons.whirlwind, weaponState.whirlwind);

  // Shockwave / Nova pulses
  drawPulses(ctx, camera, weaponState.shockwave.pulses);
  drawPulses(ctx, camera, weaponState.nova.pulses);

  // Minions (Spirit Wolf / Wolf Pack): sphere + small ears + eyes
  const mlist = minionPool.active;
  for (let i = 0; i < mlist.length; i++) {
    const m = mlist[i];
    if (!m.alive) continue;
    const sx = m.x - camera.x;
    const sy = m.y - camera.y;
    drawSphere(ctx, sx, sy, m.radius, m.color);
    // Ear triangles
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.moveTo(sx - m.radius * 0.7, sy - m.radius * 0.4);
    ctx.lineTo(sx - m.radius * 0.3, sy - m.radius * 1.0);
    ctx.lineTo(sx - m.radius * 0.1, sy - m.radius * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx + m.radius * 0.7, sy - m.radius * 0.4);
    ctx.lineTo(sx + m.radius * 0.3, sy - m.radius * 1.0);
    ctx.lineTo(sx + m.radius * 0.1, sy - m.radius * 0.5);
    ctx.closePath(); ctx.fill();
    // Eyes
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(sx - 3, sy - 2, 1.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 3, sy - 2, 1.6, 0, TAU); ctx.fill();
  }
}

function drawOrbiters(ctx, camera, weaponId, ownedLevel, stateRef) {
  if (!ownedLevel || ownedLevel <= 0) return;
  const def = CONFIG.weapons[weaponId].base;
  for (let i = 0; i < stateRef.blades.length; i++) {
    const b = stateRef.blades[i];
    drawSphere(ctx, b.x - camera.x, b.y - camera.y, def.bladeRadius, def.color);
  }
}

function drawPulses(ctx, camera, pulses) {
  for (let i = 0; i < pulses.length; i++) {
    const p = pulses[i];
    const k = Math.min(1, p.t / p.dur);
    const r = p.r1 * (0.2 + 0.8 * k);
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x - camera.x, p.y - camera.y, r, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// Drain state on retry.
export function resetWeapons() {
  for (const k in weaponState) {
    const s = weaponState[k];
    if (s.cooldown !== undefined) s.cooldown = 0;
    if (s.angle !== undefined) s.angle = 0;
    if (s.blades) s.blades.length = 0;
    if (s.hitCooldowns) s.hitCooldowns.clear();
    if (s.pulses) s.pulses.length = 0;
    if (s.burstRemaining !== undefined) { s.burstRemaining = 0; s.burstTimer = 0; }
    if (s.spawnedFor !== undefined) s.spawnedFor = 0;
  }
  for (const p of projectilePool.slots) p.alive = false;
  projectilePool.active.length = 0;
  for (const m of minionPool.slots) m.alive = false;
  minionPool.active.length = 0;
  for (const e of explosionPool.slots) e.alive = false;
  explosionPool.active.length = 0;
  for (const b of beamPool.slots) b.alive = false;
  beamPool.active.length = 0;
}

export function getWeaponCooldown(name) {
  const s = weaponState[name];
  if (!s) return 0;
  return Math.max(0, s.cooldown || 0);
}
