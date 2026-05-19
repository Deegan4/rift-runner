// Passive stat system. Each passive declares an array of `effects`, each effect being
// {stat, mult?, flat?}. Per-level contributions accumulate.
// Effective value: base * slot.mult + slot.flat.

import { CONFIG } from './config.js';

// Canonical stat keys. Anything in config.passives[*].effects[*].stat must be in this list.
export const STAT_KEYS = [
  // Player-affecting
  'pickupRadius', 'moveSpeed', 'maxHp', 'regen',
  // Weapon-affecting (all weapons multiply through these)
  'weaponDamage', 'weaponFireRate', 'weaponArea',
  'weaponProjectileSpeed', 'weaponPierce',
  // Minion-affecting
  'minionCount',
];

export function freshStatTable() {
  const t = {};
  for (const k of STAT_KEYS) t[k] = { mult: 1, flat: 0 };
  return t;
}

export function deriveStats(ownedPassives) {
  const table = freshStatTable();
  for (const id in ownedPassives) {
    const level = ownedPassives[id];
    if (level <= 0) continue;
    const def = CONFIG.passives[id];
    if (!def || !def.effects) continue;
    for (const fx of def.effects) {
      const slot = table[fx.stat];
      if (!slot) continue;
      if (fx.mult) slot.mult += fx.mult * level;
      if (fx.flat) slot.flat += fx.flat * level;
    }
  }
  return table;
}

export const applyStat = (base, slot) => base * slot.mult + slot.flat;
