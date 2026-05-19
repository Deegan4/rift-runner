// Rift Runner — entry point and game loop.
// Milestone 2: XP gems + level-up cards + 3 weapons + 3 passives.

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

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const debugEl = document.getElementById('debug');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---- Game state ----
const state = {
  player: {
    x: CONFIG.arena.width / 2,
    y: CONFIG.arena.height / 2,
    radius: CONFIG.player.radius,
    hp: CONFIG.player.startHp,
    maxHp: CONFIG.player.startHp,
    iframes: 0,
    dead: false,
  },
  camera: { x: 0, y: 0 },
  fps: 0, frameCount: 0, fpsTimer: 0,
  kills: 0,
  // Leveling
  xp: 0, level: 1,
  pendingLevelUps: 0,
  paused: false,
  pendingCards: null, // array of cards when level-up screen open
  rerollsLeft: 0,
  cardRects: [],      // updated each render of level-up screen, for click hit-testing
  // Ownership
  ownedWeapons: {},
  ownedPassives: {},
  statTable: null,
};

function xpToNext() {
  return Math.floor(CONFIG.xp.baseXpToLevel * Math.pow(CONFIG.xp.curveExponent, state.level - 1));
}

function rebuildStats() {
  state.statTable = deriveStats(state.ownedPassives);
}

