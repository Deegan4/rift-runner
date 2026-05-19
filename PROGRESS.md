# Progress

Update this at the end of every Claude Code session. Newest entries at the top.

---

## Milestone status

- [x] **Milestone 0 — Scaffold** (2026-05-18)
  - Repo initialized, PRD + CLAUDE.md in place
  - Empty `index.html`, `src/main.js`, `src/config.js`
  - Player blue circle moves with WASD on a green canvas
  - Debug overlay (` key) shows FPS, time, position
  - Camera follows player, arena bounds drawn
- [x] **Milestone 1 — Movement + auto-fire + one enemy type** (2026-05-18)
  - `utils.js`: free-list `Pool`, `SpatialHash` (cell 64px), math helpers
  - `enemies.js`: zombie pool (cap 800), straight-line chase, off-screen ring spawning, time-scaled HP
  - `weapons.js`: projectile pool, pistol auto-fires at nearest enemy in range, single-target collision via spatial hash
  - `main.js`: contact damage with 0.5s i-frames, HP bar + timer + kill HUD, game-over + R-to-retry, debug overlay extended (enemy/projectile counts, pistol cooldown)
  - Decisions logged: lock-target-at-fire-time, no separation in zombie AI, conservative starter numbers (pistol 10dmg/0.5s, zombie 20hp/80spd/5dmg)
- [x] **Milestone 2 — XP + level up + 3 weapons + 3 passives** (2026-05-18)
  - `gems.js`: pooled XP gems (cap 1500), drop on enemy death, magnet eased fly-to-player once inside pickup radius
  - `passives.js`: `{mult,flat}` stat table, `deriveStats(owned)` re-derives on level-up
  - `weapons.js`: added Orbit Blade (anchored rotating blades, per-enemy hit cooldown) + Shockwave (periodic AoE pulse), `weaponStat(id,key,level)` level-scaling helper, expanding ring visual for shockwave
  - `upgrades.js`: eligible card pool, 3-card random draw, max-owned filter, reroll-aware
  - `main.js`: XP bar (bottom, full-width), level-up screen (3 cards, click or 1/2/3, Q to reroll), weapon icons HUD, ownership state, statTable wired into player moveSpeed/pickupRadius/weaponDamage
  - Decisions logged: card pool uniform-weighted; 1 free reroll per level; conservative starter numbers (Orbit Blade 8dmg/1blade@L1; Shockwave 18dmg/100r/3s; Magnet/PowerCell/Boots 5 levels each)
- [x] **Milestone 3 — 6 weapons, 8 passives, evolutions, 4 enemy types** (2026-05-18)
  - **3 new weapons**: Grenade (lobbed parabolic projectile, AoE on impact), Beam (instant line damage at angle, pierces), Spirit Wolf (persistent minion entity with chase AI + per-enemy hit cooldown)
  - **All 6 evolutions**: pistol+ReloadKit→Auto-Rifle (3-round burst), orbit+Magnet→Whirlwind (4 blades), shockwave+PowerCell→Nova (chain lightning), grenade+Demolition→Cluster Bomb (5 secondary blasts), beam+FocusLens→Death Ray (longer/wider/stronger), wolf+PackTactics→Wolf Pack (3 baseline wolves)
  - **5 new passives**: Reload Kit (fire rate), Demolition (AoE radius), Focus Lens (proj speed + pierce), Pack Tactics (minion count), Vitality (+max HP + regen)
  - **3 new enemy types**: Runner (fast chase), Tank (slow + high HP + dark outline), Shooter (kite AI + ranged projectiles)
  - **New pools**: `minionPool`, `explosionPool`, `beamPool`, `enemyProjectilePool`
  - `passives.js`: refactored to support multi-effect passives (Vitality affects 2 stats), 10 stat keys total
  - `enemies.js`: time-weighted spawn table, per-type AI dispatch (chase vs kite), shooter projectile spawning
  - `weapons.js`: each weapon family is one update function (`updateOrbitalWeapon`, `updateRadialWeapon`, `updateGrenadeWeapon`, `updateBeamWeapon`, `updateSpiritWolfWeapon`) shared between base and evolved variants
  - `upgrades.js`: evolution eligibility detection, evolution cards force-included in draw pool, distinct gold styling
  - `main.js`: HP regen tick (Vitality), max-HP scaling with proportional heal on pickup, enemy-projectile player damage path, evolution badge in HUD
  - Verified: 0 syntax errors across 9 modules, 0 console errors in headless preview
- [ ] Milestone 4 — Bosses + elites + scaling (MVP complete)
- [ ] Milestone 5 — Meta-progression + main menu + 5 heroes
- [ ] Milestone 6 — Polish: SFX, music, screen shake, damage numbers, particles
- [ ] Milestone 7 — Balance pass, playtesting, bug fixes

---

## Session log

### 2026-05-18 — Milestone 3 complete
- Added 3 weapons (Grenade, Beam, Spirit Wolf), 5 passives, 3 enemy types, 6 evolutions, enemy projectiles, HP regen, minion pool, explosion pool, beam pool
- `passives.js` refactored to support multi-effect passives (Vitality bumps maxHp AND adds regen)
- Each weapon family reuses one update function across base + evolved (e.g. `updateOrbitalWeapon` powers both orbit blade and whirlwind)
- Evolution unlocks force-included in card draw so the player never misses them
- All 9 modules syntax-clean, 0 console errors in headless preview
- **Next session:** Milestone 4 — bosses + elites + scaling tuning. MVP complete after M4. Acceptance criteria from PRD §13 mostly already met (6+ weapons ✓, 8 passives ✓, evolutions ✓, scaling enemies ✓), needs boss + multi-phase fight at minute 5.

### 2026-05-18 — Mobile MVP (cross-cutting, addresses PRD §10 mobile acceptance)
- Added `input.js`: Pointer Event-based spawn-on-touch joystick in the left half of screen, with tap detection for buttons (cards / reroll / retry)
- `main.js`: DPR-aware canvas (retina iPad now crisp), responsive HUD scaling, level-up cards stack vertically on viewports <720px, weapon icons moved to top-right out of joystick zone, tap-to-retry on game over
- Movement abstraction: `moveVector()` returns joystick-or-keyboard normalized direction; mouse drag inherits via Pointer Events
- Tested headlessly in Claude Preview: DPR=2 detected, no console errors, joystick state surfaces in debug overlay

### 2026-05-18 — Milestone 2 complete
- Added `gems.js`, `passives.js`, `upgrades.js`; extended `config.js`, `weapons.js`, `enemies.js`, `main.js`
- Full level-up loop works: kill → gem → magnet pickup → XP bar fills → freeze + 3-card screen → pick → resume
- Stat layer is the foundation for M3 evolutions (just chain "weapon X at L5 + passive Y owned → swap to evolved id")
- **Next session:** Milestone 3 — 6 weapons, 8 passives, evolutions, 4 enemy types

### 2026-05-18 — Milestone 1 complete
- Added `utils.js`, `enemies.js`, `weapons.js`; extended `config.js` and `main.js`
- Architecture done up-front per PRD §14.2: object pooling + spatial hash before second enemy type
- Pistol auto-fires every 0.5s at nearest enemy within 600px, kills zombies in 2 hits at t=0
- Contact damage with i-frames; game-over + retry loop works
- **Next session:** Milestone 2 — XP gems (drop on death, magnet-fly within pickup radius), level-up cards, 2 more weapons, 3 passives

### 2026-05-18 — Initial scaffold
- Created repo, PRD, CLAUDE.md, config.js, runnable main.js
- Player moves on screen. Ready for milestone 1.
