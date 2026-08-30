# Mistvale — Technical Architecture

> Status: **Planning — locked for EA-0.1 unless changed via USER_QUESTIONS.md**
> Scope: game client, game server, shared packages, battle engine, content pipeline.
> The Admin Suite architecture lives in `MistvaleMobile-Admin/docs/ADMIN_ARCHITECTURE.md` (it consumes the Admin API defined here).

---

## 1. Architecture principles

1. **Authoritative server.** The client never decides outcomes. Every battle, roll, reward, upgrade, and timer is computed server-side. The client is a renderer + input device.
2. **Content is data, not code.** Champions, skills, enemies, items, stages, quests, events, shops, balance constants — all live in PostgreSQL and are edited through the Admin Suite. Code implements *systems*; the DB describes *content*. Adding a champion or a dungeon must never require a code change.
3. **Determinism where it matters.** Battle simulation is a pure, seeded, replayable function. Same seed + same inputs ⇒ same battle. This gives us testability, replays, audit, and cheap bug reproduction.
4. **Sized for the box.** Production is a 1-core / 4 GB VPS. Single Node process, tuned Postgres, nginx for all static bytes, in-memory content cache, no speculative microservices, no Redis/queues unless a measured need appears.
5. **Boring, typed, testable.** TypeScript strict everywhere, one language across the stack, pure functions for game math, thin IO layers.
6. **Extensible by construction.** New systems plug in through the same patterns: a content table + a service + an API module + a screen. The gacha genre is content-treadmill-driven; the architecture must make "add more stuff" the cheap operation.

---

## 2. Tech stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript 5.x `strict` everywhere | One language, shared types client/server/engine |
| Runtime | Node.js 22 LTS | LTS until 2027, native `fetch`/`crypto`, stable perf |
| Server framework | Fastify 5 | Fastest mainstream Node framework, schema-first validation, plugin encapsulation |
| Validation | Zod 4 (+ `fastify-type-provider-zod`) | Single source of truth for runtime validation + static types + OpenAPI generation for the Admin API |
| Database | PostgreSQL 16 | The brief mandates PostgreSQL; JSONB for skill/wave definitions is a perfect fit |
| ORM / migrations | Drizzle ORM + drizzle-kit | Lightweight (no query engine binary — matters on 1 core), SQL-transparent, first-class TS types, real migration files in git |
| Password hashing | argon2id (`argon2`) | Modern KDF; parameters tuned for the small VPS (§9) |
| Logging | pino + pino-roll | Structured JSON logs, near-zero overhead |
| Scheduling | node-cron (in-process) | Daily reset, shop refresh, event rotation, bot refresh — no external scheduler needed |
| Client build | Vite 6 | Fast builds, trivial code-splitting, first-class TS |
| UI framework | React 18 | The game is 80% menu surface; DOM+CSS is the strongest tool for complex menus |
| Game rendering | PixiJS v8 | WebGL2 sprite rendering for battle scenes, summon animations, ambient/map effects; nearest-neighbor pixel-perfect scaling |
| Client state | Zustand | Small, unopinionated stores per domain; no boilerplate |
| Styling | SCSS Modules + design tokens | Hand-built pixel UI kit (no Tailwind, no component library in the game client — see UI_UX_DESIGN.md) |
| Audio | Web Audio (`src/audio`) | Cues are content (`soundCue`), rendered from parameters into a buffer once per session and played per bus. Howler stays a dependency for sample playback when a pack lands; it has no notion of a cue built from numbers, and wrapping it to add one would be more code than the mixer is. |
| Testing | Vitest (unit/engine), Playwright (E2E smoke) | Engine correctness is the #1 test target |
| Lint/format | ESLint 9 (flat config) + Prettier | Enforced in CI |
| CI | GitHub Actions | typecheck + lint + test on every push; build artifact check |
| Package manager | pnpm 9 (workspaces) | Monorepo with strict, fast installs |

