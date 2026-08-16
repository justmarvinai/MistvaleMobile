# Mistvale — API Design

> Status: **Planning draft.** REST + JSON over HTTPS. All routes below are relative to `/api` (player) or `/admin/api` (admin). Envelope: `{ ok, data | error, rev }` (`rev` = current content revision). Auth via session cookie (or `Authorization: Bearer` for PWA). Mutations that grant/spend take a client `actionId` (UUID) for idempotency. All request/response schemas are Zod definitions in `packages/shared` (player API) or generated OpenAPI (admin API).

## 1. Player API

### Auth & account
| Method & path | Purpose |
|---|---|
| POST `/auth/register` | `{accountName, profileName, password}` → creates account+player, starts session. Rate-limited per IP. |
| POST `/auth/login` | `{accountName, password}` → session. Generic error on bad creds. |
| POST `/auth/logout` / `/auth/logout-all` | Kill session(s). |
| GET `/auth/me` | Session probe → `{account, player, forcePasswordChange}` |
| POST `/auth/change-password` | Requires current password (or force-change flag). |

### Content & player snapshot
| GET `/content` | Full content bundle for current revision (ETag/If-None-Match; client caches in IndexedDB). |
| GET `/player` | Full player snapshot: profile, resources, energy `{value,cap,nextTickAt}`, unlock flags, tutorial step, counters (quests badge, mail badge, event banners). Fetched on boot + screen re-entry, never polled. |
| GET `/player/champions` · GET `/player/gear` · GET `/player/items` | Roster / gear inventory / stackables. Paged where sensible. |
| GET `/player/starters` | The champions flagged `starter` in content — what a new account chooses between. |
| POST `/player/starter` | `{championKey}` → grants the chosen starter. Idempotent: a player who already owns champions is left alone. |
| PATCH `/player/settings` | Audio/gfx/preferences jsonb (schema-validated). |
| GET `/profile/:profileName` | Public profile card (level, top champions, arena tier) — for arena opponent inspection. |

### Champions & gear
| GET `/player/champions/:id` | One champion: assembled stats split into base and relic contribution, worn relics, skill levels, and what each ladder's next step costs. |
| POST `/player/champions/:id/level` | `{foodIds[], actionId}` — consume food champions for XP. Refuses anything locked, favourited, still wearing relics, or the champion itself. |
| POST `/player/champions/:id/rank-up` | `{foodIds[], actionId}` — exactly R champions of exactly R stars plus a silver fee; resets the champion to level 1. |
| POST `/player/champions/:id/ascend` | `{actionId}` — spends element-matched essences scaled by rarity. Capped by star rank. |
| POST `/player/champions/:id/skill-upgrade` | `{skillKey, source, actionId}` — `source` is a tome of the champion's rarity or a duplicate of the same champion. The player picks the skill (a deliberate deviation from the source game's random books). |
| POST `/champions/:id/masteries` | `{addNode}` spend emblems; POST `/champions/:id/masteries/reset` (crystal cost). |
| POST `/player/champions/release` | `{ids[], actionId}` release for silver by rarity × rank (locked, favourited and equipped champions refused — the whole selection, not silently part of it). |
| POST `/player/champions/:id/flags` | `{locked?, favourite?}` toggles. |
| POST `/player/gear/:id/equip` | `{championId}` — clears the slot and fills it in one transaction; a partial unique index makes a double occupancy impossible rather than merely unlikely. Accessory slots check the champion's ascension against the slot definition. |
| POST `/player/gear/:id/unequip` | Free (the source game made gear removal permanently free in 2025 — we adopt that from day one). |
| POST `/player/gear/:id/lock` | `{locked}` — protects a relic from a mass sell. |
| POST `/player/gear/:id/upgrade` | `{times, actionId}` — resolves the whole run server-side and returns every attempt in order, so the client animates them without deciding one. A run stops at the first success, at the cap, or when the silver runs out; a failure still charges. |
| POST `/player/gear/sell` | `{ids[], actionId}` → silver. Refuses the whole selection if any of it is locked or worn, rather than quietly sparing some of it. |
| GET `/player/gear` | Every relic the player owns, with sell value and next-upgrade cost and chance already computed. |
| GET `/player/items` | Stackables held, by item key. |
| GET `/player/gear/:id/preview?championId=` | Stat-diff preview, computed by assembling the champion twice — set bonuses appearing or vanishing included, which is exactly what a client-side sum would get wrong. |

