// Cross-run persistence. localStorage-backed stats + unlocks.
// Schema version bump (META_KEY change) wipes old data — keep migrations in mind.

const META_KEY = 'riftRunner.meta.v1';

function defaultMeta() {
  return {
    runs: 0,
    totalKills: 0,
    longestRunSec: 0,
    highestLevel: 1,
    bossesKilled: 0,
    chestsOpened: 0,
    // Weapon discovery: set of weapon ids the player has owned at least once
    weaponsSeen: [],
    passivesSeen: [],
  };
}

let cache = null;

export function loadMeta() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) { cache = defaultMeta(); return cache; }
    const parsed = JSON.parse(raw);
    // Forward-compatible: merge missing keys from default
    cache = Object.assign(defaultMeta(), parsed);
  } catch {
    cache = defaultMeta();
  }
  return cache;
}

export function saveMeta() {
  if (!cache) return;
  try {
    localStorage.setItem(META_KEY, JSON.stringify(cache));
  } catch {
    // Quota / private browsing: silent — meta is best-effort, never blocks gameplay
  }
}

// Record a completed run. Called from main.js on death.
export function recordRun({ kills, durationSec, level, bossesKilled, chestsOpened, ownedWeapons, ownedPassives }) {
  const m = loadMeta();
  m.runs++;
  m.totalKills += kills || 0;
  m.bossesKilled += bossesKilled || 0;
  m.chestsOpened += chestsOpened || 0;
  if (durationSec > m.longestRunSec) m.longestRunSec = durationSec;
  if (level > m.highestLevel) m.highestLevel = level;
  // Merge discovery sets
  const wSet = new Set(m.weaponsSeen);
  for (const id in ownedWeapons || {}) if (ownedWeapons[id] > 0) wSet.add(id);
  m.weaponsSeen = [...wSet];
  const pSet = new Set(m.passivesSeen);
  for (const id in ownedPassives || {}) if (ownedPassives[id] > 0) pSet.add(id);
  m.passivesSeen = [...pSet];
  saveMeta();
}

export function hasSeenWeapon(id) { return loadMeta().weaponsSeen.includes(id); }
export function hasSeenPassive(id) { return loadMeta().passivesSeen.includes(id); }

// Reset all meta data (e.g. user-initiated "clear progress" button)
export function resetMeta() {
  cache = defaultMeta();
  saveMeta();
}
