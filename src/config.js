// All tunable game constants live here. Do not hardcode these inline anywhere else.
// Ask Kollin before changing balance values.

export const CONFIG = {
  // ---- Arena ----
  arena: {
    width: 1500,
    height: 1500,
  },

  // ---- Player ----
  player: {
    startHp: 100,
    moveSpeed: 200,        // px/sec
    pickupRadius: 60,      // px
    armor: 0,
    critChance: 0.05,
    critMult: 1.5,
    radius: 12,            // collision radius
    iframesSec: 0.5,       // invulnerability after taking contact damage
  },

  // ---- XP / leveling ----
  xp: {
    baseXpToLevel: 100,
    curveExponent: 1.15,
    gemValues: { blue: 1, green: 5, red: 25 },
  },

  // ---- Enemy scaling (time-based, not level-based) ----
  enemies: {
    spawnIntervalStart: 1.0,
    spawnIntervalMin: 0.05,
    spawnIntervalDecayPerMin: 0.15,
    hpScalePerMin: 0.25,
    eliteIntervalSec: 60,
    bossSpawnMinutes: [5, 10, 15, 20],
    spawnOffscreenMargin: 80,
    maxAlive: 600,
  },

  // ---- Enemy types ----
  // ai: 'chase' (zombie/runner/tank) or 'kite' (shooter)
  // gemTier: which XP gem this enemy drops on death
  enemyTypes: {
    zombie:  { hp: 20, moveSpeed: 80,  radius: 12, contactDamage: 5,  color: '#7da046', xpDropChance: 1.0, gemTier: 'blue',  ai: 'chase' },
    runner:  { hp: 12, moveSpeed: 160, radius: 10, contactDamage: 6,  color: '#e07a3a', xpDropChance: 1.0, gemTier: 'blue',  ai: 'chase' },
    tank:    { hp: 80, moveSpeed: 50,  radius: 18, contactDamage: 10, color: '#5a4a8a', xpDropChance: 1.0, gemTier: 'green', ai: 'chase' },
    shooter: {
      hp: 25, moveSpeed: 70, radius: 11, contactDamage: 4, color: '#c8d850',
      xpDropChance: 1.0, gemTier: 'blue', ai: 'kite',
      // Kite params: stays in [range*0.7, range], fires periodically.
      range: 350, fireCooldownSec: 2.0,
      projectileSpeed: 280, projectileDamage: 8, projectileRadius: 5,
      projectileColor: '#ffd089', projectileLifetimeSec: 2.5,
    },
  },

  // ---- Spawn weight table (time-based progression) ----
  // Pick most-recent entry whose `time` <= elapsed seconds, then weighted-sample.
  enemySpawnTable: [
    { time: 0,   weights: { zombie: 1.0 } },
    { time: 60,  weights: { zombie: 0.6, runner: 0.4 } },
    { time: 120, weights: { zombie: 0.4, runner: 0.4, tank: 0.2 } },
    { time: 180, weights: { zombie: 0.3, runner: 0.3, tank: 0.2, shooter: 0.2 } },
    { time: 300, weights: { zombie: 0.2, runner: 0.3, tank: 0.25, shooter: 0.25 } },
  ],

  // ---- Weapons ----
  // levelN value = base[key] + perLevel[key] * (N - 1)
  weapons: {
    // ---- Base weapons ----
    pistol: {
      maxLevel: 8,
      base: { damage: 10, cooldownSec: 0.5, projectileSpeed: 600, projectileRadius: 4, projectileLifetimeSec: 1.2, range: 600, color: '#ffd76b' },
      perLevel: { damage: 4, cooldownSec: -0.04 },
    },
    orbitBlade: {
      maxLevel: 8,
      base: { bladeCount: 1, orbitRadius: 80, rotateSpeed: Math.PI * 2, bladeRadius: 14, damage: 8, hitCooldownSec: 0.4, color: '#b8e0ff' },
      perLevel: { damage: 3 },
      bladeAtLevel: [1, 1, 2, 2, 3, 3, 3, 3],
    },
    shockwave: {
      maxLevel: 8,
      base: { radius: 100, damage: 18, intervalSec: 3.0, color: '#7be0c8' },
      perLevel: { radius: 12, damage: 4, intervalSec: -0.12 },
    },
    grenade: {
      maxLevel: 8,
      base: {
        damage: 24, cooldownSec: 2.0,
        projectileSpeed: 350, projectileLifetimeSec: 1.0, projectileRadius: 6,
        aoeRadius: 80, range: 500, arcHeight: 60,
        color: '#d8843a',
      },
      perLevel: { damage: 6, aoeRadius: 6, cooldownSec: -0.08 },
    },
    beam: {
      maxLevel: 8,
      base: {
        damage: 12, intervalSec: 1.5,
        length: 700, halfWidth: 12, range: 700,
        visualDurationSec: 0.18,
        color: '#ff7adc',
      },
      perLevel: { damage: 4, halfWidth: 1, intervalSec: -0.07 },
    },
    spiritWolf: {
      maxLevel: 8,
      base: {
        damage: 14, hitCooldownSec: 0.5,
        moveSpeed: 200, radius: 10,
        baseCount: 1, color: '#cfd5ff',
      },
      perLevel: { damage: 4, moveSpeed: 8 },
      // Extra wolves added at these levels (cumulative): L1 base=1, then +1 at each listed level.
      extraWolfAtLevel: [4, 7], // L4 → 2 wolves, L7 → 3 wolves
    },

    // ---- Evolved weapons (only obtainable via evolution path) ----
    autoRifle: {
      maxLevel: 1, evolution: true,
      base: { damage: 22, cooldownSec: 0.6, burstCount: 3, burstIntervalSec: 0.06,
              projectileSpeed: 700, projectileRadius: 4, projectileLifetimeSec: 1.2, range: 700, color: '#ffe080' },
    },
    whirlwind: {
      maxLevel: 1, evolution: true,
      base: { bladeCount: 4, orbitRadius: 130, rotateSpeed: Math.PI * 2.5, bladeRadius: 18,
              damage: 18, hitCooldownSec: 0.3, color: '#d0eaff' },
    },
    nova: {
      maxLevel: 1, evolution: true,
      base: { radius: 180, damage: 40, intervalSec: 2.4,
              chainCount: 4, chainRange: 220, chainFalloff: 0.7,
              color: '#a0ffe6' },
    },
    clusterBomb: {
      maxLevel: 1, evolution: true,
      base: { damage: 36, cooldownSec: 1.6,
              projectileSpeed: 350, projectileLifetimeSec: 1.0, projectileRadius: 6,
              aoeRadius: 100, range: 550, arcHeight: 60,
              childCount: 5, childAoeRadius: 60, childDamageFrac: 0.6,
              color: '#ff9c4a' },
    },
    deathRay: {
      maxLevel: 1, evolution: true,
      base: { damage: 30, intervalSec: 0.8,
              length: 1000, halfWidth: 22, range: 1000,
              visualDurationSec: 0.25,
              color: '#ff4bd0' },
    },
    wolfPack: {
      maxLevel: 1, evolution: true,
      base: { damage: 24, hitCooldownSec: 0.35,
              moveSpeed: 240, radius: 11,
              baseCount: 3, color: '#e8edff' },
    },
  },

  // ---- Evolution table ----
  // baseId + paired passive (any level) + base weapon at evolutionMinLevel → evolved id
  evolutions: {
    pistol:     { evolvesTo: 'autoRifle',   requires: 'reloadKit',   minLevel: 5 },
    orbitBlade: { evolvesTo: 'whirlwind',   requires: 'magnet',      minLevel: 5 },
    shockwave:  { evolvesTo: 'nova',        requires: 'powerCell',   minLevel: 5 },
    grenade:    { evolvesTo: 'clusterBomb', requires: 'demolition',  minLevel: 5 },
    beam:       { evolvesTo: 'deathRay',    requires: 'focusLens',   minLevel: 5 },
    spiritWolf: { evolvesTo: 'wolfPack',    requires: 'packTactics', minLevel: 5 },
  },

  // ---- Passives ----
  // Each passive declares `effects: [{stat, mult?, flat?}]`. Per-level multipliers/flats
  // accumulate: e.g. Magnet L3 → pickupRadius mult = 1 + 0.50*3 = 2.5x.
  passives: {
    magnet:      { maxLevel: 5, name: 'Magnet',       desc: '+50% pickup radius',           effects: [{ stat: 'pickupRadius', mult: 0.50 }] },
    powerCell:   { maxLevel: 5, name: 'Power Cell',   desc: '+15% weapon damage',           effects: [{ stat: 'weaponDamage', mult: 0.15 }] },
    boots:       { maxLevel: 5, name: 'Boots',        desc: '+10% move speed',              effects: [{ stat: 'moveSpeed',    mult: 0.10 }] },
    reloadKit:   { maxLevel: 5, name: 'Reload Kit',   desc: '+15% fire rate',               effects: [{ stat: 'weaponFireRate', mult: 0.15 }] },
    demolition:  { maxLevel: 5, name: 'Demolition',   desc: '+15% AoE radius',              effects: [{ stat: 'weaponArea',   mult: 0.15 }] },
    focusLens:   { maxLevel: 5, name: 'Focus Lens',   desc: '+20% projectile speed, +1 pierce', effects: [{ stat: 'weaponProjectileSpeed', mult: 0.20 }, { stat: 'weaponPierce', flat: 1 }] },
    packTactics: { maxLevel: 5, name: 'Pack Tactics', desc: '+1 minion',                    effects: [{ stat: 'minionCount', flat: 1 }] },
    vitality:    { maxLevel: 5, name: 'Vitality',     desc: '+10% max HP, +1 HP/s regen',   effects: [{ stat: 'maxHp', mult: 0.10 }, { stat: 'regen', flat: 1 }] },
  },

  // ---- Leveling ----
  leveling: {
    maxOwnedWeapons: 6,
    maxOwnedPassives: 6,
    cardsPerLevel: 3,
    freeRerollsPerLevel: 1,
    startingWeapon: 'pistol',
  },

  // ---- Pools (preallocated sizes) ----
  pools: {
    enemies: 800,
    projectiles: 400,         // player projectiles
    enemyProjectiles: 200,    // shooter bullets
    gems: 1500,
    minions: 16,              // spirit wolves
    explosions: 32,           // grenade AoE rings (visual + damage zones)
    beams: 8,                 // beam visual ribbons
  },

  // ---- Visual effects (pure render, no gameplay impact) ----
  effects: {
    particles: 600,           // particle pool — generous; dust burst on enemy death is ~25 particles
    damageNumbers: 150,       // floating damage text pool
  },

  // ---- Gems ----
  gems: {
    radius: 5,
    magnetEase: 8,
    magnetMinSpeed: 250,
  },

  // ---- Run length ----
  run: {
    maxDurationSec: 20 * 60,
  },

  // ---- Rendering / perf ----
  render: {
    targetFps: 60,
    spatialHashCellSize: 64,
  },

  // ---- Debug ----
  debug: {
    toggleKey: '`',
    startVisible: true,
  },
};
