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
- **Entry complexity is budgeted.** Deliberate simplifications vs the source (already reflected throughout these docs): 4 elements with one simple wheel · 28 status effects instead of 40+ · no blessings/glyphs/gear-ascension meta-layers at EA · **awakening kept but paid from one material out of the Depths** rather than from a second summoning economy with its own currency and pity (owner, 2026-08-22) · one arena, one medal currency · choice-based tomes · free gear removal · 48-node masteries instead of ~72 · simplified 3-star rule · no faction-locked or tower modes at EA. Each parked layer returns post-EA only when the base game feels mastered, never before.
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

**Which ladders a champion has is decided by its rarity** (owner, 2026-08-22). A champion is *called* at a star rank inside its rarity's band and can climb to its rarity's ceiling — and Commons have no climb at all, which is what makes them the food chain rather than a project:

| Rarity | Called at | Ceiling | Level cap at the ceiling | Ascends & awakens |
|---|---|---|---|---|
| Common | ★1–2 | its own ★ | 20 | no |
| Uncommon | ★2–3 | ★5 | 50 | no |
| Rare | ★3 | ★5 | 50 | yes |
| Epic | ★4 | ★6 | 60 | yes |
| Legendary | ★5 | ★6 | 60 | yes |

A champion's called rank is content (`champion.baseRank`); leaving it unset means the bottom of the rarity's band, so a Rare is ★3 and a Legendary ★5 without anybody typing it. The ceiling is never content — it is the rarity's, so a Common cannot be authored into a six-star.

1. **Level:** the cap is the star rank's — **★1/★2→20, ★3→30, ★4→40, ★5→50, ★6→60**, and 60 is the maximum any champion reaches. Experience comes from battles, from **Mistbrew** (one XP consumable, not one per element — the source game's four-way split turns levelling into inventory sorting and adds nothing to the decision), and from feeding other champions. Brews and bodies go into the same dialog because they answer the same question.
2. **Stars (rank-up):** at the level cap, **R→R+1 costs R food champions of exactly R stars** plus silver (e.g. ★4→★5: four ★4 champions). Ranked food ("broodlings" — levelled Commons) comes from campaign farming. **A rank-up resets the champion to level 1** against its new, higher cap — the source game's rule, and the reason a star is a commitment rather than an upgrade. Full costs in ECONOMY_BALANCE.md.
3. **Ascension:** 6 levels, capped by star rank, **Rare and above only**, paid in element **Essences** (Lesser/Greater/Prime + universal Pure Essence) from the Essence Springs. Every level boosts base stats; accessory slots gate on it — **Ring @ Asc 2, Amulet @ Asc 4, Banner @ Asc 6** — and Asc 6 additionally empowers one kit-defined skill. Exact tables in ECONOMY_BALANCE.md.
4. **Awakening:** 6 levels, **Rare and above only**, and the last thing left to do to a champion. It is gated on everything else being finished — the rarity's star ceiling, that rank's level cap, and a full ascension — and paid in **Waking Shards** and silver. The shard falls in the back half of the Depths and nowhere else. This is the deliberate simplification: the source game funds awakening from a second summoning economy with its own currency and its own pity, where Mistvale puts the depth in *getting* the shard rather than in a second system to learn.
5. **Skill Tomes:** Rare/Epic/Legendary tomes upgrade skills along each skill's ladder (damage %, effect chance, cooldown −1). Tome rarity must match champion rarity. EA choice: player **picks** the skill to upgrade (friendlier than RSL's random books — flagged as a deliberate deviation).
6. **Masteries:** unlock at account level 14 (with Proving Grounds). Three trees — **Onslaught** (offense), **Bulwark** (defense), **Insight** (utility/support) — 6 tiers each, paid in Bronze/Silver/Gold **Emblems**; capstones are build-defining (e.g. Onslaught capstone *Deathmark* ≈ Warmaster-style bonus damage; full trees in COMBAT_SYSTEM.md §9). Reset costs crystals.

**Watching a fight, and not watching one** (owner, 2026-08-22). Two conveniences, both earned:

