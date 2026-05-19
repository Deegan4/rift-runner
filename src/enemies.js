// Enemy spawning, AI, and lifecycle. Milestone 1: one type (zombie), straight-line chase.

import { CONFIG } from './config.js';
import { Pool, enemyHash, TAU } from './utils.js';
import { spawnGem } from './gems.js';

const Z = CONFIG.enemyTypes.zombie;

function makeEnemy() {
  return {
    alive: false, type: 'zombie',
    x: 0, y: 0, hp: 0, maxHp: 0,
    speed: 0, radius: 0, contactDamage: 0, color: '#fff',
    hitFlash: 0, // seconds remaining of white flash on damage
  };
}

function resetEnemy(e) {
  e.hp = 0; e.hitFlash = 0;
}

export const enemyPool = new Pool(CONFIG.pools.enemies, makeEnemy, resetEnemy);

// Time-scaled HP curve.
function scaledHp(baseHp, elapsedSec) {
  const minutes = elapsedSec / 60;
  return Math.ceil(baseHp * (1 + CONFIG.enemies.hpScalePerMin * minutes));
}

function currentSpawnInterval(elapsedSec) {
  const minutes = elapsedSec / 60;
  const interval = CONFIG.enemies.spawnIntervalStart * Math.pow(1 - CONFIG.enemies.spawnIntervalDecayPerMin, minutes);
  return Math.max(CONFIG.enemies.spawnIntervalMin, interval);
}

// Spawn one zombie just outside the camera viewport.
function spawnZombie(camera, viewW, viewH) {
  const margin = CONFIG.enemies.spawnOffscreenMargin;
  const angle = Math.random() * TAU;
  // Compute a point on the edge of the (viewport + margin) box, projected through angle.
  const halfW = viewW / 2 + margin;
  const halfH = viewH / 2 + margin;
  const cx = camera.x + viewW / 2;
  const cy = camera.y + viewH / 2;
  // Project ray from center; clamp to box.
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const tX = halfW / Math.max(0.0001, Math.abs(cos));
  const tY = halfH / Math.max(0.0001, Math.abs(sin));
  const t = Math.min(tX, tY);
  let x = cx + cos * t;
  let y = cy + sin * t;
  // Clamp to arena bounds so zombies aren't unreachable.
  x = Math.max(0, Math.min(CONFIG.arena.width, x));
  y = Math.max(0, Math.min(CONFIG.arena.height, y));

  enemyPool.spawn((e) => {
    e.type = 'zombie';
    e.x = x; e.y = y;
    e.maxHp = scaledHp(Z.hp, _elapsed);
    e.hp = e.maxHp;
    e.speed = Z.moveSpeed;
    e.radius = Z.radius;
    e.contactDamage = Z.contactDamage;
    e.color = Z.color;
    e.hitFlash = 0;
  });
}

let _spawnTimer = 0;
let _elapsed = 0;

export function updateEnemies(dt, player, camera, viewW, viewH) {
  _elapsed += dt;
  _spawnTimer += dt;

  // Spawn cadence
  const interval = currentSpawnInterval(_elapsed);
  while (_spawnTimer >= interval && enemyPool.active.length < CONFIG.enemies.maxAlive) {
    _spawnTimer -= interval;
    spawnZombie(camera, viewW, viewH);
  }

  // AI + movement: straight-line chase
  const list = enemyPool.active;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.alive) continue;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * e.speed * dt;
    e.y += (dy / d) * e.speed * dt;
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
  }

  // Rebuild spatial hash for this frame
  enemyHash.clear();
  for (let i = 0; i < list.length; i++) {
    if (list[i].alive) enemyHash.insert(list[i]);
  }
}

export function damageEnemy(e, dmg) {
  if (!e.alive) return false;
  e.hp -= dmg;
  e.hitFlash = 0.08;
  if (e.hp <= 0) {
    e.alive = false;
    // Drop XP gem. Zombies only drop blue in M2; tougher enemy types will roll green/red in M3+.
    const dropCfg = CONFIG.enemyTypes[e.type];
    if (dropCfg && Math.random() < dropCfg.xpDropChance) {
      spawnGem(e.x, e.y, 'blue');
    }
    return true; // killed
  }
  return false;
}

export function drawEnemies(ctx, camera) {
  const list = enemyPool.active;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.alive) continue;
    const sx = e.x - camera.x;
    const sy = e.y - camera.y;
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.color;
    ctx.beginPath();
    ctx.arc(sx, sy, e.radius, 0, TAU);
    ctx.fill();
  }
}

export function getElapsedTime() { return _elapsed; }
export function resetElapsedTime() { _elapsed = 0; _spawnTimer = 0; }
