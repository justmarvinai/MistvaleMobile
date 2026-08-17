# CLAUDE.md — MistvaleMobile

**Mistvale** — a 2D pixel-art, turn-based champion-collection / gacha RPG in the browser, heavily inspired by Raid: Shadow Legends (structurally faithful, uniquely named, own numbers). Desktop-first, later landscape-mobile PWA. This repo: game client + authoritative server + battle engine + assets. Sibling repo `MistvaleMobile-Admin`: the operator SPA for the Admin API this server hosts.

## Project state
**Phases P0–P7 complete; P8 (meta & retention) is in progress — P8a–P8d done** — see `ROADMAP.md`. The whole PvE game runs: a fresh account registers, picks a starter, walks the campaign map, fights a stage by hand or on auto or farms ten of it at once, and is paid for it — then equips what dropped, upgrades it, levels and ranks and ascends champions, trains masteries, shops, pulls at the Mistgate, and goes down into the Depths. Farm → equip → upgrade → stronger → farther is closed at every scale from 1-1 to the deepest keep floor.

Live and tested: the monorepo, CI, database, auth, deploy scripts, the content pipeline, the full 37-champion + 6-food seed · **372 stages** — the whole campaign (12 chapters × 7 stages × 3 difficulties, twelve warlords) and 120 Depths floors across four relic keeps, the Proving Grounds and five rotating Essence Springs, with the boss mechanics that make them puzzles · the battle engine (`packages/engine`, golden replays and the `pnpm sim` balance gates) and the battle API · every game screen · the relic economy, champion progression, masteries (48 nodes, three trees, engine-backed), the Bazaar, the Mistgate, the Chronicle, multi-battle and the practice sandbox · **the Arena** — asynchronous 4v4 against snapshot defence teams, Elo-lite ratings over ten rungs, attack tokens, the weekly chest and Monday close, the Hall of Valor, and sixty bots synthesised from live content so the ladder is never empty · the Admin Suite's core editors, player management and the bot manager · **the goal engine** (P8a) — the goal DSL, `quest` as an eighteenth content type with its 19 seeds, the `player_quests`/`player_missions`/`player_events`/`login_claims` tables, and `ProgressService.track`, the one fan-out every module reports to · **quests** (P8b) — the checklist and its screen, idempotent claims, the day's completion chest, and the first win of each mode paid automatically · **the Valewarden's Path** (P8c) — eighty missions in ten arcs, ending in the exclusive Legendary Aureleth and a title · **timed events** (P8d) — the framework, three recurring presets and their ladders, scheduled off the clock with no cron. **The login calendar, mail and the tutorial do not exist yet.** When the docs and reality diverge, fix one or the other in the same PR — stale docs are a review-blocker.

**Working on the code:** `pnpm install`, then `pnpm db:migrate` against a local PostgreSQL, `pnpm dev` to run server + client. `pnpm verify` runs the whole gate CI runs (format, lint, typecheck, test, build); `pnpm e2e` drives the browser flow. Server tests need PostgreSQL and skip themselves without it.

## Read first (order matters)
1. `ROADMAP.md` — where we are, what the current phase owes
2. `docs/GAME_DESIGN.md` — what the game is (world, champions, systems)
3. `docs/ARCHITECTURE.md` — how it's built (stack, patterns, budgets)
4. `docs/COMBAT_SYSTEM.md` — the engine contract
5. `docs/DATA_MODEL.md` · `docs/API_DESIGN.md` — schema + endpoints
6. `docs/ECONOMY_BALANCE.md` · `docs/CONTENT_PLAN_EA01.md` — numbers + content inventory
7. `docs/UI_UX_DESIGN.md` · `docs/ASSET_GUIDE.md` · `docs/DEPLOYMENT_OPERATIONS.md`
8. `docs/research/RAID_REFERENCE.md` — how the source game really works (verified research)
9. `USER_QUESTIONS.md` — open decisions; **check before implementing anything listed there**

## Hard rules (from the owner's brief — non-negotiable)
- **Authoritative server.** The client never computes outcomes, rolls, or timers. All game math lives server-side (engine) — the client renders event logs and server numbers.
- **Content is data.** Champions/skills/items/stages/quests/events/constants live in PostgreSQL, edited via the Admin Suite. Adding content must never require code changes; every content field must be editable in Admin (no SQL-only knobs).
- **Production quality only.** No skeletons, MVPs, placeholders-as-architecture, or "temporary" hacks. Every phase ships finished, tested work.
- **Performance & maintainability first.** Target box: 1-core/4 GB VPS (budgets in ARCHITECTURE §9). Extensible module/screen patterns — "add more stuff" must stay the cheap operation.
- **No serif fonts. Anywhere.**
- **No generic rounded "AI-slop" UI.** The hand-built pixel UI kit per UI_UX_DESIGN.md; Kenney Fantasy UI Borders selectively; game client uses no component library.
- **Icons only from game-icons.net** (via `tools/icon-fetch`, attributed) until custom icons exist. Never invent icons.
- **Assets:** only from `assets/` + the documented CC0/CC-BY sources in ASSET_GUIDE.md (owner holds rights to `assets/`). Track every third-party source in `CREDITS.md`.
- **Highly animated.** Idle loops always play; every action acknowledges within 100 ms; motion rules in UI_UX §1.2.
- **Auth:** account name + password + profile name. No e-mail anywhere; password resets happen via the Admin Suite only. One account system with ranks **Player / GameMaster / Admin** — only Admin rank can access the Admin Panel (`play.pathlands.cc/admin`).

## Locked technical decisions (change only via USER_QUESTIONS.md)
pnpm monorepo · TypeScript strict everywhere · Node 22 + Fastify 5 + Zod 4 + Drizzle + PostgreSQL 16 · React 18 + Vite + PixiJS v8 + Zustand + SCSS Modules · Howler · Vitest/Playwright · deterministic pure battle engine in `packages/engine` (seeded xoshiro128**, event-log contract) · REST JSON `{ok,data|error,rev}` envelope · sessions (opaque tokens, hashed) · in-process Admin API at `/admin/api` with draft→validate→publish→revert content flow · nginx + systemd + bare-metal VPS (no Docker) · no Redis, no WebSockets at EA.

## Conventions
- Server: feature modules `routes.ts / service.ts / repo.ts`; cross-module via services only; every mutation transactional with player-row lock; all grants through `RewardService` (→ `economy_log`); idempotency via `actionId`.
- Client: screen folders + registry; stores per domain; no game math client-side; pixel sprites integer-scaled, DOM UI free.
- Testing: engine = highest bar (mechanic units + golden replays + property tests); services tested against real Postgres in CI; goldens regenerate only in deliberate, reviewed commits.
- Commits: `feat(scope): …` / `fix:` / `docs:` / `chore:` / `test:`; CHANGELOG `[Unreleased]` entry for every player- or admin-visible change.
- Branches: **work on `main` and push there directly** (owner's standing instruction — no feature branch). Every push must leave `pnpm verify` and `pnpm sim` green, since nothing sits in front of `main`.
- Balance numbers: never hardcode — they live in `game_config`/content seeds (ECONOMY_BALANCE.md documents defaults).

## Workflow with the owner (Marvin)
- End of each phase: offer a feedback checkpoint ("any bugs, improvements, or changes before I continue?") — never require it.
- New open questions go to `USER_QUESTIONS.md` (numbered, with a recommended default so work never blocks); prune answered ones into the relevant doc.
- Suggest improvements freely (GAME_DESIGN §15 pattern: propose, let the owner decide).