- **Skip** — jumping a fight to its end — is offered only on a stage this account has **already beaten once**, so the first walk down a road is a fight a player sees. The Arena is exempt (its "stage" is an opponent, never a repeat). The **cold open is the one fight in the game that is never skippable** — it records no clear, so it can never earn its way past the rule; that is deliberate, and the tutorial's own *Skip tutorial* is the way past it, which takes the cold open with it.
- **Playback speed** runs **×1 · ×2 · ×4**. ×1 and ×2 are there from the first fight, **×4 opens on finishing the campaign on Normal** — every stage of that difficulty cleared at least once. The pairing is `battle.speedUnlocks` in Game config. The ladder stops at ×4 (owner, 2026-08-22, after ×8 and then ×6 above it were both judged too fast), and **finishing Brutal therefore opens no speed** — ×4 kept the condition it had. **Every rung is drawn**, the unearned one struck through with the campaign that opens it, because an unlock nobody can see is a feature that does not exist.

Both are gated on progress the server computes and the client is *told*; neither is refused at the mutation, because neither changes an outcome, a roll or a timer — a skipped fight resolves exactly as a watched one does, and a multiplier only divides the delay between events already decided.

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

### 9.2b The Valewurm (Solo Titan)

**Shipped C9.** The one mode that is not about winning. The Valewurm is a single enormous
enemy, authored so that no team kills it, and a run ends when the last champion falls or the
turn cap runs out. What a run is worth is **how much damage it did**, paid at the highest
rung of a ladder — so a run that ends badly still pays, and a run that ends slightly better
pays slightly better. That comparison is the whole loop: change one thing about the team,
spend a key, see whether the number moved.

It is the source game's Clan Boss with the clan taken out. The parked plan couples the Vale
Titan to Warbands (§14) and the puzzle never needed a guild — only an opponent nobody clears.

- **Keys, not energy.** Two a day per keep, restored by the daily rollover, spent when the
  fight opens and never refunded. The resource the mode limits is *attempts*, which is what
  stops it being brute-forced by farming. It also cannot be multi-battled.
- **A turn cap belongs to the Titan**, not to `combat.maxTurns` — 50 turns for the Valewurm,
  with the enrage from turn 30 making the back half the dangerous half.
- **Paid on any ending.** Victory, defeat, the cap and a retreat all score. A retreat is
  scored rather than voided because damage only ever accumulates: stopping early can only
  lower the number, so there is nothing for a forfeit to protect.
- **The mechanics are the puzzle.** The Valewurm's hit-counter shield wants five hits between
  its turns, which is reachable with a multi-hit attack on the team and out of reach with four
  big single ones — a *team-building* answer rather than a gear one. Turn-meter manipulation
  is deliberately left open, which is what earns a support a slot on a team built to hit
  things. Both are stated on the boss card before the key is spent.
- **The ladder is measured, not guessed.** `pnpm sim` fights the Valewurm with a fresh, a
  middling and a fully-built team and gates four things: that nobody kills it, that a fresh
  account clears the bottom rung, that a built one is an order of magnitude past that, and
  that the top rung is still above what a built team typically manages — so the mode keeps a
  ceiling to chase.

A Titan is a `dungeon` entity of kind `titan` with a `titan` block (cap, keys, ladder) and a
single `titan`-mode stage, so a second one is an Admin edit rather than a release. It is
excluded from the Depths hub, which is about floors and clears — neither of which it has.

### 9.2d The Wurm Wakes — the world boss (C10e)

The same creature as the Solo Titan, and that is the whole idea. All week the Valewurm lies
under the vale and wardens go down alone to find out how much of it they can move; at the
weekend it comes up, and the question changes from *how far can I get* to **how far can we
get**. One health pool, everybody's damage on it, and a chest for everybody who helped if
the vale actually gets through it.

It is the only genuinely **shared mutable state** in Mistvale. Every other number in the
game belongs to one account; this one belongs to the server, and the damage a warden does on
Friday is still gone when somebody else opens the game on Sunday. That is what makes the
world feel populated without a guild, a chat, a raid group, a schedule to keep with anybody,
or a WebSocket — the only social act available is turning up, and the only evidence anybody
else exists is that the bar moved while you were away.

