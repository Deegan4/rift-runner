// Rift Runner — entry point and game loop.
// Milestone 3: 6 weapons + 8 passives + evolutions + 4 enemy types + enemy projectiles + HP regen.

import { CONFIG } from './config.js';
import { TAU, clamp, dist2, drawSphere } from './utils.js';
import {
  enemyPool, enemyProjectilePool,
  updateEnemies, drawEnemies, drawEnemyProjectiles,
  getElapsedTime, resetElapsedTime,
} from './enemies.js';
import {
  updateWeapons, drawWeapons, resetWeapons, getWeaponCooldown,
  projectilePool, minionPool,
} from './weapons.js';
import { gemPool, updateGems, drawGems } from './gems.js';
import {
  particlePool, numberPool, updateEffects, drawParticles, drawDamageNumbers,
  shakeAdd, getShakeOffset, resetShake, spawnBurst,
} from './effects.js';
import { deriveStats } from './passives.js';
import { drawCards, applyCard } from './upgrades.js';
import {
  initInput, moveVector, setTapHandler,
  joystick, JOYSTICK_RADIUS, KNOB_RADIUS,
} from './input.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const debugEl = document.getElementById('debug');

// ---- Viewport / DPR ----
let viewW = 0, viewH = 0, dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.style.width = viewW + 'px';
  canvas.style.height = viewH + 'px';
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ---- Game state ----
const state = {
  player: {
    x: CONFIG.arena.width / 2, y: CONFIG.arena.height / 2,
    radius: CONFIG.player.radius,
    hp: CONFIG.player.startHp, maxHp: CONFIG.player.startHp,
    iframes: 0, dead: false,
  },
  camera: { x: 0, y: 0 },
  fps: 0, frameCount: 0, fpsTimer: 0,
  kills: 0,
  xp: 0, level: 1, pendingLevelUps: 0,
  paused: false, pendingCards: null, rerollsLeft: 0,
  cardRects: [],
  ownedWeapons: {}, ownedPassives: {}, statTable: null,
  deathT: 0,        // seconds since death (drives death fade animation)
};

const xpToNext = () => Math.floor(CONFIG.xp.baseXpToLevel * Math.pow(CONFIG.xp.curveExponent, state.level - 1));

// rebuildStats also re-derives maxHp from Vitality, healing the player by any positive delta
// (so picking Vitality feels rewarding, not just bigger-bar).
function rebuildStats() {
  const oldMax = state.player.maxHp;
  state.statTable = deriveStats(state.ownedPassives);
  const newMax = Math.round(CONFIG.player.startHp * state.statTable.maxHp.mult + state.statTable.maxHp.flat);
  state.player.maxHp = newMax;
  if (newMax > oldMax) state.player.hp += (newMax - oldMax);
  if (state.player.hp > newMax) state.player.hp = newMax;
}

function openLevelUpScreen() {
  const cards = drawCards(state.ownedWeapons, state.ownedPassives, CONFIG.leveling.cardsPerLevel);
  if (cards.length === 0) {
    state.pendingLevelUps--;
    if (state.pendingLevelUps > 0) openLevelUpScreen();
    return;
  }
  state.pendingCards = cards;
  state.rerollsLeft = CONFIG.leveling.freeRerollsPerLevel;
  state.paused = true;
}

function pickCard(ix) {
  if (!state.pendingCards) return;
  const card = state.pendingCards[ix];
  if (!card) return;
  applyCard(card, state.ownedWeapons, state.ownedPassives);
  rebuildStats();
  state.pendingCards = null;
  state.pendingLevelUps--;
  // Celebratory burst at the player on every pick, bigger for evolutions
  const isEvo = card.kind === 'evolution';
  spawnBurst(state.player.x, state.player.y, isEvo ? 60 : 25, isEvo ? '#ffd76b' : '#a0e8ff',
             80, 300, 0.35, 0.7, 2.5);
  shakeAdd(isEvo ? 10 : 4, isEvo ? 0.3 : 0.15);
  if (state.pendingLevelUps > 0) openLevelUpScreen();
  else state.paused = false;
}

function reroll() {
  if (!state.pendingCards || state.rerollsLeft <= 0) return;
  state.rerollsLeft--;
  state.pendingCards = drawCards(state.ownedWeapons, state.ownedPassives, CONFIG.leveling.cardsPerLevel);
}

