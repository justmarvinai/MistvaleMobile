# Mistvale

A 2D pixel-art, turn-based **champion-collection RPG** for the browser — collect champions through the Mistgate, forge them into a warband, and reclaim a mist-drowned realm. Heavily inspired by Raid: Shadow Legends; built as a full game, not a UI demo. Desktop-first, landscape-mobile PWA later. Authoritative Node server, PostgreSQL-driven content, and a full operator suite in the sibling repo [`MistvaleMobile-Admin`].

**Status: 📐 Planning complete — implementation begins at Phase P0** (see `ROADMAP.md`).

## Documentation map
| Doc | Contents |
|---|---|
| [`ROADMAP.md`](ROADMAP.md) | Phase plan P0→P10 to the EA-0.1 release |
| [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) | The master GDD: world, factions, the 7 champions, every system |
| [`docs/COMBAT_SYSTEM.md`](docs/COMBAT_SYSTEM.md) | Turn meter, damage math, 28 status effects, masteries — the engine contract |
| [`docs/ECONOMY_BALANCE.md`](docs/ECONOMY_BALANCE.md) | Currencies, curves, rates, pity, sinks — all admin-tunable |
| [`docs/CONTENT_PLAN_EA01.md`](docs/CONTENT_PLAN_EA01.md) | Every champion kit, enemy, chapter, dungeon, quest shipping in EA-0.1 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Tech stack, monorepo layout, client/server/engine design, budgets |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) · [`docs/API_DESIGN.md`](docs/API_DESIGN.md) | PostgreSQL schema · REST API inventory |
| [`docs/UI_UX_DESIGN.md`](docs/UI_UX_DESIGN.md) | Design language, all 25 screens, battle-screen spec, icon map |
| [`docs/DEPLOYMENT_OPERATIONS.md`](docs/DEPLOYMENT_OPERATIONS.md) | VPS topology, DEPLOY/UPDATE/BACKUP scripts, tuning |
| [`docs/ASSET_GUIDE.md`](docs/ASSET_GUIDE.md) | Asset inventory, conventions, pipeline |
| [`docs/research/RAID_REFERENCE.md`](docs/research/RAID_REFERENCE.md) | Verified research on how the source game works |
| [`USER_QUESTIONS.md`](USER_QUESTIONS.md) | Open decisions for the owner (with recommended defaults) |
| [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) | Working agreements for AI-assisted development |

## Planned stack
TypeScript everywhere · React 18 + PixiJS v8 + Vite (client) · Node 22 + Fastify 5 + Drizzle + PostgreSQL 16 (server) · pure deterministic battle engine (`packages/engine`) · pnpm monorepo · single 4 GB / 1-core Ubuntu VPS behind nginx.
