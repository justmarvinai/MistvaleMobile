# Mistvale — Combat System Specification

> Status: **Planning — this is the contract `packages/engine` implements.** Every constant marked ⚙ lives in `game_config` (admin-tunable); formulas are code, inputs are data. Grounded in the source-game research (`docs/research/RAID_REFERENCE.md`); deliberate deviations are marked 〔dev〕.

## 1. Stats

| Stat | Range notion (lvl 60, Epic, no gear) | Notes |
|---|---|---|
| HP | 14k–20k | |
| ATK / DEF | 1,000–1,400 | attack skills scale ATK unless the kit says DEF/HP |
| SPD | 90–115 base | the tempo stat; gear pushes 150–200+ |
| C.RATE | 15% base | cap 100% |
| C.DMG | 50% base | multiplies on crit; grows via gear only |
| RES / ACC | RES 25–60 base, ACC 0 base | debuff shrug vs land (§5); ACC comes from gear/Hall/aura |

**Stat pipeline (order is normative):** `base(level, rank, ascension)` → `+ flat gear` → `+ %-gear on base` → `+ set bonuses` → `+ Hall of Valor (element-keyed)` → `+ masteries` → `+ aura` → *battle-time* `× buffs/debuffs`. Base growth: per-champion anchors in `champion_defs.base_stats` are values at ★6/60/Asc6; level curve geometric (⚙ exponent), rank multiplier table ⚙ (★1 ≈ 0.42 … ★6 = 1.00), ascension +2% primaries per level ⚙.

**Power score** (informational only): `HP/30 + ATK×2 + DEF×2 + SPD×8 + C.RATE×6 + C.DMG×3 + RES×2 + ACC×2 + Σ gearLevel×15` ⚙.

## 2. Battle structure & waves
- Teams: player 1–4 units (left), enemies 1–4 per wave (right); campaign/dungeon stages have 1–3 waves (boss floors: 2 trash waves + boss); arena is single-wave 4v4.
- **Between waves (source-faithful):** all buffs AND debuffs are **cleared**, every skill cooldown ticks down by 1, each surviving unit heals 10% MaxHP ⚙, turn meters reset and the new wave starts fastest-first. Players therefore time *cooldowns*, not buffs, for boss waves. HP and death states persist.
- Battle ends: victory (all enemies dead), defeat (all allies dead), retreat, or hard cap 300 total turns ⚙ → defeat (bosses soft-enrage well before this, §8).

## 3. Turn meter (TM)
- TM ∈ [0, 100). Simulation advances in ticks: each tick every living unit gains `SPD × 0.07` ⚙ TM (identical constant to the source game — ~14.3 ticks to fill at 100 SPD). At ≥100 the unit acts, then `tm −= 100` (overflow retained).
- **Multiple units ≥100 on the same tick:** highest TM value acts first; still tied → attacker's team first (defender-first when you are the arena defender); still tied → lower team slot. Battle start: all TMs at 0, fastest first.
- Effects: *TM boost/deplete/steal* are instant %-of-bar changes (enemy-targeted ones contest ACC vs RES); *SPD buffs/debuffs* (±15/30%) change fill rate multiplicatively. The engine solves "next actor" analytically — no per-tick loop cost.

