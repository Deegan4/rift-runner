// Card pool: builds a list of currently-eligible cards (weapon next-level or new passive)
// and draws N at random. Reroll-aware.

import { CONFIG } from './config.js';

// Build full pool of eligible cards given current ownership.
function eligibleCards(ownedWeapons, ownedPassives) {
  const out = [];

  for (const id in CONFIG.weapons) {
    const def = CONFIG.weapons[id];
    const lvl = ownedWeapons[id] || 0;
    if (lvl >= def.maxLevel) continue;
    if (lvl === 0) {
      const ownedCount = Object.values(ownedWeapons).filter(v => v > 0).length;
      if (ownedCount >= CONFIG.leveling.maxOwnedWeapons) continue;
    }
    out.push({
      kind: 'weapon',
      id,
      nextLevel: lvl + 1,
      name: prettyName(id),
      desc: lvl === 0 ? 'New weapon' : `Upgrade to Lv ${lvl + 1}`,
    });
  }

  for (const id in CONFIG.passives) {
    const def = CONFIG.passives[id];
    const lvl = ownedPassives[id] || 0;
    if (lvl >= def.maxLevel) continue;
    if (lvl === 0) {
      const ownedCount = Object.values(ownedPassives).filter(v => v > 0).length;
      if (ownedCount >= CONFIG.leveling.maxOwnedPassives) continue;
    }
    out.push({
      kind: 'passive',
      id,
      nextLevel: lvl + 1,
      name: def.name,
      desc: lvl === 0 ? def.desc : `Lv ${lvl + 1}: ${def.desc}`,
    });
  }

  return out;
}

function prettyName(id) {
  return id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

// Pick N cards uniformly from the eligible pool, without duplicates.
export function drawCards(ownedWeapons, ownedPassives, n) {
  const pool = eligibleCards(ownedWeapons, ownedPassives);
  if (pool.length === 0) return [];
  const out = [];
  const taken = new Set();
  const k = Math.min(n, pool.length);
  while (out.length < k) {
    const ix = Math.floor(Math.random() * pool.length);
    if (taken.has(ix)) continue;
    taken.add(ix);
    out.push(pool[ix]);
  }
  return out;
}

// Apply a chosen card. Returns the new ownership maps (mutates in place too).
export function applyCard(card, ownedWeapons, ownedPassives) {
  if (card.kind === 'weapon') {
    ownedWeapons[card.id] = (ownedWeapons[card.id] || 0) + 1;
  } else {
    ownedPassives[card.id] = (ownedPassives[card.id] || 0) + 1;
  }
  return { ownedWeapons, ownedPassives };
}
