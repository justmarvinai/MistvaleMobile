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

### `event` (timed events framework)
One `content_entries` row, like every other content type — `event_milestone_defs` is folded in as an array rather than a second table, because a milestone has no life outside its ladder.

| field | notes |
|---|---|
| `schedule` | `{kind:'window', startsAt, endsAt}` for a one-off, or `{kind:'weekly', startWeekday, durationDays}` for a repeating one measured in **game-days** — so it turns over at the same reset hour as the dailies and needs no timezone arithmetic of its own. |
| `pointRules` | `[{type, filters, points, label}]` — a goal-DSL match plus a rate. Points are paid *per unit reported*, so `{type:'summon', filters:{poolKey:'radiant'}, points:500}` pays five hundred a pull. Reusing the goal DSL means an event can count anything a quest can, and a new report type serves both at once. |
| `milestones` | `[{points, rewards}]`, ascending — publish validation enforces the order, since a ladder out of sequence would let rung 5 be claimed before rung 2. |

**There is no cron.** The planning draft said one would activate and expire events; it does not, and should not. A window is derived from the clock every time it is asked for, so a server that was down all weekend comes back with exactly the right events live and nothing to catch up on — the same rule energy, arena tokens and quest periods already follow (ARCHITECTURE §5.1).

Champion Training / Depths Delve / Summon Surge are three rows, not three features. All three ship **weekly and staggered** rather than on the planned two-week absolute calendar: a calendar that has to be re-cut by hand every fortnight is a calendar that stops being cut.

### `shop_defs` + `shop_slot_defs`
Bazaar: rotating slots `{stock_ref (drop_table or item), price {currency, amount}, refresh_group}`; crystal shop: fixed offers (energy, silver packs, roster slots). Refresh timer + manual refresh cost in `game_config`.

### `login_calendar_defs`
`day int (1-30 cycle), rewards jsonb` + separate `welcome_days` 7-day new-player track.

### Hall of Valor (config, not a content type)
The Hall's shape is fixed — 4 elements × 6 stats × 10 levels — so it needs no `_defs` table. What is tunable lives in `game_config`: `arena.hallCosts` (medals per level, 1 → 10) and `arena.hallPerLevel` (what one level of each stat gives).

### `mastery_defs`
Three trees (`onslaught` / `bulwark` / `insight`), 6 tiers, each node: `key, name, description, tree, tier, icon, effects jsonb (a list of engine-known effects), sort_order`. Costs are *not* per node — they are per tier, in the `economy.masteryCosts` config row, because a tier is the unit an operator actually reprices.

### `tutorialStep` (content, not a table) — **shipped P9**
`step, screen, highlight, title, body, goal?, rewards, grantsBefore, grantsRelics, active`. Ordered scripted steps, tweakable without code — and deliberately content rather than the `tutorial_step_defs` table this doc originally planned, for the same reason `newsPost` is: it needs no player-scoped columns, so a table would have been a table to migrate.

Two decisions are load-bearing:

- **A step's completion condition is an ordinary `goal`** — the same `{type, target, filters}` a quest, a mission and an event milestone use. That makes the tutorial the **fourth subscriber** to `ProgressService.track` rather than a parallel mechanism that has to be told about battles and summons separately, and it means "the step where you equip a relic" is authored exactly like "the daily where you equip a relic". A step with no goal is a *beat*: the Wardenmaster says something and the player presses on.
- **`grantsBefore` pays for the step it belongs to, as that step opens.** "Here are two sigils, now go and pull" is one step rather than two, and the ledger still says which step handed the sigils over. `grantsRelics` does the same for relics — rolled on arrival, so the content names the set, slot, rank and rarity and the game decides the substats, exactly as `loginTrack` grants them.

Publish validation refuses duplicate step numbers, a gap in 1…n (the script is walked by *position*, so a gap is a step nobody reaches), a reward naming an item that does not exist, and a goal filter its type does not declare.

### `stage.presetTeam` — the borrowed team
Only a `tutorial` stage has one, and publish validation refuses it anywhere else. Each entry is `{championKey, level, rank, ascension, relics[]}` — everything the engine needs to build a combatant with no `player_champions` row behind it, which is what lets the cold open be fought before the account owns a champion at all. The relics are `relicGrant` shapes rolled from the **stage key**, so the fight is identical for every new account; the battle's own seed stays fresh. A tutorial battle spends no energy, pays nothing, records no clear and cannot be batched — `settle` treats it exactly as it treats `practice`.

