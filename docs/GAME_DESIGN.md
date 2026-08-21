# Mistvale — Game Design Document

> Status: **Planning — the master design reference for EA-0.1.**
> Mistvale is a 2D pixel-art, turn-based champion-collection RPG in the mold of Raid: Shadow Legends — structurally faithful to the genre-defining loop, with its own world, names, and numbers. Companion docs: `COMBAT_SYSTEM.md` (battle math & effects), `ECONOMY_BALANCE.md` (currencies, curves, rates), `CONTENT_PLAN_EA01.md` (every stage/quest/item shipping in EA-0.1), `docs/research/RAID_REFERENCE.md` (source-game research).
> Numbers in this document are **initial values** — all live in `game_config`/content tables and are tuned via the Admin Suite + balance-sim, not by editing code.

---

## 1. Vision & pillars

**One sentence:** Collect champions through the Mistgate, forge them into a warband, and reclaim a mist-drowned realm through deep, turn-based squad combat.

**Pillars (every feature must serve one):**
1. **Collection is the fantasy** — pulling, building, and mastering champions; every champion viable somewhere.
2. **Combat with real decisions** — turn-meter manipulation, buff/debuff chess, element counters; auto for farming, manual for pushing.
3. **Always a next goal** — interlocking progression ladders (levels, stars, ascension, gear, masteries, stages, arena tiers) that feed each other.
4. **A living, breathing pixel world** — everything animated, everything reactive; "full game", not "UI demo".
5. **Respect the player** — transparent odds, visible pity, no pay wall (EA has no payments at all).

### 1.1 Depth budget — "deep grind, gentle onboarding" (owner directive)
Mistvale must be **as grindy and content-rich as the source game without its ten years of accreted complexity**. The source is the structure; we ship its *core* systems complete and park its bolt-on layers. Binding rules:
- **Grind depth is sacred.** There must always be something worth farming: gear RNG (substats/rolls/sets), 252 stars × 3 difficulties, 4 dungeon ladders + springs rotation + Proving Grounds, per-champion masteries, Hall of Valor's year-scale sink, arena weeklies, events, missions, the collection itself. "Play 5 minutes then AFK" must never be optimal — energy, tokens, rotations, and events keep sessions meaningful all day.
- **Entry complexity is budgeted.** Deliberate simplifications vs the source (already reflected throughout these docs): 4 elements with one simple wheel · 28 status effects instead of 40+ · no awakening/blessings/glyphs/gear-ascension meta-layers at EA · one arena, one medal currency · choice-based tomes · free gear removal · 48-node masteries instead of ~72 · simplified 3-star rule · no faction-locked or tower modes at EA. Each parked layer returns post-EA only when the base game feels mastered, never before.
- **Teach by unlocking.** Systems appear one at a time via the level-gating table (§12) with one-sentence explanations; a new player should never see more than one unfamiliar system at once.
- When a future design choice trades depth against approachability: keep the grind, cut the rulebook.

## 2. World & narrative

**The realm of Mistvale** was a federation of old kingdoms until the **Worldmist** — a sentient, hungry fog — rolled down from the peaks and swallowed the lowlands. Whole armies vanished into it. Generations later, the mist has settled into an ecology: things live in it, things come out of it… and with the **Sigils** — rune-keyed anchors forged by the lost kingdoms — heroes can be *called back out of it*.

You are a **Valewarden**: keeper of a half-ruined refuge on the mist's edge and bearer of the last working **Mistgate**, a standing portal that answers Sigils with champions — warriors, wraiths, and stranger things the mist has kept.

The spark of EA-0.1's campaign: the **Sskarn Broods** — cold-blooded serpentfolk who thrive inside the mist — have surged out of the Sunken Marches under their warqueen **Ssyleth the Coilmother**, overrunning the twelve regions of the vale. Your warband pushes them back region by region (which is also the honest lore for why every EA enemy is a lizard: it's an invasion — more monster families join in later updates).

Tone: melancholy dark fantasy with warmth — a campfire in the fog, not grimdark.

## 3. Factions

Eight factions structure collection, lore, faction-content (post-EA), and summon variety. **All eight are active in EA-0.1**: the full roster (§5) spreads across them, with art-pending members using the placeholder model until their sprites arrive via the Admin Suite.

