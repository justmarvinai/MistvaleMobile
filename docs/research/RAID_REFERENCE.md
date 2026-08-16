# Raid: Shadow Legends — Systems Research Reference

> **Purpose:** design-research input for Mistvale. Mistvale replicates the *structure and feel* of the genre-defining game with its own world, names, and numbers — this file records how the source game actually works (with `[verified]`/`[approx]` confidence tags and sources) so our analogs are faithful where we want fidelity and deliberate where we deviate. Deviations are listed per system in `docs/COMBAT_SYSTEM.md`, `docs/ECONOMY_BALANCE.md`, and `docs/GAME_DESIGN.md`.
> Compiled from three research passes (combat/champions · content/progression · economy/meta) on 2026-08-16.

---

# PART I — COMBAT MECHANICS & CHAMPION SYSTEM

## 1. Champion Attributes

### Affinities (4)
- Magic (blue) > Spirit (green) > Force (red) > Magic; circle: Magic beats Spirit, Spirit beats Force, Force beats Magic. Void (purple) has no advantage/disadvantage vs anything. [verified — Plarium support, fandom wiki]
- **Affinity advantage (attacking into weak affinity):** 50% chance the hit lands as a "Strong Hit" (+30% damage) and an extra +15% chance of a Critical Hit. [verified — official Plarium support article, quoted identically by fandom wiki/HellHades]
- **Affinity disadvantage (attacking into strong affinity):** damage reduced by 20% overall, plus 35% chance of a "Weak Hit"; a Weak Hit deals −30% damage, can never be a Critical Hit, and cannot apply debuffs. [verified — Plarium support + fandom + gamehelper; the "weak hits can't apply debuffs" clause verified in 2 secondary sources]
- Crit rate at disadvantage: reported both as "C.RATE effectively −30%" (InTeleria) and "crit rate capped at ~85%" (forum/fandom). Practical effect: even 100% C.RATE champions weak-hit ~1/3 of the time into bad affinity. [approx — sources conflict on exact formulation]
- Weak/crit determination order: game first rolls weak/strong hit, then crit; weak → crit impossible. [verified]

### Rarities (6)
Common (grey) → Uncommon (green) → Rare (blue) → Epic (purple) → Legendary (gold) → Mythical (crimson, added 2024). [verified]
- Rarity affects: base stats, number/power of skills (Common ~2 skills, Rare ~3, Epic 3–4, Legendary 4 incl. passive/aura more often) [approx], skill-tome rarity required, ascension potion costs, XP-per-level requirement, summon rates.
- Shard summon rates: Mystery — Common 74.2% / Uncommon 24.4% / Rare 1.4%; Ancient & Void — Rare 91.5% / Epic 8% / Legendary 0.5%; Sacred — Epic 94% / Legendary 6%; Primal — Rare 82.5% / Epic 16% / Legendary 1% / Mythical 0.5%. Mercy system: separate pity counters per shard type. [verified]
- **Mythical mechanics:** two switchable Forms (Base/Alternate) via "Metamorph" skill — switching resets all cooldowns (except Metamorph itself) and grants an extra turn; forms can differ in skills and even role/type; each form's skills booked separately using Mythical Skill Tomes (total tome count ≈ a Legendary's Legendary-tome cost). [verified — Plarium 7.50 notes/BlueStacks]

### Roles (4)
Attack / Defense / HP / Support. Role sets the base-stat distribution and which stat damage skills typically scale from (ATK-, DEF-, or HP-based multipliers). [verified]

### Factions (16)
Banner Lords, High Elves, The Sacred Order, Barbarians, Ogryn Tribes, Lizardmen, Skinwalkers, Orcs, Demonspawn, Undead Hordes, Dark Elves, Knights Revenant, Dwarves, Shadowkin, Sylvan Watchers, Argonites (16th faction, launched with the Kassandra fusion Jan 2026, fourth member of the Nyresan Union). [verified]

## 2. Stats

Full stat list: HP, ATK, DEF, SPD, C.RATE (crit chance), C.DMG (crit damage bonus), RES (resistance), ACC (accuracy). [verified]
- Universal base conventions: C.RATE base = 15%, C.DMG base = 50% for nearly all champions (a few outliers 57/60/63% C.DMG); base RES typically ~25–80; base ACC usually 0 (gear/masteries/aura provide it). [approx — community convention, per-champion pages]
- Base SPD range ≈ 90–115 (most 95–110). [approx]
- Typical level-60, fully-ascended base stats (before gear):
  - Legendary: HP ~13,000–24,000 (typical 18–21k); ATK ~900–1,700 (attack types ~1,300–1,650); DEF ~850–1,400. [approx]
  - Epic: HP ~15,000–20,000; ATK/DEF ~1,000–1,400. [approx]
  - Rare: HP ~13,000–18,000; ATK/DEF ~800–1,300 (e.g. Kael base ATK 1,200 — HellHades datamined example). [verified anchor, ranges approx]
  - Uncommon/Common markedly lower; Commons also cannot ascend, permanently lowering their stat ceiling. [verified — HellHades]
- Stats double-dip: green "battle bonuses" from gear %-stats apply to base stats; DEF/HP champions scale damage off those stats using the same multiplier system as ATK. [verified]

## 3. Ranks & Leveling
- Star ranks 1–6; max level per rank: 10 / 20 / 30 / 40 / 50 / 60. [verified]
- **Rank-up (Tavern):** champion must be at its current rank's max level; consumes champions **of the same rank as the champion's current rank**, count = current rank: 1→2 needs 1× 1★, 2→3 needs 2× 2★, 3→4 needs 3× 3★, 4→5 needs 4× 4★, 5→6 needs 5× 5★ (+ Silver). Sacrificed champions can be any level/faction. [verified]
- **Chickens:** special food-only "champions" that exist pre-ranked (2★–5★) and substitute 1:1 for real champions in rank-ups; usable at any level. [verified]
- XP curve: exponential; per-level XP for a 6★ ≈ round(1680 × e^(0.076 × level)) (forum-derived), scaled down for lower ranks; total 1→60 on a 6★ is on the order of a few million XP. [approx]
- Feeding a 1★ champion in the Tavern = 1,600 XP (costs 900 Silver); best XP farm = Campaign 12-3 Brutal. [verified]

## 4. Ascension
- 6 ascension levels (purple stars). A champion cannot have ascension level higher than its star rank. [verified]
- Potions: Lesser / Greater / Superior tiers of the 4 affinity potions (Magic blue, Spirit green, Force red, Void purple) + Arcane potions (white, needed by every champion alongside their affinity potions). Farmed in the 5 Potion Keeps. [verified]
- Cost pattern: early levels use Lesser, mid levels Greater, levels 5–6 mostly Superior + Arcane; quantity scales steeply with rarity (Legendary ≫ Epic ≫ Rare) and with ascension level; exact per-level tables exist on ayumilove/HellHades but exact quantities could not be cross-verified here. [approx]
- Each level: base-stat boost; ascension 3 typically unlocks or upgrades a skill; some champions gain further skill upgrades at higher ascension. [verified]
- Accessory slots: Ring unlocks at rank 4; Amulet at rank 5 + ascension 5; Banner at rank 6 + ascension 6. [verified — fandom/HellHades; some sources state only the rank requirement, so treat the ascension coupling as the in-game gating]
- Common champions cannot be ascended at all. [verified — HellHades]
- Distinct from **Awakening** (patch 6.0+): red stars via Souls (Soulstones: Mortal/Immortal/Eternal, Altar of Souls), grants Blessings — separate system from potion ascension. [verified]

