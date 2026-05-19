// Card pool: builds eligible cards (weapon next-level, new passive, OR evolution) and draws N at random.
// Evolutions are always offered when their criteria are met (force-include before random draw),
// so the player never misses a chance to evolve.

import { CONFIG } from './config.js';

function prettyName(id) {
  // Custom names first; fallback to id-with-spaces
  const NAMES = {
    autoRifle: 'Auto-Rifle',
    whirlwind: 'Whirlwind',
    nova: 'Nova',
    clusterBomb: 'Cluster Bomb',
    deathRay: 'Death Ray',
    wolfPack: 'Wolf Pack',
    orbitBlade: 'Orbit Blade',
    spiritWolf: 'Spirit Wolf',
  };
  if (NAMES[id]) return NAMES[id];
  return id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

function evolvedDesc(baseId, evoId) {
  const map = {
    autoRifle:   '3-round burst, much higher damage',
    whirlwind:   '4 blades, larger radius, faster spin',
    nova:        'Chain lightning to nearby enemies',
    clusterBomb: 'Spawns 5 secondary explosions',
    deathRay:    'Longer, wider, far more damage',
    wolfPack:    '3 baseline wolves, faster + meaner',
  };
  return map[evoId] || 'Powerful evolved form';
}

// Detect evolutions the player can claim right now.
// A base weapon at level >= evo.minLevel + paired passive owned (any level)
// AND the evolved id not already owned.
function eligibleEvolutions(ownedWeapons, ownedPassives) {
  const out = [];
  for (const baseId in CONFIG.evolutions) {
    const evo = CONFIG.evolutions[baseId];
    const baseLvl = ownedWeapons[baseId] || 0;
    const passiveLvl = ownedPassives[evo.requires] || 0;
    const evolvedLvl = ownedWeapons[evo.evolvesTo] || 0;
    if (baseLvl >= evo.minLevel && passiveLvl > 0 && evolvedLvl === 0) {
      out.push({
        kind: 'evolution',
        id: evo.evolvesTo,
        baseId,
        nextLevel: 1,
        name: prettyName(evo.evolvesTo),
        desc: evolvedDesc(baseId, evo.evolvesTo),
      });
    }
  }
  return out;
}

function eligibleNormal(ownedWeapons, ownedPassives) {
  const out = [];

  for (const id in CONFIG.weapons) {
    const def = CONFIG.weapons[id];
    if (def.evolution) continue; // evolved weapons never appear as normal cards
    const lvl = ownedWeapons[id] || 0;
    if (lvl >= def.maxLevel) continue;
    if (lvl === 0) {
      const ownedCount = Object.values(ownedWeapons).filter(v => v > 0).length;
      if (ownedCount >= CONFIG.leveling.maxOwnedWeapons) continue;
    }
    out.push({
      kind: 'weapon',
      id, nextLevel: lvl + 1,
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
      id, nextLevel: lvl + 1,
      name: def.name,
      desc: lvl === 0 ? def.desc : `Lv ${lvl + 1}: ${def.desc}`,
    });
  }

  return out;
}

// Draw N cards. Evolutions are prepended (up to N) so the player always sees them when available.
export function drawCards(ownedWeapons, ownedPassives, n) {
  const evos = eligibleEvolutions(ownedWeapons, ownedPassives);
  const out = [];

  // Show all available evolutions, up to N
  for (let i = 0; i < evos.length && out.length < n; i++) out.push(evos[i]);
  if (out.length >= n) return out;

  // Fill remaining slots from normal pool, no duplicates against already-picked
  const pool = eligibleNormal(ownedWeapons, ownedPassives);
  if (pool.length === 0) return out;
  const taken = new Set();
  // Track already-picked weapon/passive ids to avoid duplicates with evolution slots
  for (const c of out) taken.add(c.kind + ':' + c.id);

  const remaining = n - out.length;
  let tries = 0;
  while (out.length < n && tries < pool.length * 4) {
    const ix = Math.floor(Math.random() * pool.length);
    const cand = pool[ix];
    const key = cand.kind + ':' + cand.id;
    if (!taken.has(key)) { taken.add(key); out.push(cand); }
    tries++;
  }
  return out;
}

// Apply a chosen card.
// Evolutions: zero out the base weapon, set evolved to L1.
export function applyCard(card, ownedWeapons, ownedPassives) {
  if (card.kind === 'evolution') {
    ownedWeapons[card.baseId] = 0;
    ownedWeapons[card.id] = 1;
  } else if (card.kind === 'weapon') {
    ownedWeapons[card.id] = (ownedWeapons[card.id] || 0) + 1;
  } else {
    ownedPassives[card.id] = (ownedPassives[card.id] || 0) + 1;
  }
  return { ownedWeapons, ownedPassives };
}