| Faction | Identity | EA members (final art ⭐) |
|---|---|---|
| **Vale Sentinels** | Knight-remnants of the old federation; discipline, oaths, steel | ⭐Anuria + 5 |
| **Emberclan** | Mountain warhost of feuding fire-cults; fury and iron | ⭐Thordakk + 4 |
| **The Wayfarers** | Itinerant conclave of mist-scholars, hedge-wizards, pilgrims | ⭐Maruan, ⭐Darius + 4 |
| **Hollowborn** | The mist's dead, walking out of it with memories half-intact | ⭐Khazgor, ⭐Rattledagger + 5 |
| **Sskarn Broods** | Serpentfolk empire of the Sunken Marches (enemy faction — with playable exiles & captives) | ⭐Sethlurias + 5 |
| **Thornweald Court** | Fey of the deepwood; bargains and briars | 3 (founding members) |
| **Runebound Halls** | Dwarven vault-holds beneath the peaks | 2 (founding members) |
| **The Drowned Choir** | Tide-cult of the flooded coast | 2 (founding members) |

## 4. Elements ("the Four Breaths")

Every unit has one element; the wheel drives strong/weak hits (exact math in COMBAT_SYSTEM.md §4):

- 🔥 **Ember** (red) → burns 🌿 **Verdant** (green) → drinks 🌊 **Tide** (blue) → quenches 🔥 Ember
- 🌫 **Mist** (violet) — outside the wheel: never weak, never strong; Mist champions are rarer pulls (the "void-like" prestige element, own Sigil type).

Element read at a glance: colored ring under every unit, icon chip on every card (colorblind-safe: shape + color, see UI doc).

## 5. Rarities & roles

- **Rarities:** Common → Uncommon → Rare → Epic → Legendary (Mythic reserved post-EA). Rarity drives base-stat band, aura strength, skill-kit depth (Commons 2 skills … Legendaries 4), tome rarity needed, food value.
- **Roles:** Attack / Defense / HP / Support — determines stat spread, gear affinity and AI defaults; shown as a chip everywhere.
- **EA roster (owner-approved): 37 champions + 6 food units.** Seven champions have final art (the §6 showcase); the other 30 use the **placeholder model** — the territorial-lizard sprite with per-champion tints — until Marvin swaps in real sprites/avatars via the Admin Suite (asset-registry swap, zero code). Breakdown: 3 Uncommon · 13 Rare · 14 Epic · 6 Legendary summonable · 1 exclusive Legendary (missions reward). Full table with kits: `CONTENT_PLAN_EA01.md §1b`.
- **Food economy (owner-approved):** **Sskarn Broodlings** (Common ×3 element tints) and **Sskarn Broodguards** (Uncommon ×3) are food units on the lizard model — summonable from Faded Sigils, dropped by campaign — feeding the source-faithful level/rank-up chain. Lore: captured broodlings sworn into service. Food units are excluded from Chronicle collection-completeness.
- Many more champions (and food-champion designs) are coming from the owner over time; the content pipeline treats "new champion" as pure data + art upload, so the roster grows without releases.

## 6. The showcase seven (final-art champions)

Full kit data (multipliers, chances, tome ladders) in `CONTENT_PLAN_EA01.md §1`; the other 30 roster champions are tabled in `§1b`. All seven are Epic; the three **starters** mirror the source game's starter trio: three elements, three playstyles, all campaign-viable.

