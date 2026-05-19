// Rift Runner — entry point and game loop.
// Milestone 2 + mobile MVP: XP gems, level-up cards, DPR-aware canvas, touch joystick, responsive HUD.

import { CONFIG } from './config.js';
import { TAU, clamp, dist2 } from './utils.js';
import {
  enemyPool, updateEnemies, drawEnemies,
  getElapsedTime, resetElapsedTime,
} from './enemies.js';
import {
  updateWeapons, drawWeapons, resetWeapons, getWeaponCooldown,
  projectilePool,
} from './weapons.js';
import { gemPool, updateGems, drawGems } from './gems.js';
import { deriveStats } from './passives.js';
import { drawCards, applyCard } from './upgrades.js';
import {
  initInput, moveVector, isKeyDown, setTapHandler,
  joystick, JOYSTICK_RADIUS, KNOB_RADIUS,
} from './input.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const debugEl = document.getElementById('debug');

// ---- Viewport / DPR ----
// All gameplay code uses *logical* pixels (viewW, viewH). Canvas backing store is
// scaled to devicePixelRatio so retina/iPad renders crisp without us doing math everywhere.
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
};

const xpToNext = () => Math.floor(CONFIG.xp.baseXpToLevel * Math.pow(CONFIG.xp.curveExponent, state.level - 1));
const rebuildStats = () => { state.statTable = deriveStats(state.ownedPassives); };

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

function startRun() {
  state.player.x = CONFIG.arena.width / 2;
  state.player.y = CONFIG.arena.height / 2;
  state.player.hp = CONFIG.player.startHp;
  state.player.iframes = 0; state.player.dead = false;
  state.kills = 0;
  state.xp = 0; state.level = 1; state.pendingLevelUps = 0;
  state.paused = false; state.pendingCards = null;
  state.ownedWeapons = { pistol: 1, orbitBlade: 0, shockwave: 0 };
  state.ownedPassives = { magnet: 0, powerCell: 0, boots: 0 };
  rebuildStats();
  for (const e of enemyPool.slots) e.alive = false;
  enemyPool.active.length = 0;
  for (const g of gemPool.slots) g.alive = false;
  gemPool.active.length = 0;
  resetWeapons();
  resetElapsedTime();
}

// ---- Input wiring ----
initInput(canvas);

// Tap handler: dispatches to level-up cards / reroll button / retry-after-death.
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

// Keyboard shortcuts (debug, retry, card select). Movement is via input.js.
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

  const { dx, dy } = moveVector();
  if (dx !== 0 || dy !== 0) {
    state.player.x += dx * moveSpeed * dt;
    state.player.y += dy * moveSpeed * dt;
  }
  state.player.x = clamp(state.player.x, 0, CONFIG.arena.width);
  state.player.y = clamp(state.player.y, 0, CONFIG.arena.height);

  state.camera.x = state.player.x - viewW / 2;
  state.camera.y = state.player.y - viewH / 2;

  updateEnemies(dt, state.player, state.camera, viewW, viewH);
  updateWeapons(dt, state.player, state.ownedWeapons, st);
  const gained = updateGems(dt, state.player, pickupRadius);
  if (gained > 0) gainXp(gained);

  if (state.player.iframes > 0) state.player.iframes -= dt;
  else {
    const r = state.player.radius;
    const list = enemyPool.active;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const rr = r + e.radius;
      if (dist2(state.player.x, state.player.y, e.x, e.y) <= rr * rr) {
        state.player.hp -= e.contactDamage;
        state.player.iframes = CONFIG.player.iframesSec;
        if (state.player.hp <= 0) { state.player.hp = 0; state.player.dead = true; }
        break;
      }
    }
  }

  let killsThisFrame = 0;
  for (let i = 0; i < enemyPool.active.length; i++) if (!enemyPool.active[i].alive) killsThisFrame++;
  state.kills += killsThisFrame;

  enemyPool.compact();
  projectilePool.compact();
  gemPool.compact();
}

// ---- Render ----
function render() {
  ctx.fillStyle = '#1a3d1a';
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.strokeRect(-state.camera.x, -state.camera.y, CONFIG.arena.width, CONFIG.arena.height);

  drawGems(ctx, state.camera);
  drawEnemies(ctx, state.camera);
  drawWeapons(ctx, state.camera, state.ownedWeapons);

  const px = state.player.x - state.camera.x;
  const py = state.player.y - state.camera.y;
  ctx.fillStyle = state.player.iframes > 0 ? '#ffffff' : '#4ec9ff';
  ctx.beginPath();
  ctx.arc(px, py, state.player.radius, 0, TAU);
  ctx.fill();

  drawHud();
  drawJoystick();
  if (state.pendingCards) drawLevelUpScreen();
  if (state.player.dead) drawGameOver();
}

function drawHud() {
  const pad = 12;
  // Scale title size with viewport (iPad portrait vs landscape)
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
  ctx.fillText(`HP ${state.player.hp}/${state.player.maxHp}`, pad + 4, pad + hpH - 3);

  // Timer + kills (top-center)
  ctx.textAlign = 'center';
  ctx.font = `${big}px ui-sans-serif, system-ui`;
  const t = getElapsedTime();
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(Math.floor(t % 60)).padStart(2, '0');
  ctx.fillStyle = '#fff';
  ctx.fillText(`${mm}:${ss}   kills ${state.kills}`, viewW / 2, big + 6);

  // XP bar (bottom, full width) + level label
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

  // Weapon icons (top-right) — moved out of the joystick zone for mobile
  let iconX = viewW - 10 - 36;
  for (const id in state.ownedWeapons) {
    const lvl = state.ownedWeapons[id];
    if (lvl <= 0) continue;
    drawWeaponIcon(iconX, pad + 22, id, lvl);
    iconX -= 40;
  }
}

