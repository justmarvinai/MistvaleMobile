# Mistvale — Development Roadmap to EA-0.1

> The build plan for the game repo; the Admin Suite advances in lockstep (see `MistvaleMobile-Admin/ROADMAP.md`, phases A0–A6). Phases are **dependency-ordered, no skeletons**: each phase ships production-quality, tested, documented work — later phases never revisit "temporary" versions of earlier ones.
>
> **Checkpoint rule:** at the end of every phase I ask the owner whether there's feedback, bugs, or changes wanted before continuing — an *offer*, never a requirement; silence = continue. Open design decisions live in `USER_QUESTIONS.md`; each phase lists which pending answers it can absorb before its start.

### Phase overview

| Phase | Theme | Key deliverables | Relative size |
|---|---|---|---|
| **P0 ✅** | Foundation | Monorepo, CI, DB, auth, client shell, deploy scripts v1 | ▓▓ |
| **P1 ✅** | Content backbone | Content schema + cache + publish, seeds v1, Admin core editors (A0–A1) | ▓▓▓ |
| **P2 ✅** | Battle engine | Full engine + tests + battle API + balance-sim | ▓▓▓▓ |
| **P3 ✅** | Battle experience | Battle screen, campaign flow, results | ▓▓▓▓ |
| P4 | Champions & relics | Roster, leveling/rank/ascension, gear loop, Bazaar | ▓▓▓ |
| P5 | Summoning | Mistgate, pools/pity, Chronicle | ▓▓ |
| P6 | The Depths | 4 dungeons + Proving + Springs, masteries, multi-battle, Hard/Brutal | ▓▓▓ |
| P7 | Arena & bots | Async PvP, ratings/tiers, Hall of Valor, bot system | ▓▓▓ |
| P8 | Meta & retention | Quests, missions, events, login, mail, news, settings | ▓▓▓ |
| P9 | Onboarding | Scripted tutorial, feature gating, FTUE polish | ▓▓ |
| P10 | Release hardening | Full content seed, audio/animation polish, perf/security audit, EA-0.1 live | ▓▓▓ |

---

### P0 — Foundation ✅ **complete**
Monorepo scaffold (pnpm: `apps/client`, `apps/server`, `packages/shared`, `packages/engine`, `tools/`), TS strict + ESLint/Prettier + Vitest + CI (lint/typecheck/test/build). Drizzle + Postgres with migration/seed harness. Fastify server: config, pino, error envelope, rate limiting, request IDs. **Auth complete** (register/login/logout/sessions/change-password, argon2id, case-insensitive uniques, force-password-change path). Client shell: Vite + React + Pixi boot (one Application, scaling/letterbox, nearest-neighbor), design tokens, UI kit v1 (Panel/Button/Modal/Toast/Bar from Kenney 9-slice), screen registry + router, login/register screens, API client with envelope/error handling. `tools/atlas-pack` + `tools/icon-fetch` working (icons fetched + attributed). Scripts v1: DEPLOY/UPDATE/STATUS/BACKUP/SEED (VPS-ready even if the game is just a login screen).
**Exit:** fresh VPS → DEPLOY.sh → register, log in, see an empty Haven at 60 fps; CI green.
**Delivered:** pnpm workspace (client/server/shared/engine/tools) · TS strict + ESLint 9 + Prettier + Vitest + Playwright · GitHub Actions CI (format→lint→typecheck→migrate→test→build→migration-drift check, plus a browser e2e job against real PostgreSQL) · Drizzle schema for accounts/sessions/players/audit_log/economy_log with the Player/GameMaster/Admin rank model · Fastify server with config validation, pino logging, error envelope, rate limiting, request ids, rank-gated health endpoints · complete auth (argon2id, hashed session tokens, sliding expiry, case-insensitive unique names, change-password revoking all sessions) · seeded xoshiro128** RNG for the engine · React + Pixi client shell (design tokens, UI kit, screen registry, animated mist backdrop, Haven, settings, locked-feature teasers) · `tools/icon-fetch` (79 attributed game-icons) · all eight ops scripts + nginx/systemd/Postgres configs. 104 unit/integration tests and 3 end-to-end browser tests pass.

