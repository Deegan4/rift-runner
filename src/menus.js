// Main menu + stats + codex screens. Canvas-rendered, click/tap-driven.
// State: caller passes which view to draw; we return a list of clickable rects
// with action ids for the caller to dispatch on tap.

import { CONFIG } from './config.js';
import { loadMeta, hasSeenWeapon, hasSeenPassive, resetMeta } from './meta.js';
import { TAU } from './utils.js';

// Each draw* function mutates the passed `out` array of {id, x, y, w, h} hit rects.
// Returns nothing; caller is the dispatcher.

const COL = {
  bg: '#0c0d12',
  card: '#1b1d27',
  cardBorder: '#3a3f55',
  accent: '#ffd76b',
  accentSoft: '#5ec8ff',
  text: '#f0f0f5',
  textDim: '#9aa0b4',
  locked: '#3a3f55',
  evolution: '#ff9c4a',
};

function fmtTime(sec) {
  const s = Math.floor(sec);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function drawButton(ctx, x, y, w, h, label, accent = COL.accent) {
  ctx.fillStyle = COL.card;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = accent;
  ctx.font = 'bold 18px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.textBaseline = 'alphabetic';
}

// ============================================================
// Main menu
// ============================================================
export function drawMainMenu(ctx, viewW, viewH, out) {
  out.length = 0;
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, viewW, viewH);

  // Title
  ctx.fillStyle = COL.accent;
  const titleSize = Math.max(40, Math.min(72, viewW * 0.08));
  ctx.font = `bold ${titleSize}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText('RIFT RUNNER', viewW / 2, viewH * 0.22);
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillStyle = COL.textDim;
  ctx.fillText('survivors-like · v1.0 MVP', viewW / 2, viewH * 0.22 + 28);

  // Buttons stacked vertically, centered
  const btnW = Math.min(360, viewW * 0.6);
  const btnH = 64;
  const gap = 16;
  const btns = [
    { id: 'play',  label: '▶  PLAY',     accent: COL.accent },
    { id: 'stats', label: 'STATS',       accent: COL.accentSoft },
    { id: 'codex', label: 'CODEX',       accent: COL.accentSoft },
  ];
  const totalH = btns.length * btnH + (btns.length - 1) * gap;
  let y = (viewH - totalH) / 2 + 40;
  const x = (viewW - btnW) / 2;
  for (const b of btns) {
    drawButton(ctx, x, y, btnW, btnH, b.label, b.accent);
    out.push({ id: b.id, x, y, w: btnW, h: btnH });
    y += btnH + gap;
  }

  // Footer
  ctx.fillStyle = COL.textDim;
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText('WASD / touch to move · auto-fire · pick cards on level up',
    viewW / 2, viewH - 20);
}

// ============================================================
// Stats view
// ============================================================
export function drawStats(ctx, viewW, viewH, out) {
  out.length = 0;
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.fillStyle = COL.accent;
  ctx.font = `bold 32px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText('STATS', viewW / 2, 56);

  const m = loadMeta();
  const rows = [
    ['Runs played',      String(m.runs)],
    ['Total kills',      m.totalKills.toLocaleString()],
    ['Longest survival', fmtTime(m.longestRunSec)],
    ['Highest level',    String(m.highestLevel)],
    ['Bosses killed',    String(m.bossesKilled)],
    ['Chests opened',    String(m.chestsOpened)],
    ['Weapons discovered', `${m.weaponsSeen.length} / ${Object.keys(CONFIG.weapons).length}`],
    ['Passives discovered', `${m.passivesSeen.length} / ${Object.keys(CONFIG.passives).length}`],
  ];
  const rowH = 32;
  const colW = Math.min(560, viewW * 0.8);
  const x0 = (viewW - colW) / 2;
  let y = 110;
  ctx.font = '17px ui-sans-serif, system-ui';
  for (const [label, value] of rows) {
    ctx.fillStyle = COL.card;
    ctx.fillRect(x0, y, colW, rowH - 4);
    ctx.fillStyle = COL.textDim;
    ctx.textAlign = 'left';
    ctx.fillText(label, x0 + 16, y + 22);
    ctx.fillStyle = COL.text;
    ctx.textAlign = 'right';
    ctx.fillText(value, x0 + colW - 16, y + 22);
    y += rowH;
  }

  // Back + Reset
  const bw = 140, bh = 44, bgap = 12;
  const totalBw = bw * 2 + bgap;
  const bx = (viewW - totalBw) / 2;
  const by = viewH - 80;
  drawButton(ctx, bx, by, bw, bh, '← BACK', COL.accentSoft);
  out.push({ id: 'back', x: bx, y: by, w: bw, h: bh });
  drawButton(ctx, bx + bw + bgap, by, bw, bh, 'RESET', '#ff6464');
  out.push({ id: 'reset', x: bx + bw + bgap, y: by, w: bw, h: bh });
}