**Explicitly rejected:**
- **Phaser/Godot-web as the app shell** — UI-heavy collection RPGs are menus first; canvas-rendered UI is slower to build, worse for accessibility/text/scrolling, and fights the DOM. Pixi is used *only* where sprites live.
- **Next.js / SSR** — no SEO need behind a login; SSR wastes RAM/CPU on the 1-core box. Static SPA + JSON API wins.
- **Prisma** — heavier runtime and memory footprint; Drizzle is closer to SQL and lighter on the VPS.
- **Redis** — premature. Sessions and caches fit in Postgres + process memory at our player count. The session table + in-memory content cache can be swapped for Redis later without API changes.
- **WebSockets for EA-0.1** — every EA feature is request/response (turn-based, async PvP). The transport layer is isolated so a WS gateway can be added for Live Arena / Guilds later. No polling loops anywhere; the client only re-fetches on user action or screen entry.

---

## 3. Repository layout (game repo, pnpm monorepo)

```
MistvaleMobile/
├── CLAUDE.md / AGENTS.md / ROADMAP.md / CHANGELOG.md / USER_QUESTIONS.md
├── docs/                       # all planning + living documentation
│   └── research/               # RSL reference research (design input)
├── assets/                     # SOURCE art (as provided; never hand-edited)
│   ├── champions/<key>/...     # 64x64 stills + 9-frame idle
│   ├── enemies/<key>/...
│   └── ui/...                  # Kenney Fantasy UI Borders
├── apps/
│   ├── client/                 # Vite + React + Pixi SPA
│   │   ├── src/
│   │   │   ├── app/            # bootstrap, router, providers, screen registry
│   │   │   ├── screens/        # one folder per screen (login, haven, battle, ...)
│   │   │   ├── game/           # Pixi layer: battle stage, sprite/anim system, vfx
│   │   │   ├── ui/             # Mistvale UI kit: Panel, Button, Bar, Modal, ...
│   │   │   ├── state/          # zustand stores (session, player, roster, content, battle)
│   │   │   ├── api/            # typed API client (generated from shared DTOs)
│   │   │   ├── audio/          # mixer (cues: buses, unlock, throttle) + synth (pure: voice → samples)
│   │   │   │                   # + tracks (files: music loop, narration, crossfade)
│   │   │   └── styles/         # tokens.scss, mixins, global
│   │   └── public/             # packed atlases, fonts, icons, audio (build output of asset pipeline)
│   └── server/
│       ├── src/
│       │   ├── modules/        # feature modules (auth, player, battle, summon, arena, ...)
│       │   │   └── <mod>/      #   routes.ts, service.ts, repo.ts, schemas.ts
│       │   ├── admin/          # admin API modules (content CRUD, players, publish, ...)
│       │   ├── content/        # ContentCache: load, validate, publish, revision
│       │   ├── db/             # drizzle schema/, migrations/, seed/
│       │   ├── jobs/           # cron: daily reset, shop/event/bot rotation, backups
│       │   ├── lib/            # config, errors, logging, rng, rate-limit
│       │   └── index.ts
│       └── drizzle.config.ts
├── packages/
│   ├── shared/                 # DTOs, enums, API route constants, formulas' types
│   ├── engine/                 # PURE battle engine (no IO, no DB) + its test suite
│   └── sim/                    # PURE headless stage simulation, shared by CI and Admin
├── tools/
│   ├── atlas-pack/             # sprite → texture atlas packing (build step)
│   ├── icon-fetch/             # game-icons.net fetcher + manifest (attribution)
│   └── balance-sim/            # CLI: headless battle simulations for tuning
├── scripts/                    # DEPLOY.sh, UPDATE.sh, BACKUP.sh, RESTORE.sh, STATUS.sh, LOGS.sh, SEED.sh
└── .github/workflows/ci.yml
```