| | Champion | Faction · Element · Role | Design intent | Kit sketch |
|---|---|---|---|---|
| ⭐ | **Anuria, Arrow of the Vale** | Vale Sentinels · Tide · Attack | Self-buffing **sharpshooter** (Athel-pattern): consistent single-target pressure at range | A1 *Twinshot* — 2 arrows, small Weaken chance · A2 *Warden's Aim* — instant self ATK+50% & Crit+30% (2t) + turn meter · A3 *Arrowstorm* — AoE volley, 75% chance Weaken (2t). Aura: team ATK+15% (Campaign) |
| ⭐ | **Thordakk Cindermaw** | Emberclan · Ember · Attack | AoE bruiser (Galek-pattern): wave-clear king, tanky for an attacker | A1 *Axefall* — heavy single hit · A2 *Emberwake* — AoE, 60% chance ATK-Down 30% (2t) · A3 *Ashen Roar* — AoE + self Counterattack (2t). Aura: team HP+15% (Campaign) |
| ⭐ | **Maruan the Stillwater** | Wayfarers · Verdant · Support | Sustain + damage-over-time (Kael-inverted): the beginner-friendly safety pick | A1 *Thornlash* — hit + 40% Poison 5% · A2 *Rite of Reeds* — team heal 20% of Maruan's HP + cleanse 1 debuff · A3 *Verdant Ruin* — AoE, 75% chance 2× Poison 5% (2t). Aura: team DEF+15% (Campaign) |
| | **Darius Veilcaller** | Wayfarers · Mist · Attack | Glass-cannon control mage; the "big pull" of early pools | A1 *Hexbolt* — hit + 30% SPD-Down 15% · A2 *Umbral Torrent* — AoE, 50% SPD-Down 30% (2t) · A3 *Rite of Ruin* — huge nuke ignoring 25% DEF. Aura: team ACC+40 (Depths) |
| | **Khazgor of the Silent Rank** | Hollowborn · Ember · Defense | DEF-scaling wall; provoke/counter anchor for Arena & bosses | A1 *Gravecleave* — DEF-scaled hit · A2 *Deadman's Bulwark* — self Shield (25% MaxHP) + AoE 75% Provoke (1t) · A3 *Standfast Eternal* — team DEF+30% (2t) + self Counterattack (2t). Aura: team DEF+20% (Arena) |
| | **Rattledagger** | Hollowborn · Mist · Attack | Turn-meter assassin; speed-meta seed for Arena | A1 *Bonestab* — fast stab, +20% crit chance · A2 *Marrowdrain* — hit + steal 25% Turn Meter · A3 *Deathrattle* — 3 hits on random enemies, each 60% chance TM −30%. Aura: team SPD+12% (Arena) |
| | **Sethlurias, Tidebound Exile** | Sskarn (exile) · Tide · HP/Support | HP-scaling warder; shields + protection, lore hook into the campaign villain | A1 *Tidebrand* — HP-scaled strike · A2 *Scalesong Ward* — team Shield (20% of his MaxHP, 2t) + SPD+15% (2t) · A3 *Coilguard* — heal weakest ally 30% + Ally Protection 25% (2t). Aura: team RES+30 (Depths) |

Starter choice presents ⭐-marked three on pedestals with honest guidance (Maruan tagged "recommended for new Valewardens"). The un-picked two remain summonable later (like RSL).

## 7. Champion progression (the four ladders)

1. **Level & rank:** Level cap by star rank — ★1→10, ★2→20, ★3→30, ★4→40, ★5→50, ★6→60. XP from battles (+events). **Rank-up** at max level consumes food champions: N champions of rank N−1 stars? No — Mistvale uses the source pattern: to go from rank R to R+1, feed R champions of rank ≥R stars? **Locked rule (simple + familiar): rank-up from R→R+1 costs R "food" champions of exactly R stars** (e.g. 3★→4★: three 3★ champions). Ranked food ("broodlings" — leveled Commons) comes from campaign farming. Full costs in ECONOMY_BALANCE.md.
2. **Ascension:** 6 levels per champion (capped by star rank, source-faithful), paid in element **Essences** (Lesser/Greater/Prime + universal Pure Essence) from the Essence Springs. Every level boosts base stats; accessory slots gate on it — **Ring @ Asc 2, Amulet @ Asc 4, Banner @ Asc 6** — and Asc 6 additionally empowers one kit-defined skill. Exact tables in ECONOMY_BALANCE.md.
3. **Skill Tomes:** Rare/Epic/Legendary tomes upgrade skills along each skill's ladder (damage %, effect chance, cooldown −1). Tome rarity must match champion rarity. EA choice: player **picks** the skill to upgrade (friendlier than RSL's random books — flagged as a deliberate deviation).
4. **Masteries:** unlock at account level 14 (with Proving Grounds). Three trees — **Onslaught** (offense), **Bulwark** (defense), **Insight** (utility/support) — 6 tiers each, paid in Bronze/Silver/Gold **Emblems**; capstones are build-defining (e.g. Onslaught capstone *Deathmark* ≈ Warmaster-style bonus damage; full trees in COMBAT_SYSTEM.md §9). Reset costs crystals.