### P1 — Content backbone (+ Admin A0–A1) ✅ **complete**
Full content schema (`*_defs` per DATA_MODEL.md) + Zod contracts in shared. ContentCache with draft→validate→publish→revert + revisions + client bundle endpoint (ETag/IndexedDB). Seed v1: the full 37-champion roster + 6 food units (7 final-art kits verbatim from CONTENT_PLAN §1; §1b kits from the skill-template library; placeholder-asset convention per ASSET_GUIDE), lizard archetypes, chapter 1 stages, sets/slots/stat tables, game_config defaults. Asset registry + admin upload → pack pipeline. Admin Suite reaches A1 (auth, shell, Game-config editor, Champion/Skills/Enemy/Gear editors, asset manager, dashboard v1).
**Exit:** edit a champion in Admin → publish → client bundle updates without redeploy; seeds reviewed in git.
**Delivered:** content contracts in `packages/shared/src/content/` (the effect-component DSL every skill is built from, entity schemas, the type registry) · `content_entries`/`content_revisions` storage with live+draft states · `ContentCache` serving an immutable snapshot with atomic hot-swap on publish · three-layer validation (schema → references → engine registry) that blocks a publish rather than shipping broken content, normalising entities at the persistence boundary so seeded and Admin-authored content are stored identically · Admin API for all 12 content types with draft writes, validate, field-level diff with risk flags, publish, revert and revision history, every mutation audited · public `GET /api/content` bundle with ETag/304 · client content store with IndexedDB caching keyed by revision · **published API contract**: every endpoint described once in Zod, generated into `docs/openapi/admin-api.json`, the Admin Suite's client types generated from it, CI failing on drift and a contract test parsing every real response with the schema the document came from · committed seeds — 338 entities: 36 statuses, 8 factions, 9 relic slots + 16 sets, 17 items, **43 champions (37 roster + 6 food) and 136 skills** across all eight factions, the Sskarn enemy roster, chapter 1 across three difficulties, and every tunable constant · Admin Suite A0–A1 (auth, shell, dashboard, generic entity editor, champion and skill composers, game-config editor, publish centre with diff and typed confirmations). 232 game-repo tests and 63 Admin tests pass.

### P2 — Battle engine ✅ **complete**
`packages/engine` implements COMBAT_SYSTEM.md completely: TM simulation, element rolls, damage/mitigation, ACC/RES, all 28 shipped statuses, instants, waves (clear/CD-tick/heal rules), auras, boss flags, AI + hints, event log, seeded RNG. Test suite: mechanic units, golden replays, property tests, 300-turn cap. Battle API: start/action/auto/retreat/active/log + session snapshots + idempotency. `tools/balance-sim` CLI + CI gates (COMBAT §14). Admin battle inspector (A2 timeline viewer) + stage simulate button.
**Exit:** full campaign stage resolves headless in <20 ms; all tuning gates pass on chapter-1 seeds; goldens locked.
**Delivered so far:** `packages/engine` implements COMBAT_SYSTEM in full — turn meter (analytic next-actor solve, documented tie-breaks), element/hit-quality/crit/mitigation damage, the ACC-versus-RES curve, all fifteen status behaviours with family stacking and end-of-turn timing, the nine effect components with conditions and targeting, wave transitions, boss immunity flags, and hint-driven AI shared by enemies and auto-battle · 132 engine tests (mechanic units, property tests over randomised battles, two committed golden replays) · `tools/balance-sim` with the §14 tuning gates in CI, deterministic over 2,000 fixed seeds. A campaign stage resolves headless in **0.02 ms**, a thousandfold inside the 20 ms budget; every gate passes.
**Also delivered:** the player roster (`player_champions`) brought forward from P4, because the battle API needs to know what a team *is* and inventing a temporary shape would have been the exact "temporary hack" the brief rules out · the battle API — start, act, auto, retreat, resume — with the engine's whole state stored as JSONB so a fight survives a restart, one active battle per player enforced by a partial unique index, and `actionId` idempotency so a dropped response is safe to retry · `RewardService`, the single path resources move by, writing every movement to `economy_log` · 18 integration tests over the real seeded content: pick a starter, fight chapter 1-1, get paid, exactly once.
**Deferred to A2:** the Admin battle inspector (timeline viewer + stage simulate), which belongs with the Admin phase rather than here.

### P3 — Battle experience (+ campaign flow) ✅ **complete**
Battle screen per UI_UX §4: Pixi stage (formations, idle/procedural animations, floaters, VFX presets, shake), turn-order strip, skill bar + targeting + tooltips, buff chips, speed ×1/×2, auto toggle, retreat; event-log playback engine (the client "player piano"). Campaign map + chapter/stage screens, team select (presets, power, energy confirm), results screen (stars, loot reveal, XP bars). Wave/victory/defeat choreography. Seeds extended: chapters 1–3 Normal.
**Exit:** tutorial-less full loop: pick team → fight 1-1…3-7 manually or auto → loot → repeat, feeling like a real game.
**Delivered:** starter choice (pedestals from content) · campaign map with chapters, stages and difficulty tabs · team select with leader-first ordering and an energy preview · the battle screen — Pixi formations with running idle loops, drifting mist, health bars, status pips, hit shake and damage floaters, over a DOM HUD with turn order, skill bar with cooldowns, speed ×1/×2, auto, skip and retreat · the playback engine that applies the server's event log to a view model and reads every number off an event, with an ESLint rule enforcing that the client imports engine *types* only · results with stars and the granted loot · `pnpm assets` sprite pipeline, run by the client's own build, publishing `assets/` with a frame-count manifest · chapters 2–3 seeded with their own bosses, the generator now per-chapter plan driven · 18 playback tests and a browser end-to-end run of the whole loop.