### `game_config`
Single-row-per-key `key text pk, value jsonb, schema_key text`. Every balance constant: energy regen seconds, caps by level, XP curves, gear upgrade cost/success tables, element wheel modifiers, crit caps, arena tier thresholds & weekly rewards, multi-battle cap, pity defaults, daily reset hour/timezone, rate limits… Admin edits through schema-typed forms.

### `bot_defs`
`name, avatar_champion_key, personality jsonb (team archetype, element bias), rating_band, roster jsonb (generated champion instances w/ gear tiers), refresh_policy`. A nightly job + admin editor manage the ladder population.

### `newsPost` (content, not a table)
`title, body, startsAt, endsAt, pinned, active`. Content rather than its own table, and deliberately: a post carries a *window*, so it appears and disappears on the clock exactly the way an event does — an operator writes Friday's patch note on Tuesday, publishes once, and it shows up by itself. A table would have needed either a scheduler or somebody awake at the right hour. The body is markdown-lite and the client renders it as **text, never as HTML**: a post reaches every player at once, and "we trust our own operators" is not an argument that survives one compromised session.

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
`id, account_id unique, profile_name citext unique, level, xp, energy, energy_updated_at, silver bigint, crystals, valor_medals, roster_capacity, vault_slots, tutorial_step, tutorial_progress, tutorial_action_id, tutorial_skipped, settings jsonb, summon_pity jsonb, last_summon_action_id, last_vault_action_id, daily_counters jsonb, daily_counters_day, last_multi_battle jsonb, last_daily_reset_at, is_bot bool default false` — bots are players; every system (arena, leaderboards) works on them uniformly. Currencies as columns (hot, small); stackable items normalized below. `vault_slots` is what the player has *bought*, not the capacity — the base and the ceiling are `game_config`, so an operator raising the base raises everybody's vault without touching a single player row (Q5).

Three of those are worth their own sentence:

- **`daily_counters` + `daily_counters_day`** — every per-day allowance in one map keyed by counter name (`multiBattle` today; eight quest counters in P8), stamped with the game-day it belongs to. One map rather than a column each, because adding an allowance must not be a migration. There is deliberately **no reset job**: a counter whose stamp is not today reads as zero and is overwritten on the next write, so an account away for a month is current the moment it comes back. What "today" means is `lib/game-day` — the reset hour and timezone are `game_config` rows, so a game-day runs from the reset hour rather than from midnight.
- **`title`** — the honorific the account displays beside its profile name, awarded by the last step of the Valewarden's Path. One column rather than a table of earned titles: exactly one exists at EA, and a table for a single row would be a table to maintain. It becomes a list when a second source appears; the column is the *displayed* title either way, which is the only thing the game reads.
- **The four `tutorial_*` columns** — where in the script the player is (`tutorial_step`, a *position*), how far into that step's goal (`tutorial_progress`), the action that completed the last step so a retried advance replays (`tutorial_action_id`), and whether they left deliberately (`tutorial_skipped`). Columns rather than a row per step, because the tutorial is strictly sequential and exactly one step is ever open — a table would be a join to answer something the player row already holds. A position rather than a step key so an operator who re-cuts the script does not strand everybody mid-way through it on a number that no longer exists.
- **`chest_claims`** — the last completion chest taken per quest period: `{daily: {anchor, actionId}}`. An anchor rather than a boolean, for the same reason `player_quests` carries one: the chest re-opens when the stored anchor is no longer the current period's, so there is nothing to reset. The action id makes a retried claim replay rather than fail — a dropped response on a phone must not cost the chest.
- **`last_multi_battle`** — `{actionId, result}` for the most recent batch. A multi-battle writes **no `battle_sessions` rows** (thirty states and thirty logs is megabytes per farm, and a batch has nothing to resume), so the summary has nowhere else to live and a retried request has nothing else to replay. Exactly one is kept: the next batch overwrites it.
- **`summon_pity` + `last_summon_action_id`** — mercy counters per pool, and the same replay guarantee for pulls.

### `player_items`
`player_id, item_key, quantity bigint, unique(player_id, item_key)` — sigils, essences, tomes, emblems, consumables.

