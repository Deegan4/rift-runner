# PRD — "Portal Survivor" Clone

**Working title:** Rift Runner
**Genre:** Survivors-like / bullet heaven / auto-shooter
**Reference:** Portal Survivor (ESC Games), Vampire Survivors, Survivor.io, Brotato
**Target platform (MVP):** Web (HTML5 + Canvas, single `index.html` playable in any modern browser)
**Stretch:** Mobile (Capacitor wrap), Steam (Electron wrap)
**Author:** Kollin
**Date:** 2026-05-18

---

## 1. Goal

Ship a playable, addictive survivors-like in a single repo. Auto-firing hero, exponential enemy hordes, XP-driven level-ups with a 3-card weapon/perk pick, escalating bosses, meta-progression between runs. MVP must be fun in under 60 seconds of play and run at 60 fps with 500+ enemies on screen.

## 2. Why this design works

The reference game (Portal Survivor) is doing one thing right: dopamine loop every 8–15 seconds (level up → pick upgrade → numbers go bigger → more enemies pop → repeat). The genre is proven (Vampire Survivors did $80M+ on a $5 price point). The art bar is intentionally low — chunky cartoon sprites — so the entire dev cost is in **feel, balance, and progression curves**, not assets.

## 3. Non-goals (MVP)

- No multiplayer
- No realistic graphics
- No story/cutscenes beyond a single intro screen
- No monetization plumbing (IAP, ads) — design for it, don't build it
- No accounts/cloud sync — `localStorage` is fine

---

## 4. Core loop

```
Spawn in arena → enemies stream in from edges → auto-fire kills enemies →
enemies drop XP gems → walk over gems → XP bar fills → LEVEL UP →
pause, pick 1 of 3 upgrade cards → resume → repeat →
every 60s spawn elite, every 5min spawn boss → die OR survive 20min →
return to meta screen → spend earned currency on permanent upgrades → new run
```

A single run is 20 minutes max. Death is expected and frequent on first 5–10 runs.

---

## 5. Gameplay systems

### 5.1 Player

- Top-down 2D, 8-directional movement, WASD + arrow keys, joystick on mobile
- **No manual attack.** Weapons fire automatically on cooldown.
- Base stats: HP 100, move speed 200 px/s, pickup radius 60 px, armor 0, crit 5%, crit dmg 1.5x
- Hero unlocks: start with 1 hero ("Ranger"). Unlock 4 more via meta-progression. Each has a unique starting weapon and stat skew (Tank: +HP −speed, Mage: +area −HP, etc.)

### 5.2 Weapons (start with 6, design for 12)

Each weapon has 8 levels. Hits 5 levels → "evolves" into a stronger variant if paired with a specific passive.

| Weapon | Behavior | Evolves with | Evolution |
|---|---|---|---|
| Pistol | Fires at nearest enemy | Reload Kit | Auto-Rifle (burst of 3) |
| Orbit Blade | Spinning blade around player | Magnet | Whirlwind (2 blades, larger radius) |
| Shockwave | Periodic AoE pulse from player | Power Cell | Nova (chain lightning) |
| Grenade | Lobs at random enemy, AoE | Demolition | Cluster Bomb |
| Beam | Sweeping laser, fixed angle | Focus Lens | Death Ray (pierces all) |
| Spirit Wolf | Pet that chases enemies | Pack Tactics | Wolf Pack (3 wolves) |

### 5.3 Passives (start with 8)

Magnet (pickup radius), Reload Kit (fire rate), Power Cell (damage), Demolition (area), Focus Lens (projectile speed/pierce), Pack Tactics (minion count), Vitality (max HP + regen), Boots (move speed).

### 5.4 Enemies

- **Trash mobs:** zombies, slimes — slow, low HP, swarm in waves of 30–100
- **Runners:** faster than player, low HP, pressure the kiter
- **Tanks:** slow, high HP, knockback resistant
- **Shooters:** ranged, kite the player back
- **Elites:** spawn every 60s, glow effect, drop chest (3-card legendary upgrade)
- **Bosses:** spawn at 5, 10, 15, 20 min. Multi-phase. Drop legendary chest + currency.