**Module pattern (server):** every feature is a Fastify plugin folder with `routes.ts` (HTTP + schemas), `service.ts` (game logic, transactional), `repo.ts` (queries). Modules never import each other's repos — cross-feature calls go through services. This keeps "add a feature" mechanical.

**Screen pattern (client):** every screen is a folder with `Screen.tsx`, local components, `screen.module.scss`, and an entry in the screen registry (route, required unlock, preload list). Adding a screen touches nothing global.

---

## 4. Client architecture

### 4.1 Shell: React DOM. Stage: Pixi.
- The **app shell** (navigation, menus, roster, inventory, summon UI chrome, quests, arena lists…) is React DOM styled by the pixel UI kit. Crisp text, native scrolling, fast iteration.
- The **stage** is a single persistent `<PixiStage>` canvas mounted behind/within screens that need sprites:
  - **Battle screen** — full battle rendering (units, animations, floaters, VFX).
  - **Summon screen** — gate animation + champion reveal.
  - **Haven (home) screen** — ambient animated backdrop (mist drift, torch flicker).
- One Pixi `Application` instance for the app lifetime (WebGL context reuse; avoids context-loss churn). Screens acquire/release "scenes" on it.

### 4.2 Pixel-perfect rendering rules
- All sprite rendering integer-scaled (`SCALE_MODES.NEAREST`, no rotation on pixel sprites, positions snapped to whole device pixels).
- Base sprite unit is 64×64; battle stage designs around a **virtual resolution of 960×540** (16:9), integer-zoomed to fit (×1/×2/×3) with letterboxing — the same strategy carries to mobile-landscape later.
- DOM UI is *not* integer-locked (text needs subpixel freedom) but uses the pixel-art frames via `border-image` 9-slice from the Kenney pack.

### 4.3 Animation system
- Champion/enemy animation model: named tracks per unit — `idle` (exists today, 9 frames), and future `attack`, `hit`, `death`, `cast`. The **asset registry** (DB) maps unit → track → atlas frames + fps + loop flag.
- **Fallback rule (EA-critical):** units that only have `idle` get procedural stand-ins — attack = forward lunge + weapon-flash overlay, hit = white-flash + knockback pixels, death = desaturate + dissolve. When real frames are uploaded later via the Admin Suite, they take over automatically because everything routes through the registry. No code change.
- Tweens/timelines: a tiny internal tween util on Pixi tickers for battle motion; DOM micro-animations via CSS transitions/keyframes (see UI doc, §motion).
- Floating combat text, buff/debuff icon pops, turn-meter bar, screen shake (small, configurable) are all engine-event-driven (§6.4).

### 4.4 State & data flow
- Zustand stores: `session` (auth), `content` (static content bundle + revision), `player` (profile, resources, energy), `roster`, `inventory`, `battle` (live battle playback state), `ui` (modals, toasts).
- The `battle` store holds **two clocks** and they are deliberately far apart: server truth (the session, its whole event log, whether it wants an action) and playback position (how much of that log the player has watched). An auto-battle settles in one response and then animates for half a minute, so which clock a piece of UI reads is a decision, not a detail — `state/battleClocks.ts` names both and every screen reads them through it.
- `game/playback` is the client's **projection of the event log onto a screen**, and the only place it happens: it folds the log into a `PlaybackView` (units, floaters, effects) that both battlefield renderers read. Adding a new visual beat means adding an `Effect` there and a case in each renderer — never a second read of the log, and never a number the server did not send. The view is pure and unit-tested; the renderers own only how a beat is drawn and how long it lives.
- Server is the source of truth; every mutating API response returns the **authoritative deltas** (e.g. new resource totals, changed champion) which stores apply. No optimistic writes in EA — latency to a EU VPS is fine and correctness is simpler.
- Energy and other timers: server returns `{ value, cap, nextTickAt, regenSeconds }`; client animates the countdown locally and never self-credits — screen entry / actions re-sync.
- The **content bundle** (all champion/skill/item/stage definitions needed to render the game) is fetched once per content revision (`GET /api/content` with ETag), cached in IndexedDB, keyed by revision. Bundle target < 500 KB gzipped at EA content size.

