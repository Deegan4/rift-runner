// Passive stat system. Each passive bumps a named stat by a multiplier per level.
// Effective stat = base * (1 + sum_of_mults). No flat adds in M2 (PRD examples are all percentages).

import { CONFIG } from './config.js';

// Stat names. Keep this list in sync with config.passives[*].stat.
export const STATS = {
  pickupRadius: 'pickupRadius',
  weaponDamage: 'weaponDamage',
  moveSpeed: 'moveSpeed',
};

export function freshStatTable() {
  return {
    pickupRadius: { mult: 1, flat: 0 },
    weaponDamage: { mult: 1, flat: 0 },
    moveSpeed:    { mult: 1, flat: 0 },
  };
}

// Recompute the entire stat table from current passive levels.
// Cheap (3 entries × <= 5 levels) and predictable; we call it on level-up only.
export function deriveStats(ownedPassives) {
  const table = freshStatTable();
  for (const id in ownedPassives) {
    const level = ownedPassives[id];
    const def = CONFIG.passives[id];
    if (!def) continue;
    const slot = table[def.stat];
    if (!slot) continue;
    slot.mult += def.mult * level;
  }
  return table;
}

// Apply a stat to a base value: base * mult + flat.
export const applyStat = (base, slot) => base * slot.mult + slot.flat;
