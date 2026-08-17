# Mistvale — Data Model (PostgreSQL 16)

> Status: **Planning draft** — table-by-table blueprint for the Drizzle schema built in Phase P0/P1.
> Conventions: `snake_case`; PKs `id bigint generated always as identity` unless noted; all timestamps `timestamptz`; every table gets `created_at`/`updated_at`; FKs `on delete restrict` unless noted; JSONB columns are always Zod-validated at the API boundary (never trusted raw).

> **Implementation note (P1).** The content families below are *modelled* exactly as
> described, but they are **stored in one table**, `content_entries`, discriminated by
> `content_type` with the entity in a validated JSONB `data` column, plus
> `content_revisions` for publish snapshots. A table per family would mean a migration
> for every new content type — precisely the cost the "content is data" rule exists to
> avoid. The schema per family is enforced in code by the Zod contracts in
> `packages/shared/src/content/`, which the Admin API, the seed loader and publish
> validation all share. Read the sections below as the *shape of each entity*, not as a
> list of physical tables.

Two families of tables:
- **Content (`*_defs`)** — authored via Admin Suite, read-mostly, loaded into the server ContentCache. Rows carry `status` (`draft` | `live`) + `draft_of` self-reference for the publish workflow, and are exportable/importable as JSON (admin backup / git-versioned content).
- **Player state** — hot tables, one source of truth for everything a player owns/did.

---

## 1. Content: units & skills

### `faction_defs`
| column | type | notes |
|---|---|---|
| key | text unique | `vale_sentinels`, `emberclan`, `wayfarers`, `hollowborn`, `sskarn` … |
| name, lore | text | display |
| icon | text | game-icons key |
| sort_order | int | |

### `champion_defs` (playable units; enemies reference the same skill machinery via `enemy_defs`)
| column | type | notes |
|---|---|---|
| key | text unique | `anuria`, `thordakk`, … |
| name, title, lore | text | e.g. Anuria, "Arrow of the Vale" |
| faction_key | fk | |
| element | enum | `ember` `tide` `verdant` `mist` |
| rarity | enum | `common` `uncommon` `rare` `epic` `legendary` (`mythic` reserved) |
| role | enum | `attack` `defense` `hp` `support` |
| base_stats | jsonb | `{hp, atk, def, spd, critRate, critDmg, res, acc}` — values AT max rank/level; growth curves derive lower values (COMBAT_SYSTEM.md §stats) |
| skills | jsonb | ordered array of skill_def keys (A1..A4 + passive) |
| aura | jsonb nullable | `{stat, value, scope: all|element|faction, area: any|campaign|arena|depths}` |
| asset_key | text | → `asset_defs`; sprite + animation tracks |
| summonable, starter | bool | starters: anuria/thordakk/maruan |
| balance_version | int | bumped on stat changes (shows "updated" badge in Chronicle) |

### `skill_defs`
| column | type | notes |
|---|---|---|
| key | text unique | `anuria_a1_riftcut` |
| name, description_tpl | text | template with `{dmg%}`-style placeholders auto-filled from data |
| slot | enum | `a1` `a2` `a3` `a4` `passive` |
| cooldown, cooldown_upgraded | int | |
| targeting | jsonb | `{side: enemy|ally|self, mode: single|all|random_n|self, n?}` |
| components | jsonb | ordered effect components — the engine contract, e.g. `[{type:"damage", scale:"atk", mult:3.6, element:"inherit"},{type:"applyStatus", status:"poison_5", chance:0.75, turns:2, target:"hit"}]` |
| upgrades | jsonb | tome upgrade ladder `[{effect:"dmg+5%"},{effect:"chance+10%"},{effect:"cooldown-1"}…]` |
| ai_hints | jsonb | `{prefer:"lowest_hp", openWith:true, dontRepeatWhileActive:"poison_5"}` |
| animation | jsonb | `{track:"attack", vfx:"slash_red", projectile?, shake?}` |