## 5. Turn Meter System
- Each combatant has a Turn Meter (TM) 0–100%. The battle engine advances in discrete **ticks**; every tick each combatant gains TM proportional to current SPD. Community/datamined constant: TM gain per tick = SPD × 0.07 (i.e., ticks-to-full = 1428.57 / SPD; 100 SPD ≈ 14.3 ticks, 200 SPD ≈ 7.1 ticks). [approx — datamined constant underpinning DeadwoodJedi/speed-calculator tools; tick model itself verified by Plarium forum/Raid 101]
- At ≥100% the champion takes a turn, then TM resets to 0. If several units cross 100% on the same tick, the one with the **highest TM value** (TM can exceed 100% internally) acts first. [verified — HellHades]
- Tie-breaking at identical speed: the attacking player's champion acts first everywhere except when you are the Arena defender; within a team, team-slot position breaks ties. True speeds can be fractional (percentage speed bonuses), so displayed ties often aren't real ties. [verified — community/forum]
- Battle start: all TMs start empty; fastest unit acts first. [verified]
- TM manipulation (instant effects, common magnitudes): Boost TM 5/10/15/20/30/50/100%; Decrease/Steal TM 20/25/50/75/100%. TM-reduction effects must pass the ACC-vs-RES check; several bosses (Clan Boss, both Dragons) are immune to TM reduction. [verified values as skill-dependent; immunity verified]
- Increase SPD buff: +15% or +30% SPD (changes fill rate multiplicatively); Decrease SPD debuff: −15% or −30%. [verified]
- Clan Boss (UNM) SPD = 190 — teams tune to 171–189 (boss first) or 191–209 (team first); standard tunes described as ratios (2:1, 4:3) of team turns per boss turn. [verified]

## 6. Damage Math (community-established)
- Core: `Damage = ScalingStat × SkillMultiplier × (1 + C.DMG if crit) × AffinityModifier × BookDamageBonus × Mastery/Buff/Passive modifiers × (1 − DEF_mitigation)`. [verified — HellHades formulation]
- Skill multipliers are datamined per skill (not shown in-game). Examples/ranges: A1s ≈ 1.7–2.2× total (often split over multiple hits); A2/A3 nukes ≈ 3.5–6.5× total (HellHades example: Kael A2 = 4.65× ATK); HP-scalers ≈ 0.2–0.3× MAX HP per hit; dual-stat skills weight the primary stat (~75/25, e.g. Peydma). Default Bomb multiplier = 2× ATK unless the skill overrides it. [approx ranges; Kael/bomb figures verified]
- **DEF mitigation:** damage reduction = DEF / (DEF + K); K ≈ 600 for a level-60 attacker (raid.guru datamine; consistent with K = 10 × attacker level). Diminishing returns — ~3,000 DEF ≈ 83% reduction; HellHades states DEF mitigates "up to ~85%" in practice; community rule: little value past ~4,000–5,000 DEF. [approx — community/datamine consensus, exact constant not officially published]
- Crit: multiplies by (1 + C.DMG); base C.DMG 50%; Weak Hits can't crit. [verified]
- Affinity modifiers: ×1.30 strong hit (50% chance w/ advantage); ×0.80 blanket at disadvantage and ×0.70 on weak hits (35% chance). [verified]
- DEF-ignore: skills with "ignores X% of DEF", Helmsmasher mastery (50% chance ignore 25% DEF); Bomb detonation ignores DEF entirely; Hex splash damage ignores DEF; Poison/HP Burn/Warmaster/Giant Slayer deal %-MAX-HP damage unaffected by DEF. [verified]
- Level affects damage only via stats (and the mitigation constant scaling with attacker level). [approx]

## 7. Accuracy vs Resistance (debuff landing)
- Every debuff (and TM-reduction/buff-stealing effect) rolls: first the skill's stated chance, then an ACC-vs-RES resist roll based on (attacker ACC − defender RES). [verified]
- Community-measured curve: ACC = RES → ~90% land / 10% resist; each point of RES above ACC costs ~1% land chance; ACC 30+ above RES → ~97% (cap); irreducible floor ~3–3.5% resist regardless of ACC (and ~3% minimum land chance regardless of RES), unless the skill says "cannot be resisted". [approx — raidoptimizer/forum tests; floor 3% vs 5% varies by source]
- Rules of thumb: ACC ≈ enemy RES + 25 caps you out; dungeon ACC requirement ≈ 10–11 × stage number (e.g., Spider 20: 200 RES → ~225 ACC); resist-builds want RES ≈ enemy ACC + 50+. [verified as community standards]
- ACC is never needed for damage, buffs on allies, or hit connection — only for enemy-targeted effects. [verified]

## 8. Buffs & Debuffs

