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

  // ---- Weapons (milestone 1: pistol only) ----
  weapons: {
    pistol: {
      damage: 10,
      cooldownSec: 0.5,
      projectileSpeed: 600,
      projectileRadius: 4,
      projectileLifetimeSec: 1.2,
      range: 600,           // don't fire if no enemy within this radius
      color: '#ffd76b',
    },
  },

  // ---- Pools (preallocated sizes) ----
  pools: {
    enemies: 800,
    projectiles: 400,
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