### `status_defs` (buff/debuff catalog — the ~30 EA effects)
| column | type | notes |
|---|---|---|
| key | text unique | `atk_up_50`, `poison_5`, `stun`, `shield_pct`, … |
| kind | enum | `buff` `debuff` |
| family | text | stacking family (`atk_up` — stronger replaces weaker) |
| params | jsonb | magnitudes, tick timing (`onTurnStart|onTurnEnd`), max_stacks |
| icon, color | text | UI |
| engine_type | text | which engine interpreter handles it — publish-validated against the engine registry |

### `enemy_defs`
Same shape as champions (element, role, skills, asset_key) plus:
| column | type | notes |
|---|---|---|
| archetype | text | `sskarn_skirmisher`, `sskarn_shaman`, `sskarn_broodguard`, boss keys … (all share the lizard asset for now) |
| stat_profile | jsonb | base stats at reference level + per-level growth multipliers — stages instantiate `{enemy_key, level, stars, modifiers}` |
| is_boss | bool + boss_mechanics jsonb | e.g. turn-meter-fill immunity, shield phases (engine-known keys) |

### `asset_defs` (asset registry)
| column | type | notes |
|---|---|---|
| key | text unique | `champ_anuria`, `enemy_lizard` |
| kind | enum | `unit` `vfx` `ui` `audio` |
| source | enum | `repo` (build atlas) `upload` (admin-uploaded) |
| tracks | jsonb | `{idle:{frames:9,fps:9,loop:true}, attack?:{...}}` + atlas refs |
| avatar_path, still_path | text | |

## 2. Content: items & gear

### `gear_set_defs` (e.g. Swiftwind, Bloodthorn, Ironroot…)
| column | type | notes |
|---|---|---|
| key, name, lore | | |
| pieces | int | 2 or 4 |
| bonus | jsonb | `{stat:"spd", pct:12}` or proc `{type:"lifesteal", pct:30}` — engine-known bonus types |
| drop_sources | jsonb | dungeon keys (display + drop-table generation aid) |

### `gear_slot_defs` (6 gear + 3 accessory slots)
| column | type | notes |
|---|---|---|
| key | enum-ish | `weapon` `helm` `shield` `gauntlets` `cuirass` `boots` `ring` `amulet` `banner` |
| allowed_main_stats | jsonb | per-slot list incl. fixed slots (weapon=flat ATK, helm=flat HP, shield=flat DEF) |
| accessory | bool | accessories gated by ascension level |

### `gear_main_stat_defs` / `gear_substat_defs`
Per stat × rank: base value, per-upgrade-level growth (main), roll min/max (sub). Fully data-driven so balance lives in the Admin Suite.

### `item_defs` (stackables)
| column | type | notes |
|---|---|---|
| key | text unique | `sigil_faded`, `sigil_gleaming`, `sigil_mistwoven`, `sigil_radiant`, `essence_ember_lesser`…, `essence_pure`, `tome_rare|epic|legendary`, `emblem_bronze|silver|gold`, `energy_pack_*`, `xp_boost_*` |
| category | enum | `sigil` `essence` `tome` `emblem` `consumable` `material` |
| rarity, icon, description | | |
| payload | jsonb | e.g. consumable effects `{energy:+50}` |

## 3. Content: world & modes

### `campaign_chapter_defs`
`key, number (1-12), name, region_lore, background_asset, star_reward_tiers jsonb ([{stars:7,rewards:[...]},{stars:14,…},{stars:21,…}])`

### `stage_defs` (campaign stages AND dungeon floors — one table, `mode` discriminates)
| column | type | notes |
|---|---|---|
| key | text unique | `c01_s1_normal`, `wyrms_hollow_f07`, … |
| mode | enum | `campaign` `dungeon` `springs` `proving` `tutorial` |
| parent_key | text | chapter or dungeon key |
| number, difficulty | int, enum | difficulty: `normal` `hard` `brutal` (`nightmare` reserved) |
| energy_cost | int | |
| waves | jsonb | `[[{enemy_key, level, stars, slot, modifiers?}…] × 1-3]` |
| rewards | jsonb | `{silverRange, playerXp, champXpBase, dropTable: key}` |
| star_rules | jsonb | `{noDeaths: true, maxTurns: N}` → 1-3 stars |
| unlock | jsonb | `{prevStage?, playerLevel?}` |
| first_clear_bonus | jsonb | one-time rewards |