Enemy HP and count scale with **time elapsed**, not player level. This is the genre trick: the game gets harder on a schedule, the player gets stronger on a level curve, and the gap is what creates tension.

### 5.5 XP and leveling

- Gems drop from every kill. Blue (1 XP), green (5), red (25 — boss only).
- XP per level: `100 * 1.15^level` (classic Vampire Survivors curve)
- On level up: freeze time, present 3 random cards (weapon or passive), player picks 1
- Reroll button: 1 free reroll per level, more buyable via meta-progression
- Max 6 weapons + 6 passives equipped simultaneously

### 5.6 Map

- Single bounded arena for MVP (1500x1500 px). Camera follows player.
- Tiled grass texture, occasional rocks (cosmetic obstacles, no collision in MVP)
- Stretch: unlockable maps (forest, factory, lava, space station) with biome modifiers

---

## 6. Meta-progression

Between runs, on the main menu:

- **Permanent upgrades tree:** spend coins (earned in runs) on +5% HP, +5% damage, +1 reroll, etc. ~20 nodes for MVP.
- **Hero unlocks:** survive 10 min with Ranger → unlock Tank. Kill 3 bosses → unlock Mage. Etc.
- **Weapon unlocks:** find a weapon once in a run → it's available in future runs' card pool.
- **Achievements:** "Kill 10,000 enemies", "Survive without taking damage for 60s", etc. Cosmetic + small stat bonuses.

This is what makes players come back after a death.

---

## 7. UX / UI

- **Main menu:** Play, Heroes, Upgrades, Achievements, Settings
- **In-run HUD:** top-left HP bar, top-center timer + kill count, top-right gold, bottom XP bar, bottom-left weapon icons with cooldown rings
- **Level-up screen:** time freeze, dim background, 3 cards center-screen, reroll button bottom-right
- **Pause:** ESC, shows current build, stats, time alive
- **Game over:** stats summary (kills, XP gained, gold earned, time), tap to return to menu

Mobile: virtual joystick bottom-left, no other input needed.

---

## 8. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Engine | **Vanilla JS + HTML5 Canvas** | Zero dependencies, ships as one file, easy to debug. Phaser is overkill for a survivors-like. |
| Rendering | Canvas 2D context | Sufficient for sprite-based 2D. Stretch: swap to WebGL via PixiJS if perf demands. |
| State | Single global game state object | Survivors-likes are simple state machines. No Redux. |
| Persistence | `localStorage` | Meta-progression, settings, high scores. |
| Audio | HTML5 `<audio>` + Web Audio API for SFX pooling | Cheap, works everywhere. |
| Build | None for MVP. Single `index.html` + assets folder. | Stretch: Vite if we add modules. |
| Mobile | Capacitor wrap of the same HTML | One codebase, two stores. |

**File layout:**
```
/
├── index.html
├── src/
│   ├── main.js           # game loop, init
│   ├── player.js
│   ├── enemies.js        # spawning, AI, scaling
│   ├── weapons.js        # weapon definitions + fire logic
│   ├── passives.js
│   ├── upgrades.js       # card pool, level-up screen
│   ├── meta.js           # localStorage, permanent upgrades
│   ├── ui.js             # HUD, menus
│   ├── audio.js
│   └── utils.js          # collision, math, spatial hash
├── assets/
│   ├── sprites/          # PNG sprite sheets
│   ├── sfx/              # OGG sound effects
│   └── music/            # OGG loops
└── README.md
```

**Performance budget:**
- 60 fps with 500 enemies + 200 projectiles on screen
- Use a spatial hash grid for collision (not n²). Cell size ~64px.
- Object pool everything: enemies, projectiles, XP gems, damage numbers. Never `new` in the hot loop.
- Render only visible entities (camera culling).

---

## 9. Art and audio