function openLevelUpScreen() {
  const cards = drawCards(state.ownedWeapons, state.ownedPassives, CONFIG.leveling.cardsPerLevel);
  if (cards.length === 0) {
    // Nothing left to offer (everything maxed): resolve silently.
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
  state.player.iframes = 0;
  state.player.dead = false;
  state.kills = 0;
  state.xp = 0; state.level = 1;
  state.pendingLevelUps = 0;
  state.paused = false;
  state.pendingCards = null;
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

// ---- Input ----
const keys = new Set();
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key === CONFIG.debug.toggleKey) debugEl.classList.toggle('visible');
  if (state.player.dead && e.key.toLowerCase() === 'r') startRun();
  if (state.pendingCards) {
    if (e.key === '1') pickCard(0);
    if (e.key === '2') pickCard(1);
    if (e.key === '3') pickCard(2);
    if (e.key.toLowerCase() === 'q') reroll();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

canvas.addEventListener('click', (e) => {
  if (!state.pendingCards) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  for (let i = 0; i < state.cardRects.length; i++) {
    const r = state.cardRects[i];
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
      if (r.kind === 'card') pickCard(r.ix);
      else if (r.kind === 'reroll') reroll();
      return;
    }
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
  let dx = 0, dy = 0;
  if (keys.has('w') || keys.has('arrowup')) dy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dy += 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len; dy /= len;
    state.player.x += dx * moveSpeed * dt;
    state.player.y += dy * moveSpeed * dt;
  }
  state.player.x = clamp(state.player.x, 0, CONFIG.arena.width);
  state.player.y = clamp(state.player.y, 0, CONFIG.arena.height);

  // Camera
  state.camera.x = state.player.x - canvas.width / 2;
  state.camera.y = state.player.y - canvas.height / 2;

  // Systems
  updateEnemies(dt, state.player, state.camera, canvas.width, canvas.height);
  updateWeapons(dt, state.player, state.ownedWeapons, st);
  const gained = updateGems(dt, state.player, pickupRadius);
  if (gained > 0) gainXp(gained);

  // Contact damage
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

  // Tally kills (dead-but-not-yet-compacted entries in active)
  let killsThisFrame = 0;
  for (let i = 0; i < enemyPool.active.length; i++) if (!enemyPool.active[i].alive) killsThisFrame++;
  state.kills += killsThisFrame;

  // Compact
  enemyPool.compact();
  projectilePool.compact();
  gemPool.compact();
}

// ---- Render ----
function render() {
  ctx.fillStyle = '#1a3d1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.strokeRect(-state.camera.x, -state.camera.y, CONFIG.arena.width, CONFIG.arena.height);

  drawGems(ctx, state.camera);
  drawEnemies(ctx, state.camera);
  drawWeapons(ctx, state.camera, state.ownedWeapons);

  // Player
  const px = state.player.x - state.camera.x;
  const py = state.player.y - state.camera.y;
  ctx.fillStyle = state.player.iframes > 0 ? '#ffffff' : '#4ec9ff';
  ctx.beginPath();
  ctx.arc(px, py, state.player.radius, 0, TAU);
  ctx.fill();

  drawHud();
  if (state.pendingCards) drawLevelUpScreen();
  if (state.player.dead) drawGameOver();
}

function drawHud() {
  const pad = 12;

  // HP bar (top-left)
  const hpW = 200, hpH = 14;
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
  ctx.font = '18px ui-sans-serif, system-ui';
  const t = getElapsedTime();
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(Math.floor(t % 60)).padStart(2, '0');
  ctx.fillText(`${mm}:${ss}   kills ${state.kills}`, canvas.width / 2, 26);

  // XP bar (bottom, full width) + level label
  const xpBarH = 10;
  const xpY = canvas.height - xpBarH - 6;
  ctx.fillStyle = '#000a';
  ctx.fillRect(0, xpY, canvas.width, xpBarH);
  const need = xpToNext();
  const frac = clamp(state.xp / need, 0, 1);
  ctx.fillStyle = '#5ec8ff';
  ctx.fillRect(0, xpY, canvas.width * frac, xpBarH);
  ctx.fillStyle = '#fff';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`LVL ${state.level}`, 8, xpY - 4);
  ctx.textAlign = 'right';
  ctx.fillText(`${state.xp}/${need}`, canvas.width - 8, xpY - 4);

  // Weapon icons (bottom-left, above XP bar)
  const iconY = xpY - 50;
  let iconX = 10;
  for (const id in state.ownedWeapons) {
    const lvl = state.ownedWeapons[id];
    if (lvl <= 0) continue;
    drawWeaponIcon(iconX, iconY, id, lvl);
    iconX += 40;
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

function drawLevelUpScreen() {
  state.cardRects.length = 0;

  // Dim background
  ctx.fillStyle = '#000c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Title
  ctx.fillStyle = '#ffd76b';
  ctx.font = '36px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(`LEVEL ${state.level}`, canvas.width / 2, 100);
  ctx.fillStyle = '#fff';
  ctx.font = '16px ui-sans-serif, system-ui';
  ctx.fillText('Pick a card — click or press 1/2/3', canvas.width / 2, 130);

  // Cards
  const cards = state.pendingCards;
  const cardW = 220, cardH = 280, gap = 24;
  const totalW = cardW * cards.length + gap * (cards.length - 1);
  let startX = (canvas.width - totalW) / 2;
  const cardY = (canvas.height - cardH) / 2;

  for (let i = 0; i < cards.length; i++) {
    const x = startX + i * (cardW + gap);
    const c = cards[i];
    // Card body
    ctx.fillStyle = c.kind === 'weapon' ? '#1f2d3d' : '#1e3027';
    ctx.fillRect(x, cardY, cardW, cardH);
    ctx.strokeStyle = c.kind === 'weapon' ? '#ffd76b' : '#7be0c8';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, cardY, cardW, cardH);
    // Number badge
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}`, x + 10, cardY + 22);
    // Kind label
    ctx.textAlign = 'right';
    ctx.fillStyle = c.kind === 'weapon' ? '#ffd76b' : '#7be0c8';
    ctx.fillText(c.kind.toUpperCase(), x + cardW - 10, cardY + 22);
    // Name
    ctx.fillStyle = '#fff';
    ctx.font = '22px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(c.name, x + cardW / 2, cardY + 80);
    // Level pill
    ctx.fillStyle = '#fff';
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillText(`Lv ${c.nextLevel}`, x + cardW / 2, cardY + 108);
    // Description
    ctx.fillStyle = '#cfd';
    ctx.font = '14px ui-sans-serif, system-ui';
    wrapText(c.desc, x + cardW / 2, cardY + 150, cardW - 24, 18);

    state.cardRects.push({ kind: 'card', ix: i, x, y: cardY, w: cardW, h: cardH });
  }

  // Reroll button (bottom-right)
  const rrW = 140, rrH = 36;
  const rrX = canvas.width - rrW - 24;
  const rrY = canvas.height - rrH - 32;
  const canReroll = state.rerollsLeft > 0;
  ctx.fillStyle = canReroll ? '#3a2d1f' : '#2a2a2a';
  ctx.fillRect(rrX, rrY, rrW, rrH);
  ctx.strokeStyle = canReroll ? '#ffd76b' : '#666';
  ctx.lineWidth = 2;
  ctx.strokeRect(rrX, rrY, rrW, rrH);
  ctx.fillStyle = canReroll ? '#ffd76b' : '#888';
  ctx.font = '14px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(`Reroll (Q)  ${state.rerollsLeft}`, rrX + rrW / 2, rrY + 23);
  if (canReroll) state.cardRects.push({ kind: 'reroll', x: rrX, y: rrY, w: rrW, h: rrH });
}

function wrapText(text, cx, cy, maxW, lineH) {
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
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = '48px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('YOU DIED', canvas.width / 2, canvas.height / 2 - 10);
  ctx.font = '18px ui-sans-serif, system-ui';
  ctx.fillStyle = '#fffa';
  const t = getElapsedTime();
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(Math.floor(t % 60)).padStart(2, '0');
  ctx.fillText(`Survived ${mm}:${ss} · Lv ${state.level} · ${state.kills} kills · press R to retry`,
    canvas.width / 2, canvas.height / 2 + 28);
}

function updateDebug() {
  if (!debugEl.classList.contains('visible')) return;
  const owned = Object.entries(state.ownedWeapons).filter(([_, v]) => v > 0).map(([k, v]) => `${k}L${v}`).join(' ');
  const pass = Object.entries(state.ownedPassives).filter(([_, v]) => v > 0).map(([k, v]) => `${k}L${v}`).join(' ');
  debugEl.textContent =
    `FPS: ${state.fps}\n` +
    `Time: ${getElapsedTime().toFixed(1)}s\n` +
    `Pos: ${state.player.x.toFixed(0)}, ${state.player.y.toFixed(0)}\n` +
    `HP: ${state.player.hp}/${state.player.maxHp}\n` +
    `Lvl: ${state.level} (${state.xp}/${xpToNext()})\n` +
    `Enemies: ${enemyPool.active.length}\n` +
    `Projectiles: ${projectilePool.active.length}\n` +
    `Gems: ${gemPool.active.length}\n` +
    `Pistol cd: ${getWeaponCooldown('pistol').toFixed(2)}s\n` +
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
