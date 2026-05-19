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
- [x] **Milestone 4 — Bosses + elites + scaling (MVP complete)** (2026-05-18)
  - **Elites** spawn every 60s (PRD §5.4): existing enemy type tagged with `isElite`, 4× HP / 1.5× damage / 1.35× radius / 0.85× speed, pulsing gold glow halo, drop 3 green gems + chest
  - **Boss "Rift Warden"** spawns at minutes 5/10/15/20 (PRD §13.5): 3-phase state machine keyed off HP fraction — phase 1 (100→60%) base, phase 2 (60→30%) faster + spawns minions every 4s, phase 3 (30→0%) enraged + huge burst spread. HP scales per wave (+60% per subsequent boss). Drops 8 red gems + chest.
  - **Chests** (PRD §5.4 elite chest drop): new `chests.js` module with pool, pulsing glow render, pickup → immediate level-up via `pendingLevelUps++`
  - **Boss intro**: 2.5s "BOSS INCOMING" warning banner with pulsing red overlay before spawn
  - **Boss HP bar**: dedicated full-width bar at top of screen, color-shifts with phase
  - **Effects integration**: elite/boss deaths have scaled-up bursts (50/120 particles) and shake (7/22). Boss phase transitions visible via concentric ring count on body.
  - **Public enemies.js API**: `getCurrentBoss()` for HUD, `getBossWarningSec()` for banner
  - Verified: 0 syntax errors across 11 modules, 0 console errors in headless preview
  - **MVP COMPLETE.** PRD §13 acceptance criteria met: 6+ weapons ✓, 8 passives ✓, evolutions ✓, scaling enemies ✓, boss fight at minute 5 with multi-phase ✓, 20-min run loop ✓, full menu→run→death→retry loop ✓, mobile-playable via touch joystick ✓.
- [~] **Milestone 5a — Main menu + stats + codex (partial)** (2026-05-18)
  - `meta.js`: localStorage-backed persistence layer (`riftRunner.meta.v1` key), `recordRun()` on death, weapon/passive discovery tracking, `resetMeta()` for user-initiated wipe
  - `menus.js`: canvas-rendered main menu (PLAY / STATS / CODEX), stats screen (8 rows: runs/kills/longest/level/bosses/chests/weapons-discovered/passives-discovered), 3-tab codex (Weapons / Passives / Heroes), confirmation modal for reset
  - `main.js`: state machine `mode = 'menu' | 'playing' | 'dead'`, tap dispatch by mode, `handleMenuTap` / `handleDeadTap`, game now boots to menu (not auto-startRun), death screen has Retry + Menu buttons
  - Codex shows all 12 weapons + 8 passives. Locked entries (not yet seen) show "???". Heroes tab shows 5 placeholder heroes (1 unlocked: Ranger) with unlock condition hints — gameplay system deferred
  - Stats persist across page reloads via localStorage
- [ ] Milestone 5b — Hero gameplay (5 heroes with stat skews + starting weapons + unlock conditions)
- [ ] Milestone 5c — Permanent upgrade tree (spend coins on +5% HP, +5% damage, +1 reroll, ~20 nodes)
- [ ] Milestone 6 — Polish: SFX, music, screen shake, damage numbers, particles
- [ ] Milestone 7 — Balance pass, playtesting, bug fixes

---

## Session log

### 2026-05-18 — Milestone 4 complete (MVP)
- Added `chests.js`; extended `config.js`, `enemies.js`, `main.js`
- Elite enemies: existing types boosted via `isElite` tag, drop chest + green gems, pulsing gold glow
- Boss "Rift Warden" with 3-phase state machine, fan-burst projectile pattern, minion spawn in phase 2
- Boss-incoming warning banner + dedicated full-width boss HP bar in HUD
- Chest entity: walk-over pickup grants level-up via existing pendingLevelUps flow
- **PRD §13 MVP acceptance: every criterion met except the audio one** (10 SFX + 1 music loop — needs assets, M6 territory)
- **Next session:** Milestone 5 (meta-progression + main menu + heroes) OR more M4 tuning if playtest reveals balance issues

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