### `dungeon_defs`
`key (wyrms_hollow, frostgrave_vault, cinderspire, silkmire_depths, proving_grounds, spring_ember|tide|verdant|mist, spring_pure), name, kind (relic|proving|springs), lore, region, tagline, background_asset, floors int (15 relic / 10 proving & springs at EA), set_keys jsonb, item_keys jsonb, boss_enemy_key, open_days jsonb (weekday indices, `0` = Sunday; empty = every day), unlock_level int`

The rotation and the account level are the only two things a dungeon knows that a stage does not; everything else about fighting a floor is the stage's own business. `open_days` is content rather than code precisely because "Mist on Sunday only" is a balance decision, not a structural one.

### `drop_table_defs` + `drop_table_entries`
Weighted rolls, engine-agnostic: `entries: {ref_type: gear|item|silver|champion, ref/params (set, slot?, rank, rarity_weights, level_range | item_key, qty_range), weight, rolls}`. Publish-validated (weights > 0, refs exist). Reused by stages, chests, events, login calendar, shops.

### `summon_pool_defs` + `summon_pool_entries`
| column | notes |
|---|---|
| pool per sigil type; entries: `{champion_key, weight}` grouped by rarity with `rarity_rates jsonb` (`{rare:0.914, epic:0.08, legendary:0.006}`-style, must sum 1, publish-validated) |
| `pity jsonb` | mercy rules per pool: `{epic:{after:20, step:0.02, maxBonus:1}, legendary:{after:200, step:0.05, maxBonus:1}}` |
| `ten_pull_floor` | rarity a ×10 guarantees at least once, if any |

Rates and mercy live here rather than in `game_config` because they are per-pool: Radiant's mercy is not Gleaming's, and a rate-up weekend on one banner must not touch the others. Publish validation refuses a table that does not sum to 1, or a pool advertising a rarity it holds no champion for.

### `quest` (daily/weekly/monthly), `mission_defs` (one long chain)
A `content_entries` row like every other content type, not a table of its own.

| field | notes |
|---|---|
| `period` | `daily` / `weekly` / `monthly`. Missions carry a chain position instead. |
| `goals` | 1–4 goals from the DSL below. A quest is done when **every** one is met. |
| `rewards` | the usual `{currency-or-item-key: amount}` map, paid through `RewardService`. |
| `countsTowardChest` | whether it fills the all-dailies completion meter. |
| `unlockLevel`, `active`, `sortOrder`, `icon` | when it appears, whether it appears, and where. |

**The goal DSL** (`packages/shared/src/content/goals.ts`) is `{type, target, filters}` and nothing else:

- **`type`** is one of a registry of twenty — `battleWin`, `stageClear`, `bossKill`, `useEnergy`, `summon`, `gearUpgrade`, `gearLevel`, `championLevelUp`, `championRankUp`, `championAscend`, `masteryLearn`, `shopPurchase`, `arenaBattle`, `arenaWin`, `arenaTier`, `chapterStars`, `dungeonClear`, `accountLevel`, `claimAllDailies`, `championObtained`. Adding one is a line in the registry plus a `track` call where it happens; every quest, mission and event milestone can use it immediately.
- **`target`** is how many, or how high. Progress is capped at it, so a goal never reads 340/3.
- **`filters`** narrows what counts — `{mode: 'campaign'}`, `{dungeonKey: 'keep_ember'}`. **Publish validation refuses a filter the type does not declare**, which is what stops `{type:'summon', mode:'campaign'}`: a goal that looks reasonable in the editor and silently never completes.

How a goal accumulates is a property of its *type*, not of the goal: `count` sums reports, `highest` keeps a high-water mark. That is what makes "reach +12 on a relic" un-satisfiable by upgrading twelve relics to +1 — the classic quest bug, ruled out once rather than per-goal.