### `player_champions`
| column | notes |
|---|---|
| id, player_id, champion_key | |
| level, xp, stars (rank), ascension (0-6), awakening (0-6) | `rank` is the champion's *current* star, which starts at the definition's `baseRank` rather than at 1 (migration `0027_awakening` backfilled every existing row to at least its rarity's called rank). How far it can climb is never stored — it is the rarity's ceiling, read from `RANK_RANGE_BY_RARITY` at every gate. |
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

### `gear_loadouts`
`player_id, name, gear_ids jsonb, from_champion_id`, unique on `(player_id, name)`.

A saved relic set: the nine pieces a build is made of, named. It owns **relic ids rather than a champion**, which is the shape that serves both of the things players want out of it — one good set moved between champions as content demands, and two builds for one champion.

**`gear_ids` is deliberately not a set of foreign keys.** A relic named in a loadout can be sold, and a loadout naming a sold piece is an ordinary state of the world months after saving it: applying skips what is gone and says so, where a cascade would silently rewrite the set instead. `from_champion_id` *is* a foreign key, but only as a note about where the set was captured — it nulls out if that champion is fed away, and nothing reads it but the "saved from" line.

Applying is planned before it is written (`planLoadout`, pure and shared with the client) and the writes go in one order for one reason: the partial unique index on `(equipped_champion_id, slot)` must never see two occupants, so every slot is cleared before anything is put into it — the same rule a single equip follows.

### `titan_records`
`player_id, dungeon_key, best_damage bigint, best_tier_key, last_damage bigint, runs int`, unique on `(player_id, dungeon_key)`.

One bounded row per player per Titan, and deliberately **not** a log of runs. A Titan pays *per run*, at the rung that run reached, so there is no "already collected" state to keep — which is exactly what makes this a record rather than progress. What it holds is the two numbers the mode is about: the best you have ever managed, and the last thing you did, so "did that change help" is a glance rather than a memory. A `titan_runs` log would grow without bound for a fact nobody reads twice, and the nightly prune would have to learn about it.

Keys are not here: they are an ordinary entry in `players.daily_counters`, keyed `titan:<dungeon_key>` so two Titans cannot share an allowance, and so the rollover needs no job (§5.1).

**`best_tier_key` is the rung the *record run* reached**, not a recomputation — a worse run afterwards does not demote it, and only a new best moves it.

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
`player_id, event_key, occurrence, points, claimed_milestones jsonb, claim_action_id`, unique on `(player_id, event_key, occurrence)`.

`occurrence` is the game-day the window opened on, and it does for events exactly what `period_anchor` does for quests: a weekly event runs again next week and the ladder starts over, so last week's row simply stops matching and there is nothing to reset. A one-off carries the day it was scheduled to open, so an operator re-running the same event later gets a fresh score rather than a total somebody has been sitting on since March.

Points are added in SQL (`points + n`) rather than read-then-written — a score is the one number here that is pure accumulation, and expressing it as an increment means it cannot be lost even if the fan-out's player lock ever moves. Claimed indices are stored so claiming is idempotent and a milestone list an operator extends mid-event does not re-open what was already paid.

### `login_claims`
`player_id, track (calendar|welcome), day, claimed_on, claim_action_id`, unique on `(player_id, track, claimed_on)`. A row per claim rather than a counter: the calendar gives day N on the Nth *claim*, so a player who misses a day loses the day and not their place.

**`login_claims` is never pruned, at any setting**, and the nightly job has a test that fails if it ever is. The whole of a track's state is `count(*)` over these rows plus "was one of them today" — which cycle a player is on, which tile glows and whether it is spent all fall out of those two numbers. So there is nothing here for the daily reset to do, and no counter that can drift from the ledger that produced it. The unique index is what stops two tabs both taking day 7; `claim_action_id` is what lets a retried claim replay rather than fail.

The `loginTrack` content type holds the days themselves — one entity per *track* (thirty tiles or seven), because a track is only ever read whole and "re-cut the calendar for August" should be one draft to review rather than thirty. A day carries a reward map, champions granted outright, champions the player picks *one* of (the day-30 selector), and relics to roll. Publish validation refuses gaps or duplicates in the day numbers, a second active track of the same kind, and any key that does not resolve.

### `players.showcase`
`jsonb` array of `player_champions` ids, in display order. Instance ids rather than champion keys: the public card shows *this* Aureleth at her level and rank, not the definition. Empty means the player has never chosen, and the card falls back to their strongest — so a card is never blank, and the picker is something to reach for rather than something to get past. A chosen champion that is later released simply drops out of the card rather than leaving a hole.

### `players.avatar_champion_key`
`text`, nullable. The champion whose face the account wears in the top bar and on its public card; null is the plain crest with the profile name's initial on it, which is where every account starts and a perfectly good place to stay.

A champion **key** rather than a `player_champions` id, and that is the whole difference between this and `showcase` above. The showcase presents a particular copy — this Aureleth, at her level and rank — so it has to name the instance. A face is a face: which unit, not which copy. Storing the key means feeding away one Anuria of three does not blank the portrait, and a rank-up that mints a new row does not either.

Ownership and champion-hood are checked when it is **set** — the key has to resolve in the published bundle, must not be food, and the account must hold a copy. It is deliberately *not* re-checked on read: an account that fed away its last Anuria still chose her, and a portrait that vanishes without being touched is worse than one that outlives the copy behind it. The showcase is where ownership is asserted; this is a picture.

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
`id uuid, player_id, mode, stage_key/arena ref, state enum(active|won|lost|retreat|expired), seed, content_rev, team jsonb, snapshot jsonb (latest engine state), action_count, energy_spent, rewards jsonb (granted on completion), action_id uuid (idempotency), can_skip bool, created_at, resolved_at`

**`can_skip`** is decided when the fight opens and stored rather than recomputed. The rule is "had this stage been beaten *before* this fight" (owner, 2026-08-22), and by the time the last turn resolves `recordClear` has already run — so asking the progress table again would answer about the clear this very battle produced, and every first attempt would report itself skippable the moment it was over. Arena rows are always true: an arena stage key is an opponent rather than a place, so no arena fight is ever a repeat.
### `battle_logs`
`battle_id fk, events jsonb (compressed event list)` — in practice the events live on the session row itself rather than in a second table, so a session and its log are pruned together. Kept `ops.retainBattleDays` (14 ⚙); an **active** session is never pruned at any setting, because a player who left a fight open over a weekend must come back to it. `arena_battles` outlives them on purpose — the ladder's history is what settles a dispute, and it is small.

### `summon_history`
`player_id, pool_key, sigil_item_key, champion_key, rarity, pity_counters_after jsonb, created_at` — the pity state IS derivable but we cache counters on `players.summon_pity jsonb` for O(1) reads.

### `champion_sightings`
`player_id, champion_key, first_seen_at, unique(player_id, champion_key)` — champions the player has *met*, recorded on a summon and when a battle starts. The Chronicle reads owned from `player_champions` and seen from here, which is what makes it a record of the world rather than a list of receipts.

### `mailbox`
`id, player_id, title, body, attachments jsonb (a reward map), sent_by (`system` | `admin:<account name>`), batch_id, read_at, claimed_at, claim_action_id, expires_at, created_at` — the composer targets one player or everybody, fanning out a row per recipient at send time inside one transaction, so a send either reaches everybody or nobody. Bots are never recipients: they hold no balances, and a row per bot would be sixty wrong denominators in every claim statistic.

`batch_id` groups the rows one send produced, which is what turns the composer's log into "reached 43, read 38, collected 31" instead of a thousand unrelated rows. Attachments are paid through `RewardService`, so a gift lands in `economy_log` beside every other grant.

**Expiry is derived, never swept**: an expired message is one whose `expires_at` has passed, which is a `where` clause rather than a job — a server down for a week comes back with exactly the right inbox. Deleting the rows afterwards is the daily prune's business and is only about disk.

### `hall_of_valor`
`id, player_id, element, stat, level, updated_at` — unique on `(player_id, element, stat)`, level checked 0–10. A row per track rather than a jsonb map because a track is a *ledger*: it only ever goes up, one level at a time, each level bought with medals — and rows make that a constraint rather than a convention.

### `economy_log` (append-only audit of every grant/spend)
`id, player_id, source (battle:c01_s3|summon|quest:...|admin:<name>|mail|shop), deltas jsonb, created_at` — powers Admin player inspector + economy dashboards. Pruned to `ops.retainEconomyDays` (90 ⚙).

### `audit_log` (admin actions)
`id, account_id (rank admin at time of action), action, entity, entity_id, before jsonb, after jsonb, created_at` — every Admin mutation, no exceptions (including rank changes).

---

## 5. Indexing & ops notes (initial)
- Hot paths: `sessions(token_hash)`, `players(account_id)`, `player_champions(player_id)`, `gear_instances(player_id)`, partial index `gear_instances(equipped_champion_id) where equipped_champion_id is not null`, `battles(player_id) where state='active'`, `player_quests(player_id, period_anchor)`, `arena_state(rating)` for matchmaking bands, `mailbox(player_id) where claimed_at is null`.
- JSONB integrity: Zod at every boundary + CHECK constraints for enums; publish-time referential validation for content JSONB (skill→status keys, waves→enemy keys, drops→item keys).
- Migrations: drizzle-kit generated SQL committed to git; `UPDATE.sh` runs `migrate` before restart; destructive migrations require an explicit `--allow-destructive` flag and a fresh backup (script-enforced).
- Seeds: `apps/server/src/db/seed/` = the EA content in code-reviewable JSON/TS (7 champions, skills, lizard archetypes, 12 chapters, dungeons, quests, shops, calendar, bots, config). `SEED.sh` loads them into an empty install, and on an install that already has content adds only what is missing — new types and new `game_config` keys — never changing what is there (`--force-content` for a full refresh; player data never touched).