**Power score:** single derived number per champion (stat-weighted, formula in COMBAT doc) used for lists, arena matchmaking bands, and bot synthesis — informational, never a gameplay input.

## 8. Gear ("Relics")

Six relic slots — **Weapon, Helm, Shield, Gauntlets, Cuirass, Boots** — plus three **accessories** (Ring, Amulet, Banner) gated by ascension. Slots have fixed-or-choice main stats (weapon flat ATK, helm flat HP, shield flat DEF; gauntlets/cuirass/boots percentage-or-flat choices incl. SPD boots), 0–4 substats by rarity, ranks ★1–6, upgrade +0→+16 with success-chance ladder and substat rolls at +4/+8/+12/+16 — the full genre-standard system, exact tables in ECONOMY_BALANCE.md.

**16 Relic Sets at EA** (2- or 4-piece; drop sources in parentheses): Swiftwind (SPD+12%, Wyrm's Hollow) · Bloodthorn (4pc Lifesteal 30%, Silkmire) · Ironroot (HP+15%, everywhere/campaign) · Wolfsfang (ATK+15%, campaign) · Stoneguard (DEF+15%, Frostgrave) · Hawkeye (C.RATE+12%, Cinderspire) · Reaver (C.DMG+20%, Wyrm's Hollow) · Truestrike (ACC+40, Cinderspire) · Wardweave (RES+40, Frostgrave) · Mendersong (heal/turn 5%? → *Regeneration-style*, Silkmire) · Bulwark of Thorns (4pc Counter 20%? → *Retaliation-style*, Arena shop) · Gravebind (4pc 25% Provoke on hit → *Taunting-style*, Arena shop) · Stormcoil (4pc +TM on crit → *tempo set*, Proving Grounds) · Leadenscale (4pc Stun 18% on hit, Frostgrave deep floors) · Mistveil (4pc 15% Unkillable-style 1t once/battle? — **cut for EA balance risk**, replaced by: Pathfinder (SPD+8%+ACC+20, springs)) · Emberheart (4pc HP Burn on hit 25%, Cinderspire deep floors). Final list + exact bonuses locked in CONTENT_PLAN_EA01.md.

## 9. Game modes (EA-0.1)

### 9.1 Campaign — *The Reclamation*
12 chapters × 7 stages × 3 difficulties (Normal/Hard/Brutal; Nightmare data-reserved) — **252 stages, all shipped**. 3-wave stages, and an x-7 warlord in every chapter with a signature of its own. Stars (≤3/stage): win · win with no deaths · win within the turn limit → chapter star-chests at 7/21/42/63★, counting all three difficulties together. First-clear bonuses, replay farming (relics, silver, food, XP — one relic set per chapter, one slot per stage number; the full table is CONTENT_PLAN §3). **Difficulty unlocks: clear 12-7 of the difficulty below**, so Hard is a second pass over the whole vale rather than an alternative to the chapter you are on. Auto + Multi-battle make it the farming backbone.

**Multi-battle** (L6 ⚙, 30 runs/day ⚙, 10 per press ⚙) fights the same stage N times server-side and answers with a summary rather than N event logs — at thirty runs the logs are megabytes and the point of the button is that nobody was going to watch them. It works on any stage the player can enter, campaign or Depths, and it is not a shortcut: same engine, a fresh seed each run, the same energy and the same payout as fighting them by hand. The count the player asks for is trimmed by the server to what today's allowance, their energy and the per-press cap actually allow, and the summary says which one bit. **A lost run ends the batch** and keeps everything the earlier runs earned — throwing a losing team at a stage nine more times is a way to spend energy on nothing.

**Practice** is the opposite deal: re-fight any stage you have *already cleared*, for no energy and no reward at all — no silver, no experience, no drops, no clear recorded. The stars still show, because the question a sandbox answers is "would this team have held?". A stage nobody has beaten cannot be practised; free reconnaissance on every boss in the game is not a sandbox, it is a solved puzzle.