The daily set also feeds a completion meter → the all-dailies chest.

### `event_defs` + `event_milestone_defs` (timed events framework)
`key, name, banner_asset, starts_at, ends_at, point_rules jsonb ([{action:"champ_xp", points_per:1000}, {action:"dungeon_clear", dungeon:"any", points:10}…]), milestones: [{points, rewards}]`. Cron activates/expires; admin editor composes these freely (Champion Training / Dungeon Delve / Summon Surge are just presets).

### `shop_defs` + `shop_slot_defs`
Bazaar: rotating slots `{stock_ref (drop_table or item), price {currency, amount}, refresh_group}`; crystal shop: fixed offers (energy, silver packs, roster slots). Refresh timer + manual refresh cost in `game_config`.

### `login_calendar_defs`
`day int (1-30 cycle), rewards jsonb` + separate `welcome_days` 7-day new-player track.

### Hall of Valor (config, not a content type)
The Hall's shape is fixed — 4 elements × 6 stats × 10 levels — so it needs no `_defs` table. What is tunable lives in `game_config`: `arena.hallCosts` (medals per level, 1 → 10) and `arena.hallPerLevel` (what one level of each stat gives).

### `mastery_defs`
Three trees (`onslaught` / `bulwark` / `insight`), 6 tiers, each node: `key, name, description, tree, tier, icon, effects jsonb (a list of engine-known effects), sort_order`. Costs are *not* per node — they are per tier, in the `economy.masteryCosts` config row, because a tier is the unit an operator actually reprices.

### `tutorial_step_defs`
Ordered scripted steps: `{trigger, screen, highlight, text, forced_action?, rewards?}` — makes onboarding tweakable without code.

### `game_config`
Single-row-per-key `key text pk, value jsonb, schema_key text`. Every balance constant: energy regen seconds, caps by level, XP curves, gear upgrade cost/success tables, element wheel modifiers, crit caps, arena tier thresholds & weekly rewards, multi-battle cap, pity defaults, daily reset hour/timezone, rate limits… Admin edits through schema-typed forms.

### `bot_defs`
`name, avatar_champion_key, personality jsonb (team archetype, element bias), rating_band, roster jsonb (generated champion instances w/ gear tiers), refresh_policy`. A nightly job + admin editor manage the ladder population.

### `news_defs`
`title, body_md, starts_at, ends_at, pinned` — shown on Haven sidebar + login.

### Content plumbing
- `content_revisions` — `rev serial, published_at, published_by, diff_summary jsonb, snapshot ref` (last N snapshots kept for one-click revert).
- Export/import: any `*_defs` subset ⇄ JSON file (admin feature; also how content gets from a local authoring session into git seeds).

---

## 4. Player state

### `accounts`
`id, account_name citext unique, password_hash, rank enum(player|gamemaster|admin) default 'player', force_password_change bool, status enum(active|banned), ban_reason, last_login_at, created_ip`
- **One account system, rank-gated (owner decision):** `player` = the game; `gamemaster` = reserved moderation rank (no Admin Panel access at EA — future in-game moderation tools); `admin` = full Admin Panel access. Only `admin` can authenticate against `/admin/api`. Rank changes: Admin Panel player-management (admin-only, audited, self-demotion blocked) or the `scripts/` CLI (`SET_RANK.sh`, used by DEPLOY.sh to bootstrap the first admin account).

### `sessions`
`id, account_id fk cascade, token_hash bytea unique, expires_at, created_at, last_seen_at, user_agent` — one session table for all ranks; Admin API endpoints additionally require `rank = 'admin'` on every request (checked server-side, never cached client-side).

### `players` (1:1 account)
`id, account_id unique, profile_name citext unique, level, xp, energy, energy_updated_at, silver bigint, crystals, valor_medals, roster_capacity, tutorial_step, settings jsonb, summon_pity jsonb, last_summon_action_id, daily_counters jsonb, daily_counters_day, last_multi_battle jsonb, last_daily_reset_at, is_bot bool default false` — bots are players; every system (arena, leaderboards) works on them uniformly. Currencies as columns (hot, small); stackable items normalized below.