function gainXp(amount) {
  if (amount <= 0) return;
  state.xp += amount;
  while (state.xp >= xpToNext()) {
    state.xp -= xpToNext();
    state.level++;
    state.pendingLevelUps++;
  }
  if (state.pendingLevelUps > 0 && !state.paused) openLevelUpScreen();
}

// Build the initial ownership maps: 0 for every weapon/passive in config (lets `||` checks work uniformly).
function blankWeaponMap() {
  const m = {};
  for (const id in CONFIG.weapons) m[id] = 0;
  m[CONFIG.leveling.startingWeapon] = 1;
  return m;
}
function blankPassiveMap() {
  const m = {};
  for (const id in CONFIG.passives) m[id] = 0;
  return m;
}

function startRun() {
  state.player.x = CONFIG.arena.width / 2;
  state.player.y = CONFIG.arena.height / 2;
  state.player.hp = CONFIG.player.startHp;
  state.player.maxHp = CONFIG.player.startHp;
  state.player.iframes = 0; state.player.dead = false;
  state.kills = 0;
  state.xp = 0; state.level = 1; state.pendingLevelUps = 0;
  state.paused = false; state.pendingCards = null;
  state.ownedWeapons = blankWeaponMap();
  state.ownedPassives = blankPassiveMap();
  rebuildStats();
  for (const e of enemyPool.slots) e.alive = false;
  enemyPool.active.length = 0;
  for (const p of enemyProjectilePool.slots) p.alive = false;
  enemyProjectilePool.active.length = 0;
  for (const g of gemPool.slots) g.alive = false;
  gemPool.active.length = 0;
  for (const p of particlePool.slots) p.alive = false;
  particlePool.active.length = 0;
  for (const n of numberPool.slots) n.alive = false;
  numberPool.active.length = 0;
  resetShake();
  state.deathT = 0;
  resetWeapons();
  resetElapsedTime();
}

// ---- Input wiring ----
initInput(canvas);
setTapHandler((x, y) => {
  if (state.player.dead) { startRun(); return; }
  if (!state.pendingCards) return;
  for (let i = 0; i < state.cardRects.length; i++) {
    const r = state.cardRects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      if (r.kind === 'card') pickCard(r.ix);
      else if (r.kind === 'reroll') reroll();
      return;
    }
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === CONFIG.debug.toggleKey) debugEl.classList.toggle('visible');
  if (state.player.dead && e.key.toLowerCase() === 'r') startRun();
  if (state.pendingCards) {
    if (e.key === '1') pickCard(0);
    if (e.key === '2') pickCard(1);
    if (e.key === '3') pickCard(2);
    if (e.key.toLowerCase() === 'q') reroll();
  }
});

if (CONFIG.debug.startVisible) debugEl.classList.add('visible');

// ---- Update ----
function update(dt) {
  if (state.player.dead || state.paused) return;
  const st = state.statTable;
  const moveSpeed = CONFIG.player.moveSpeed * st.moveSpeed.mult;
  const pickupRadius = CONFIG.player.pickupRadius * st.pickupRadius.mult;

  // Movement
  const { dx, dy } = moveVector();
  if (dx !== 0 || dy !== 0) {
    state.player.x += dx * moveSpeed * dt;
    state.player.y += dy * moveSpeed * dt;
  }
  state.player.x = clamp(state.player.x, 0, CONFIG.arena.width);
  state.player.y = clamp(state.player.y, 0, CONFIG.arena.height);

  // Camera
  state.camera.x = state.player.x - viewW / 2;
  state.camera.y = state.player.y - viewH / 2;

  // Systems
  updateEnemies(dt, state.player, state.camera, viewW, viewH);
  updateWeapons(dt, state.player, state.ownedWeapons, st);
  const gained = updateGems(dt, state.player, pickupRadius);
  if (gained > 0) gainXp(gained);

  // HP regen (Vitality)
  if (st.regen.flat > 0 && state.player.hp < state.player.maxHp) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + st.regen.flat * dt);
  }

  // Contact damage from enemies
  if (state.player.iframes > 0) state.player.iframes -= dt;
  else {
    const r = state.player.radius;
    const list = enemyPool.active;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const rr = r + e.radius;
      if (dist2(state.player.x, state.player.y, e.x, e.y) <= rr * rr) {
        takeDamage(e.contactDamage);
        break;
      }
    }
  }

  // Damage from enemy projectiles (separate code path — i-frames apply to both)
  if (state.player.iframes <= 0) {
    const eps = enemyProjectilePool.active;
    for (let i = 0; i < eps.length; i++) {
      const p = eps[i];
      if (!p.alive) continue;
      const rr = state.player.radius + p.radius;
      if (dist2(state.player.x, state.player.y, p.x, p.y) <= rr * rr) {
        takeDamage(p.damage);
        p.alive = false;
        break;
      }
    }
  }

  // Kill tally (dead-but-not-yet-compacted entries in active)
  let killsThisFrame = 0;
  for (let i = 0; i < enemyPool.active.length; i++) if (!enemyPool.active[i].alive) killsThisFrame++;
  state.kills += killsThisFrame;

  updateEffects(dt);

  enemyPool.compact();
  projectilePool.compact();
  enemyProjectilePool.compact();
  minionPool.compact();
  gemPool.compact();
}