### 9.2 The Depths (dungeon hub)
- **4 Relic dungeons** (15 floors each at EA, boss every floor, floors 13-15 "deep" tier): **Wyrm's Hollow** (speed/crit-dmg relics; the Broodwyrm boss — turn-meter breath phases), **Frostgrave Vault** (defense/resist; the Rimebound Sentinel — stun gaze), **The Cinderspire** (accuracy/crit-rate; the Ashpriest — HP-burn aura + buff steal? simplified: cleanse-punisher), **Silkmire Depths** (lifesteal/HP; the Broodmother — add-summoning). *(All bosses use scaled lizard art with distinct tints/scale until unique art lands — mechanics are real regardless.)*
- **Proving Grounds** (mastery dungeon, 10 floors): drops Emblems; weekly-ish cadence via energy pricing.
- **Essence Springs** (ascension keeps, source-faithful rotation): **Pure Spring open every day**; Verdant Mon & Thu, Ember Tue & Fri, Tide Wed & Sat, **Mist Sun only**; all springs open daily during a new account's first 7 days. 10 floors each.

### 9.3 Arena (async PvP) + Hall of Valor
Classic arena: 4v4 vs snapshot **defense teams**; tokens cap 10, +1/hour (source-faithful), opponent offer list with refresh; Elo-lite rating → tiers **Bronze I-III, Silver I-III, Gold I-III, Platinum**; per-win **Valor Medals** (amount scales with tier) + weekly tier chest (reset Monday). **AI bots seed every band** (never an empty ladder; natural names with no bot marker — owner-approved; admin-managed). **Hall of Valor**: spend Valor Medals on permanent account-wide element-keyed stat bonuses (per element × stat, 10 levels — the Great Hall analog), doubling as the long-term arena sink.

### 9.4 Tutorial / Onboarding — *The First Calling*
Scripted RSL-style opening: cold-open battle with all three starters pre-made (taste of power) → the Mistgate flickers, you may keep only one (**starter choice**) → guided: first summon, equip relic, upgrade relic, clear 1-1…1-7, unlock Quests → tutorial rewards seed the first days. Guide NPC: **the Wardenmaster**, a Hollowborn lantern-keeper.

**Shipped P9a–P9b**, as the `tutorialStep` content type — fifteen steps, cold open included. Three things about how it is built are worth carrying forward:

- **A step's completion condition is an ordinary goal**, so the tutorial is a subscriber to the fan-out quests and missions already use rather than a mechanism of its own. Nothing that reports activity knows it exists, and a new step is authored exactly like a new daily.
- **Skippable as a whole, not per step.** The design said "skippable-per-step for alts"; the build makes skipping one decision that ends the script for good. Per-step skipping would have meant deciding what to do about a step's rewards and the kit the next step depends on — and an alt who wants out wants out of all of it, not of step 7.
- **The cold open borrows rather than grants.** A `tutorial`-mode stage carries the team it is fought with, so the three starters are never minted into a roster the Mistgate is about to reduce to one. The near-loss is authored — the third wave is built to hurt — rather than forced by the engine, and the borrowed relics roll from the stage key so every new warden fights the same fight.

## 10. Summoning — the Mistgate

| Sigil | Analog | Pool | Base rates (initial) |
|---|---|---|---|
| **Faded Sigil** | Mystery | Broodlings/Broodguards (food) + Rares | C 74% / U 20% / R 6% |
| **Gleaming Sigil** | Ancient | Rare–Legendary, all elements | R 91.5% / E 8% / L 0.5% |
| **Mistwoven Sigil** | Void | Mist-element champions only (R/E/L) | R 91.5% / E 8% / L 0.5% |
| **Radiant Sigil** | Sacred | Epic+ only | E 94% / L 6% |

- **Mercy/pity (visible in-game, source-faithful):** Gleaming/Mistwoven — Epic chance +2%/pull after 20 pulls without an Epic+; Legendary chance +5%/pull after 200 without a Legendary; Radiant — Legendary +2%/pull after 12. Counters are per sigil type, additive, reset on hit, and shown on the "Odds & Mercy" panel. Exact tuning in ECONOMY_BALANCE.md.
- x1/x10 pulls, reveal cinematics by rarity (skippable), NEW badge + Chronicle registration, dupes flow to rank-up stock with a "reserved as food?" affordance (locked champions never auto-foddered).
- **The reveal is theatre over an outcome already settled.** The server decides every card before the first frame; what the client chooses is the order they are turned in — the best one last, always, because a reveal that opens on the legendary has nothing left to give. The wind-up climbs to rare on every pull so it cannot be read as a tell, and only tells above that, where the telling is the reward. None of it can change what was received (UI_UX §1.2).
- All rarities pull **real champions** from the 37-champion roster (owner-approved); art-pending champions show their placeholder sprite + tinted avatar frame until real art is uploaded via Admin.