Three of those are worth their own sentence:

- **`daily_counters` + `daily_counters_day`** — every per-day allowance in one map keyed by counter name (`multiBattle` today; eight quest counters in P8), stamped with the game-day it belongs to. One map rather than a column each, because adding an allowance must not be a migration. There is deliberately **no reset job**: a counter whose stamp is not today reads as zero and is overwritten on the next write, so an account away for a month is current the moment it comes back. What "today" means is `lib/game-day` — the reset hour and timezone are `game_config` rows, so a game-day runs from the reset hour rather than from midnight.
- **`title`** — the honorific the account displays beside its profile name, awarded by the last step of the Valewarden's Path. One column rather than a table of earned titles: exactly one exists at EA, and a table for a single row would be a table to maintain. It becomes a list when a second source appears; the column is the *displayed* title either way, which is the only thing the game reads.
- **`chest_claims`** — the last completion chest taken per quest period: `{daily: {anchor, actionId}}`. An anchor rather than a boolean, for the same reason `player_quests` carries one: the chest re-opens when the stored anchor is no longer the current period's, so there is nothing to reset. The action id makes a retried claim replay rather than fail — a dropped response on a phone must not cost the chest.
- **`last_multi_battle`** — `{actionId, result}` for the most recent batch. A multi-battle writes **no `battle_sessions` rows** (thirty states and thirty logs is megabytes per farm, and a batch has nothing to resume), so the summary has nowhere else to live and a retried request has nothing else to replay. Exactly one is kept: the next batch overwrites it.
- **`summon_pity` + `last_summon_action_id`** — mercy counters per pool, and the same replay guarantee for pulls.

### `player_items`
`player_id, item_key, quantity bigint, unique(player_id, item_key)` — sigils, essences, tomes, emblems, consumables.

### `player_champions`
| column | notes |
|---|---|
| id, player_id, champion_key | |
| level, xp, stars (rank), ascension (0-6) | |
| skill_upgrades jsonb | per-skill tome levels |
| masteries jsonb | picked nodes (validated vs tree rules) |
| locked bool, favorite bool | food-protection |
| in_vault bool (reserved), obtained_at, obtained_from | |
| power int | cached power score for lists/bots |

### `gear_instances`
| column | notes |
|---|---|
| id, player_id, set_key, slot, rank (1-6), rarity, level (0-16) | |
| main_stat jsonb `{stat, percent, value}` | recomputed from `gear_stat_defs` on each upgrade level |
| substats jsonb `[{stat, percent, value, rolls}]` | rolled at drop and at +4/+8/+12/+16; **never** recomputed from the tables afterwards, so retuning them cannot restat a piece a player already owns |
| equipped_champion_id fk nullable → player_champions (unique per slot enforced by partial unique index `(equipped_champion_id, slot)`) | |
| source, obtained_at | |

### `shop_states`
| column | notes |
|---|---|
| player_id, shop_key, unique(player_id, shop_key) | |
| restocks_at | a read past this rolls the next window |
| unlocked_slots | crystal shelves opened permanently |
| slots jsonb | `[{index, offerKey, gearId, price, purchased}]` — the whole window, always read and written together |
| daily_counts jsonb, daily_counts_on | per-offer purchase counts since the last daily reset |
| seed, content_rev | so a support query can reproduce what was offered |

Stock is rolled per player and **stored**, not derived on read: what a player is looking at has to still be there when they tap it, and what they were offered has to be as auditable afterwards as a drop. A relic offer creates its `gear_instances` row up front — which is what lets the shop show real substats — and buying it simply stops the next restock from sweeping it away.

### `campaign_progress`
`player_id, stage_key, stars (0-3), best_clear jsonb (turns, team), clears int, unique(player_id, stage_key)` + claimed star-tier flags on a per-chapter row (`chapter_star_claims`).

