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
    curveExponent: 1.15,   // xpToLevel = base * curveExponent^level
    gemValues: { blue: 1, green: 5, red: 25 },
  },

  // ---- Enemy scaling (time-based, not level-based) ----
  enemies: {
    spawnIntervalStart: 1.0,  // seconds between spawns at t=0
    spawnIntervalMin: 0.05,   // floor
    spawnIntervalDecayPerMin: 0.15, // interval *= (1 - decay) per minute
    hpScalePerMin: 0.25,      // enemy hp *= (1 + scale * minutesElapsed)
    eliteIntervalSec: 60,
    bossSpawnMinutes: [5, 10, 15, 20],
    spawnOffscreenMargin: 80, // spawn this far outside the camera viewport
    maxAlive: 600,            // safety cap; spawner skips when reached
  },

  // ---- Enemy types (milestone 1: zombie only) ----
  enemyTypes: {
    zombie: {
      hp: 20,
      moveSpeed: 80,        // px/sec
      radius: 12,
      contactDamage: 5,
      color: '#7da046',
      xpDropChance: 1.0,    // probability to drop an XP gem on death (gems land in M2)
    },
  },

  // ---- Weapons ----
  // Per-level deltas are flat additions on top of base. levelN = base + perLevel*(N-1).
  weapons: {
    pistol: {
      maxLevel: 8,
      base: {
        damage: 10,
        cooldownSec: 0.5,
        projectileSpeed: 600,
        projectileRadius: 4,
        projectileLifetimeSec: 1.2,
        range: 600,
        color: '#ffd76b',
      },
      perLevel: { damage: 4, cooldownSec: -0.04 },
    },
    orbitBlade: {
      maxLevel: 8,
      base: {
        bladeCount: 1,
        orbitRadius: 80,       // px from player
        rotateSpeed: Math.PI * 2,  // rad/sec (1 rotation per sec)
        bladeRadius: 14,
        damage: 8,
        hitCooldownSec: 0.4,   // per-enemy cooldown to avoid 60-hits-per-second insta-kills
        color: '#b8e0ff',
      },
      perLevel: { damage: 3 },
      // Adding a blade every other level keeps the spinner readable.
      bladeAtLevel: [1, 1, 2, 2, 3, 3, 3, 3],
    },
    shockwave: {
      maxLevel: 8,
      base: {
        radius: 100,
        damage: 18,
        intervalSec: 3.0,
        color: '#7be0c8',
      },
      perLevel: { radius: 12, damage: 4, intervalSec: -0.12 },
    },
  },

  // ---- Passives (apply via stat modifier layer in passives.js) ----
  passives: {
    magnet:    { maxLevel: 5, name: 'Magnet',     desc: '+50% pickup radius',  stat: 'pickupRadius', mult: 0.50 },
    powerCell: { maxLevel: 5, name: 'Power Cell', desc: '+15% weapon damage',  stat: 'weaponDamage', mult: 0.15 },
    boots:     { maxLevel: 5, name: 'Boots',      desc: '+10% move speed',     stat: 'moveSpeed',    mult: 0.10 },
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
    projectiles: 400,
    gems: 1500,             // many gems can pile up before pickup-radius catches up
  },

  // ---- Gems ----
  gems: {
    radius: 5,
    magnetEase: 8,         // higher = snappier fly-to-player (exp lerp factor)
    magnetMinSpeed: 250,   // floor speed once magneted, px/s
  },

  // ---- Run length ----
  run: {
    maxDurationSec: 20 * 60, // 20 minutes
  },

  // ---- Rendering / perf ----
  render: {
    targetFps: 60,
    spatialHashCellSize: 64,
  },

  // ---- Debug ----
  debug: {
    toggleKey: '`',          // tilde
    startVisible: true,      // helpful during milestone 1 — flip back to false later
  },
};