function takeDamage(amount) {
  state.player.hp -= amount;
  state.player.iframes = CONFIG.player.iframesSec;
  shakeAdd(Math.min(14, 4 + amount * 0.6), 0.22);
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.player.dead = true;
    state.deathT = 0; // for death fade animation
    shakeAdd(20, 0.4);
    spawnBurst(state.player.x, state.player.y, 60, '#ff4444', 100, 380, 0.4, 0.9, 3);
  }
}

// ---- Render ----
// Render camera = gameplay camera + shake offset. Computed each frame so gameplay coords stay clean.
const renderCamera = { x: 0, y: 0 };

function render() {
  const shake = getShakeOffset();
  renderCamera.x = state.camera.x + shake.x;
  renderCamera.y = state.camera.y + shake.y;

  drawBackground();

  drawGems(ctx, renderCamera);
  drawEnemies(ctx, renderCamera);
  drawEnemyProjectiles(ctx, renderCamera);
  drawWeapons(ctx, renderCamera, state.ownedWeapons);
  drawParticles(ctx, renderCamera);
  drawPlayer(renderCamera);
  drawDamageNumbers(ctx, renderCamera);

  drawVignette();
  drawHud();
  drawJoystick();
  if (state.pendingCards) drawLevelUpScreen();
  if (state.player.dead) drawGameOver();
}

function drawBackground() {
  // Dark base
  ctx.fillStyle = '#101810';
  ctx.fillRect(0, 0, viewW, viewH);

  // Subtle grid that scrolls with the camera — turns the arena into a battlefield
  const CELL = 60;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  const offX = -((renderCamera.x % CELL + CELL) % CELL);
  const offY = -((renderCamera.y % CELL + CELL) % CELL);
  ctx.beginPath();
  for (let x = offX; x <= viewW; x += CELL) {
    ctx.moveTo(x, 0); ctx.lineTo(x, viewH);
  }
  for (let y = offY; y <= viewH; y += CELL) {
    ctx.moveTo(0, y); ctx.lineTo(viewW, y);
  }
  ctx.stroke();

  // Arena bounds (slightly brighter — the world edge)
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.strokeRect(-renderCamera.x, -renderCamera.y, CONFIG.arena.width, CONFIG.arena.height);
}

function drawVignette() {
  // Radial darkening at edges — focuses attention without obscuring gameplay
  const g = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.35,
                                      viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);
}