### 4.5 Asset pipeline (build step, `tools/atlas-pack`)
1. Reads `assets/champions|enemies` source frames.
2. Packs per-unit atlases (idle track = 9 frames → one 576×64 strip + JSON) and a global UI atlas for Kenney frames.
3. Emits to `apps/client/public/atlases/` with content-hashed filenames + a manifest.
4. Admin-uploaded art (post-deploy) lives under `/var/lib/mistvale/uploads/` and is served by nginx; the asset registry stores which source (build atlas vs upload) a unit uses. Uploads are individual frame strips packed server-side with the same tool (shared code).
- Icons: `tools/icon-fetch` downloads the exact game-icons.net SVGs named in `docs/UI_UX_DESIGN.md §icon-map`, recolors them to token colors, and emits a single SVG sprite + attribution file (CC BY 3.0 credits page reachable from Settings).

---

## 5. Server architecture

### 5.1 Process model
- **One Node process** runs both the player API and the Admin API (separate Fastify plugin trees; one account system with the Admin tree rank-gated to `admin`; same content services — admin edits invalidate caches in-process, which is what makes "changes are live immediately" trivial).
- systemd manages the process (auto-restart, journal); nginx terminates TLS and serves all static files (client build, admin build, atlases, uploads).
- In-process `node-cron` jobs (event activation/expiry, bot refresh, backups). **Anything derivable from a timestamp is derived instead of ticked**, which is the pattern to reach for first: energy from `energy_updated_at`; a shop window rolled by the read that outlives it; a daily allowance stamped with its game-day, so a stale stamp reads as zero and needs no reset job at all (`lib/game-day`, `lib/daily-counters`). What "today" is comes from `ops.dailyResetHour` / `ops.dailyResetTimezone`, so a game-day runs from the reset hour rather than from midnight, and one answer serves the springs rotation and every allowance.

### 5.2 Request pipeline
`nginx → fastify: requestId → rate-limit → session auth → zod-validate → handler(service) → typed reply | AppError`
- All handlers validated by Zod schemas from `packages/shared` (request + response). Responses are `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }` with a closed error-code enum.
- Rate limits (per account + per IP): login 5/min, register 3/hour/IP, general API 20/s burst, battle actions 5/s. Configurable in `game_config`.