- **Art style:** chunky cartoon, 32x32 sprite base, 4-frame walk cycles, bright saturated colors. Same aesthetic as the reference screenshot.
- **Source:** start with free assets — Kenney.nl (CC0), itch.io free packs. Replace with custom art once feel is locked.
- **Audio:** free SFX from freesound.org, royalty-free chiptune loops from OpenGameArt. One music track per biome.

Do not block on art. Use placeholder colored rectangles for week 1 if needed.

---

## 10. Milestones

| Week | Milestone | Definition of done |
|---|---|---|
| 1 | Movement + auto-fire | Player moves, shoots nearest enemy, kills it. One enemy type. |
| 2 | XP + level up + 3 weapons + 3 passives | Full level-up loop works. Cards appear, picks apply. |
| 3 | 6 weapons, 8 passives, evolutions, 4 enemy types | Build variety. A run feels different each time. |
| 4 | Bosses + elites + scaling | Difficulty curve tuned. 20-min run is survivable but hard. |
| 5 | Meta-progression + main menu + 5 heroes | Death feels good. Player wants to play again. |
| 6 | Polish: SFX, music, screen shake, damage numbers, particles | Game *feels* good. Juice everywhere. |
| 7 | Balance pass, playtesting, bug fixes | Ship-ready build. |

MVP = end of week 4. Polish = week 5–7.

---

## 11. "Game feel" checklist (do not skip)

This is what separates a $0 game from a $5 game:

- Screen shake on every hit
- White flash on enemy when hit
- Damage numbers float up and fade
- Knockback on hit
- Pickup gems should *fly* to the player when in range (eased curve, not linear)
- XP bar fills with a slight overshoot animation on level up
- Level-up card hover: lift + glow
- Boss spawn: screen darkens, warning indicator, alarm sound
- Death: slow-mo, fade to red, then stats
- Every weapon needs a distinct SFX. Reuse weakens the loop.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Performance dies at 500+ enemies | Spatial hash + object pooling from day 1, not as a refactor |
| Balance feels off (too easy / too hard) | Build a debug menu with sliders for damage/HP/spawn rate. Tune live. |
| Scope creep (more weapons, more maps) | MVP locked at 6 weapons / 1 map. Everything else is post-launch. |
| Asset hunting eats time | Use placeholders. Art comes last. |
| Trademark on "Portal Survivor" name | Pick original name before public release. "Rift Runner" is the working title. |

---

## 13. Acceptance criteria (definition of done for MVP)

- [ ] Player can complete a full 20-minute run without crashes
- [ ] At least 6 weapons and 8 passives are obtainable in a single run
- [ ] At least 2 weapon evolutions exist and trigger correctly
- [ ] Enemies scale: minute 1 should be easy, minute 15 should be punishing
- [ ] At least 1 boss fight at minute 5, with multi-phase behavior
- [ ] Meta-progression: at least 5 permanent upgrade nodes work and persist across runs via localStorage
- [ ] 60 fps sustained on a mid-tier 2022 laptop with 300+ enemies on screen
- [ ] Full game loop playable end-to-end: menu → run → death → meta → new run
- [ ] One full music loop + at least 10 distinct SFX
- [ ] Mobile-playable via touch joystick (responsive layout, no UI overlap)

---

## 14. Instructions for Claude Code

When implementing:

1. **Start with `main.js` and the game loop.** Get a square moving on a canvas. Don't write any other file until that works.
2. **Build the spatial hash and object pool before adding the second enemy type.** Refactoring this later is painful.
3. **One weapon at a time, fully working, before starting the next.** Each weapon = define behavior in `weapons.js`, add SFX, add card to upgrade pool, test in isolation.
4. **Commit per milestone.** Each milestone in §10 is one commit minimum.
5. **No frameworks unless I approve it.** If you think we need Phaser/PixiJS, ask first with a concrete perf reason.
6. **Debug menu first, polish last.** Build a hidden `~` key debug overlay with FPS, enemy count, current build, and stat sliders. This is your dev tool for weeks 4–7.
7. **Ask before tuning numbers.** Damage values, XP curves, spawn rates — surface the constants in a `config.js` and ask me to tune them. Don't guess.