### Shops
| GET `/shops/:key` | The player's current stock and its restock time. A read past the window rolls the next one in the same transaction that serves it, so the shop refreshes without a scheduler. |
| POST `/shops/:key/buy` | `{slotIndex, actionId}` — charges, grants, and marks the slot sold. Relic offers hand over the exact piece that was shown. |
| POST `/shops/:key/refresh` | `{actionId}` — pays crystals to roll a new window now. Relics from the discarded window stop being for sale. |
| POST `/shops/:key/unlock-slot` | `{actionId}` — opens one more crystal shelf, permanently. It fills on the next restock. |

### Summoning & collection
| GET `/summon/banners` | Every published pool with the player's sigils, the published rates, and the live mercy state — including the *effective* chance the next pull will roll against. |
| POST `/summon/:key` | `{count, actionId}` — ×1 or ×10. Atomic under the player lock: the sigil leaves and the champion arrives together. A replayed `actionId` returns the original pull rather than spending again. |
| GET `/summon/history` | The player's recent pulls, newest first. |
| GET `/chronicle` | Owned and seen across the whole roster. Food units are listed but excluded from the completion count. |

### Battles (campaign, dungeons, springs, proving, tutorial)
| POST `/battles/start` | `{mode, stageKey, team[1-4], actionId}` → spends energy, creates session, returns `{battleId, initialState, events (to first decision), needsInput}` |
| POST `/battles/:id/action` | `{actionId, skill?, target?, auto?}` → `{state, events, outcome, rewards}`. Omit `skill` to let the AI take the turn; set `auto` to resolve the rest of the fight in one call. Replaying an `actionId` returns the recorded state rather than taking a second turn. |
| POST `/battles/:id/retreat` | Concede (energy stays spent). |
| POST `/battles/multi` | `{mode, stageKey, team, runs (≤ cap), actionId}` → N seeded auto-runs server-side → summary + per-run compact results + rewards. |
| GET `/battles/active` | Resume support after refresh/crash. |
| GET `/battles/:id/log` | Replay events (own battles + arena battles involving you). |

### Summoning & collection
| POST `/summon` | `{sigilItemKey, count: 1|10, actionId}` → results `[{championKey, rarity, isNew, dupeReserved?}]` + updated pity counters. |
| GET `/summon/pools` | Live rates + own pity counters (transparency screen). |
| GET `/chronicle` | Collection index: all champions + owned/seen flags. |

### Arena
| GET `/arena` | State: rating, tier, tokens `{value,cap,nextTickAt}`, defense team, current opponent offers, weekly progress. |
| POST `/arena/refresh-opponents` | Free per cooldown, else crystal cost. |
| POST `/arena/defense` | Set defense team. |
| POST `/arena/attack` | `{offerId, team, actionId}` → battle session vs snapshot defense (manual or auto), resolution updates ratings both sides. |
| GET `/arena/leaderboard` | Top N + own rank neighborhood (bots included). |