- **The ladder is cumulative, not per run.** A Titan pays the rung a *run* reached; a wake
  pays each rung once, against everything an account has done to it all week. The Titan
  rewards the best hour you had; the Wurm rewards turning up. It is the **reliable** payout,
  which matters because felling it is not guaranteed.
- **The felling chest is flat and shared.** If the pool empties before the wake closes,
  everybody who struck it takes the same chest — the last blow and a single Friday strike
  are worth exactly the same. Anything scaled here would turn "did we get it?" back into
  "did I do enough?", which is the question every other mode already asks.
- **Overkill stays on the striker.** Damage past the last point of the pool is kept on their
  own total, because capping it would dock precisely the run that did the most for
  everybody.
- **Strikes, not energy.** Three a day, spent when the fight opens and gone whatever happens
  to it. The resource the mode limits is *attempts*: a shared bar you could farm down with a
  big enough energy bar would make felling it a question of who had the most energy.
- **Your battle is not the kill.** A strike is fifty turns against something authored to
  outlast anybody, so it is still standing in *your* fight when the turn cap runs out. What
  falls is the shared bar, which is a different number on a different screen — and the
  screen says so.

**No bots strike it.** The Arena has bots because a ladder needs opponents and a synthetic
one is still a real fight; a fabricated line on this board would be a lie about who was
here, and a bar that moved on its own would be a lie about what a strike is worth. If the
vale is too small to fell it, it is not felled — and the ladder does not care. `maxHp` is the
number an operator moves as the population grows, and it is content like everything else.

Mechanically it is a `dungeon` of kind `worldBoss` carrying a `worldBoss` block (schedule,
pool, cap, strikes a day, ladder, felling chest, claim grace) plus one `worldBoss`-mode
stage — the Titan's arrangement exactly, so a second world boss is an Admin edit. The wake is
derived from the clock by the same scheduler timed events use, so there is **no cron**: the
row is created lazily by whoever gets there first, and last week's contribution row simply
stops matching when the anchor moves on.

### 9.2c Trials (C10d)

The one mode where **what you own does not matter**. A trial hands the player four champions
they do not have, at a fixed level, in fixed relics, against a fixed enemy — and the same
dice. Nothing about the account changes any of it, so the only variable left is the play:
which skill, on which target, on which turn.

It exists to answer a collection game's oldest problem from both ends at once. A player who
has out-farmed the content has nothing interesting left to do with it; a player who has
farmed nothing has nothing to do at all. A trial is the same fight for both of them, which
is why it opens early (level 9) and never closes.

- **Par, not a clear.** Every trial carries a turn count to beat. Clearing is the easy half;
  the bonus is for clearing *well*, and it is paid **once** — the first attempt that comes in
  at or under par. A later run that also lands inside par pays nothing, because the puzzle
  was already solved. What is stored is the account's best turn count, which `stage_progress`
  has carried since P6a — a trial needs no table of its own.
- **The same dice for everybody.** A trial's battle seed is its own **stage key** rather than
  a fresh roll, so every attempt by every account opens the identical fight. That is what
  makes a par a measure of play rather than of luck, and it is why holding Auto until the
  crits fall well is not a strategy.
- **Nothing is spent.** No energy, no keys, no attempt limit. Multi-battle refuses a trial
  outright: a puzzle with one right answer, farmed ten at a time, would produce ten identical
  clears and pay for none of them.
- **Each one teaches one thing**, and each is built on a boss mechanic the engine has had
  since P6 and the game had never obliged anybody to use. Four ship: *The Warded Coil*
  (a hit-counter shield — cheap multi-hit openers break it, and the window it leaves is when
  the big skills come out), *The Mending Fen* (a mender behind a wall — everything spent
  anywhere else is handed straight back), *The Brood Crown* (two lethal hatchlings a turn,
  forever — the crown is the only health bar that stays down) and *The Standing Stone*
  (retaliation on every wound it feels, and a poison is not a wound).