## 11. Meta & retention systems

- **Quests:** Daily (7-8 tasks + completion chest), Weekly, Monthly ladders — classic gacha checklist, all admin-editable.
- **Missions — "The Valewarden's Path":** ~80-step curated chain from tutorial to endgame (teachers disguised as goals: "3★ chapter 2", "reach Silver arena", "+12 a relic"…), big milestone rewards; final EA reward: **Aureleth, Voice of the Vale** — an exclusive, unsummonable Legendary (Mist · Support; the Arbiter-analog) + title "Warden of the Reclamation".
- **Events (timed):** point-accrual framework with milestone ladders; EA presets: **Champion Training** (XP), **Dungeon Delve** (Depths clears), **Summon Surge** (pulls). Admin composes/schedules freely; Haven banners + event screen.
- **Login calendar:** 30-day rolling track + separate 7-day newcomer track (day 7: Gleaming Sigil ×2).
- **Bazaar:** rotating relic/sigil/essence stock for silver (refresh timer + manual refresh), crystal tab (energy refills, silver caches, roster slots).
- **Mail:** system/admin gifts with claimable attachments; **News:** announcement feed on Haven.
- **Chronicle:** collection index (owned/seen/teased factions) — collection pressure made visible.
- **Profile:** public card (level, arena tier, showcase champions) viewable from arena/leaderboard.

## 12. Account & unlock cadence

Account levels 1–60 (XP from stage clears). Feature gating (initial): L2 login calendar · L3 relic upgrading · L4 quests+missions · L5 Bazaar · L6 multi-battle · L7 events · **L8 Arena + Hall of Valor** · L9 Chronicle · **L10 The Depths (springs)** · L12 relic dungeons · **L14 Proving Grounds + Masteries** · L16+ deep floors pacing. Energy cap grows with level (ECONOMY doc). Locked features visible as mist-shrouded teasers (see UI doc).

## 13. Fairness & EA posture
No payments in EA (crystals fully earnable; "premium" is a pacing currency, not a paywall). Real odds displayed. Bots never take top-10 leaderboard slots at week end (auto-yield rule). Single account per player expected but not enforced beyond rate limits. All balance changes publish-logged → visible "balance updated" badges (champion `balance_version`).

## 14. Post-EA parked systems (architected-for, not built)
**Warbands** (guilds) + **the Vale Titan** (clan-boss analog) — first post-EA priority per the brief · **The Mistspire** (Doom-Tower-style ascending tower) · **Faction Trials** (faction-locked crypt ladders) · Live & Tag arena · Champion Fusion events · The Forge (crafting) · **Boons** (blessing-style empowerments) · Awakening tier · Mythic rarity · Battle pass ("Vale Pass") · skins · localization · native mobile wrap. Each has a reserved data-shape note in DATA_MODEL.md or an explicit extension point.

## 15. Approved additions (owner-approved 2026-08-16 — all in EA-0.1 scope)
1. **Choice-based skill tomes** (vs the source's random books) — §7.
2. **Multi-battle** from L6, 30 runs/day cap — §9.1 / ECONOMY §2.
3. **"Odds & Mercy" transparency panel** — §10.
4. **Team presets per mode** — team-select feature (ROADMAP P3).
5. **Daily first-win-of-mode bonuses** — quest-layer bonus (ROADMAP P8).
6. **Practice sandbox** — re-fight any cleared stage at zero energy / zero reward (ROADMAP P6).
7. **Colorblind-safe element glyphs** — UI_UX_DESIGN §element indicators.

**Dropped 2026-08-17 (owner):** battle replays and shareable battle-log links. The engine is deterministic and the event log is persisted, so the capability is still *there* — a replay is a seed and a log — but nothing is built on it and nothing is planned to be. The share-link half was the expensive part: a public, unauthenticated surface with its own privacy questions, for a game whose only audience is signed in.
