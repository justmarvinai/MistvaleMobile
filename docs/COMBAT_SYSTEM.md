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

**Enemies** follow the same convention from the other end: `enemy_defs.base_stats` are the values at `anchor_level` (default 60) **and at ★6**, and a stage scales them by `growth ^ (level − anchor_level) × rankMultipliers[stars]` — the same rank ladder champions climb, so ★6 is 1.00 and ★1 is ≈0.42. Authoring at the tier you can picture and deriving the rest is what keeps one lizard archetype serving chapter 1 and chapter 12; the rating is the second lever, and it is what makes a Brutal trash mob a different creature from the Normal one rather than the same one at a higher level.

Only HP/ATK/DEF move with the rating. **SPD, C.RATE, C.DMG and RES are flat at every rung by design**: speed decides turn order before anything else resolves, and every boss in the game is built on a turn count (a hit shield's window, a mender's cooldown, the Titan's fifty-turn cap), so a rating that also moved speed would retune all of it at once. An omitted `stars` on a wave line reads as **★6**, because an unset rating has to mean "as authored". *(The field was carried into the engine and dropped from P2 until C13 — see the `scaleEnemyStats` header for what that cost.)*

**Power score** (informational only): `HP/30 + ATK×2 + DEF×2 + SPD×8 + C.RATE×6 + C.DMG×3 + RES×2 + ACC×2 + Σ gearLevel×15` ⚙.

## Auto-battle, and taking it back

`advance(state, rules, config, { auto })` has always meant "run the fight out": the AI takes
every player turn until somebody wins. That is exactly right for multi-battle and for an
Arena defence, and it is wrong for the **Auto button**, because a fight resolved in one
request cannot be un-resolved — pressing the button again had nothing left to cancel, so it
read as off while the battle carried on.

`autoTurns` bounds it. Omitted it means the whole fight, unchanged. Given a number, the AI
takes that many player turns and then pauses on the next decision exactly as manual play
does. The client asks for a few at a time and keeps asking only while Auto is engaged, which
is what makes it a toggle rather than a commitment.

`focus` rides along with it: the enemy the player asked auto-battle to concentrate on. It is
handed to target resolution as the explicit target, which means it applies **only where the
skill leaves a choice** — a single-target enemy skill. An all-target skill, a heal, a
lowest-health pick and a focus that is already dead all ignore it. It is a preference the
engine may decline, never an instruction it must obey.

The client side of it is one number, `AUTO_LOOKAHEAD` in `state/battleClocks.ts`, and both
of its extremes are bugs the owner has already reported. Ask for the next batch only when
the animation has caught up and Auto is exactly as slow as watching. Ask without a bound and
the fight is over on the server a second after the button is pressed, which is
"switched on and never off" again. So Auto asks while the playback queue is **short** — forty
events, a few turns — which keeps the animation fed and keeps the fight cancellable.

Skip is the other half of the same change, and it is the button that is **not** reversible.
It used to be offered only once the server had already decided the fight, so draining the
playback queue *was* jumping to the end. Now the queue is a couple of turns, so Skip does
what it says instead: it asks for the rest of the battle in one unbounded `auto` call and
plays none of it. Auto is the toggle; Skip is the commitment. The two share one wire —
`state/oneAtATime.ts` — because a Skip landing on top of an in-flight auto request would
slice the event log at a length the other had already moved past, and that reaches the
player as the same hit landing twice.


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
Failed contest = **RESIST** floater. **There is no accuracy check on damage** — an attack always connects, and ACC/RES gate only whether a status sticks. That is deliberate and source-faithful, and it is why the battlefield has no dodge animation: the defensive beats the screen can honestly show are a resist and a weak hit (UI_UX §4). "Cannot be resisted" skill flags skip the contest. Buffs/self/ally effects never contest. Rule-of-thumb parity with the source: out-ACC the target's RES by ~25 and you're capped.

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
Composable flags per `enemy_defs.boss_mechanics`, all engine-known and all **implemented since P6**. Bosses are single-unit boss waves with 3–5× stat budgets ⚙; full per-dungeon assignments in CONTENT_PLAN_EA01.md.

| Flag | Behaviour | Where |
|---|---|---|
| `almightyImmunity` | Immune to Stun/Freeze/Sleep/Provoke. Source-faithful baseline for every boss — a boss that can be switched off has no mechanic. | Every boss |
| `tmReductionImmune` | Turn-meter depletion is refused outright (a `statusResisted … immune` event). The answer is damage, not tempo. | Broodwyrm |
| `hitShield {hits, punishTmPct}` | A **persistent** hit counter. Every landed hit spends one count and is fully absorbed; the count carries across the boss's turns, so chipping accumulates. Reach the boss's turn with it standing and the whole opposing team loses `punishTmPct` meter. Empty it first and the boss **forfeits its next turn** and stays hurtable through it, restoring to full on the turn after. DoT ticks are true damage: they pass through the shield without touching the counter — the slow way in, next to the fast one. | Cinderspire Ashpriest (6 / 9 / 12 hits by floor band); Hissrad the Span-Taker, ch5 (6); Ryssa Gatekeeper, ch11 (12) |
| `thresholdRetaliation {perHpPct, skipIfDot}` | Every time the boss's HP falls through another `perHpPct` band of its maximum, it answers with a free A1 at whoever struck it — once per band crossed, so a single enormous blow owes several. `skipIfDot` exempts damage-over-time. Cannot chain: a retaliation never provokes another. | Rimebound Sentinel (10%); Mama Fenwrack, ch8 (12.5%) |
| `addSummon {unitKey, perTurn, cap}` | At the start of its turn the boss calls up to `perTurn` adds while fewer than `cap` of them are alive. Adds take the lowest free slot on their side (a slot held by a corpse may be reused; the summon event carries a full snapshot). | Broodmother Ssarethi (2/turn, cap 6); Ssyleth the Coilmother, ch12 (1/turn, cap 4) |
| `enrage {afterTurn, dmgPctPerTurn}` | After `afterTurn` unit-turns, the boss's outgoing damage grows linearly and uncapped. Announced once, then silent. Guarantees no fight can be stalled to the 300-turn cap. | Pitmaster Drazhak (turn 12, +8%/turn); every keep-boss at turn 40; every chapter warlord at turn 20–32 |

Each of these carries a `boss*` event so the client can present it: `bossShield` (count changed), `bossPunish`, `bossExposed`, `bossRetaliate`, `bossSummon`, `bossEnraged`.

## 9. Masteries (source-faithful structure, own content)
- Three trees — **Onslaught / Bulwark / Insight** — 6 tiers each. Per champion: **only 2 of the 3 trees may be activated**; picks capped at **15 + nothing extra**: 2× Tier-1, 3 each of Tiers 2–5, exactly **1 Tier-6 capstone** (across both active trees).
- **Tier gate:** a tier opens once **2 × (tier − 1)** masteries have been learned at lower tiers — counted across the whole build, not per tree. Per-tree counting looks more source-faithful and is unshippable here: with only fifteen picks and a hard cap per tier, splitting the two Tier-1 picks across two trees would leave *neither* tree able to reach Tier 2, stranding the champion at 2/15 permanently. Counting globally keeps the ladder (two picks buy Tier 2, ten buy a capstone) while leaving the choice of trees genuinely free.
- Paid in **Emblems**: Bronze (T1–2), Silver (T3–4), Gold (T5–6) from the Proving Grounds. Full build ≈ 100 Bronze + 600 Silver + 950 Gold ⚙ (per-node: T1/T2 = 20 Bronze · T3/T4 = 100 Silver · T5 = 150 Gold · T6 = 500 Gold). Crystal buyout ⚙ (800) and reset (first free, then 150 ⚙) mirror the source.
- The **48-node** content (16 per tree: three each at T1–T4, two at T5, two capstones) is authored in CONTENT_PLAN_EA01.md; marquee capstones: Onslaught *Deathmark* (60% chance: bonus damage = 10% target MaxHP, capped 4% vs bosses, once per skill — Warmaster-analog) / *Flawless Edge* (+20% C.DMG); Bulwark *Last Bastion* (survive lethal at 1 HP once per battle); Insight *Veilbinder* (30% chance own debuffs last +1 turn; excludes hard CC — Master-Hexer-analog) / *Eagle Sight* (+50 ACC).
- **How a node reaches the engine.** Every node is a list of typed effects from a fixed vocabulary of twenty-one (`stat`, `damageDealt`, `damageTaken`, `lifesteal`, `onKill`, `battleStartShield`, `cooldownProc`, `healing`, `redirect`, `counterProc`, `counterDamage`, `protectionBonus`, `cleanseProc`, `turnMeterProc`, `debuffChance`, `setBonusAmplify`, `a1Ramp`, `firstStrike`, `statusDuration`, `bonusDamageMaxHp`, `lastStand`) — the same contract skills use, so adding a node is content and only a new *kind* of effect is a deploy. Publish validation refuses anything else.
- **Where a node is settled.** An unconditional `stat` effect and `setBonusAmplify` are folded into the champion's assembled stats *before* the battle, exactly as relics are, which is why the champion screen can show a Masteries column beside the Relics one. Everything else — conditions that depend on the state of a fight, and every proc — rides into the engine as effects it evaluates. Getting that split right is what keeps the displayed number and the fighting number the same.

## 10. Auras
One aura per champion, active only from the leader slot (slot 1), exactly one per battle: stat (HP/ATK/DEF/SPD/C.RATE/RES/ACC) + scope (all/element/faction) + area (everywhere/Campaign/Arena/Depths). Team-select shows the live effect.

## 11. Skills as data (engine contract)
A skill = `targeting` + ordered `components[]`. The nine component types the engine implements:

| Component | Fields |
|---|---|
| `damage` | `scale` (atk/def/maxHp/spd), `mult`, `hits`, `ignoreDefPct?`, `element?` |
| `applyStatus` | `status`, `turns`, `target` |
| `heal` | `scale`, `mult`, `target` |
| `shield` | `scale`, `mult`, `turns`, `target` |
| `turnMeter` | `deltaPct`, `target` |
| `cleanse` | `count` (number or `all`), `target` |
| `dispel` | `count` (number or `all`), `target` |
| `extraTurn` | — |
| `cooldown` | `delta` (−3…+3), `target` |

Every component also takes an optional `chance` (0–1, rolled before the ACC/RES contest) and an optional `condition` — `targetHasStatus` · `targetMissingStatus` · `selfHpBelow` · `targetHpBelow` · `alliesDead`. Multi-hit is the `hits` field on `damage` rather than a wrapper component, and conditionals are the per-component `condition` rather than a nesting one: both keep `components[]` a flat list, which is what lets the Admin composer render one form per component and the engine switch on `type` without recursion. Boss add-summoning is not a component: it is a `boss_mechanics` flag (§8), because it belongs to the unit rather than to any one skill.

Plus cooldowns, tome upgrade ladders (`dmg+5% | dmg+10% | chance+5..15% | cooldown−1`), AI hints, animation binding. The Admin skill composer edits exactly this shape; publish-validation checks every component against the engine registry.
〔dev, owner-approved〕 Tomes are **player-choice** (pick which skill to book), not random.

## 12. AI (enemies & auto-battle) — deterministic, hint-driven
Priority: forced openers → highest-slot skill off cooldown whose hint passes (`dontRepeatWhileActive`, `onlyBelowHpPct`, …) → A1. Targeting per skill hint (`lowest_hp | highest_atk | highest_tm | random | self | lowest_hp_ally`), default seeded-random. Auto-battle uses the same brain for player units; per-skill player instructions (Auto settings: *don't use / opener / priority*) ship in EA 〔source parity: Skill Instructions〕. Manual play always overrides.

## 13. Determinism, replay, audit
`BattleState` pure data; `advance(state, rng)` pure; xoshiro128** seeded per battle (seed persisted) ⇒ byte-identical replays. The seed is drawn from the process CSPRNG so a player cannot predict a fight from a previous one — with **one deliberate exception**: a `trial` takes its seed from its *stage key*, so every attempt by every account opens the identical fight. That is what makes a trial's par a measure of play rather than of luck (GAME_DESIGN §9.2c). The event log (ARCHITECTURE §6.4) is the only client contract — every floater/bar/animation derives from events carrying full payloads; the client computes no game math. Golden-replay tests pin behavior; intentional changes regenerate goldens in reviewed commits.

Because the log is the whole record of a fight, anything a screen wants to say *about* the
fight is a fold of it rather than a second copy kept alongside. Two exist: `damageDealtTo`
(the Titan's payout and the world boss's strike) and `contributions` (what each champion on
a side did, for the result screen). Both add a shield-eaten blow to the HP it took, since
`amount` is what reached health and `absorbed` is what a shield swallowed; both leave out
damage landing back on the striker's own side; and neither clamps overkill, because
`amount` is the engine's figure and the world boss's rule is that overkill stays on the
striker. `shieldGained` carries a `source` for the same reason `heal` does — attribution
that is not in the log cannot be recovered from it.

## 14. Initial tuning targets (balance-sim gates, enforced in CI)
- Chosen starter (lvl 1, tutorial gear) clears 1-1…1-3 Normal on auto ≥95%.
- At par recommended power, each of the twelve chapter bosses falls ≥70% on auto (Normal).
- **Difficulties (P6):** Hard and Brutal chapter 1 fall ≥70% to the team that just unlocked them — a difficulty opens on clearing 12-7 of the one below, so that team is known — and their chapter 12 falls ≥50% to a maxed, relic-wearing team. Two *walls* keep the campaign a ladder rather than a ramp: 12-7 Normal turns back a chapter-1 team ≥90% of the time, and Brutal 12-7 turns back a team fresh off Normal ≥90%.
- **The Depths (P6):** every dungeon's floor 1 falls ≥70% to a team at that dungeon's unlock level; its deepest floor falls ≥50% to a fully levelled, relic-wearing team, and turns back an entry-level team ≥80% of the time. The third gate is what keeps a ladder a ladder — without it, a rebalance could flatten fifteen floors into one.
- **The XP farm (P6):** Brutal 12-6 falls to *one* maxed relic-wearing carry and three level-1 food units ≥97% of the time, and does so well inside the turn cap (95% under 200 unit-turns). The composition is the gate: a stage's champion XP is a total split across the team, so the "farmer carries 3 food" loop only pays if the three passengers can be worthless — which means the carry must clear it nearly alone. 〔Revised in P6: the original ≤14-turn target was written against an unstated four-strong team, which clears it in ~16. A solo carry through four waves of elites takes ~120 unit-turns by construction, and nobody watches it — that is what multi-battle is for. The bound that matters is distance from the 300-turn cap, not speed.〕
- **Trials (C10d):** every trial is gated twice, and the two gates pull against each other. The **line the puzzle is authored around wins it at or under par** — otherwise the trial is a wall — and **auto-battle does not** — otherwise it is a stage with a longer name. Neither is sampled and neither should be: a trial's battle seed is its own stage key, so one run *is* the distribution and the number the gate measures is the number every player sees. The authored lines live in `tools/balance-sim/src/index.ts` and are the answer keys; they never ship to a client.
- *Not yet enforced:* every EA champion sims within 85–115% of its role benchmark (identity via mechanics, not raw stat gaps) — a champion-tuning gate, scheduled with the P10 content pass. Arena diversity (no EA champion in >40% of winning comps at equal power) needs an Arena, so it arrives with P7.