### Buffs (standard strengths)
- Increase ATK 25% / 50% [verified]
- Increase DEF 30% / 60% [verified]
- Increase SPD 15% / 30% [verified]
- Increase C.RATE 15% / 30% [verified]
- Increase C.DMG 15% / 30% [verified]
- Increase ACC 25% / 50% [verified]
- Increase RES 25% / 50% [verified]
- Strengthen 15% / 25% (reduces damage taken) [verified]
- Shield (flat value from caster's stat, absorbs damage) [verified]
- Ally Protection 25% / 50% (caster takes that share of direct damage dealt to the protected ally) [verified]
- Continuous Heal 7.5% / 15% of MAX HP at the start of the holder's turn [verified]
- Counterattack (counters any hit with A1 at 75% of normal damage) [verified]
- Reflect Damage 15% / 30% [verified]
- Revive on Death (auto-revive when killed while active) [verified]
- Unkillable (HP cannot drop below 1; damage/debuffs still apply) [verified]
- Block Damage (immune to all incoming damage) [verified]
- Block Debuffs (debuffs cannot be applied) [verified]
- Veil / Perfect Veil (untargetable by single-target skills; −7.5% / −15% damage from AoE; Veil breaks when the holder deals damage with non-A1 damaging skills, Perfect Veil survives attacking) [verified]
- Stone Skin (−85% damage taken, removes & blocks all debuffs except Bomb and HP Burn, immune to Decrease MAX HP and TM decrease, 50% chance to resist buff removal/steal; countered by Bombs ~3× damage and HP Burn ~5× damage) [verified]

### Debuffs (standard strengths)
- Decrease ATK 25% / 50% [verified]
- Decrease DEF 30% / 60% [verified]
- Decrease SPD 15% / 30% [verified]
- Decrease ACC 25% / 50% [verified]
- Decrease C.RATE 15% / 30% [verified]
- Decrease C.DMG 15% / 25% (some sources list 15/30) [approx — sources conflict]
- Weaken 15% / 25% (increases damage taken) [verified]
- Poison 2.5% / 5% of target MAX HP at start of target's turn; stacks up to 10 [verified]
- Poison Sensitivity 25% / 50% (increases Poison tick damage) [verified]
- HP Burn 3% of MAX HP at start of holder's turn, also burns all the holder's allies for 3% of their MAX HP; only one HP Burn per champion [verified]
- Leech (any attacker heals for 18% of damage dealt to the holder) [verified]
- Heal Reduction 50% / 100% [verified]
- Block Buffs (cannot receive buffs) [verified]
- Block Active Skills (only A1 usable) [verified]
- Block Passive Skills [verified — exists, referenced in Almighty Immunity list]
- Block Revive [verified]
- Stun (skip turns) [verified]
- Freeze (skip turns) [verified]
- Sleep (skip turns; removed immediately when the holder takes damage) [verified]
- Provoke (forced to use A1 on the provoker) [verified]
- Fear (50% chance the holder's skill "misfires" — turn wasted, skill does NOT go on cooldown) [verified]
- True Fear (50% chance skill misfires AND the skill goes on full cooldown) [verified]
- Petrification (cannot act; takes 60% less damage while petrified; Bombs deal +300% to petrified targets) [verified]
- Sheep / Polymorph (loses all skills/passives; can only use a special Sheep attack; 50% chance to remove the Sheep debuff after it attacks) [verified]
- Bomb (detonates when timer expires: damage ignores DEF, cannot crit, scales off placer's stat — default 2× ATK; affected by Increase/Decrease ATK; multiple bombs can stack) [verified]
- Hex (marker debuff: the holder also takes 10% of single-target damage and 2% of AoE damage dealt to their allies, ignoring DEF; specific champions get bonus effects vs Hexed targets) [verified]
- Smite (when the holder uses an Active Skill, a meteor hits them for 25% of their MAX HP + 5% MAX HP to all their allies; one Smite per team) [verified]

### Rules
- Duration ticking: effect durations decrease at the end of the affected champion's turn; a buff a champion casts on itself ticks down at the end of that same turn (so self-buffs are effectively 1 turn shorter than ally-cast ones). Counterattacks/extra hits don't consume durations; extra turns do. [approx — universally accepted community model, not officially documented]
- Stacking: identical buffs/debuffs don't stack — re-applying refreshes duration; the 50%/30% "stronger" versions override weaker ones. Exceptions that stack: Poison (≤10), Bombs; unique-per-champ: HP Burn, Stone Skin; unique-per-team: Smite. Effect bar capacity ~10 debuffs per champion. [verified for refresh/poison/burn; cap 10 approx]
- Increase/Decrease Debuff Duration effects cannot extend CC (Stun, Sleep, Freeze, Provoke, Fear, True Fear, Petrification, Sheep, Smite). [verified]
- Instant effects (not buffs/debuffs, cannot be resisted unless targeting enemy): TM boost/deplete, cleanse debuffs, remove/steal buffs, transfer debuffs, heal, revive, extra turn, cooldown increase/decrease, Destroy/Decrease MAX HP, HP swap/equalize. Enemy-targeted instants (TM reduction, buff removal/steal, cooldown increase, MAX HP destroy) do check ACC vs RES. [verified]
- Boss immunity — "Almighty Immunity" (most bosses): immune to Stun, Freeze, Sleep, Provoke, Block Active Skills, Block Passive Skills, Fear, True Fear, Petrification, HP-exchange/HP-balance effects, and cooldown-increase effects. Clan Boss additionally immune to Decrease SPD, Decrease MAX HP, TM-reduction and HP-exchange; only Clan Boss + the two Dragons are TM-reduction-immune (other dungeon bosses can have TM reduced). Poison/HP Burn/Decrease DEF etc. DO work on bosses. [verified]

## 9. Skills
- A1 = default skill, no cooldown (used by Provoke/counterattack). A2/A3 (/A4 on some champions) = active skills with cooldowns, typically 3–6 turns; cooldown starts when used; cooldowns can be manipulated by skills ("reset/reduce/increase cooldown"). [verified]
- Passive skills: always-on effects (blockable by Block Passive Skills; disabled by Sheep). [verified]
- **Aura:** team-wide stat bonus, active only when the champion is in the leader slot; exactly one aura per battle. Aura stat types: HP, ATK, DEF, SPD, C.RATE, RES, ACC; area restrictions: "in all battles", "in Arena", "in Dungeons", "in Faction Crypts", "in Doom Tower", "in Campaign". Area-restricted auras are simply inactive elsewhere. [verified]
- **Skill upgrades:** each skill has an upgrade ladder; each tome/book applies +1 level to a RANDOM skill that still has upgrades (no choosing); modern QoL: slider/MAX to spend many tomes at once, still random. Upgrade types: Damage +5% / +10%, Buff/Debuff Chance +5% / +10% / +15%, Cooldown −1 turn. [verified]
- Tome rarities gate champion rarity: Rare Tomes → Rare and below; Epic Tomes → Epic and below; Legendary Tomes → Legendary and below; Mythical Tomes for Mythicals (each form booked separately). [verified]
- Feeding an identical duplicate champion also grants +1 random skill level (standard way to book farmable champions). [verified — community-universal]
- Fully-booked damage difference matters: "Increase Damage from Books" is a separate multiplier in the damage formula. [verified — HellHades]

## 10. Masteries
- 3 trees: **Offense, Defense, Support**, each with 6 tiers. Per champion: only 2 of the 3 trees may be activated (3rd locks); max 15 masteries: 2× Tier-1, 3 each of Tiers 2–5, exactly 1 Tier-6. [verified — Plarium support]
- Scrolls: Basic (T1–2), Advanced (T3–4), Divine (T5–6), farmed in Minotaur's Labyrinth; full 15-mastery build = 1,650 scrolls: 100 Basic + 600 Advanced + 950 Divine. [verified] Per-mastery cost: T1 = 20 Basic, T2 = 20 Basic, T3 = 100 Advanced, T4 = 100 Advanced, T5 = 150 Divine, T6 = 500 Divine (derived; exactly consistent with the verified totals). [approx/derived]
- Instant unlock: 800 Gems buys all scrolls for one champion. Reset: first reset free, then 150 Gems per reset; all scrolls refunded. [verified]
- Notable masteries (current values):
  - **Offense** — T1: Blade Disciple (+75 ATK), Deadly Precision (+5% C.RATE), Keen Strike (+10% C.DMG), Heart of Glory (+5% dmg when attacking at full HP) [verified]; T2: Shield Breaker (+25% dmg vs Shielded targets), Life Drinker (heal 5% of damage when ≤50% HP), Whirlwind of Death (+6 SPD per kill, stacks to 18) [verified]; T3: Bring It Down (+6% dmg vs higher-MAX-HP targets), Wrath of the Slain (+5% dmg per dead ally, max 10%), Cycle of Violence (30% chance −1 random cooldown on big hits ≥30% target HP), Opportunist (+12% dmg vs Stun/Sleep/Freeze targets) [verified]; T4: Methodical (A1 damage +2%/use, max +10%), Kill Streak (+6% dmg per own kill in Arena / +3% elsewhere), Blood Shield (Shield 15% MAX HP on kill) [verified]; T5: Single Out (+8% dmg vs targets <40% HP), Stoked to Fury (+4% dmg per debuff on self) [verified]; **T6 (pick 1): Warmaster (60% chance: bonus dmg = 10% target MAX HP, 4% vs bosses, once per skill), Giant Slayer (30% chance: 5% target MAX HP, 2% vs bosses, rolls per hit), Helmsmasher (50% chance to ignore 25% of target DEF), Flawless Execution (+20% C.DMG)** [verified]
  - **Defense** — Tough Skin (+75 DEF), Blastproof (−5% AoE damage), Rejuvenation (+5% healing/shield value received), Bulwark (redirects 5% of damage from all allies to self), Retribution (50% chance to counterattack when losing ≥25% MAX HP in one hit), Deterrence (20% chance to counterattack when an enemy places Stun/Sleep/Fear/True Fear/Freeze on an ally); T6: Unshakeable (+50 RES), Fearsome Presence (+5% chance to land Stun/Sleep/Freeze/Provoke). [verified]
  - **Support** — Pinpoint Accuracy (+40? ACC, T1) [approx], Lore of Steel (multiplies Basic artifact set bonuses by +15%), Evil Eye (first A1 hit on a target: −20% TM single-target / −5% AoE), Arcane Celerity (30% chance +10% TM when own debuff expires/removed), Rapid Response (30% chance +10% TM when own buff expires/removed), Swarm Smiter (+4 ACC per living enemy, max 16); T6: **Master Hexer** (30% chance to extend own debuffs by 1 turn; excludes Stun/Sleep/Freeze/Provoke/Bomb/Fear/True Fear), Eagle Eye (+50 ACC), Elixir of Life (+10% MAX HP-ish) [last value approx]. [verified except noted]
- Warmaster/Giant Slayer bonus damage is %-MAX-HP based, unaffected by target DEF (capped values vs bosses as above). [verified]

## 11. Battle Flow
- **Waves ("rounds"):** most Campaign stages = 3 waves; dungeon boss stages typically = 2 trash waves + boss wave; Arena and Clan Boss = single round. [verified for campaign/arena/CB; dungeon wave count approx]
- **Between waves:** buffs AND debuffs are cleared, all skill cooldowns tick down by 1, champions heal a small amount, and turn order restarts (fastest first); Shield-set-style "per Round" effects re-trigger at each wave start. Because effects don't carry, players time COOLDOWNS (not buffs) for boss waves. [verified — fandom "Battle Waves" + HellHades; heal amount unquantified, TM-reset detail approx]
- In single-round modes (Arena, Clan Boss), everything persists until it expires or is removed. [verified]
- **First actor:** empty TMs at start, fastest unit first; speed ties → attacker's team first (except on Arena defense); intra-team ties → higher team slot. [verified]
- **Auto-battle AI:** default AI uses non-A1 skills as they come off cooldown (generally higher-slot/longest-cooldown first), with no strategic holding — known to waste AoEs/heals; targets chosen by simple heuristics unless the player pre-selects a target. [approx — community-observed] Since patch 4.30, **Skill Instructions** in Saved Teams override AI: per-skill settings Default / Don't Use / Opener (use on first turn of round 1) / Priority 1st–3rd choice; they work only in Auto or Multi-Battle with saved presets. [verified]
- Battle speed: ×1/×2 toggle only; Plarium has explicitly declined true ×4 (Super Raids double drops instead); Multi-Battle automates repeated runs. [verified]
- PvE "rounds" vocabulary: Plarium's texts use Round = wave; effects reading "each Round" re-trigger per wave. [verified]

### Part I sources
Plarium support (Affinity · List of Buffs and Debuffs · Masteries · The Tavern · Saved Teams & Skill Instructions), raidshadowlegends.fandom.com (Affinity Guide · Rank · Battle Waves · Almighty Immunity · Accessories · Shield Set · Bomb · Clan Boss), hellhades.com (damage calculation · debuffs/buffs · fear/true fear · petrification · ascension · masteries · veil), raid.guru (damage formula), raidoptimizer.com (ACC vs RES), ayumilove.net (masteries · buffs/debuffs · leveling · spider ACC rules · increase debuff duration · mercy system), deadwoodjedi.com (CB calculator · speed tunes), raid-codex.com & empyreanrule.com & inteleria.com (masteries), Plarium 7.50 notes + BlueStacks (Mythicals), GlobeNewswire (Argonites faction), Plarium forums (turn meter/speed · XP formula), theriagames.com (arena speed ties).

---

# PART II — CONTENT STRUCTURE & PLAYER PROGRESSION

## 1. Campaign

**Structure**
- 12 chapters ("locations") × 7 stages each = 84 stages per difficulty; 4 difficulties = 336 total stages. [verified]
- Chapter names, in order: 1 Kaerok Castle, 2 Sewers of Arnoc, 3 Catacombs of Narbuk, 4 Durham Forest, 5 Felwin's Gate, 6 Palace of Aravia, 7 Tilshire, 8 Valdemar Strait, 9 The Deadlands, 10 Godfrey's Crossing, 11 The Hallowed Halls, 12 Brimstone Path. [verified]
- Difficulties: Normal → Hard → Brutal → Nightmare. Each next difficulty unlocks by completing the final stage (12-7) of the previous one. [verified]
- Stages 1–6 are wave battles; stage 7 of every chapter is the **boss stage** (an oversized, stat-inflated elite champion; no unique scripted boss kits — the boss model varies by chapter). [approx]

**Energy cost per stage**

| Difficulty | Stages 1–6 | Boss stage (x-7) |
|---|---|---|
| Normal | 4 | 5 |
| Hard | 6 | 7 |
| Brutal | 8 | 9 |
| Nightmare | 16 | 18 |

All [verified].

**Drops**
- Slot by stage number (fixed): stage 1 = Weapon, 2 = Helmet, 3 = Shield, 4 = Gauntlets, 5 = Chestplate, 6 = Boots; stage 7 (boss) can drop any of the 6 slots. [verified]
- Artifact **set** by chapter: Ch1 Life, Ch2 Offense, Ch3 Defense, Ch4 Crit Rate, Ch5 Accuracy, Ch6 Speed, Ch7 Resist, Ch8 Lifesteal, Ch9 Destroy, Ch10 Retaliation, Ch11 Fury, Ch12 Curing. [verified]
- Drop rank/rarity scales with chapter and difficulty (Normal drops low-rank Common→Rare; Brutal/Nightmare late chapters drop 5–6★ up to Epic quality). [approx]

**3-star rating & star rewards**
- 3★ = win using **2 or fewer Champions**, in **under 10 minutes**, with **no Champion dead at battle end** (deaths mid-fight are fine if revived before the end). 2★ = win with the whole deployed team alive; 1★ = just win. [verified]
- Stars are tracked **separately per difficulty** (max 252 per difficulty = 84 stages × 3★), and separately from Faction Wars stars. [verified]
- Star-milestone chests per difficulty award gems, silver, shards, skill tomes and energy; the 252-star (full-clear) reward of **Hard, Brutal and Nightmare is a Sacred Shard each**. [verified]

**XP / silver farming (why Brutal 12-3 / 12-6)**
- Base champion XP per surviving champion: **Brutal 12-3 ≈ 4,326** (≈17,304 team total); **Brutal 12-6 ≈ 4,400** (slightly more XP than 12-3); **Nightmare 12-3 = 9,604** (38,415 team total). [verified]
- With 2× XP boost + RAID Card, Brutal 12-3 yields ≈10,382 XP per trained champion per run. [approx]
- Nightmare 12-3 gives ~10% more XP **per energy** than Brutal, but less silver per energy. [verified]
- 12-3 vs 12-6: 12-3 drops **Shields**, which vendor for more silver than 12-6's Boots, so 12-3 is the best silver+XP balance; 12-6 is chosen for pure XP. [verified]
- Standard practice: one maxed "farmer" champion carries 3 low-level "food" champions; XP is split across the team, so the food gains ~¾ of the total XP output. [verified]
- Player-account XP also accrues per run (Brutal chapter 12 ≈ 330 account XP/run). [approx]

## 2. Player Account Level & Feature-Unlock Gating

- **Max player level: 100** (raised from the original cap of 60). [verified]
- Energy cap: starts at **18** at level 1, rises with each level to **130 at level 60**, then stops growing (levels 61–100 give no additional cap). [verified]
- Level-up reward: full energy refill (equal to cap) + gems; milestone levels grant extras (incl. Sacred Shards) via the Progression Rewards menu. [verified]
- Account XP sources: every battle that spends energy/keys, daily/weekly/monthly/advanced quests (100/500/1,000 XP chunks), challenges and progress missions; most efficient grinds are Brutal/NM campaign and Faction Wars (FW stage 21 ≈ 375 XP/run). [verified]

**Feature-unlock table (player level → feature)**

| Level | Unlock |
|---|---|
| 1 | Campaign (Normal), core UI, Challenges [approx] |
| ~4–7 | Dungeons hub opens in the first days of play; all Potion Keeps open every day for a new account's first 7 days [approx / verified for the 7-day keep access] |
| 6 | **Tavern**, **Great Hall**, **Classic Arena** [verified] |
| 13 | **Clans** (join/create) → access to **Clan Boss** via clan membership [approx] |
| 15 | **Sparring Pit** (slot 1), **Guardian Ring** [verified] |
| 18 | **Market** [verified] |
| 30 | **Faction Wars** [approx — widely cited, not confirmed on wiki] |
| 35 | **Tag Team Arena**; **Hydra Clan Boss** (also requires a clan) [verified / approx for Hydra] |
| 35–40 | **Advanced Quests** (full 10-quest set at 35+; some sources say 40) [approx] |
| 38 | **Sand Devil's Necropolis** + Gear/Accessory Ascension (Oils & Extracts) [verified] |
| 40 | **Doom Tower**; Phantom Shogun's Grove ≈ same band [verified / approx for Shogun] |
| ~45 | **Iron Twins Fortress** [approx] |
| 50 | **Live Arena**; Great Hall "Area Bonuses" tab [verified] |
| ~55–65 | **Cursed City of Sintranos** [approx] |
| 60+ | **Champion Proving Grounds** (rotation dungeon, update 11.70) [verified] |

Note: Clan Boss has no separate account-level gate — it is gated by clan membership (clans at 13) [approx]; Hard Mode dungeons are gated by beating Normal stage 25 of each dungeon, not by level [verified]; Nightmare Campaign is gated by completing Brutal 12-7, not by level [verified].

## 3. Tutorial / Onboarding Flow

1. Intro cinematic: the Arbiter resurrects your fallen champion; the game drops you into a guided battle on **Kaerok Castle Stage 1** with a preset team that includes the four starters. [verified]
2. End of the tutorial battle: you "save" **one of four starter Champions** — this choice is **permanent**. [verified]
3. The four starters — all are **Rare, Attack-role, Magic-affinity** champions [verified]:
 - **Kael** (Dark Elves): Poison-based kit (AoE + poison debuffs); scales vs high-HP bosses (Clan Boss, Dragon); consensus best pick. [verified]
 - **Elhain** (High Elves): double-AoE crit nuker; fastest early campaign farmer and early Arena; falls off vs bosses. [verified]
 - **Athel** (Sacred Order): multi-hit A1 with self-buff/Weaken; consistent hits make her the Fire Knight-friendly pick. [verified]
 - **Galek** (Orcs): AoE damage with debuff utility; strongest very early, weakest long-term. [verified]
4. Clearing Stage 1 grants a free support champion, **Warpriest** (Rare, Sacred Order healer). [verified]
5. Forced guided steps in the first session: equip your first artifact, upgrade an artifact, level your champion in the Tavern (feed a food champion/brew), perform your first **Mystery Shard summon**, continue Kaerok Castle stages; feature tabs unlock as you level (Tavern/Great Hall/Classic Arena at level 6, with a guided first Arena battle). [approx — exact step order varies by client version]
6. Early free rewards:
 - New-account **promo codes** grant a free champion + boosts (e.g., RAID7-type codes). [approx — codes rotate]
 - All 5 Potion Keeps open daily for your **first 7 days**. [verified]
 - Login-calendar champions: first free **Epic at Day 30** (High Khatun) — see §10. [verified]
 - **Champion Chase Loyalty Program** (periodic, for eligible/new players): log in 7 days → featured **Legendary**; 14 days → its Perfect Soul. [verified]
 - Beginner Challenges tab: staged tasks paying silver, energy, shards. [approx]

## 4. Dungeons

**Full list & stage counts**
- **Gear dungeons (open daily): Dragon's Lair, Ice Golem's Peak, Fire Knight's Castle, Spider's Den** — Normal stages **1–25** (extended from 20 in 2021). **Hard Mode** per dungeon unlocks by beating that dungeon's Normal 25; launched with **+10 Hard stages** (patch 6.51.1, July 2023), later extended (Hard ladder now numbered to stage 30); **Mythical artifacts/accessories drop only from Hard stage 26+**. [verified / approx on the extension details]
- **Potion Keeps ×5** (ascension potions): **Arcane Keep — open every day; Magic Keep — Wed & Sat; Force Keep — Tue & Fri; Spirit Keep — Mon & Thu; Void Keep — Sun**. ~15 stages each. [verified schedule / approx stage count]
- **Minotaur's Labyrinth** (open daily): **15 stages**; drops Mastery Scrolls. [verified]
- **Iron Twins Fortress**: **15 stages per affinity**; daily affinity rotation (Spirit Mon/Thu, Force Tue/Fri, Magic Wed/Sat, Void Sun); entry costs **1 Fortress Key + energy**, **6 keys/day**; drops **Soul Coins / Soulstones** (Soul/Awakening system) and silver — no champion XP. [verified]
- **Sand Devil's Necropolis**: **25 stages**; unlocks at account level 38; drops **Oils** (Lesser/Greater/Superior) for artifact ascension. [verified]
- **Phantom Shogun's Grove**: **25 stages**; drops **Accessory Extracts** — Lesser (stages 1–25), Greater (10–25), Superior (17–25). [verified]
- **Champion Proving Grounds**: rotation-based dungeon for level 60+, features boss pairings incl. Minotaur (2025/26 addition). [verified]
- "Super Raids" toggle: double rewards for double energy/keys in DT, FW, the 4 gear dungeons, Sand Devil, Phantom Shogun. [verified]

**Energy costs** (Normal gear dungeons scale by stage): early stages ~6–8 energy, rising to **16 energy at stage 20+** (Dragon 20 = 16 [verified, two sources]; Minotaur 15 = 14 [verified]); Hard Mode stages ≈ **20–22 energy** (Hard Dragon 6 = 20; Hard stage 10 = 21). [approx for full curve]

**What each dungeon drops (current pools)**
- **Dragon's Lair**: Accuracy, Speed, Lifesteal, Destroy, Toxic, Frost, Daze, Avenging, Stalwart sets. [verified]
- **Ice Golem's Peak**: Life, Offense, Defense, Crit Rate, Resistance, Retaliation, Reflex, Cursed, Taunting sets. [verified]
- **Fire Knight's Castle**: Fury, Curing, Immunity, Shield, Crit Damage, Frenzy, Regeneration, Stun, Savage sets. [verified]
- **Spider's Den**: the accessory dungeon — Rings, Amulets, Banners (no armor sets). [verified]
- **Keeps**: Lesser/Greater/Superior ascension potions of that affinity (Arcane potions used by every champion; Void Keep for Void potions). [verified]
- **Minotaur**: Basic/Advanced/Divine Mastery Scrolls — full masteries per champion cost **1,650 scrolls (100 Basic / 600 Advanced / 950 Divine)**; stage 15 max drops per run ≈ 32 Basic / 16 Advanced / 12 Divine → ≈160 runs ≈ 2,240 energy per champion (or 800-gem instant buyout). [verified]

**Boss mechanics (summaries)**
- **Dragon**: straightforward — AoE breath + a Shield buff; his turn meter can't be pushed back, so Poison stacking is the core strategy. [verified]
- **Ice Golem (Klyssus)**: flanked by minions; passive retaliation nuke triggers when HP crosses thresholds **unless** the crossing damage came from Poison/HP Burn; strong self-heal. Hard "Tainted" version: Poison-immune, takes +10% from HP Burn, and casts Debilitating Frost (self-cleanse + −30% team turn meter). [verified]
- **Fire Knight (Fyro)**: hit-counter **shield** — must be broken with many hits (multi-hit A1 teams); shield count scales by stage (low stages ~4–6 hits, high stages ~10–12 [approx]); while shielded he punishes the team (AoE turn-meter reset). Hard version: **21 hits** to break and each hit into the shield destroys 1% of the attacker's MAX HP; Freeze works (−15% TM on Hard). [verified]
- **Spider (Skavag)**: summons 2 Spiderlings every time one of your champions takes a turn (max 10); spiderlings stack 5% Poisons and are devoured to heal the queen — counters: AoE clear, HP Burn, turn-meter control on the queen. [verified]
- **Minotaur**: builds a stacking rage/damage buff over the fight (enrage) and periodically slams the team — kill quickly before stacks accumulate. [verified/approx]
- Secret rooms exist only in the Doom Tower, not in dungeons. [verified]

## 5. Faction Wars (brief)

- One **Crypt per faction** — 16 factions as of 2026. [verified]
- **21 stages per crypt**; bosses ("Crypt Keepers") at stages **7, 14, 21**, evolving kits at each tier. Teams must be built only from that crypt's faction. [verified]
- Access at player level ~30 [approx]. Battles cost **Crypt Keys**; **12 keys granted per crypt** when it opens; keys are only consumed **on victory** (losses are free retries). Official docs describe a rotation: several crypts open per day, each crypt open 1 day per 7 (00:00 UTC cycle). [verified as documented; live client has loosened this over time — [approx]]
- The launch-era per-champion "lives" mechanic (champions lost a life when defeated and became temporarily unusable) was removed early in the game's life; keys are now the only limiter. [approx]
- 3★ = clear the stage with the full team alive. [verified]
- Rewards: **Glyphs** (HP/ATK/DEF/SPD/RES/ACC — used to enhance artifact substats) + Forge materials; star-milestone rewards up to a **Sacred Shard at 655 stars**; **Lydia the Deathsiren** (Void Legendary, unsummonable) for 3-starring every stage of the (original 13) crypts on Normal. [verified] A Hard Mode (2024+) shares the same keys. [verified]

## 6. Doom Tower (brief)

- Unlocks at player level **40**; resets **monthly**; two difficulties (Normal/Hard). [verified]
- Per difficulty: **132 stages = 108 regular floors + 12 boss floors (every 10th floor) + 12 secret rooms**. Regular floors are 3-wave battles. [verified]
- **3 rotations** cycle month to month, each with a fixed boss lineup + secret-room set. Boss pool: **Magma Dragon, Nether Spider (Agreth), Frost Spider (Sorath), Scarab King, Celestial Griffin (Grythion), Eternal Dragon (Iragoth), Dreadhorn, Dark Fae (Astranyx), Bommal the Dreadful** (Rotation 1 = Magma Dragon, Scarab King, Nether Spider, Frost Spider). [verified list / approx per-rotation composition]
- Keys, reset daily at 00:00 UTC: **10 Gold Keys** (first-time floor clears, incl. boss floors) + **10 Silver Keys** (secret rooms and re-farming beaten boss floors). No energy is used. [verified]
- Secret rooms = restriction fights (specific faction/affinity/rarity-only teams). [verified]
- Auto-Climb re-clears previously beaten floors automatically. [verified]
- Rewards: shards, skill tomes, energy, fragment/gear chests from boss-floor farming (source of DT-exclusive gear/fragment champions). [approx]

## 7. Quests

**Daily Quests — 7 per day (6 fixed + 1 that rotates between 2 variants)** [verified]:

| # | Quest | Reward |
|---|---|---|
| DQ1 | Fight 5 Classic Arena battles (win or lose) | 1 Energy Refill + 100 XP + 2,500 silver |
| DQ2 | Summon 3 Champions (Mystery Shards count) | 100 XP + 5,000 silver |
| DQ3 | Use 50 Energy | 100 XP + 2,500 silver + 2 Lesser Arcane Potions |
| DQ4 | Increase a Champion's level in the Tavern 3 times | 100 XP + 5,000 silver |
| DQ5 | Make 4 artifact/accessory upgrade attempts | 100 XP + 5,000 silver |
| DQ6 | Purchase an item in the Market | 100 XP + 5,000 silver + 5 Classic Arena Tokens |
| DQ7 | Rotates: Beat a Campaign Boss 3× **or** Win 7 Campaign battles | 100 XP + 5,000 silver |

- Completing all dailies: **10 Gems + 400 player XP** chain reward. [verified]
- Standard f2p loop: 3 Mystery Shards (5,000 silver each from Market) cover DQ2+DQ6 simultaneously. [verified]

**Weekly Quests — 6 quests**; first is "Claim the all-dailies reward 5 times"; others cover Clan Boss chests, Crypt Key usage, arena/dungeon activity [approx list]; completing all 6 = **1 Ancient Shard + 500 XP**. [verified]

**Monthly Quests — 5 quests** (largely "complete weekly sets" + long-tail activity); completing all 5 = **1 Sacred Shard + 1,000 XP**. [verified]

**Advanced Quests** (unlock mid-30s account level): a second daily set of **10 randomized quests** highlighting newer systems; completing all 10 in a day = **1 Energy Refill + 3 Plarium Points**, plus cumulative-completion rewards. [verified]

## 8. Missions / Progress Missions

- Three sequential mission **sets**, each ending in an exclusive Void Legendary: **Set 1 → Arbiter**, **Set 2 → Ramantu Drakesblood**, **Set 3 → Marius the Gallant**. [verified]
- Missions are strictly sequential (one at a time), spanning categories: Campaign, Arena, Dungeons, Clan Boss, Faction Wars, Doom Tower, artifacts/Great Hall, champion development. [verified]
- Arbiter chain ≈ **270 missions** split into parts (documented part sizes include Part 3 = 75 and Part 4 = 60, with Arbiter awarded on Part 4 completion). [verified parts / approx total]
- Ramantu chain: Part 5 = 60 missions (ends: 1 Sacred Shard), Part 6 = 60 (ends: 2 Legendary Skill Tomes), Part 7 = 63 (ends: **Ramantu Drakesblood**). [verified]
- Example missions — early: "Clear Kaerok Castle stages", "Equip/upgrade an artifact", "Summon from a Mystery Shard"; mid: "Beat Dragon's Lair stage N", "Reach Silver rank in Classic Arena", "3-star Brutal campaign chapters"; late (Arbiter finishers famously include) "Reach Gold IV in Classic Arena" and Nightmare-campaign / high-dungeon clears. [approx]
- Per-mission rewards: silver, energy, brews, tomes, shards, gems, artifacts. [verified]

## 9. Events & Tournaments

- **Events** = personal point-threshold reward tracks; **Tournaments** = bracketed leaderboards vs other players; both time-boxed. Typical durations: Summon Rush 2–3 days, Artifact Enhancement 2–3 days, Dungeon Divers 3–4 days, dungeon tournaments 3–4 days, Champion Training ~5 days; fusion cycles ~2 weeks, roughly monthly. [verified]
- **Champion Training**: points per champion level gained, scaled by rank/rarity — reported table: Rare 1★→6★ = 2/3/4/8/16/21 pts per level; Epic = 3/4/5/9/17/22; Legendary = 6/7/8/12/20/25. [approx — values vary slightly by event]
- **Dungeon Divers**: points per artifact obtained from dungeon runs, scaled by stage; best pts/energy at Normal stage 20 (~0.76 pts/energy) and Hard stage 10 (~0.95 pts/energy). [verified ratios]
- **Artifact Enhancement**: points at upgrade milestones (+4/+8/+12/+16), scaled by artifact rank; a 6★ artifact to +16 ≈ 330 pts; typical event targets ≈ 3,000 pts. [approx]
- **Summon Rush**: points purely by shard used, result irrelevant — **Mystery = 1, Ancient = 20, Void = 120, Sacred = 500**. [verified]
- **Champion Chase Tournament**: points for acquiring champions by rarity; ~25 fusion fragments per 2,500 pts + leaderboard placement rewards. [verified]
- **Champion Chase Loyalty Program** (newer, 2024+): daily objectives, capped 75 Chase Points/day; Day 7 = featured Legendary champion, Day 14 = its Perfect Soul. [verified]
- **Fusion events**: 3 formats — traditional (collect + max 4 Rares → Epic, 4 Epics at 5★/L50 → Legendary), fragment fusion (collect 100 fragments), hybrid; fragments/ingredient champions are earned in the component events/tournaments during the ~2-week window. [verified]
- **Tournaments** also run per-dungeon (points per run/stage), Arena (wins), and turn-based variants (fewest-turn clears); rank-tier rewards by leaderboard bracket. [approx]

## 10. Daily Login Rewards

- A long fixed calendar (documented to day 810+): daily items cycle silver, energy, gems, XP brews/boosts, chickens, Mystery/Ancient/Void/Sacred shards at intervals, skill tomes, glyphs, artifacts. [verified]
- Champion milestones on the calendar: **Day 30 — High Khatun (Epic)**, **Day 60 — Yaga the Insatiable (Epic)**, **Day 90 — Dark Athel (Epic)**, **Day 180 — Scyl of the Drakes (Legendary)**, **Day 270 — Visix the Unbowed (Void Legendary)**; days 271–390 pay **25 Cleopterix fragments/month** (4 months → Legendary Cleopterix). [verified]
- "New player 90-day arc" = the first three Epic milestones above plus the shard/tome drip; separate from it: first-7-days all-Keeps access and the Champion Chase Loyalty 7/14-day track when offered. [verified/approx]

## 11. Playtime / Idle Systems

- **Sparring Pit** (unlocks level 15): passive champion XP without battles. 5 slots total — slot 1 free, each additional slot 300 gems; slots upgrade with gems (~350+ per level), each upgrade level ≈ +1,000 XP/hr; base rate ≈ 2,200–2,400 XP/hr (varies by champion rank/rarity), max ≈ 4,400–4,500 XP/hr per fully upgraded slot. [approx]
- **Gem Mine**: passive gem trickle; max level 3; full upgrade costs 1,500 gems and repays itself in ~100 days (≈15 gems/day at max, per community math). [approx]
- **Energy regen**: 1 energy per 3 minutes up to cap (130 at level 60+); full refill purchasable for 40 gems. [approx regen rate / verified refill cost]
- No offline "AFK battle" earnings — idle income is limited to Sparring Pit XP, Gem Mine, and timer-based resources (energy, arena tokens, CB/FW/DT/Iron Twins keys). [approx]

## 12. Multi-Battle

- Automates consecutive runs of a chosen Campaign/Dungeon stage with a fixed team; each run consumes the normal energy/key cost. [verified]
- **30 free Multi-Battle attempts per day**; an active **RAID Card raises the cap to 100/day** (+70 at each reset); additional attempts sold in packs. [verified]
- Per session you set the repeat count (recent clients allow queuing up to ~50 repeats, bounded by your remaining daily attempts). [approx]
- Champion queue: replacement champions can be queued to auto-swap in when a team member hits max level. [approx]
- The session auto-stops when attempts run out, energy runs out (unless auto gem-refill is enabled), or all queued champions reach max level. [verified]
- Available from the early campaign, shortly after the tutorial. [approx]

### Part II sources
ayumilove.net (campaign XP/silver · quests · tournaments/events · progress missions · doom tower · login rewards), fandom (Campaign · Player Levels · Daily/Advanced Quests · Faction Wars · Doom Tower), Plarium support (3 stars · Faction Wars · Doom Tower · Iron Twins · Multi-Battles FAQ · Champion Chase Loyalty), hellhades.com (Doom Tower · secret rooms · login champions · Lydia · fusions · update 11.70), official raidshadowlegends.com + BlueStacks (hard-mode dungeons · FW · DT), empyreanrule.com (campaign · minotaur), inteleria.com (dungeon drop rates 2026), gamerempire.net (account leveling · shards), theriagames.com (Iron Twins · multi-battle), IGV (login days 1–150), GameLeap (champion training), AppGamer (dungeon divers), Plarium forums (dungeon divers pts/energy · nightmare unlock), playbite/GamingNoble/Dexerto (misc unlocks).

---

# PART III — ECONOMY, GEAR & META SYSTEMS

## 1. Currencies — full list, sources & sinks

| Currency | Sources | Sinks |
|---|---|---|
| **Silver** (soft) | Selling artifacts (largest source), campaign farming (Brutal 12-3/12-6 meta spots), dungeons, arena wins, quests, events/tournaments, login, Playtime | Artifact upgrades (dominant sink, millions per piece), rank-up champions, Market purchases, Forge crafting, vault expansion, (historically) gear removal [verified] |
| **Gems** (hard) | Gem Mine (up to 15/day), daily/weekly/monthly quests, missions, arena weekly chests, Clan Boss chests, events/tournaments, achievements, IAP | See §11 [verified] |
| **Energy** | Regen 1/3 min, level-ups, quests, events, gem refills (40 gems) | All PvE stage entries [verified] |
| **Classic Arena Tokens** | Regen 1/hour, cap 10; gem refills | Classic Arena battles (1/battle) [verified] |
| **Tag Arena Tokens** | Topped up to 10 daily (no passive regen) | Tag Team Arena battles [verified] |
| **Live Arena Tokens** | 5 granted daily at 00:00 UTC, cap 5; escalating gem refills | Live Arena matches [verified] |
| **Arena Medals** (Bronze/Silver/Gold) | Classic Arena wins — medal type matches your tier; convert 1 gold = 2 silver = 4 bronze | Great Hall upgrades only [verified] |
| **Gold Bars** | Tag Arena wins + weekly tier bundle | Tag Arena **Bazaar**: shards, tomes, food champs, forge materials, special accessories [verified] |
| **Live Arena Crests** | Live Arena victories | Advanced Great Hall "Area Bonuses" [verified] |
| **Clan Boss Keys** | 1 per 6 h (≈4 hits/day) | Clan Boss attempts [verified] |
| **FW Crypt Keys** | Daily allotment (12/day cited; defeats don't consume) [approx] | Faction Wars stages |
| **Doom Tower Keys** | 10 Gold + 10 Silver daily, reset 00:00 UTC | Doom Tower entries [verified] |
| **Shards** | See §6 | Portal summons [verified] |
| **Mastery Scrolls** | Minotaur (energy), 800-gem buyout, events | Masteries [verified] |
| **Skill Tomes** | Events, Bazaar, CB chests, Doom Tower, passes | Skill upgrades [verified] |
| **XP Brews / Ascension Potions** | Potion Keeps, Arena chests, events | Leveling / ascension [verified] |
| **Chaos Dust/Powder/Ore** | Iron Twins, Forge Pass | Artifact "Ascension" [approx] |
| **Forge Materials** | Tag Bazaar, events, Forge Pass, Hydra | Forge crafting [verified] |
| **Glyphs & Charms** | CB chests, Forge Pass, events | Substat enhancement; charms re-roll [verified] |
| **Clan/CvC/Hydra/Chimera currencies** | Clan activity | Clan Shop (incl. Void shards), Hydra chests [verified] |

## 2. Energy
- Regen: **1 energy per 3 minutes**, only below cap [verified]. Full bar at cap 130 ≈ 6.5 h [verified].
- Cap: grows with account level; **130 max at account level 60** [verified]. Growth ≈ +1 per level (cap ≈ 70 + level) [approx].
- Gem refill: **40 gems = +1 full bar** (can overfill above cap); flat cost, no daily escalation [verified 40; non-escalation approx].
- Level-up: restores a full bar [approx]. Daily quests/events award energy chunks [approx].
- Design note: energy is the primary F2P throttle; gems→energy is the recommended endgame gem sink [verified].

## 3. Artifacts / gear — complete system

### Slots
- 6 artifact slots: Weapon, Helmet, Shield, Gauntlets, Chestplate, Boots [verified]; 3 accessories: Ring, Amulet, Banner [verified]. Accessory unlock per champion via Ascension: Ring ≈ Asc 2, Amulet ≈ Asc 4, Banner ≈ Asc 6 [approx — sources conflict with rank-gates 4★/5★/6★; verify in client].

### Main stats per slot
| Slot | Possible main stats |
|---|---|
| Weapon | flat ATK only [verified] |
| Helmet | flat HP only [verified] |
| Shield | flat DEF only [verified] |
| Gauntlets | HP/HP%/ATK/ATK%/DEF/DEF% + **C.RATE%, C.DMG%** (exclusive) [verified] |
| Chestplate | HP/HP%/ATK/ATK%/DEF/DEF% + **ACC, RES** (exclusive) [verified] |
| Boots | HP/HP%/ATK/ATK%/DEF/DEF% + **SPD** (exclusive) [verified] |
| Ring | flat HP/ATK/DEF [verified] |
| Amulet | flat HP/ATK/DEF + **C.DMG%** [verified] |
| Banner | flat HP/ATK/DEF + **ACC, RES** [verified] |

### Main stat max values at +16 (Rank 6 / Rank 5)
HP flat 4,080 / 3,480 [approx] · HP%/ATK%/DEF% 60% / ~50% [verified R6] · ATK/DEF flat 265 / 225 [approx] · SPD 45 / 40 [approx, widely cited] · C.RATE 60% / ~47.5% [verified R6] · C.DMG 80% / ~65% [verified R6] · ACC/RES 96 / 84 [approx]. Main stat grows deterministically each level 0→16 [verified].

### Substats
- Start count by rarity: Common 0, Uncommon 1, Rare 2, Epic 3, Legendary 4 [verified]; max 4; pool excludes the main stat [verified].
- Rolls at +4/+8/+12/+16: fewer than 4 revealed → new substat added; else random existing upgrades [verified].
- Per-roll ranges (rank 6 / 5) [approx]: SPD 4–6 / 3–5 · HP%/ATK%/DEF% 4–6% · C.RATE ~3–6% · C.DMG ~4–6% · ACC/RES 8–12 · HP flat ~210–300 · ATK/DEF flat ~15–30.
- **Glyphs**: consumable substat boosters with % success toward a per-glyph cap; from CB chests/passes [approx].
- **Artifact Ascension** (endgame): Chaos materials (Iron Twins) add bonus stats [approx].

### Ranks, levels, upgrade costs & success rates
- Ranks 1–6★, levels 0→16, silver per attempt [verified].
- Success buckets (official wording): +1–4 = 100%; +5–8 "may fail"; +9–12 "fail quite frequently"; +13–16 "fail more often than not" [verified]. Community curve: ~85% at +5 → ~10–15% at +16 [approx].
- **Failures consume full silver, no pity** [verified].
- Rank-6 attempt costs: ~2–8k (low) → ~30–50k (+13–16) [approx]; expected total 0→+16 rank 6: **~1.5–2.5M silver average** [verified range]. Core silver sink of the game.
- **Mythical artifacts** drop only from Hard dungeon stages 26+ [verified].

## 4. Artifact sets (bonuses & sources)
**2-piece stat sets:** Life +15% HP · Offense +15% ATK · Defense +15% DEF · Speed +12% SPD · Crit Rate +12% · Crit Damage +20% [approx] · Accuracy +40 · Resistance +40 · Perception +40 ACC +5% SPD · Resilience +10% HP +10% DEF · Fatal +15% ATK +5% C.RATE · Cruel +15% ATK, ignore 5% DEF [approx] · Immortal +15% HP + heal 3%/turn · Divine variants (stat + 15%-HP shield 3 turns) [approx] · Swift Parry +18% SPD [approx] · Deflection +20% HP + debuff-transfer chance [approx] · Stalwart −15% AoE damage [approx]. [all verified unless tagged]
**4-piece proc sets:** Lifesteal heal 30% of damage [verified] · Relentless 18% extra-turn chance [approx] · Savage ignore 25% DEF [verified] · Destroy MAX-HP destruction ~30% of damage [approx] · Stun 18% on-attack [approx] · Daze 25% Sleep on attack [approx] · Toxic 75% chance 2.5% Poison [approx] · Cursed 50% Heal Reduction/Hex [approx] · Frost 20% Freeze attacker when hit [verified] · Frenzy +8% TM per 7% HP lost [verified] · Regeneration ~10–15% heal/turn [approx] · Immunity Block Debuffs 2t at round start [verified] · Shield 30% HP shield 3t [verified] · Retaliation 25% counter when hit [verified] · Avenging ~45% counter on crit received [approx] · Reflex 30% chance −1 random cooldown/turn [verified] · Curing +20% heal bonus [verified] · Taunting 75% Provoke on attack [approx] · Fury ATK up as HP falls (to ~+45%) [approx] · Stoneskin/Protection (Hydra variable sets) · Impulse/Zeal (Live Arena) · 50+ sets total [verified count].
**Accessory sets** (per-piece 1/2/3 stacking): Refresh (5/10/15% no-cooldown chance), Reaction, Revenge, etc. — from Tag Bazaar / Live Arena / Hydra [verified names; values approx].
**Sources:** campaign chapters = fixed set per chapter, slot per stage (Part II §1); Dragon = Speed/Lifesteal/ACC/Destroy/Toxic/Frost/Daze/Avenging/Stalwart; Ice Golem = Life/Offense/Defense/CritRate/Resist/Retaliation/Reflex/Cursed/Taunting; Fire Knight = Fury/Curing/Immunity/Shield/CritDmg/Frenzy/Regen/Stun/Savage; Spider = accessories only [verified, pools patch-rotated]; Doom Tower = Divine sets; Forge = 10 craftable sets; Arena weekly chests = tier-scaled gear [verified].

## 5. Selling, removal, glyphs
- Sell values scale rank × rarity × level (r5 ~3–9k, r6 ~8–25k+; upgraded pieces refund more) [approx]; "farm → sell 95% → upgrade 5%" is the intended silver loop [verified].
- Unequip: historically silver-priced by rank; **permanently FREE since Aug 21, 2025** [verified — major economy change].
- Glyphs upgrade a chosen substat with success %; from CB chests, passes, events [approx values].

## 6. Summoning — shards, rates, mercy
| Shard | Rates | Mercy |
|---|---|---|
| Mystery | C 74.2% / U 24.4% / R 1.4% [verified] | none |
| Ancient | R 91.5% / E 8% / L 0.5% [verified] | Epic: after 20 → +2%/shard; Leg: after 200 → +5%/shard [verified] |
| Void | same as Ancient (Void champs) [verified] | same [verified] |
| Sacred | E 94% / L 6% [verified] | Leg: after 12 → +2%/shard [verified] |
| Primal | R 82.5% / E 16% / L 1% / Mythical 0.5% [verified] | Leg: after 75 → +1%; Mythical: after 200 → +10% [verified] |
- Mercy: additive to base, per shard-type × rarity, resets on hit [verified]. **x2 events**: double Epic AND Leg base chance (roughly weekly, rotating shard types) [verified]. **x10 events**: featured champion 10× within its rarity [verified]. Guaranteed-champion events exist [verified].
- Shard sources: Mystery — Market 5,000 silver, dailies, playtime, clan chests; Ancient — Market 200,000 silver, weeklies, missions, login, CB/DT chests; Void — monthly quest, login days, CB NM/UNM, Clan Shop, DT; Sacred — monthly quest, day-78 login, missions, CB UNM, DT rotation, FW milestones, tournaments; Primal — events/CvC/Live Arena season [verified/approx mix].

## 7. Great Hall
- 6 stats × 4 affinities = 24 bonuses, each level 0→10, paid in Arena Medals [verified].
- Values: HP%/ATK%/DEF% 2%/level → +20% at L10 [verified]; C.DMG 1%/level → +10% [approx]; ACC/RES 4/level → +40 [approx].
- Medal gating: L1–3 bronze-payable (total 500 bronze), L4–6 silver (total 1,500), L7–10 gold (total 2,700); conversion 1 gold = 2 silver = 4 bronze [verified].
- Total ≈ 3,575 gold-equivalents per bonus; ≈ 85,800 for all 24 [approx math]. Advanced Great Hall "Area Bonuses" upgraded with Live Arena Crests (patch 7.00+) [verified].

## 8. Arena
**Classic** — async 4v4 [approx]; attack AI-run defense teams; refreshable opponent list.
- Tokens: cap 10, +1/hour, gem refills [verified].
- Rating: ± per win/loss scaled by gap (win ~+25–35) [approx]; weekly reset Monday 08:00 UTC [verified].
- Tiers: Bronze I–IV → Silver I–IV → Gold I–V → Platinum (cap 500 players, entered via weekly Ranking Phase from Gold V) [verified]. Historical thresholds ~1,000 → 3,700+ points [approx].
- Per-win: silver + medals (type by tier, ~1–3) [type verified; qty approx]. Weekly tier chests: gems, brews, shards, tomes, gear scaling to Platinum = Epic/Leg/Mythical rank 6 [verified]. Tier passive stat bonuses exist [verified].
**Tag Team**: 3 teams of 5 [approx], best-of-3; tokens top-up to 10 daily; pays Gold Bars → Bazaar [verified].
**Live**: real-time 1v1 draft pick/ban; 5 tokens/day; Crests → Area Bonuses; season chest at 35 wins [verified].

## 9. Bastion buildings
- **Sparring Pit**: L15; 5 slots (slot 1 free, others 300 gems; ~1,500 all-in); slot upgrades ~350 gems/level ≈ +1,000 XP/h; base ~2,200–2,400 XP/h, max ~4,400 [approx].
- **Gem Mine**: 3 levels, 500 gems each; 5/10/15 gems/day [L3=15 verified; split approx]; ~100-day payback each [verified].
- **Market**: hourly restock; Mystery Shard 5,000 silver (always-buy), Ancient 200,000, artifacts all sets/rarities, Common champs ~6k, Uncommon ~39–49k [verified]; extra slots alternate gems (~250+)/silver; manual refresh for gems [approx].
- **Tavern**: leveling (feed champs/brews) + Rank Up (N same-star champions + silver; 6★ push ≈ 500k+ silver) [approx]; chickens substitute 1:1 [verified].
- **Portal**: summons + fusions [verified].
- **Champion Vaults**: Master 10→400 slots, Reserve 600→1,200; +10-slot expansions silver OR gems, scaling (130→140 = 2.5M silver example) [verified].
- **Forge**: crafts 10 sets at chosen rank; Magisteel + set materials + silver; output rarity/substats RNG [verified/approx]. Forge Pass: 4-week seasons, 50 levels, free/Gold/Platinum tracks [verified].
- **Great Hall** (§7); **Guardian Ring** (roster-ownership bonuses) [approx].

## 10. Roster / storage
- Active collection starts ~60 slots; legacy +5/gems escalating; modern (7.70+): +10 slots for silver-or-gems, scaling [verified]. Vaults as §9. Storage pressure is a deliberate recurring soft gem sink [verified pattern].

## 11. Gem sinks (for pricing a fair F2P hard currency)
Energy refill 40 (flat, repeatable) · Masteries buyout 800/champion · Mastery reset 150 (first free) · Gem Mine 3×500 · Market slots ~250 each · Market manual refresh (small) · Sparring Pit slots 300+ each + level-ups ~350 · Vault/collection expansions (gems option) · Arena token refills (tens; Live: 10 escalating / 100 per 5) · direct shard offers (poor value) · XP boosts/silver packs/potions · skins/avatars [verified list, some prices approx].
- F2P gem income: Mine 15/day + dailies ~10–15 + weeklies/monthlies + arena/CB chests + events ≈ **50–100+/day active** [approx]; Daily Gem Pack IAP = 2,140/30 days [verified].
- Community priority: Mine → Market slots → Masteries → energy forever [verified].

## 12. XP boosts & passes (post-launch monetization reference)
XP Brews; 100% XP boost consumables; RAID Card (+20% XP & silver, +70 Multi-Battle attempts) [verified]; Daily Gem Pack 2,140/30d [verified]; **Forge Pass**: 4-week seasons, 50 levels, daily/weekly challenges, Core/Gold($19.99)/Platinum tracks, level-skip purchase [verified]; Relics (2025-26 gear layer via Platinum pass) [verified existence].

### Part III sources
Plarium support (Mercy system · Classic Arena · Arena Rewards · Great Hall · Forge · Forge Pass · Doom Tower · Champion Vaults · Masteries), fandom (Upgrading Artifacts · Artifact Sets · Great Hall · Gem Mine), ayumilove.net (mercy · artifact & accessory guide · gem spending), hellhades.com (energy guide · primal shards · summon events), gamerempire.net (energy · forge), inteleria.com (shard drop rates & pity), GameLeap (free gear removal Aug 2025), BlueStacks (Live Arena / patch 7.00).