## 4. Elements & hit quality (roll-based, source-faithful)
Wheel: **Ember > Verdant > Tide > Ember; Mist outside the wheel** (never advantaged/disadvantaged, either direction).
- **Advantage (attacking a weaker element):** each hit has a 50% ⚙ chance to land as a **STRONG hit** (+30% damage ⚙) and gains +15 pp crit chance ⚙.
- **Disadvantage:** all damage −20% ⚙, and each hit has a 35% ⚙ chance to land **WEAK** (a further −30% ⚙, cannot crit, cannot apply that hit's debuffs).
- Roll order per hit: strong/weak roll → crit roll → damage → on-hit debuff rolls. Distinct floaters/SFX for STRONG/WEAK/CRIT (battle-feel-defining).

## 5. Accuracy vs Resistance (debuff landing)
Enemy-targeted debuffs & instants: roll the skill's stated chance first, then the contest (source-faithful curve):
```
Δ = ACC − RES
P(stick) = 0.90 + min(0.07, max(0, Δ) × 0.0025)   # parity ≈ 90%, caps ≈ 97% at Δ ≥ +28
           − max(0, −Δ) × 0.01                     # each RES point above ACC ≈ −1 pp
clamped to [0.05, 0.97] ⚙                          # 5% floor, 3% irreducible resist
```
Failed contest = **RESIST** floater. "Cannot be resisted" skill flags skip the contest. Buffs/self/ally effects never contest. Rule-of-thumb parity with the source: out-ACC the target's RES by ~25 and you're capped.

## 6. Damage
```
raw   = Σ_scaling (skillMult × stat)                  # atk / def / maxHp scaling per component
hitQ  = strong ? ×1.30 : weak ? ×0.80×0.70 : disadv ? ×0.80 : ×1.0     # §4
crit  = roll(C.RATE ± mods) ? ×(1 + C.DMG) : ×1      # weak hits never crit
mitig = × K / (K + DEF_eff),  K = 10 × attackerLevel ⚙   # lvl 60 → K=600; 600 DEF ≈ 50% red., 3000 ≈ 83%
final = × (1 ± 0.05 variance ⚙) × (1 + Weaken/Strengthen etc.)
```
- `DEF_eff` = DEF after buffs/debuffs and "ignore X% DEF" flags. Poison/HP Burn/Bomb and mastery %-MaxHP procs bypass DEF ⚙ (source-faithful).
- Multi-hit skills roll hit-quality/crit per hit; on-hit debuffs roll per hit.
- Multiplier bands ⚙-guided (match source feel): A1 total ×1.7–2.2 ATK (often 2 hits) · A2/A3 nukes ×3.5–6.5 · AoE ×2.0–2.6 · DEF-scalers ×3.2–4.2 DEF · HP-scalers ×0.20–0.26 MaxHP per hit.
- Order of application on damage taken: Ally Protection split → Shield absorb → HP; lifesteal heals from HP damage only; Reflect/thorns compute off pre-shield damage ⚙.

## 7. Status effects (EA catalog)
**Timing rules (source-faithful):**
- Durations tick down at the **end of the affected unit's turn**; an effect a unit casts on itself ticks that same turn (self-buffs are effectively 1 turn shorter — kits account for it).
- DoTs: **Poison** damages at the **start of the poisoned unit's turn**; **HP Burn** at the start of the holder's turn (and splashes 3% to the holder's allies); **Continuous Heal** at the start of the holder's turn.
- Same-family stacking: stronger replaces weaker; equal refreshes duration. Poison stacks (cap 5 ⚙ 〔dev — source allows 10; tighter cap for a 7-champion roster〕); HP Burn unique per unit. Effect bar cap 10 ⚙.
- Counterattacks don't consume durations; extra turns do.

**Buffs (13 shipped):** ATK Up 25/50% · DEF Up 30/60% · SPD Up 15/30% · C.RATE Up 15/30% · Strengthen 15/25% (−damage taken) · Shield (scales from caster stat) · Continuous Heal 7.5/15% · Counterattack (A1 at 75% damage) · Ally Protection 25/50% · Block Debuffs · Reflect 15/30% · Vampiric 25% (self lifesteal) 〔dev-named〕 · Unkillable (kit/boss-limited, HP floors at 1).
**Debuffs (15 shipped):** ATK Down 25/50% · DEF Down 30/60% · SPD Down 15/30% · C.RATE Down 15/30% · ACC Down 25/50 flat · Weaken 15/25% (+damage taken) · Poison 2.5/5% · HP Burn 3% · Heal Reduction 50/100% · Leech (attackers heal 18% of damage dealt to holder) · Stun · Freeze (Stun-mechanics, Tide-flavored visual) · Sleep (breaks on damage) · Provoke (forced A1 at provoker) · Block Buffs.
**Reserved keys (post-EA, engine-known but unused):** Fear/True Fear, Petrify, Sheep, Bomb, Hex, Revive-on-Death, Block Damage, Stone-Skin-analog, Veil-analog, Poison Sensitivity, Block Active Skills, Block Revive.
**Instants (not statuses, no duration):** heal, TM ±, cleanse (debuffs), dispel/steal (buffs), extra turn, cooldown ±, revive 〔reserved EA〕.
- Arena-only anti-CC rule ⚙ 〔dev〕: +25% resist chance per consecutive hard-CC (Stun/Freeze/Sleep/Provoke) landed on the same unit — perma-stun protection for a small meta.

## 8. Bosses
Composable flags per `enemy_defs.boss_mechanics` (all engine-known): `almightyImmunity` (immune to Stun/Freeze/Sleep/Provoke — source-faithful baseline for every boss), `tmReductionImmune` (Broodwyrm), `hitShield {hits, punish}` (Cinderspire Ashpriest — Fire-Knight-style hit-counter shield), `thresholdRetaliation {perHpPct, skipIfDot}` (Frostgrave Sentinel — Ice-Golem-style), `addSummon {unitKey, perTurn, cap, devourHeal}` (Silkmire Broodmother — Spider-style), `enrage {afterTurn, dmgPerTurn}` (Proving Grounds), fixed openers. Bosses are single-unit boss waves with 3–5× stat budgets ⚙. Full per-dungeon assignments in CONTENT_PLAN_EA01.md.

## 9. Masteries (source-faithful structure, own content)
- Three trees — **Onslaught / Bulwark / Insight** — 6 tiers each. Per champion: **only 2 of the 3 trees may be activated**; picks capped at **15 + nothing extra**: 2× Tier-1, 3 each of Tiers 2–5, exactly **1 Tier-6 capstone** (across both active trees).
- Paid in **Emblems**: Bronze (T1–2), Silver (T3–4), Gold (T5–6) from the Proving Grounds. Full build ≈ 100 Bronze + 600 Silver + 950 Gold ⚙ (per-node: T1/T2 = 20 Bronze · T3/T4 = 100 Silver · T5 = 150 Gold · T6 = 500 Gold). Crystal buyout ⚙ (800) and reset (first free, then 150 ⚙) mirror the source.
- The 45-node content (15 per tree) is authored in CONTENT_PLAN_EA01.md; marquee capstones: Onslaught *Deathmark* (60% chance: bonus damage = 10% target MaxHP, capped 4% vs bosses, once per skill — Warmaster-analog) / *Flawless Edge* (+20% C.DMG); Bulwark *Last Bastion* (survive lethal at 1 HP once per battle); Insight *Veilbinder* (30% chance own debuffs last +1 turn; excludes hard CC — Master-Hexer-analog) / *Eagle Sight* (+50 ACC).

## 10. Auras
One aura per champion, active only from the leader slot (slot 1), exactly one per battle: stat (HP/ATK/DEF/SPD/C.RATE/RES/ACC) + scope (all/element/faction) + area (everywhere/Campaign/Arena/Depths). Team-select shows the live effect.

## 11. Skills as data (engine contract)
A skill = `targeting` + ordered `components[]`: `damage {scale, mult, ignoreDefPct?, bonusVsHpBelow?}` · `applyStatus {status, chance, turns, target}` · `heal {scale, mult, target}` · `shield {scale, mult, turns, target}` · `turnMeter {deltaPct, target}` · `cleanse {count|all}` · `dispel {count|all}` · `extraTurn` · `multiHit {n, components}` · `conditional {if, then}` · boss-only `summon`. Plus cooldowns, tome upgrade ladders (`dmg+5% | dmg+10% | chance+5..15% | cooldown−1`), AI hints, animation binding. The Admin skill composer edits exactly this shape; publish-validation checks every component against the engine registry.
〔dev, owner-approved〕 Tomes are **player-choice** (pick which skill to book), not random.

## 12. AI (enemies & auto-battle) — deterministic, hint-driven
Priority: forced openers → highest-slot skill off cooldown whose hint passes (`dontRepeatWhileActive`, `onlyBelowHpPct`, …) → A1. Targeting per skill hint (`lowest_hp | highest_atk | highest_tm | random | self | lowest_hp_ally`), default seeded-random. Auto-battle uses the same brain for player units; per-skill player instructions (Auto settings: *don't use / opener / priority*) ship in EA 〔source parity: Skill Instructions〕. Manual play always overrides.

## 13. Determinism, replay, audit
`BattleState` pure data; `advance(state, rng)` pure; xoshiro128** seeded per battle (seed persisted) ⇒ byte-identical replays. The event log (ARCHITECTURE §6.4) is the only client contract — every floater/bar/animation derives from events carrying full payloads; the client computes no game math. Golden-replay tests pin behavior; intentional changes regenerate goldens in reviewed commits.

## 14. Initial tuning targets (balance-sim gates before P2 exits)
- Chosen starter (lvl 1, tutorial gear) clears 1-1…1-3 Normal on auto ≥95%.
- At par recommended power, each chapter boss falls ≥70% on auto.
- Brutal 12-6 farm team (6★, +12 relics) clears in ≤14 sim-turns ≥97% (the "farmer carries 3 food" loop must work).
- Every EA champion sims within 85–115% of its role benchmark (identity via mechanics, not raw stat gaps).
- Arena: among seeded bot teams, no single EA champion appears in >40% of winning comps at equal power (soft diversity check).