### 5.3 Transactions & integrity
- Every mutating game action is **one Postgres transaction** with `SELECT … FOR UPDATE` on the player row (serializes a single player's actions — prevents double-spend from double-click/multi-tab, costs nothing at our scale).
- Reward grants go through a single `RewardService.grant(tx, playerId, rewards[], source)` used by *every* system (battle, quest, mail, summon, admin grant) and always writes an `economy_log` row — one audit trail, one place to extend.
- Idempotency: battle completion, summon, and purchase endpoints take a client-generated `actionId` (UUID); replays return the stored result instead of re-granting.
- **The nightly job resets nothing.** Energy, arena tokens, quest periods, event windows, mail expiry, the login calendar and every daily allowance are derived against the clock on read, so the scheduled pass only *prunes* rows past their retention window and rebuilds the bot ladder. A missed run costs disk, never state — and anything that would ever need it to have run belongs on the read path instead. The one genuine state change is the arena's Monday close, which names the week it seals so running it late or twice closes it once.

### 5.4 Content cache & publish flow
- `ContentCache` loads all `*_defs` tables at boot into typed, frozen in-memory structures (validated by the same Zod schemas the Admin API writes with — bad content cannot go live).
- Admin edits write to **draft** rows; **Publish** copies draft → live inside a transaction, bumps `content_revision`, and hot-swaps the in-memory cache atomically. In-flight battles keep the revision they started with (cache keeps the previous revision alive until no battle references it).
- The client learns the revision from every API response envelope (`rev` field) and re-fetches the bundle when it changes.

### 5.5 Battle session management
- Battles live in an in-memory `Map<battleId, BattleSession>` + a `battles` DB snapshot updated after each action (crash recovery = load snapshot; a restart mid-battle costs nobody anything).
- Manual play: client sends `{ actionId, skillId, targetSlot }` → server advances the engine until the next player decision point (enemy/auto turns resolve inline) → returns the ordered `BattleEvent[]` slice.
- Auto: the whole battle resolves in one call and the event log streams back for playback at client-chosen speed. The client must not treat that response as the end of the fight — see §4.4 on the two clocks.
- Multi-battle: N repeats resolve in one call under one player lock, and **write no session rows at all** — thirty states and thirty event logs is megabytes per farm, and a batch has nothing to resume. The summary is the record; it lives on the player row (`last_multi_battle`) so a retried request replays it rather than farming twice.
- Sessions expire after 30 min idle (counts as retreat: energy spent, no reward — same as RSL).
- Engine CPU budget: a full 3-wave stage resolves in **< 20 ms**; even aggressive multi-battle x10 stays trivially within the 1-core budget.

### 5.6 Security posture (EA)
- Session tokens: 256-bit random, stored **hashed** (SHA-256) in `sessions`, 30-day sliding expiry, httpOnly + SameSite=Lax cookie (header fallback for PWA), logout-all support.
- argon2id: memory 19 MiB, iterations 2, parallelism 1 (~40–60 ms on the VPS — strong enough, cheap enough).
- Admin API: **same account system, rank-gated** (owner decision) — `accounts.rank ∈ {player, gamemaster, admin}`; only `admin` passes the `/admin/api` auth guard (checked per request, server-side). `gamemaster` is a reserved moderation rank with no Admin Panel access at EA. Stricter rate limits on `/admin/api`, optional IP allowlist (nginx `location /admin`), every mutation writes `audit_log`. Player password resets happen here. First admin bootstrapped by DEPLOY.sh (`SET_RANK.sh`).
- Input hygiene: Zod everywhere, Postgres parameterized via Drizzle, no raw HTML rendering of user strings (profile names rendered as text; length + charset limits `[a-zA-Z0-9_\- ]{3,16}`).
- No secrets in the repo: `.env` on the VPS (`DATABASE_URL`, `SESSION_PEPPER`, `ADMIN_ALLOWLIST?`, `DOMAIN…`), `.env.example` in git.

---

## 6. The battle engine (`packages/engine`)

The heart of the game. **Pure TypeScript, zero IO, zero Date.now(), zero Math.random()** — everything injected.

### 6.1 Shape
```ts
simulateUntilDecision(state: BattleState, rng: Rng): { state: BattleState; events: BattleEvent[]; needsInput: UnitRef | null }
applyPlayerAction(state, action: { skillId; targetSlot }, rng): { state; events }
createBattle(setup: BattleSetup, contentView: ContentView, seed: number): BattleState
```
- `ContentView` is a read-only slice of the content cache (champion defs, skill defs, constants) — the engine never touches the DB.
- `Rng` is a seeded PRNG (xoshiro128**); the seed is stored per battle ⇒ full replayability. Server-side reward rolls use crypto RNG (not the battle seed) so drop outcomes can't be predicted from replays.

### 6.2 Core model (details in COMBAT_SYSTEM.md)
- Turn-meter simulation (speed-driven tick model), element wheel (Ember > Verdant > Tide > Ember; Mist neutral), damage/mitigation formulas, ACC vs RES debuff resolution, crits, weak/strong hits.
- **Effects are data.** A skill is a list of typed effect components (`damage`, `applyStatus`, `heal`, `shield`, `turnMeter`, `cleanse`, `revive`, `teamBuff`…) with targeting selectors and chance/scaling params — exactly what the Admin skill composer edits. The engine is an interpreter over ~30 status effect types + ~15 component types; new *skills* need no code, new *effect types* are small engine PRs.
- Waves (1–3 per stage), auras, passives, multi-hit, extra turns, counterattacks, buff/debuff duration ticking — all specified in COMBAT_SYSTEM.md with exact rules.

### 6.3 AI
- One AI used for enemies *and* player auto-battle: skill priority (off cooldown, highest slot first — RSL-style predictable) + per-skill **AI hints** in content (`prefer: lowestHp | highestAtk | random | self`, `avoidRetarget`, `openWith`) so the Admin Suite can shape boss behavior without code.

### 6.4 Event log
- The engine emits a flat ordered list of `BattleEvent` (`turnStarted`, `skillCast`, `hit {amount, crit, weak, element}`, `statusApplied/Resisted/Expired`, `turnMeterChanged`, `unitDied`, `waveCleared`, `battleEnded`…). The client is a *player piano* for this log — rendering derives 100% from events, which is what makes replays, spectating, and battle-log inspection (Admin) free.

### 6.5 Testing (the most-tested code in the project)
- Unit tests per mechanic (turn order ties, poison ticking, resist math boundaries, shield/damage interaction order…).
- **Golden replay tests**: canonical setups + seeds → committed event logs; any diff fails CI (catches accidental balance/behavior drift).
- Property tests: no negative HP without death event, TM bounds, energy conservation of effects, battle always terminates (< 300 turns hard cap → draw/defeat rule).
- `packages/sim`: the simulation itself — `LoadedContent`, the three named bench teams, and `simulateStage`. Pure and IO-free, depending on the engine and the content contracts and on nothing else, which is what lets the server import it without importing itself.
- `tools/balance-sim`: the CI gates on top of it (`pnpm sim`) — fills a `LoadedContent` from the committed **seeds**, so it always measures what a fresh install would get, and adds the modes with balance questions of their own: the cold open, the Trials, the Titan.
- `POST /admin/api/simulate/stage`: the same simulation against **live or draft** content, on demand (C27). An operator retuning a stage can ask what the edit does before publishing it, rather than publishing it and going to play the stage. It is deliberately the same `simulateStage` the gates call: a sandbox that answered a balance question differently from the gate guarding the same number would be worse than no sandbox.

---

## 7. Shared packages

- `packages/shared`: enums (Element, Rarity, Role, Faction, StatusType, Slot…), DTO types for every endpoint, API route constants, `BattleEvent` types, error codes. Server validates with Zod schemas co-located here; client imports the inferred types. **Formulas live in the engine, not shared** — the client never needs to compute game math (it renders server-provided numbers).
- Versioning: client sends `X-Client-Rev` (build hash); server replies `426` if a breaking API change requires a reload — the SPA then force-refreshes. Deploys are atomic (nginx swaps the build dir symlink).

## 7b. Localisation (`packages/shared/src/i18n.ts`, `apps/client/src/i18n/`) — C39

Mistvale ships in one language and has no translator. The layer exists for the roadmap's own
argument: *retrofitting is strictly more expensive per screen added, so if it is ever wanted,
earlier is cheaper.* Every screen written without a way to reach its strings is a screen
somebody has to go back through.

**Strings are keyed by their own English.** `t('Roster')` rather than `t('screen.roster')`,
and the three reasons all bite before a second language exists: a missing entry falls back to
correct English rather than showing an id; the code still reads as the sentence it produces;
and a half-converted screen is a *correct* state, which is what makes converting one screen
at a time possible instead of all of them in one unreviewable commit.

**`t()` is a function, `useText()` is the hook.** Most of the client's chrome is not written
inside a component — the screen registry is a module-level array, the combat tips are a table
— so a hook could not reach it. Both read the same store, so they cannot disagree.

**`pnpm i18n` extracts, reports and checks.** It parses rather than greps, because only the
syntactic position of a string says whether a player reads it. It answers two questions: what
is already reachable (the catalogue a translator fills in — **77** strings), and what is not
(**686** still written into components, which is the figure the roadmap's claim rests on and
nobody had counted). It also mines the named **text tables** — the screen registry, the unlock
titles — because their prose is data and the call site says `text(screen.label)`, which no
extractor can read. `pnpm i18n:check` is in `pnpm verify` and fails on a stale template.

**Content is not localised by this**, and that is a schema decision rather than an oversight:
champion names and kit text live in PostgreSQL and are edited in Admin, so a second language
for them needs a locale dimension on `content_entries` with a real migration behind it. **Q10
settled it** (2026-08-30, *"leave content English"*): content stays English-only, so there is no
locale dimension, no language picker on any editor and no per-locale validation pass — publish,
diff and the served bundle are exactly what they were. Adding one later is a migration with a
real translator in front of it, which is cheaper than a shape guessed at now; the client's own
chrome needs nothing from it.

## 8. Admin API (consumed by MistvaleMobile-Admin)

- Mounted at `/admin/api/*` in the same process (see §5.1 for why); the Admin SPA itself is served at **`play.pathlands.cc/admin`** (path-based, single domain — owner decision). Full CRUD for every `*_defs` table, draft/publish, asset upload + atlas pack, player management (search, inspect, grant via RewardService, password reset, rank changes, ban), bot management, mail composer, battle log inspector, health/stats endpoints.
- Fastify + Zod generate an **OpenAPI 3.1 document** at build time, committed to this repo (`docs/openapi/admin-api.json`). The admin repo type-generates its client from that file — the two repos stay in sync through one artifact.

## 9. Performance & capacity budget (1 core / 4 GB)

| Budget item | Target | Measured (P10d, EA content) |
|---|---|---|
| RAM: Postgres | ≤ 768 MB (`shared_buffers` 256 MB, `max_connections` 20, tuned in DEPLOYMENT_OPERATIONS.md) | 113 MB (dev settings) |
| RAM: Node (server) | ≤ 1.2 GB (`--max-old-space-size=1024`; content cache ≈ tens of MB) | 199 MB RSS, tsx watch included |
| RAM: nginx + OS headroom | remainder | — |
| API latency (p95, on-box) | < 100 ms; battle action < 50 ms + engine < 20 ms | 6–22 ms p95 across the hot reads; engine 0.06 ms/run (`pnpm sim`) |
| Client first load (cold) | < 1.5 MB JS gz, < 2.5 s to login screen on desktop broadband | **322 KB JS gz** (pixi 160 · index 118 · react 44) — D9, with the whole FantasyUIs layer in it |
| Painted UI art (FantasyUIs) | no stated budget; measured so there is one | **1.2 MB on the login screen, 1.7 MB through the Haven, 1.9 MB after four screens.** PNGs, so already compressed — gzip does nothing for them |
| Title-screen backdrop | 300 KB, measured so there is one | **244 KB** — one painted scene at 1600px, faded in after the form is already usable. The master is 2752×1536 and 2.7 MB; `pnpm assets` resizes it (C18) |
| Champion avatar art | within budget since C16 | 8 avatars, **2.0 MB published** — delivered at 1254×1254 and published at 320px, twice the largest place any is drawn (150px on a champion card, 44px on an arena portrait). Was 14 MB, which was Q6 |
| Content bundle | < 500 KB gzipped | 708 KB raw → **80 KB gzipped** by nginx (`gzip_types` covers `application/json`) |
| Battle scene | 60 fps at ×2 zoom on integrated graphics | — |
| Concurrent players | comfortably 100+ (design intent: dozens) | — |

The two art rows are D9's, re-measured after the design rework (D0–D8) with every painted
asset in place. The JS answer is the reassuring one: the entire component library, its theme
and the twenty-odd Mistvale primitives built on it cost **20 KB gzipped** — 302 KB to 322 KB
against a 1.5 MB budget. The art is where the weight went, and one half of it was a real
problem: the library's own PNGs are small and load per screen, while the champion avatars
were full-resolution source files published untouched — 14 MB of a 15 MB tree. That was a
content-pipeline gap rather than a design one, which is why the fix belonged in `pnpm assets`
and not in a component: C16 resizes on publish and the tree is 2.0 MB (ASSET_GUIDE §build).

Measured on the dev box against the published EA seed, `/api/player` `/api/content` `/api/player/champions` `/api/player/gear` `/api/quests` `/api/player/progress` at 40 samples each. Everything is an order of magnitude inside its budget, so P10d spent its effort on correctness rather than tuning. Two notes worth keeping:

- **The bundle is only small over the wire.** 708 KB of JSON leaves the origin uncompressed; nginx is what makes it 80 KB. A deployment that bypasses nginx — or drops `application/json` from `gzip_types` — is nine times over budget without anything looking broken.
- **Sequential scans on `stage_progress` are the planner being right**, not a missing index: at fourteen rows a scan beats an index, and the `(player_id, stage_key)` and `(player_id, parent_key)` indexes are both there for when it is not. Every table carries at least one index or unique constraint on the column it is looked up by.

- No polling endpoints; everything event-on-action. Cron granularity ≥ 1 min. Bundle-split per screen (battle/summon Pixi chunks lazy-loaded).

## 10. Observability

- pino JSON logs to stdout, captured and rotated by journald (systemd already does the rotation, retention and querying a second log file would duplicate). Request logs are sampled — 100% of errors and slow requests, 10% of successes — to keep IO low. `LOGS.sh` reads journald and formats the JSON.
- **Health endpoints** (paths in `packages/shared` `ROUTES.health`):
  - `GET /api/health-lite` — public, no database round-trip. The uptime-monitor and post-deploy probe; it must answer even while PostgreSQL is recovering.
  - `GET /api/health` — **admin-rank only**: process RSS, event-loop lag, DB pool stats and latency, content revision, active battles. Rendered on the Admin dashboard; `STATUS.sh` prints the same from the CLI, authenticating with an admin session token (`OPS_SESSION_TOKEN`).
  - These live on the player API rather than under `/admin/api` so that health remains reachable independently of the Admin SPA's routing.
- Every unexpected error gets a `requestId` surfaced to the client toast ("Something broke — code X7F2K") for painless bug reports from friends.

## 11. Testing & CI summary

- CI on every push: `pnpm lint` → `tsc --noEmit` (all packages) → `vitest` (engine + server services with a disposable Postgres via `pg-mem`? **No** — real Postgres service container in CI; pg-mem diverges) → client build + admin OpenAPI drift check.
- Playwright smoke suite (post-P3): register → tutorial → battle → summon → equip, run against a local compose-style stack in CI before each release tag.
- Definition of Done for every phase includes: tests for new services, engine goldens updated deliberately (never regenerated blindly), docs updated, CHANGELOG entry.

## 12. Key risks & mitigations

| Risk | Mitigation |
|---|---|
| 1-core VPS builds are slow (Vite + tsc) | UPDATE.sh builds sequentially with nice/ionice; acceptable (~3–5 min); later: prebuilt artifacts from GitHub Actions if it hurts |
| Content editing breaks live game | Draft/publish with Zod validation + diff preview; battles pin their revision; one-click revert to previous revision (kept in `content_revisions`) |
| Engine/content mismatch (skill references missing effect type) | Publish-time validation walks every skill against the engine's registered component types |
| Sprite set incomplete (only idle exists) | Procedural animation fallbacks (§4.3) — shipped as a feature, not a hack |
| Scope creep toward RSL's 10 years of systems | ROADMAP.md locks EA-0.1 scope; everything else is parked in GAME_DESIGN.md §post-EA |