### `dungeon_progress` — **not built; deliberately**
A floor *is* a stage, so its clear is already a `stage_progress` row with `parent_key` set to the dungeon. "Deepest floor" is the largest floor number among those rows and "clears" is their sum, both derived on read. A second table would be the same fact written twice, and the second copy is the one that drifts.

### `player_quests` / `player_missions`
`player_id, quest_key, period_anchor, progress jsonb, completed_at, claimed_at`, unique on `(player_id, quest_key, period_anchor)`. Missions: the same without the anchor, unique on `(player_id, mission_key)`.

**The chain is grouped into arcs of eight, and the arc is the only gate.** Progress accrues on *every* active mission whatever arc it belongs to; the arc decides what may be claimed and what the screen shows. Farming two hundred Depths floors during arc 4 leaves arc 8's "clear one hundred" already done — the floors happened, and a chain that pretended otherwise would punish playing well. A mission may also `grant` a champion and a title: that is how the exclusive Legendary at the end of the Path exists at all, and the grant runs inside the claim's transaction alongside the payout.

**`period_anchor` is what makes "today's dailies" a lookup rather than a job**: it is the game-day a daily instance belongs to, the week's Monday for a weekly, the month's first for a monthly. Yesterday's row simply stops matching, so nothing goes round at 04:00 deleting things — and a player who finished their dailies at 03:50 still has last night's row to claim at 04:10. All three periods derive from the same `lib/game-day` the rest of the game resets on, so a player's day ends once rather than three times.

`progress` is an array **parallel to the definition's goals**, so a two-goal quest stores `[2, 0]`. Positional rather than keyed, because goals have no identity of their own and an operator reordering them in the editor must not silently rebind a player's progress to a different goal.

Three tables rather than one with a discriminator, because their *lifetimes* differ — a quest instance belongs to a period and is replaced, a mission is permanent and ordered, an event window opens and shuts. One table would need a partial index per lifetime anyway, and every query would carry a `where kind = …` the planner has to be told about.

**Everything advances through one fan-out**: `ProgressService.track(tx, ctx, playerId, events)`. Modules report what happened — `battleWin`, `summon`, `gearUpgrade` — and whatever is listening advances; nothing in Mistvale knows what a quest is. Adding the tutorial, a battle pass or a guild later is a subscriber, not a change to any module that reports. Two properties hold it together:

- **Called inside the transaction that did the thing**, always — typed to accept a transaction and not a `Database`, so it is a rule the compiler keeps. A quest that advanced for a battle that then rolled back is a quest the player did not earn; a battle paid for without its quest credit is the same bug wearing a different hat.
- **It locks the player row first.** That single statement reads the level the quest list is gated on *and* serialises every report for the account, which is what makes the read-modify-write safe: without it, a battle settling while a purchase lands both read `3`, both write `4`, and one of the two things the player did never happened.

### `player_events`
`player_id, event_key, points, claimed_milestones jsonb`, unique on `(player_id, event_key)`. Events are point ladders rather than goal lists; the claimed indices are stored so claiming is idempotent and a milestone list extended mid-event does not re-open what was already paid.

### `login_claims`
`player_id, track (calendar|welcome), day, claimed_on`, unique on `(player_id, track, claimed_on)`. A row per claim rather than a counter: the calendar gives day N on the Nth *claim*, so a player who misses a day loses the day and not their place.

### `arena_state`
`player_id pk, rating, tier, weekly_high, tokens, tokens_updated_at, defence_team jsonb (player_champion ids in formation order), offers jsonb, offers_refreshed_at, refreshes_used, refresh_day, last_weekly_claim, pending_chest_week, pending_chest_high`.
Tokens follow energy's pattern — a value plus the moment it was written, everything else derived against the clock — so an idle account costs nothing to keep current and there is no job that can fall behind.
The **offer list is a column, not a table**: it is small, entirely replaced on every refresh, and meaningless to anyone but its owner. Three properties that make a column the right shape.
The two `pending_chest_*` columns hold the chest the Monday reset sealed. They exist because that reset clears `weekly_high`: a chest is earned in the week that just ended and claimed in the one that follows, so the rating it pays against has to survive the boundary.
### `arena_battles`
`id, attacker_id, defender_id, battle_id, won, attacker_rating_delta, defender_rating_delta, medals, created_at` (defender may be a bot — same table, no special case). Rows outlive the battle session they came from: a session is pruned with its event log, while "who attacked whom, and what it moved" is the ladder's own history and the only thing that can answer a dispute.

