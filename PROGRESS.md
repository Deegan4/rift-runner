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
- [ ] Milestone 2 — XP + level up + 3 weapons + 3 passives
- [ ] Milestone 3 — 6 weapons, 8 passives, evolutions, 4 enemy types
- [ ] Milestone 4 — Bosses + elites + scaling (MVP complete)
- [ ] Milestone 5 — Meta-progression + main menu + 5 heroes
- [ ] Milestone 6 — Polish: SFX, music, screen shake, damage numbers, particles
- [ ] Milestone 7 — Balance pass, playtesting, bug fixes

---

## Session log

### 2026-05-18 — Milestone 1 complete
- Added `utils.js`, `enemies.js`, `weapons.js`; extended `config.js` and `main.js`
- Architecture done up-front per PRD §14.2: object pooling + spatial hash before second enemy type
- Pistol auto-fires every 0.5s at nearest enemy within 600px, kills zombies in 2 hits at t=0
- Contact damage with i-frames; game-over + retry loop works
- **Next session:** Milestone 2 — XP gems (drop on death, magnet-fly within pickup radius), level-up cards, 2 more weapons, 3 passives

### 2026-05-18 — Initial scaffold
- Created repo, PRD, CLAUDE.md, config.js, runnable main.js
- Player moves on screen. Ready for milestone 1.