// ============================================================
// Codex view
// ============================================================
let codexTab = 'weapons'; // 'weapons' | 'passives' | 'heroes'
export function getCodexTab() { return codexTab; }
export function setCodexTab(t) { codexTab = t; }

export function drawCodex(ctx, viewW, viewH, out) {
  out.length = 0;
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.fillStyle = COL.accent;
  ctx.font = `bold 32px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText('CODEX', viewW / 2, 48);

  // Tab bar
  const tabs = [
    { id: 'weapons',  label: 'Weapons' },
    { id: 'passives', label: 'Passives' },
    { id: 'heroes',   label: 'Heroes' },
  ];
  const tabW = 120, tabH = 36, tabGap = 8;
  const totalTabW = tabs.length * tabW + (tabs.length - 1) * tabGap;
  let tx = (viewW - totalTabW) / 2;
  const ty = 70;
  for (const t of tabs) {
    const active = t.id === codexTab;
    ctx.fillStyle = active ? COL.accent : COL.card;
    ctx.fillRect(tx, ty, tabW, tabH);
    ctx.strokeStyle = active ? COL.accent : COL.cardBorder;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tx, ty, tabW, tabH);
    ctx.fillStyle = active ? '#1a1a1a' : COL.text;
    ctx.font = 'bold 14px ui-sans-serif, system-ui';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(t.label, tx + tabW / 2, ty + tabH / 2);
    ctx.textBaseline = 'alphabetic';
    out.push({ id: 'tab:' + t.id, x: tx, y: ty, w: tabW, h: tabH });
    tx += tabW + tabGap;
  }

  // Content area
  const contentY = ty + tabH + 16;
  const contentH = viewH - contentY - 80;
  if (codexTab === 'weapons')  drawCodexWeapons(ctx, viewW, contentY, contentH);
  if (codexTab === 'passives') drawCodexPassives(ctx, viewW, contentY, contentH);
  if (codexTab === 'heroes')   drawCodexHeroes(ctx, viewW, contentY, contentH);

  // Back button
  const bw = 140, bh = 44;
  const bx = (viewW - bw) / 2;
  const by = viewH - 60;
  drawButton(ctx, bx, by, bw, bh, '← BACK', COL.accentSoft);
  out.push({ id: 'back', x: bx, y: by, w: bw, h: bh });
}

function weaponLongDesc(id) {
  const D = {
    pistol:      'Fires single bullet at nearest enemy. Cheap, reliable, evolves with Reload Kit.',
    orbitBlade:  'Spinning blade orbits player. Hits everything in its path. Evolves with Magnet.',
    shockwave:   'Periodic AoE pulse from player. No aim required. Evolves with Power Cell.',
    grenade:     'Lobs at random enemy in range, explodes on impact. Evolves with Demolition.',
    beam:        'Sweeping laser aimed at nearest enemy. Pierces all. Evolves with Focus Lens.',
    spiritWolf:  'Pet wolf chases enemies on its own. More wolves via Pack Tactics.',
    autoRifle:   '★ EVOLVED — Pistol fires 3-round bursts at high speed.',
    whirlwind:   '★ EVOLVED — 4 blades, larger radius, faster spin.',
    nova:        '★ EVOLVED — Shockwave chain-lightnings to nearby enemies.',
    clusterBomb: '★ EVOLVED — Grenade impact spawns 5 secondary explosions.',
    deathRay:    '★ EVOLVED — Longer, wider, far more damage.',
    wolfPack:    '★ EVOLVED — 3 baseline wolves, faster and meaner.',
  };
  return D[id] || '';
}

function drawCodexWeapons(ctx, viewW, y0, h) {
  const entries = Object.entries(CONFIG.weapons);
  const colW = Math.min(720, viewW * 0.92);
  const rowH = 56;
  const x0 = (viewW - colW) / 2;
  let y = y0;
  ctx.textBaseline = 'alphabetic';
  for (const [id, def] of entries) {
    const seen = hasSeenWeapon(id);
    const isEvo = def.evolution;
    const accent = isEvo ? COL.evolution : (seen ? COL.accent : COL.locked);
    ctx.fillStyle = COL.card;
    ctx.fillRect(x0, y, colW, rowH - 6);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y, colW, rowH - 6);
    // Color dot
    ctx.fillStyle = seen ? def.base.color : COL.locked;
    ctx.beginPath();
    ctx.arc(x0 + 22, y + 25, 9, 0, TAU);
    ctx.fill();
    // Name
    ctx.fillStyle = seen ? COL.text : COL.textDim;
    ctx.font = 'bold 15px ui-sans-serif, system-ui';
    ctx.textAlign = 'left';
    const name = seen || isEvo ? prettyName(id) : '???';
    const tag = isEvo ? '  ★EVO' : '';
    ctx.fillText(name + tag, x0 + 40, y + 22);
    // Description
    ctx.fillStyle = COL.textDim;
    ctx.font = '12px ui-sans-serif, system-ui';
    const desc = seen || isEvo ? weaponLongDesc(id) : 'Discover by picking this weapon during a run.';
    ctx.fillText(desc.length > 90 ? desc.slice(0, 88) + '…' : desc, x0 + 40, y + 40);
    y += rowH;
    if (y > y0 + h - rowH) break;
  }
}

function drawCodexPassives(ctx, viewW, y0, h) {
  const entries = Object.entries(CONFIG.passives);
  const colW = Math.min(720, viewW * 0.92);
  const rowH = 56;
  const x0 = (viewW - colW) / 2;
  let y = y0;
  for (const [id, def] of entries) {
    const seen = hasSeenPassive(id);
    const accent = seen ? COL.accentSoft : COL.locked;
    ctx.fillStyle = COL.card;
    ctx.fillRect(x0, y, colW, rowH - 6);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y, colW, rowH - 6);
    ctx.fillStyle = seen ? COL.text : COL.textDim;
    ctx.font = 'bold 15px ui-sans-serif, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(seen ? def.name : '???', x0 + 16, y + 22);
    ctx.fillStyle = COL.textDim;
    ctx.font = '12px ui-sans-serif, system-ui';
    ctx.fillText(seen ? def.desc + `  ·  max Lv ${def.maxLevel}` : 'Discover by picking this passive during a run.',
      x0 + 16, y + 40);
    y += rowH;
    if (y > y0 + h - rowH) break;
  }
}

// Placeholder heroes — system not implemented yet; locked rows for future M5b
function drawCodexHeroes(ctx, viewW, y0, h) {
  const HEROES = [
    { id: 'ranger',     name: 'Ranger',     desc: 'The default. Balanced stats, starts with Pistol.',          unlocked: true },
    { id: 'tank',       name: 'Tank',       desc: '+HP, −speed. Starts with Shockwave.',                       unlocked: false, unlock: 'Survive 10:00 as Ranger' },
    { id: 'mage',       name: 'Mage',       desc: '+area, −HP. Starts with Beam.',                             unlocked: false, unlock: 'Kill 3 bosses' },
    { id: 'beastmaster',name: 'Beastmaster',desc: '+minion count. Starts with Spirit Wolf.',                   unlocked: false, unlock: 'Pick Spirit Wolf 5 times across runs' },
    { id: 'demolitions',name: 'Demolitions',desc: '+area, +AoE damage. Starts with Grenade.',                  unlocked: false, unlock: 'Kill 1000 enemies with Grenade evolutions' },
  ];
  const colW = Math.min(720, viewW * 0.92);
  const rowH = 60;
  const x0 = (viewW - colW) / 2;
  let y = y0;
  for (const hero of HEROES) {
    const accent = hero.unlocked ? COL.accent : COL.locked;
    ctx.fillStyle = COL.card;
    ctx.fillRect(x0, y, colW, rowH - 6);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y, colW, rowH - 6);
    ctx.fillStyle = hero.unlocked ? COL.text : COL.textDim;
    ctx.font = 'bold 16px ui-sans-serif, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(hero.unlocked ? hero.name : '🔒 ' + hero.name, x0 + 16, y + 22);
    ctx.font = '12px ui-sans-serif, system-ui';
    ctx.fillStyle = COL.textDim;
    ctx.fillText(hero.desc, x0 + 16, y + 40);
    if (!hero.unlocked) {
      ctx.fillStyle = COL.textDim;
      ctx.font = 'italic 11px ui-sans-serif, system-ui';
      ctx.textAlign = 'right';
      ctx.fillText('Unlock: ' + hero.unlock, x0 + colW - 16, y + 22);
    }
    y += rowH;
    if (y > y0 + h - rowH) break;
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = COL.textDim;
  ctx.font = 'italic 12px ui-sans-serif, system-ui';
  ctx.fillText('Hero gameplay system coming in next update.', x0, y + 18);
}

function prettyName(id) {
  const NAMES = {
    autoRifle: 'Auto-Rifle', whirlwind: 'Whirlwind', nova: 'Nova',
    clusterBomb: 'Cluster Bomb', deathRay: 'Death Ray', wolfPack: 'Wolf Pack',
    orbitBlade: 'Orbit Blade', spiritWolf: 'Spirit Wolf',
  };
  if (NAMES[id]) return NAMES[id];
  return id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

// Confirmation dialog (rendered overlay; caller handles tap dispatch)
export function drawConfirmReset(ctx, viewW, viewH, out) {
  out.length = 0;
  ctx.fillStyle = '#000c';
  ctx.fillRect(0, 0, viewW, viewH);
  const w = Math.min(440, viewW * 0.8);
  const h = 180;
  const x = (viewW - w) / 2;
  const y = (viewH - h) / 2;
  ctx.fillStyle = COL.card;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#ff6464';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = COL.text;
  ctx.font = 'bold 20px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Reset all progress?', viewW / 2, y + 50);
  ctx.font = '13px ui-sans-serif, system-ui';
  ctx.fillStyle = COL.textDim;
  ctx.fillText('This wipes stats and weapon/passive discovery.', viewW / 2, y + 76);
  const bw = 130, bh = 40, gap = 12;
  const bx = (viewW - bw * 2 - gap) / 2;
  const by = y + h - 56;
  drawButton(ctx, bx, by, bw, bh, 'Cancel', COL.accentSoft);
  out.push({ id: 'cancel', x: bx, y: by, w: bw, h: bh });
  drawButton(ctx, bx + bw + gap, by, bw, bh, 'Reset', '#ff6464');
  out.push({ id: 'confirmReset', x: bx + bw + gap, y: by, w: bw, h: bh });
}

export function doResetMeta() { resetMeta(); }