### Bots
There is no bot table. A bot is an ordinary `players` row with `is_bot` set, holding ordinary `player_champions` and `gear_instances` and an ordinary `arena_state` — so matchmaking, the leaderboard, the engine and the settle path need no special case. Its account carries a CSPRNG password hashed and discarded, so nobody can log into one. Champions, relics, level and rating are all synthesised from live content per the `arena.botBands` recipe and rebuilt nightly; nothing a bot does writes to `economy_log` (ECONOMY_BALANCE §12).

### `battles` (active sessions + history header)
`id uuid, player_id, mode, stage_key/arena ref, state enum(active|won|lost|retreat|expired), seed, content_rev, team jsonb, snapshot jsonb (latest engine state), action_count, energy_spent, rewards jsonb (granted on completion), action_id uuid (idempotency), created_at, resolved_at`
### `battle_logs`
`battle_id fk, events jsonb (compressed event list)` — kept 14 days for players, longer for arena disputes; admin inspector reads these. Partitioned/pruned by cron.

### `summon_history`
`player_id, pool_key, sigil_item_key, champion_key, rarity, pity_counters_after jsonb, created_at` — the pity state IS derivable but we cache counters on `players.summon_pity jsonb` for O(1) reads.

### `champion_sightings`
`player_id, champion_key, first_seen_at, unique(player_id, champion_key)` — champions the player has *met*, recorded on a summon and when a battle starts. The Chronicle reads owned from `player_champions` and seen from here, which is what makes it a record of the world rather than a list of receipts.

### `mailbox`
`id, player_id, title, body, attachments jsonb (rewards), sent_by (system|admin name), read_at, claimed_at, expires_at` — admin composer can target one/all players (fan-out rows at send time; player count is tiny).

### `hall_of_valor`
`id, player_id, element, stat, level, updated_at` — unique on `(player_id, element, stat)`, level checked 0–10. A row per track rather than a jsonb map because a track is a *ledger*: it only ever goes up, one level at a time, each level bought with medals — and rows make that a constraint rather than a convention.

### `economy_log` (append-only audit of every grant/spend)
`id, player_id, source (battle:c01_s3|summon|quest:...|admin:<name>|mail|shop), deltas jsonb, created_at` — powers Admin player inspector + economy dashboards. Pruned to 90 days.

### `audit_log` (admin actions)
`id, account_id (rank admin at time of action), action, entity, entity_id, before jsonb, after jsonb, created_at` — every Admin mutation, no exceptions (including rank changes).

---

## 5. Indexing & ops notes (initial)
- Hot paths: `sessions(token_hash)`, `players(account_id)`, `player_champions(player_id)`, `gear_instances(player_id)`, partial index `gear_instances(equipped_champion_id) where equipped_champion_id is not null`, `battles(player_id) where state='active'`, `player_quests(player_id, period_anchor)`, `arena_state(rating)` for matchmaking bands, `mailbox(player_id) where claimed_at is null`.
- JSONB integrity: Zod at every boundary + CHECK constraints for enums; publish-time referential validation for content JSONB (skill→status keys, waves→enemy keys, drops→item keys).
- Migrations: drizzle-kit generated SQL committed to git; `UPDATE.sh` runs `migrate` before restart; destructive migrations require an explicit `--allow-destructive` flag and a fresh backup (script-enforced).
- Seeds: `apps/server/src/db/seed/` = the EA content in code-reviewable JSON/TS (7 champions, skills, lizard archetypes, 12 chapters, dungeons, quests, shops, calendar, bots, config). `SEED.sh` loads them into an empty install, and on an install that already has content adds only what is missing — new types and new `game_config` keys — never changing what is there (`--force-content` for a full refresh; player data never touched).