### The Depths, quests, events, meta
| GET `/depths` | Dungeon list, open springs today, own floor progress, proving grounds state. |
| GET `/quests` | Daily/weekly/monthly with progress + daily-chest meter. POST `/quests/:key/claim`. |
| GET `/missions` | Chain state. POST `/missions/:key/claim`. |
| GET `/events` | Active events, points, milestones. POST `/events/:key/claim` `{milestone}`. |
| GET `/login-calendar` | Month grid + today claim state. POST `/login-calendar/claim`. |
| GET `/mail` · POST `/mail/:id/claim` · POST `/mail/claim-all` | Inbox. |
| GET `/hall-of-valor` · POST `/hall-of-valor/upgrade` | `{element, stat}` medal spend. |
| GET `/bazaar` · POST `/bazaar/buy` `{slotId, actionId}` · POST `/bazaar/refresh` | Shop. |
| GET `/news` | Active announcements. |
| POST `/tutorial/advance` | `{step, choice?}` — server validates scripted order; starter pick happens here. |

## 2. Admin API (`/admin/api`, consumed by MistvaleMobile-Admin)

- **Auth:** POST `/auth/login|logout`, GET `/auth/me` — same `accounts` table as the game, but login succeeds **only for `rank = 'admin'`** (GameMaster/Player get a generic denial). Every `/admin/api` request re-checks rank server-side. Sessions are the standard session system.
- **Content CRUD:** for every `*_defs` family: `GET /content/<type>` (list w/ filter), `GET/POST/PUT/DELETE /content/<type>/:key`, all writes hit **draft** state. Bulk ops where needed (drop table entries, pool entries).
- **Publish flow:** GET `/content/diff` (draft vs live, human-readable), POST `/content/publish` (validate → snapshot → swap → bump rev), POST `/content/revert` `{rev}`, GET `/content/revisions`.
- **Validation service:** POST `/content/validate` — full referential + engine-registry check, returns structured problem list (the editors run this continuously).
- **Export/import:** GET `/content/export?types=…` → JSON file; POST `/content/import` (dry-run diff first).
- **Assets:** POST `/assets/upload` (frame strips/PNGs; server packs atlas + registers), GET `/assets`, DELETE guarded. Preview URLs for editors.
- **Players:** GET `/players?query=` (search), GET `/players/:id` (full inspect: roster, gear, resources, progress, economy_log tail, battle history), POST `/players/:id/grant` (RewardService — champions/items/currency/gear), POST `/players/:id/reset-password` (temp password + force-change), POST `/players/:id/set-rank` `{rank: player|gamemaster|admin}` (admin-only, audited, self-demotion blocked), POST `/players/:id/ban|unban`, DELETE guarded double-confirm. |
| **Bots:** GET/POST/PUT `/bots`, POST `/bots/generate` `{count, ratingBand}`, POST `/bots/refresh-ladder`. |
- **Mail:** POST `/mail/compose` `{target: player|all, title, body, attachments, expiresInDays}`.
- **Ops:** GET `/health` (see ARCHITECTURE §10), GET `/stats/overview` (DAU-ish counters, economy totals, summon rarity actuals vs configured), GET `/battles/:id/log` (inspector), GET `/audit-log`, POST `/jobs/run/:name` (manually trigger daily reset etc. — guarded).

## 3. Cross-cutting rules
- **Errors:** closed enum (`AUTH_REQUIRED, FORBIDDEN, VALIDATION, NOT_FOUND, INSUFFICIENT_FUNDS, ENERGY_LOW, ROSTER_FULL, COOLDOWN, LOCKED_CONTENT, IDEMPOTENT_REPLAY, RATE_LIMITED, CONTENT_STALE, INTERNAL`). `CONTENT_STALE` tells the client to re-pull the bundle and retry once.
- **Versioning:** `X-Client-Rev` header; `426 UPGRADE_REQUIRED` forces SPA reload after breaking deploys.
- **Pagination:** cursor-based (`?after=id&limit=`) on gear list, summon history, leaderboard, economy log.
- **Time:** all responses UTC ISO-8601; the client renders local. Daily reset boundary from `game_config`.
- **No polling contract:** clients refresh on navigation/action only; the only "timers" are client-side countdowns to server-provided timestamps.
