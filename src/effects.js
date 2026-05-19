// Visual effects: particles, damage numbers, screen shake. Pure rendering — no gameplay impact.
// Spawned from anywhere (enemies/weapons/gems/main); ticked + drawn from main loop.

import { CONFIG } from './config.js';
import { Pool, TAU, randRange } from './utils.js';

// ---- Particle pool ----
function makeParticle() {
  return { alive: false, x: 0, y: 0, vx: 0, vy: 0,
           life: 0, maxLife: 0, color: '#fff', radius: 2, drag: 0.92 };
}
function resetParticle(p) { p.life = 0; }
export const particlePool = new Pool(CONFIG.effects.particles, makeParticle, resetParticle);

// ---- Damage number pool ----
function makeNumber() {
  return { alive: false, x: 0, y: 0, vy: 0, life: 0, maxLife: 0, text: '', color: '#fff', big: false };
}
function resetNumber(n) { n.life = 0; }
export const numberPool = new Pool(CONFIG.effects.damageNumbers, makeNumber, resetNumber);

// ---- Screen shake ----
const shake = { intensity: 0, time: 0, ox: 0, oy: 0 };

export function shakeAdd(intensity, duration = 0.25) {
  // Take the louder of the two so big events override small ones
  if (intensity > shake.intensity) {
    shake.intensity = intensity;
    shake.time = duration;
  }
}
export function getShakeOffset() { return { x: shake.ox, y: shake.oy }; }
export function resetShake() { shake.intensity = 0; shake.time = 0; shake.ox = 0; shake.oy = 0; }

// ---- Spawn helpers ----
export function spawnBurst(x, y, count, color, speedMin = 60, speedMax = 220, lifeMin = 0.25, lifeMax = 0.55, radius = 2) {
  for (let i = 0; i < count; i++) {
    particlePool.spawn((p) => {
      const a = Math.random() * TAU;
      const s = randRange(speedMin, speedMax);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.maxLife = randRange(lifeMin, lifeMax);
      p.life = p.maxLife;
      p.color = color;
      p.radius = radius + Math.random() * 1.5;
      p.drag = 0.88 + Math.random() * 0.08;
    });
  }
}

// Tighter, faster, fewer particles — for "hit spark"
export function spawnHitSpark(x, y, color, count = 4) {
  for (let i = 0; i < count; i++) {
    particlePool.spawn((p) => {
      const a = Math.random() * TAU;
      const s = randRange(150, 320);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.maxLife = randRange(0.12, 0.22);
      p.life = p.maxLife;
      p.color = color;
      p.radius = 1.5 + Math.random();
      p.drag = 0.82;
    });
  }
}

export function spawnDamageNumber(x, y, amount, color = '#ffe680', big = false) {
  numberPool.spawn((n) => {
    n.x = x + (Math.random() - 0.5) * 14;
    n.y = y - 8;
    n.vy = -55 - Math.random() * 25;
    n.maxLife = big ? 0.85 : 0.65;
    n.life = n.maxLife;
    n.text = String(Math.round(amount));
    n.color = color;
    n.big = big;
  });
}

// ---- Update (called from main loop) ----
export function updateEffects(dt) {
  // Particles
  const list = particlePool.active;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy *= Math.pow(p.drag, dt * 60);
    p.life -= dt;
    if (p.life <= 0) p.alive = false;
  }

  // Damage numbers
  const nlist = numberPool.active;
  for (let i = 0; i < nlist.length; i++) {
    const n = nlist[i];
    if (!n.alive) continue;
    n.y += n.vy * dt;
    n.vy += 80 * dt; // slight gravity so they decelerate upward
    n.life -= dt;
    if (n.life <= 0) n.alive = false;
  }

  // Screen shake decay
  if (shake.time > 0) {
    shake.time -= dt;
    if (shake.time <= 0) { shake.intensity = 0; shake.ox = 0; shake.oy = 0; }
    else {
      const k = shake.intensity * (shake.time / 0.25); // linear with current intensity proxy
      shake.ox = (Math.random() * 2 - 1) * k;
      shake.oy = (Math.random() * 2 - 1) * k;
      shake.intensity *= Math.pow(0.85, dt * 60); // exponential decay
    }
  }

  particlePool.compact();
  numberPool.compact();
}

// ---- Draw ----
export function drawParticles(ctx, camera) {
  const list = particlePool.active;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive) continue;
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - camera.x, p.y - camera.y, p.radius * (0.6 + 0.4 * a), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawDamageNumbers(ctx, camera) {
  const list = numberPool.active;
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (!n.alive) continue;
    const a = Math.max(0, n.life / n.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = n.color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.font = (n.big ? 'bold 22px ' : 'bold 14px ') + 'ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    const sx = n.x - camera.x;
    const sy = n.y - camera.y;
    ctx.strokeText(n.text, sx, sy);
    ctx.fillText(n.text, sx, sy);
  }
  ctx.globalAlpha = 1;
}
