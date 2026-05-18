# CLAUDE.md

Project conventions and operating rules for Claude Code. Read this first every session.

## Project

**Rift Runner** — a survivors-like / bullet-heaven game. Single-page HTML5 + Canvas. See `PRD.md` for full spec.

## Non-negotiable rules

1. **Read `PRD.md` before any work.** All scope, milestones, and acceptance criteria live there. Do not deviate without asking.
2. **No frameworks or build tools without approval.** Vanilla JS + Canvas only. If you think we need Phaser, PixiJS, Vite, TypeScript, or anything else — stop and ask first, with a concrete reason (perf number, specific bug, etc.).
3. **No new dependencies in `package.json` without approval.** `npm install` requires sign-off.
4. **All tunable numbers go in `src/config.js`.** Never hardcode damage, HP, speed, spawn rates, XP curves, etc. inline. Surface them as constants in config.
5. **Object pool everything in the hot loop.** Enemies, projectiles, XP gems, damage numbers, particles. Never `new` an object per frame.
6. **Use the spatial hash for collisions.** Never n² loops over all entities. `utils.js` has the grid.
7. **One milestone per commit minimum.** Milestones are defined in PRD §10.

## Code style

- ES modules (`import` / `export`), no CommonJS
- 2-space indent, single quotes, semicolons, trailing commas in multi-line
- camelCase for variables and functions, PascalCase for classes
- Files are lowercase with hyphens if multi-word (`spatial-hash.js`)
- Comments: explain **why**, not **what**. Skip obvious comments.
- No `console.log` in committed code — use the debug overlay instead

## Workflow per milestone

1. Re-read PRD §10 milestone description and §13 acceptance criteria
2. Plan: list the files you'll touch, in order
3. Implement smallest change first, verify it runs in browser
4. Add to the debug overlay if it's a new system (enemy count, weapon state, etc.)
5. Self-test: open `index.html`, play for 2 minutes, confirm milestone DoD
6. Commit with format: `milestone N: <description>` (e.g. `milestone 2: XP gems and level-up cards`)

## Testing

There is no test framework. Manual playtesting only. After each significant change:
- Open `index.html` in a browser, play for 60 seconds
- Confirm FPS stays at 60 via the debug overlay (`~` key)
- Check the browser console for errors — must be zero

## When to stop and ask

- Adding any dependency
- Changing the file layout in PRD §8
- Tuning balance numbers (damage, HP, spawn rates) — surface them, don't guess
- Anything you'd do that contradicts PRD §3 (non-goals) or §10 (milestone scope)
- Picking art or audio assets — show me the source/license first

## Current state

See `PROGRESS.md` for what's done. Update it at the end of every session.