### P4 — Champions & relics (+ Admin A3 start)
Roster + champion detail screens (stats breakdown from server, skills/tomes, lore). Leveling (food consume), rank-up, ascension (essences), dupe→skill-level. Relic inventory, equip/unequip (free), upgrade forge (success ladder, animated attempts, bulk-continue), sell with guardrails, set bonuses live in stat preview. Bazaar (rotating stock + crystal tab + refresh). Locks/favorites.
**Exit:** the full RPG management loop closes: farm → equip → upgrade → stronger → farther.

### P5 — Summoning & collection
Mistgate screen with portal reveal cinematics by rarity (skippable), ×1/×10, all four sigils, pools + weights + **mercy counters** (server) + "Odds & Mercy" transparency panel, summon history, roster capacity + expansion, Chronicle (owned/seen; food units excluded), NEW-champion flow. Pools span the full roster incl. Broodlings/Broodguards (owner-approved).
**Exit:** pull loop feels premium; pity provably correct (unit-tested counters); Chronicle registers everything.

### P6 — The Depths (+ masteries, multi-battle, difficulties)
Depths hub + 4 relic dungeons (15 floors, bosses with real mechanics per CONTENT_PLAN), Proving Grounds (Emblems), Essence Springs (day rotation + first-7-days-all-open). Masteries system + trees UI + reset. Multi-battle (server loop, daily cap, summary UI). **Practice sandbox** (zero-energy/zero-reward re-fights of cleared stages). Campaign Hard/Brutal + stars/star-chests + first-clears everywhere. Seeds: all dungeons + chapters 1–12 across difficulties (generator-assisted).
**Exit:** the PvE endgame treadmill runs: farm springs on rotation, push floors, spec masteries, multi-battle farms.

### P7 — Arena & bots (+ Hall of Valor)
Arena screens (defense editor, offers + refresh, token meter, tier ladder, weekly chest, leaderboard). Rating math, weekly reset job, medal grants. Hall of Valor (element×stat tracks). Bot system: generation from content at power bands, ladder seeding (60 bots), nightly refresh, top-10 auto-yield; Admin bot manager (A5 part). Arena battles through the same engine (defense AI).
**Exit:** at 0 real friends online, Arena still feels alive and fair; medals→Valor loop closes.

### P8 — Meta & retention
ProgressService fan-out + quest/mission/event/tutorial goal tracking. Daily/weekly/monthly quests + chest + **daily first-win-of-mode bonuses**; Missions (80 arcs, finale: exclusive Legendary Aureleth); Events framework + 3 presets + admin scheduling; login calendar + welcome track; mailbox + admin mail composer; news feed; player profile card + **battle replays with shareable links** + settings (audio/speed/motion/credits/password); daily reset job wired to everything. Admin reaches A4/A5 completeness.
**Exit:** a day in Mistvale has structure: log in → calendar → quests → energy plan → events — the retention layer breathes.

### P9 — Onboarding & FTUE
Scripted tutorial per CONTENT_PLAN §7 (cold-open battle, starter choice, guided steps, rewards), driven by `tutorial_step_defs` + overlay/highlight system. Feature gating by level with mist-shrouded teasers + unlock celebrations. Contextual empty-states/tooltips pass. New-account happy-path hardening (every screen safe at zero-content).
**Exit:** a fresh account reaches chapter 1-7 guided, oriented, and hooked — tested with real fresh accounts.

### P10 — Release hardening & EA-0.1 launch
Full content seed review + balance-sim pass over everything; audio (CC0 SFX/music per ASSET_GUIDE, mixer + settings); animation/transition polish (screen wipes, reward bursts, Haven ambience); performance audit (bundle split, atlas sizes, API p95, DB indexes, RAM ceilings); security pass (rate limits, fuzz inputs, session hygiene, admin allowlist); PWA manifest + installability; Playwright E2E smoke; DEPLOY/UPDATE/BACKUP/RESTORE drill on a scratch VPS + real VPS deploy; content export→git snapshot; `ea-0.1.0` tag; launch checklist + day-1 monitoring.
**Exit:** **EA-0.1 live** on the VPS, friends onboarded, backups proven, dashboard quiet.

---

### Post-EA (parked, in brief-priority order)
Warbands (guilds) + Vale Titan → the Mistspire → Faction Trials → Live/Tag Arena → Fusions → Forge/crafting → Boons → Awakening/Mythic → Vale Pass → skins/localization/native wrappers.

### Standing Definition of Done (every phase)
Typecheck/lint/tests green in CI · engine goldens updated only deliberately · new content editable in Admin (no SQL-only fields) · docs + CHANGELOG updated · deploy scripts still pass on a scratch run · checkpoint offered to the owner.