- **The pars are measured, not guessed.** `pnpm sim` fights every trial twice — once on the
  engine's own auto-battle, once on the line the puzzle is authored around — and gates both
  halves: the line comes in inside par, and Auto does not. A trial whose par Auto can reach is
  a stage with a longer name; one whose par the line cannot reach is a wall. Two further
  puzzles were designed, measured and **cut** for failing the second gate, which is the gate
  doing its job.

A trial is an ordinary stage of a new `trial` mode carrying a `presetTeam` (P9b's machinery,
which the cold open already needed) and a `trial` block of `{ name, parTurns, parRewards,
hint }`. The fight runs through the ordinary battle routes, so playback, Auto, the speed
ladder and a reload mid-fight all work with no second implementation — and a fifth trial is
an Admin edit rather than a release.

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
- **Chronicle:** collection index, **grouped by faction** with an `owned/total` on each shelf, which is the shape the genre uses and the one that makes "which of these am I missing" a glance. **Nothing is hidden** — every champion in the game is listed whether or not the player has met them, greyed where they are not held (owner's call, 2026-08-21: a wall of question marks cannot be planned against, and the point of a collection tracker is to show what exists). Collection pressure made visible.
- **Profile:** public card (level, arena tier, showcase champions) viewable from arena/leaderboard.

## 12. Account & unlock cadence

Account levels 1–60 (XP from stage clears). Feature gating (initial): L2 login calendar · L3 relic upgrading · L4 quests+missions · L5 Bazaar · L6 multi-battle · L7 events · **L8 Arena + Hall of Valor** · **L9 Chronicle + Trials** · **L10 The Depths (springs)** · L11 expeditions · L12 relic dungeons · **L14 Proving Grounds + Masteries** · **L16 the Valewurm** · **L18 the Wurm Wakes** · L16+ deep floors pacing. Trials sit early on purpose: they are the one mode that does not care what has been farmed, so gating them late would waste the thing they are for. Energy cap grows with level (ECONOMY doc). Locked features visible as mist-shrouded teasers (see UI doc).

## 13. Fairness & EA posture
No payments in EA (crystals fully earnable; "premium" is a pacing currency, not a paywall). Real odds displayed. Bots never take top-10 leaderboard slots at week end (auto-yield rule). Single account per player expected but not enforced beyond rate limits. All balance changes publish-logged → visible "balance updated" badges (champion `balance_version`).

## 14. Post-EA parked systems (architected-for, not built)
**Warbands** (guilds) — first post-EA priority per the brief; ~~the Vale Titan (clan-boss analog)~~ **shipped solo in C9 as the Valewurm** (§9.2b), since the puzzle never needed a guild · **The Mistspire** (Doom-Tower-style ascending tower) · **Faction Trials** (faction-locked crypt ladders) · Live & Tag arena · Champion Fusion events · The Forge (crafting) · **Boons** (blessing-style empowerments) · Awakening tier · Mythic rarity · Battle pass ("Vale Pass") · skins · localization · native mobile wrap. Each has a reserved data-shape note in DATA_MODEL.md or an explicit extension point.

## 15. Approved additions (owner-approved 2026-08-16 — all in EA-0.1 scope)
1. **Choice-based skill tomes** (vs the source's random books) — §7.
2. **Multi-battle** from L6, 30 runs/day cap — §9.1 / ECONOMY §2.
3. **"Odds & Mercy" transparency panel** — §10.
4. **Team presets per mode** — team-select feature (ROADMAP P3).
5. **Daily first-win-of-mode bonuses** — quest-layer bonus (ROADMAP P8).
6. **Practice sandbox** — re-fight any cleared stage at zero energy / zero reward (ROADMAP P6).
7. **Colorblind-safe element glyphs** — UI_UX_DESIGN §element indicators.

**Dropped 2026-08-17 (owner):** battle replays and shareable battle-log links. The engine is deterministic and the event log is persisted, so the capability is still *there* — a replay is a seed and a log — but nothing is built on it and nothing is planned to be. The share-link half was the expensive part: a public, unauthenticated surface with its own privacy questions, for a game whose only audience is signed in.