function drawPlayer(cam = state.camera) {
  const px = state.player.x - cam.x;
  const py = state.player.y - cam.y;
  const r = state.player.radius;

  // I-frame flicker: skip drawing on alternating short windows for a strobe effect
  if (state.player.iframes > 0) {
    const phase = Math.floor(state.player.iframes * 14) % 2;
    if (phase === 0) {
      drawSphere(ctx, px, py, r, '#ffffff', 'rgba(255,255,255,0.0)', null);
    } else {
      drawSphere(ctx, px, py, r, '#4ec9ff');
    }
  } else {
    drawSphere(ctx, px, py, r, '#4ec9ff');
  }

  // Direction arrow when moving — read at-a-glance
  const v = moveVector();
  if (v.dx !== 0 || v.dy !== 0) {
    const ang = Math.atan2(v.dy, v.dx);
    const tipX = px + Math.cos(ang) * (r + 6);
    const tipY = py + Math.sin(ang) * (r + 6);
    const baseX = px + Math.cos(ang) * (r + 1);
    const baseY = py + Math.sin(ang) * (r + 1);
    const perpX = -Math.sin(ang) * 3;
    const perpY = Math.cos(ang) * 3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + perpX, baseY + perpY);
    ctx.lineTo(baseX - perpX, baseY - perpY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHud() {
  const pad = 12;
  const big = Math.max(14, Math.min(20, viewW * 0.02));

  // HP bar (top-left)
  const hpW = Math.min(220, viewW * 0.4), hpH = 14;
  ctx.fillStyle = '#000a';
  ctx.fillRect(pad, pad, hpW, hpH);
  ctx.fillStyle = '#d04040';
  ctx.fillRect(pad, pad, hpW * (state.player.hp / state.player.maxHp), hpH);
  ctx.strokeStyle = '#fff8'; ctx.lineWidth = 1;
  ctx.strokeRect(pad, pad, hpW, hpH);
  ctx.fillStyle = '#fff';
  ctx.font = '12px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${Math.ceil(state.player.hp)}/${state.player.maxHp}`, pad + 4, pad + hpH - 3);

  // Timer + kills (top-center)
  ctx.textAlign = 'center';
  ctx.font = `${big}px ui-sans-serif, system-ui`;
  const t = getElapsedTime();
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(Math.floor(t % 60)).padStart(2, '0');
  ctx.fillStyle = '#fff';
  ctx.fillText(`${mm}:${ss}   kills ${state.kills}`, viewW / 2, big + 6);

  // XP bar (bottom)
  const xpBarH = 10;
  const xpY = viewH - xpBarH - 6;
  ctx.fillStyle = '#000a';
  ctx.fillRect(0, xpY, viewW, xpBarH);
  const need = xpToNext();
  const frac = clamp(state.xp / need, 0, 1);
  ctx.fillStyle = '#5ec8ff';
  ctx.fillRect(0, xpY, viewW * frac, xpBarH);
  ctx.fillStyle = '#fff';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`LVL ${state.level}`, 8, xpY - 4);
  ctx.textAlign = 'right';
  ctx.fillText(`${state.xp}/${need}`, viewW - 8, xpY - 4);

  // Weapon icons (top-right, wrapping right-to-left)
  let iconX = viewW - 10 - 36;
  for (const id in state.ownedWeapons) {
    const lvl = state.ownedWeapons[id];
    if (lvl <= 0) continue;
    drawWeaponIcon(iconX, pad + 22, id, lvl);
    iconX -= 40;
    if (iconX < pad + 200) break; // avoid overlap with timer
  }
}

function drawWeaponIcon(x, y, id, lvl) {
  ctx.fillStyle = '#0008';
  ctx.fillRect(x, y, 36, 36);
  const def = CONFIG.weapons[id];
  ctx.strokeStyle = def.evolution ? '#ffd76b' : '#fff6';
  ctx.lineWidth = def.evolution ? 2 : 1;
  ctx.strokeRect(x, y, 36, 36);
  ctx.fillStyle = def.base.color;
  ctx.beginPath();
  ctx.arc(x + 18, y + 18, 8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(def.evolution ? 'EVO' : `L${lvl}`, x + 33, y + 33);
}

function drawJoystick() {
  if (!joystick.active) return;
  ctx.strokeStyle = '#ffffff60';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(joystick.cx, joystick.cy, JOYSTICK_RADIUS, 0, TAU);
  ctx.stroke();
  const dx = joystick.px - joystick.cx;
  const dy = joystick.py - joystick.cy;
  const d = Math.hypot(dx, dy);
  let kx = joystick.px, ky = joystick.py;
  if (d > JOYSTICK_RADIUS) {
    kx = joystick.cx + (dx / d) * JOYSTICK_RADIUS;
    ky = joystick.cy + (dy / d) * JOYSTICK_RADIUS;
  }
  ctx.fillStyle = '#ffffff80';
  ctx.beginPath();
  ctx.arc(kx, ky, KNOB_RADIUS, 0, TAU);
  ctx.fill();
}

function drawLevelUpScreen() {
  state.cardRects.length = 0;
  ctx.fillStyle = '#000c';
  ctx.fillRect(0, 0, viewW, viewH);

  const titleSize = Math.max(24, Math.min(40, viewW * 0.04));
  ctx.fillStyle = '#ffd76b';
  ctx.font = `${titleSize}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText(`LEVEL ${state.level}`, viewW / 2, Math.max(60, viewH * 0.12));
  ctx.fillStyle = '#fff';
  ctx.font = '14px ui-sans-serif, system-ui';
  ctx.fillText('Tap a card to pick   ·   tap reroll to redraw',
    viewW / 2, Math.max(60, viewH * 0.12) + 24);

  const cards = state.pendingCards;
  const horizontal = viewW >= 720;
  const reservedBottom = 90;

  if (horizontal) {
    const cardW = 220, cardH = 280, gap = 24;
    const totalW = cardW * cards.length + gap * (cards.length - 1);
    const startX = (viewW - totalW) / 2;
    const cardY = Math.max(180, (viewH - cardH) / 2);
    for (let i = 0; i < cards.length; i++) {
      drawCard(startX + i * (cardW + gap), cardY, cardW, cardH, cards[i], i);
    }
  } else {
    const margin = 16;
    const cardW = viewW - margin * 2;
    const cardH = Math.min(120, (viewH - 200 - reservedBottom) / cards.length - 12);
    const totalH = cardH * cards.length + 12 * (cards.length - 1);
    const startY = Math.max(170, (viewH - totalH - reservedBottom) / 2);
    for (let i = 0; i < cards.length; i++) {
      drawCard(margin, startY + i * (cardH + 12), cardW, cardH, cards[i], i, true);
    }
  }

  // Reroll
  const rrW = 200, rrH = 48;
  const rrX = horizontal ? viewW - rrW - 24 : (viewW - rrW) / 2;
  const rrY = viewH - rrH - 24;
  const canReroll = state.rerollsLeft > 0;
  ctx.fillStyle = canReroll ? '#3a2d1f' : '#2a2a2a';
  ctx.fillRect(rrX, rrY, rrW, rrH);
  ctx.strokeStyle = canReroll ? '#ffd76b' : '#666';
  ctx.lineWidth = 2;
  ctx.strokeRect(rrX, rrY, rrW, rrH);
  ctx.fillStyle = canReroll ? '#ffd76b' : '#888';
  ctx.font = '16px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(`Reroll  (${state.rerollsLeft})`, rrX + rrW / 2, rrY + 30);
  if (canReroll) state.cardRects.push({ kind: 'reroll', x: rrX, y: rrY, w: rrW, h: rrH });
}

function cardColors(c) {
  if (c.kind === 'evolution') return { bg: '#3d2a0f', border: '#ffb84a', accent: '#ffd76b' };
  if (c.kind === 'weapon')    return { bg: '#1f2d3d', border: '#ffd76b', accent: '#ffd76b' };
  return                            { bg: '#1e3027', border: '#7be0c8', accent: '#7be0c8' };
}

function drawCard(x, y, w, h, c, ix, compact = false) {
  const col = cardColors(c);
  ctx.fillStyle = col.bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = col.border;
  ctx.lineWidth = c.kind === 'evolution' ? 3 : 2;
  ctx.strokeRect(x, y, w, h);

  // Evolution flair: a corner badge
  if (c.kind === 'evolution') {
    ctx.fillStyle = col.accent;
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('★ EVOLUTION', x + 10, y + 38);
  }

  if (compact) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px ui-sans-serif, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${ix + 1}. ${c.name}`, x + 16, y + 28);
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = col.accent;
    ctx.textAlign = 'right';
    const tag = c.kind === 'evolution' ? '★ EVO' : `${c.kind.toUpperCase()}  Lv ${c.nextLevel}`;
    ctx.fillText(tag, x + w - 16, y + 28);
    ctx.fillStyle = '#cfd';
    ctx.font = '14px ui-sans-serif, system-ui';
    ctx.textAlign = 'left';
    wrapText(c.desc, x + 16, y + 54, w - 32, 18, 'left');
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${ix + 1}`, x + 10, y + 22);
    ctx.textAlign = 'right';
    ctx.fillStyle = col.accent;
    ctx.fillText(c.kind === 'evolution' ? 'EVO' : c.kind.toUpperCase(), x + w - 10, y + 22);
    ctx.fillStyle = '#fff';
    ctx.font = '22px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(c.name, x + w / 2, y + 80);
    ctx.fillStyle = '#fff';
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillText(c.kind === 'evolution' ? '★ Legendary' : `Lv ${c.nextLevel}`, x + w / 2, y + 108);
    ctx.fillStyle = '#cfd';
    ctx.font = '14px ui-sans-serif, system-ui';
    wrapText(c.desc, x + w / 2, y + 150, w - 24, 18, 'center');
  }
  state.cardRects.push({ kind: 'card', ix, x, y, w, h });
}

function wrapText(text, cx, cy, maxW, lineH, align = 'center') {
  ctx.textAlign = align;
  const words = text.split(' ');
  let line = '';
  let y = cy;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, y);
      line = words[i];
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, y);
}

function drawGameOver() {
  // Phase 1 (0..0.6s): red fade in from center, like blood
  // Phase 2 (0.6s+): dark overlay + text
  const t = state.deathT;
  if (t < 0.6) {
    const k = t / 0.6;
    const g = ctx.createRadialGradient(viewW / 2, viewH / 2, 0,
                                        viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.8);
    g.addColorStop(0, `rgba(180, 30, 30, ${k * 0.7})`);
    g.addColorStop(1, `rgba(0, 0, 0, ${k * 0.85})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
    return;
  }
  // Dark base
  ctx.fillStyle = 'rgba(20, 5, 5, 0.85)';
  ctx.fillRect(0, 0, viewW, viewH);
  // Title fade-in over second 0.6..1.0
  const textFade = Math.min(1, (t - 0.6) / 0.4);
  ctx.globalAlpha = textFade;
  ctx.fillStyle = '#ff6464';
  const size = Math.max(32, Math.min(64, viewW * 0.07));
  ctx.font = `bold ${size}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText('YOU DIED', viewW / 2, viewH / 2 - 10);
  ctx.font = '16px ui-sans-serif, system-ui';
  ctx.fillStyle = '#ffffffaa';
  const elapsed = getElapsedTime();
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
  ctx.fillText(`Survived ${mm}:${ss}  ·  Lv ${state.level}  ·  ${state.kills} kills`,
    viewW / 2, viewH / 2 + 24);
  ctx.fillText('tap or press R to retry', viewW / 2, viewH / 2 + 48);
  ctx.globalAlpha = 1;
}

function updateDebug() {
  if (!debugEl.classList.contains('visible')) return;
  const owned = Object.entries(state.ownedWeapons).filter(([_, v]) => v > 0).map(([k, v]) => `${k}L${v}`).join(' ');
  const pass = Object.entries(state.ownedPassives).filter(([_, v]) => v > 0).map(([k, v]) => `${k}L${v}`).join(' ');
  const st = state.statTable;
  debugEl.textContent =
    `FPS: ${state.fps}  DPR: ${dpr}\n` +
    `Time: ${getElapsedTime().toFixed(1)}s\n` +
    `Pos: ${state.player.x.toFixed(0)}, ${state.player.y.toFixed(0)}\n` +
    `HP: ${Math.ceil(state.player.hp)}/${state.player.maxHp}` + (st.regen.flat > 0 ? `  +${st.regen.flat}/s` : '') + `\n` +
    `Lvl: ${state.level} (${state.xp}/${xpToNext()})\n` +
    `Enemies: ${enemyPool.active.length}  EProj: ${enemyProjectilePool.active.length}\n` +
    `Projectiles: ${projectilePool.active.length}  Minions: ${minionPool.active.length}  Gems: ${gemPool.active.length}\n` +
    `Joystick: ${joystick.active ? joystick.dx.toFixed(2) + ',' + joystick.dy.toFixed(2) : 'off'}\n` +
    `Weapons: ${owned}\n` +
    `Passives: ${pass}\n` +
    `Kills: ${state.kills}`;
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  state.frameCount++;
  state.fpsTimer += dt;
  if (state.fpsTimer >= 1) {
    state.fps = state.frameCount;
    state.frameCount = 0; state.fpsTimer = 0;
  }
  update(dt);
  // Death timer advances even while update() early-returns on dead — so the fade animates
  if (state.player.dead) {
    state.deathT += dt;
    updateEffects(dt); // particles + shake still need to tick post-death
  }
  render();
  updateDebug();
  requestAnimationFrame(loop);
}
startRun();
requestAnimationFrame(loop);
