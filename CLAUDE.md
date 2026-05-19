# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Rift Runner** — a survivors-like / bullet-heaven game. Single-page HTML5 + Canvas, vanilla JS, ES modules, no build step. See `PRD.md` for full spec, `PROGRESS.md` for current state.

## Commands

This project has no `npm install`, no build, no test framework, no linter. Everything is run from a static file server because ES modules require HTTP (not `file://`).

```sh
# Run the game (foreground, blocks the terminal until Ctrl+C)
python3 -m http.server 8080

# Run with LAN binding so an iPad / phone on the same WiFi can connect
python3 -m http.server 8080 --bind 0.0.0.0
# then on the device: http://<your-mac-LAN-IP>:8080/
# find the IP: ipconfig getifaddr en0
```

Then open `http://localhost:8080/`. **Sandboxed environments (some agent runners, IDE preview tools) may bind to a namespace your host browser can't reach** — if `localhost:8080` is unreachable from your real browser but `curl` works, start the server from a real Terminal window instead.

Syntax-check all modules without running them:
```sh
for f in src/*.js; do node --check "$f"; done
```

There is no test framework. Verification is manual playtesting: open the page, confirm FPS stays at 60 via the debug overlay (` key), check browser console for zero errors.

## Non-negotiable rules

1. **Read `PRD.md` before any work.** All scope, milestones, and acceptance criteria live there. Do not deviate without asking.
2. **No frameworks or build tools without approval.** Vanilla JS + Canvas only. If you think we need Phaser, PixiJS, Vite, TypeScript, or anything else — stop and ask first, with a concrete reason (perf number, specific bug, etc.).
3. **No new dependencies in `package.json` without approval.** `npm install` requires sign-off.
4. **All tunable numbers go in `src/config.js`.** Never hardcode damage, HP, speed, spawn rates, XP curves inline. Surface them as constants in config.
5. **Object pool everything in the hot loop.** Enemies, projectiles, XP gems, damage numbers, particles. Never `new` an object per frame.
6. **Use the spatial hash for collisions.** Never n² loops over all entities. `utils.js` has the grid.
7. **One milestone per commit minimum.** Milestones defined in PRD §10. Commit message format: `milestone N: <description>`.

## Architecture

### Per-frame data flow

The game loop is in `src/main.js`. Every frame:

```
moveVector()        — input.js returns {dx,dy} from joystick OR keyboard
update()
  player position   — applies stat-modified moveSpeed
  updateEnemies()   — spawn, AI, then REBUILDS the spatial hash
  updateWeapons()   — fires weapons, moves/collides projectiles using the hash
  updateGems()      — magnet pull within stat-modified pickupRadius
  contact damage    — player vs enemy circles
  pool.compact()    — drops dead entries from each pool's active list
render()            — paints background → gems → enemies → weapons → player → HUD → joystick → overlays
```

**Order in `update()` is load-bearing.** Enemies rebuild the spatial hash; weapons query it. Swap them and weapons fire at last-frame positions.

### Two cross-cutting layers

These are the abstractions that make new content (weapons, passives, enemies) cheap to add:

- **`utils.js`** — `Pool` (free-list, `alive` flag, `compact()` after frame) and `SpatialHash` (rebuilt per frame, queried by circle). Every entity class has its own pool and uses the shared `enemyHash` for queries.
- **`passives.js`** — `deriveStats(ownedPassives)` returns a stat table of `{mult, flat}` pairs. Weapons and player movement multiply their base values through this table. **Recompute only on level-up, not per frame.** This indirection is also what makes M3 weapon evolutions nearly free.

### Module boundaries

- `config.js` — single source of truth for tunable numbers. `base + perLevel*(N-1)` is the convention for level-scaled weapon stats; passive scaling is `mult * level`.
- `enemies.js` — enemy types live here, plus `spawnGem(...)` is called on death. Time-based HP scaling (not level-based) is intentional per PRD §5.4.
- `weapons.js` — each weapon is its own `updateXxx()` function. `weaponStat(id, key, level)` reads the level-scaled stat. Three patterns currently: projectile (pistol), anchored-spinner with per-enemy hit cooldown (orbit blade), periodic-AoE (shockwave). New weapons should fit one of these or be a fourth named pattern.
- `gems.js` — magnet eases *velocity* toward the player, not position. That's what gives the satisfying snap; don't switch to position lerp.
- `upgrades.js` — eligibility filter (ownership cap + max level) feeds uniform random draw. If you weight cards later, do it here.
- `input.js` — Pointer Events unify mouse + touch + pen. `moveVector()` is the single read-point for movement. `setTapHandler()` registers a callback for level-up card / reroll / retry taps. Joystick is spawn-on-touch in the left half of the screen.
- `main.js` — game loop, state, HUD, level-up screen. **DPR-aware**: all gameplay code uses logical pixels (`viewW`, `viewH`); the canvas backing store is scaled to `devicePixelRatio` once in `resize()`.

### State conventions

- **Pool references are not stable across frames.** Free-list slots are reused. Don't hold an enemy reference past `compact()`. The orbit blade's per-enemy hit-cooldown `Map` works around this by pruning keys whose `alive` is false each tick.
- **Owned weapons/passives** live on `state.ownedWeapons` and `state.ownedPassives` as `id -> level` maps. Level 0 = not owned. `state.statTable` is the rebuilt cache from `deriveStats()`.
- **Pause is a single boolean.** When `state.paused` is true (level-up screen open), `update()` returns early but `render()` keeps drawing.

## Code style

- ES modules (`import` / `export`), no CommonJS
- 2-space indent, single quotes, semicolons, trailing commas in multi-line
- camelCase for variables and functions, PascalCase for classes
- Files are lowercase with hyphens if multi-word
- Comments: explain **why**, not **what**
- No `console.log` in committed code — extend the debug overlay (`updateDebug()` in main.js) instead

## When to stop and ask

- Adding any dependency
- Changing the file layout in PRD §8
- Tuning balance numbers (damage, HP, spawn rates) — surface them in config, don't guess
- Anything that contradicts PRD §3 (non-goals) or §10 (milestone scope)
- Picking art or audio assets — show source/license first