function drawWeaponIcon(x, y, id, lvl) {
  ctx.fillStyle = '#0008';
  ctx.fillRect(x, y, 36, 36);
  ctx.strokeStyle = '#fff6'; ctx.lineWidth = 1;
  ctx.strokeRect(x, y, 36, 36);
  ctx.fillStyle = CONFIG.weapons[id].base.color;
  ctx.beginPath();
  ctx.arc(x + 18, y + 18, 8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`L${lvl}`, x + 33, y + 33);
}

function drawJoystick() {
  if (!joystick.active) return;
  // Outer ring (spawn point)
  ctx.strokeStyle = '#ffffff60';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(joystick.cx, joystick.cy, JOYSTICK_RADIUS, 0, TAU);
  ctx.stroke();
  // Knob (follows finger, clamped to ring)
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

  // Title scales with viewport
  const titleSize = Math.max(24, Math.min(40, viewW * 0.04));
  ctx.fillStyle = '#ffd76b';
  ctx.font = `${titleSize}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText(`LEVEL ${state.level}`, viewW / 2, Math.max(60, viewH * 0.12));
  ctx.fillStyle = '#fff';
  ctx.font = '14px ui-sans-serif, system-ui';
  ctx.fillText('Tap a card to pick   ·   tap reroll to redraw',
    viewW / 2, Math.max(60, viewH * 0.12) + 24);

  // Responsive layout: horizontal row if room, vertical stack on narrow viewports
  const cards = state.pendingCards;
  const horizontal = viewW >= 720;
  const reservedBottom = 90; // space for reroll button

  if (horizontal) {
    const cardW = 220, cardH = 280, gap = 24;
    const totalW = cardW * cards.length + gap * (cards.length - 1);
    const startX = (viewW - totalW) / 2;
    const cardY = Math.max(180, (viewH - cardH) / 2);
    for (let i = 0; i < cards.length; i++) {
      drawCard(startX + i * (cardW + gap), cardY, cardW, cardH, cards[i], i);
    }
  } else {
    // Stacked: each card is roughly (viewW - 32) wide, ~120 tall
    const margin = 16;
    const cardW = viewW - margin * 2;
    const cardH = Math.min(120, (viewH - 200 - reservedBottom) / cards.length - 12);
    const totalH = cardH * cards.length + 12 * (cards.length - 1);
    const startY = Math.max(170, (viewH - totalH - reservedBottom) / 2);
    for (let i = 0; i < cards.length; i++) {
      drawCard(margin, startY + i * (cardH + 12), cardW, cardH, cards[i], i, true);
    }
  }

  // Reroll button (bottom-center on mobile, bottom-right on desktop)
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

function drawCard(x, y, w, h, c, ix, compact = false) {
  ctx.fillStyle = c.kind === 'weapon' ? '#1f2d3d' : '#1e3027';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = c.kind === 'weapon' ? '#ffd76b' : '#7be0c8';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  if (compact) {
    // Horizontal layout inside a wide-but-short card
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px ui-sans-serif, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${ix + 1}. ${c.name}`, x + 16, y + 28);
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = c.kind === 'weapon' ? '#ffd76b' : '#7be0c8';
    ctx.textAlign = 'right';
    ctx.fillText(`${c.kind.toUpperCase()}  Lv ${c.nextLevel}`, x + w - 16, y + 28);
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
    ctx.fillStyle = c.kind === 'weapon' ? '#ffd76b' : '#7be0c8';
    ctx.fillText(c.kind.toUpperCase(), x + w - 10, y + 22);
    ctx.fillStyle = '#fff';
    ctx.font = '22px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(c.name, x + w / 2, y + 80);
    ctx.fillStyle = '#fff';
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillText(`Lv ${c.nextLevel}`, x + w / 2, y + 108);
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
  ctx.fillStyle = '#000a';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.fillStyle = '#fff';
  const size = Math.max(28, Math.min(56, viewW * 0.06));
  ctx.font = `${size}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText('YOU DIED', viewW / 2, viewH / 2 - 10);
  ctx.font = '16px ui-sans-serif, system-ui';
  ctx.fillStyle = '#fffa';
  const t = getElapsedTime();
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(Math.floor(t % 60)).padStart(2, '0');
  ctx.fillText(`Survived ${mm}:${ss}  ·  Lv ${state.level}  ·  ${state.kills} kills`,
    viewW / 2, viewH / 2 + 24);
  ctx.fillText('tap or press R to retry', viewW / 2, viewH / 2 + 48);
}

function updateDebug() {
  if (!debugEl.classList.contains('visible')) return;
  const owned = Object.entries(state.ownedWeapons).filter(([_, v]) => v > 0).map(([k, v]) => `${k}L${v}`).join(' ');
  const pass = Object.entries(state.ownedPassives).filter(([_, v]) => v > 0).map(([k, v]) => `${k}L${v}`).join(' ');
  debugEl.textContent =
    `FPS: ${state.fps}  DPR: ${dpr}\n` +
    `View: ${viewW}x${viewH}\n` +
    `Time: ${getElapsedTime().toFixed(1)}s\n` +
    `Pos: ${state.player.x.toFixed(0)}, ${state.player.y.toFixed(0)}\n` +
    `HP: ${state.player.hp}/${state.player.maxHp}\n` +
    `Lvl: ${state.level} (${state.xp}/${xpToNext()})\n` +
    `Enemies: ${enemyPool.active.length}\n` +
    `Projectiles: ${projectilePool.active.length}\n` +
    `Gems: ${gemPool.active.length}\n` +
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
  render();
  updateDebug();
  requestAnimationFrame(loop);
}
startRun();
requestAnimationFrame(loop);
