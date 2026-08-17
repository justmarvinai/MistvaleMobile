# Mistvale — EA-0.1 Content Plan

> Status: **Planning.** The concrete content inventory that gets authored into seed files (and later tuned via Admin). Numbers are initial values feeding `tools/balance-sim`; ⚙ = tunable. Where a value bands by stage, the seed generator (a build-time script) expands the band tables below into per-stage rows — hand-authoring 252 campaign stages is not the plan; *reviewing generated content* is.

## 1. The showcase seven (final-art champions) — full kits

All Epic. Format: multiplier × scaling stat; chances are pre-ACC/RES; CD = cooldown. Tome ladders: 4 upgrades per A-skill (Epic champions use Epic Tomes). Base stats (at ★6/L60/Asc6) chosen per role archetype ⚙.

### Anuria, Arrow of the Vale — Vale Sentinels · Tide · Attack (starter, **archer/ranger**)
Base: HP 15.5k · ATK 1,390 · DEF 990 · SPD 103 · CR 15 · CD 50 · RES 30 · ACC 0
- **A1 Twinshot** — 2 arrows, ×0.95 ATK each; each hit 20% chance → Weaken 15% (1t). Ladder: dmg+5%, chance+10%, dmg+10%, chance+15%.
- **A2 Warden's Aim** (CD4) — instant: self ATK Up 50% + C.RATE Up 30% (2t) + 30% TM. Ladder: tm+10%, cd−1.
- **A3 Arrowstorm** (CD4) — AoE volley ×2.2 ATK; 75% chance → Weaken 25% (2t). Ladder: dmg+5%, chance+10%, dmg+10%, cd−1.
- Aura: team ATK +15% (Campaign). AI hints: A2 opener, A3 on cooldown. Battle visuals: ranged attack lane (projectile arrows via VFX preset — she holds position, arrows travel).

### Thordakk Cindermaw — Emberclan · Ember · Attack (starter)
Base: HP 17.5k · ATK 1,330 · DEF 1,050 · SPD 98 · CR 15 · CD 50 · RES 35 · ACC 0
- **A1 Axefall** — 1 hit ×2.0 ATK; 30% chance → ATK Down 25% (1t).
- **A2 Emberwake** (CD4) — AoE ×2.1 ATK; 60% chance → ATK Down 30%? 〔family: use 25/50 tiers〕 → ATK Down 50% (2t). Ladder: dmg+5%, chance+10%, dmg+10%, cd−1.
- **A3 Ashen Roar** (CD5) — AoE ×2.5 ATK + self Counterattack (2t). Ladder: dmg+5%, dmg+10%, cd−1, cd−1.
- Aura: team HP +15% (Campaign). Hints: A3 opener, A2 on cooldown.

### Maruan the Stillwater — Wayfarers · Verdant · Support (starter)
Base: HP 18.5k · ATK 950 · DEF 1,150 · SPD 101 · CR 15 · CD 50 · RES 50 · ACC 0
- **A1 Thornlash** — 1 hit ×1.9 ATK; 40% chance → Poison 5% (2t).
- **A2 Rite of Reeds** (CD4) — heal all allies 20% of Maruan's MaxHP + cleanse 1 debuff each. Ladder: heal+5%, cd−1, heal+10%, cleanse 2.〔cleanse-2 is the Asc6 empowerment instead — ladder: heal+5%, heal+5%, cd−1, heal+10%〕
- **A3 Verdant Ruin** (CD4) — AoE ×1.8 ATK; 75% chance → Poison 5% (2t) ×2 instances. Ladder: chance+10%, dmg+5%, chance+15%, cd−1.
- Aura: team DEF +15% (Campaign). Hints: A2 when any ally <60% HP else hold; A3 on cooldown.

### Darius Veilcaller — Wayfarers · Mist · Attack
Base: HP 14.5k · ATK 1,430 · DEF 930 · SPD 105 · CR 15 · CD 50 · RES 30 · ACC 20
- **A1 Hexbolt** — 1 hit ×2.1 ATK; 30% chance → SPD Down 15% (1t).
- **A2 Umbral Torrent** (CD4) — AoE ×2.15 ATK; 50% chance → SPD Down 30% (2t). Ladder: dmg+5%, chance+10%, chance+15%, cd−1.
- **A3 Rite of Ruin** (CD5) — 1 hit ×5.9 ATK ignoring 25% DEF. Ladder: dmg+5%, dmg+5%, dmg+10%, cd−1.
- Aura: team ACC +40 (Depths). Hints: A3 → highest_atk, A2 opener.

### Khazgor of the Silent Rank — Hollowborn · Ember · Defense
Base: HP 18k · ATK 850 · DEF 1,400 · SPD 96 · CR 15 · CD 50 · RES 45 · ACC 0
- **A1 Gravecleave** — 1 hit ×3.5 DEF; 25% chance → DEF Down 30% (1t).
- **A2 Deadman's Bulwark** (CD4) — self Shield 25% MaxHP (2t) + AoE 75% chance → Provoke (1t). Ladder: chance+10%, shield+5%, chance+15%, cd−1.
- **A3 Standfast Eternal** (CD5) — team DEF Up 60% (2t) + self Counterattack (2t). Ladder: cd−1, cd−1.
- Aura: team DEF +20% (Arena). Hints: A2 opener, A3 when ≥2 enemies alive.

### Rattledagger — Hollowborn · Mist · Attack
Base: HP 13.5k · ATK 1,410 · DEF 900 · SPD 112 · CR 20 · CD 57 · RES 25 · ACC 25
- **A1 Bonestab** — 1 hit ×1.85 ATK with +20 pp crit chance.
- **A2 Marrowdrain** (CD3) — 1 hit ×3.4 ATK + steal 25% TM (on stick). Ladder: dmg+5%, dmg+10%, cd−1.
- **A3 Deathrattle** (CD4) — 3 hits on random enemies ×1.7 ATK each; each hit 60% chance → −30% TM. Ladder: chance+10%, dmg+5%, chance+15%, cd−1.
- Aura: team SPD +12% (Arena). Hints: A2 → highest_tm, A3 opener.

### Sethlurias, Tidebound Exile — Sskarn (exile) · Tide · HP
Base: HP 21.5k · ATK 900 · DEF 1,100 · SPD 100 · CR 15 · CD 50 · RES 40 · ACC 0
- **A1 Tidebrand** — 1 hit ×0.23 own MaxHP.
- **A2 Scalesong Ward** (CD4) — team Shield 20% of Seth's MaxHP (2t) + SPD Up 15% (2t). Ladder: shield+5%, cd−1, shield+5%, buff 30%〔Asc6 empowerment: SPD Up 30%〕→ ladder: shield+5%, cd−1, shield+5%.
- **A3 Coilguard** (CD4) — heal lowest ally 30% of Seth's MaxHP + Ally Protection 25% on them (2t) + cleanse 1. Ladder: heal+5%, heal+10%, cd−1.
- Aura: team RES +30 (Depths). Hints: A3 → lowest_hp_ally, A2 opener.

## 1b. The extended roster (owner-approved: placeholder art until sprites arrive)

30 more champions complete the EA-0.1 gacha. **All use the territorial-lizard model with per-champion tints + framed tinted avatars** until Marvin uploads real sprites/avatars via the Admin asset manager (registry swap, zero code). Kit depth by rarity: Uncommon 2 skills · Rare 3 · Epic 3 (+Asc6 empowerment) · Legendary 4 (A4 or passive). Kits are authored in P1 seeds from the hooks below (skill-template library + per-champion tweaks); every kit passes the COMBAT §14 role-benchmark gates.

| Champion | Faction | El. | Role | Rar. | Kit hook |
|---|---|---|---|---|---|
| Ashka Torchhand | Emberclan | 🔥 | Attack | U | fast A1 + small HP Burn chance |
| Grib the Unburied | Hollowborn | 🔥 | HP | U | thorny bruiser, self Continuous Heal |
| Ssiv Quickfang | Sskarn | 🌿 | Attack | U | double-hit A1, +SPD self |
| Serjeant Bramwell | Vale Sentinels | 🔥 | Defense | R | shield-bearer: self Shield + single Provoke |
| Kerra Palewatch | Vale Sentinels | 🌿 | Attack | R | duelist: DEF Down opener + nuke |
| Brekka Foehammer | Emberclan | 🔥 | HP | R | hammer Stun chance, HP-scaled hits |
| Maddoc Threefingers | Hollowborn | 🔥 | Attack | R | counter-brawler: self Counterattack + Weaken |
| Wisp of Old Hallen | Hollowborn | 🌫 | Support | R | Leech + Heal Reduction spreader |
| Petta Lanternmaid | Wayfarers | 🌊 | Support | R | single-heal + cleanse bot, Continuous Heal |
| Sylvi Mistreader | Wayfarers | 🌫 | Support | R | TM control: team +15%, enemy −20% |
| Old Gharssa | Sskarn | 🌿 | Support | R | poison shaman: AoE Poison + ally heal |
| Krosska Shieldback | Sskarn | 🌊 | Defense | R | team Shield + self taunt |
| Bracken Puck | Thornweald | 🌿 | Attack | R | TM thief, high SPD |
| Torvi Anvilborn | Runebound | 🔥 | Defense | R | DEF-scaled AoE + DEF Up |
| Hodrek Deepline | Runebound | 🌫 | Attack | R | rune nuker: ignore-DEF single |
| Sister Nerissa | Drowned Choir | 🌊 | Support | R | team Continuous Heal + RES Up |
| Castellan Ordwin | Vale Sentinels | 🌊 | Defense | E | wall: AoE Provoke + team DEF Up + counter |
| Ugrim Pyrechant | Emberclan | 🔥 | Support | E | war-drummer: team ATK Up + HP Burn spread |
| Aldemar the Cartographer | Wayfarers | 🌿 | HP | E | pathfinder: team Shield + Weaken AoE |
| Lady Merrow of the Fen | Hollowborn | 🌊 | Support | E | Sleep controller + big heal |
| Vessk the Unchained | Sskarn | 🔥 | Attack | E | rage multi-hit (3× random) + self ATK Up |
| The Briar Knight | Thornweald | 🌿 | Defense | E | Reflect + Provoke thorns tank |
| Cantor Maelis | Drowned Choir | 🌊 | Attack | E | AoE + SPD Down chorus |
| Warden-Cmdr. Elstan | Vale Sentinels | 🌊 | Defense | L | Ally Protection on team + Shield engine + counter aura |
| Vulkas Emberlord | Emberclan | 🔥 | Attack | L | AoE burn nuker: HP Burn + big AoE, enrage passive |
| Orenna Veilmother | Wayfarers | 🌫 | Support | L | mass cleanse + Block Debuffs + team SPD Up |
| The Pale Duke | Hollowborn | 🌫 | HP | L | Leech aura passive + AoE Weaken + self-sustain |
| Szarran Coilfather | Sskarn | 🌿 | HP | L | poison king: mass Poison + poison-scaling nuke (Sethlurias lore link) |
| Vess'aryn of the Deep Thorn | Thornweald | 🌫 | Attack | L | assassin: Stealth-analog + execute vs <40% HP |
| **Aureleth, Voice of the Vale** | Vale Sentinels | 🌫 | Support | L (exclusive) | missions-chain reward, unsummonable (Arbiter-analog): revive-lite (heal+TM surge), team ATK Up, SPD aura |

**Food units (not in Chronicle):** Sskarn Broodling ×3 (Common — Ember/Tide/Verdant tints, 1-skill) · Sskarn Broodguard ×3 (Uncommon — same tints, 2-skill). Summonable via Faded Sigils, dropped by campaign, stocked in Bazaar.
**Pool coverage checks (publish-validated):** Mistwoven (Mist-only) pool = 3 R + 2 E + 3 L ✓ · every element ≥2 Rares ✓ · every summonable rarity non-empty per element where required ✓.

## 2. Enemy roster (all use the lizard model; tint per archetype)

| Archetype | Role | Tint | Kit sketch |
|---|---|---|---|
| Sskarn Skirmisher | Attack | green (base) | A1 ×1.9; A2 CD3 single ×3.2 |
| Sskarn Venomspitter | Attack | olive | A1 + 30% Poison 2.5%; A2 CD4 AoE + Poison 5% |
| Sskarn Spearguard | Defense | slate | DEF-scaled A1; A2 CD4 self+adjacent Shield |
| Sskarn Broodguard | Defense | rust | A2 CD4 AoE Provoke 60% + DEF Up 30% self |
| Sskarn Mireshaman | Support | teal | A2 CD3 team heal 15%; A3 CD5 cleanse + SPD Up 15% |
| Sskarn Warcaller | Support | crimson | A2 CD4 team ATK Up 25%; A1 ATK Down 25% 25% |
| Sskarn Brute | HP | mud | A1 ×0.2 MaxHP; A2 CD4 single stun 35% |
| **Elite** variants | any | brightened + ★ badge | +1 skill tier, +25% stat budget ⚙ |

**Chapter bosses (stage x-7) — shipped P6:** oversized (1.5× sprite scale) named warlords, one per chapter; the roster is the table in §3. Boss kits = elite kit + `almightyImmunity` + an enrage ramp + one signature `a3` on a four-turn cooldown, and four of the twelve additionally carry a keep-boss mechanic in a gentler form (§3).
**Depths bosses (shipped P6):** Broodwyrm (`tmReductionImmune`, AoE breath + SPD Down, self shield & DEF Up) · Rimebound Sentinel (`thresholdRetaliation` every 10% of its bar, self-heal + self-cleanse, Freeze gaze) · the Ashpriest (`hitShield`, **three defs** — 6 hits on floors 1–4, 9 on 5–9, 12 from 10 down — with a TM-drain punish, HP Burn, and a DEF-ignoring pyre) · Broodmother Ssarethi (`addSummon` 2/turn cap 6 of `silkmire_spawn`, devour-heal, AoE Poison spit) · Pitmaster Drazhak (Proving Grounds; `enrage` +8%/turn after t12). Every keep-boss also carries `almightyImmunity` and a late `enrage` (turn 40, +6%/turn) so no fight can be stalled to the cap. Guards are per-keep archetypes on the shared lizard model; the five Spring Wardens differ only in breath, which is the point — the springs are the straight fight.

## 3. Campaign — *The Reclamation* (12 chapters × 7 stages × 3 difficulties) — **shipped P6**

**252 stages live**, generated from twelve plan entries in `apps/server/src/db/seed/data/campaign.ts`.

| Ch | Chapter | Region | Set dropped | Warlord (x-7) | Enemy levels N/H/B ⚙ |
|---|---|---|---|---|---|
| 1 | Veilwood Fringe | The Fringe | Ironroot (HP) | Vrash the Fenblade | 1–6 / 24–30 / 42–48 |
| 2 | The Drowned Road | Sunken Marches | Wolfsfang (ATK) | Ssythra the Tidecaller | 4–9 / 26–32 / 44–50 |
| 3 | Silkmire Hollow | Sunken Marches | Stoneguard (DEF) | Gorrakh the Broodtyrant | 7–12 / 28–34 / 46–51 |
| 4 | Thornmere Marsh | The Thornmere | Hawkeye (C.RATE) | Hessk the Marshbinder | 10–15 / 30–36 / 47–52 |
| 5 | The Shattered Span | The Thornmere | Truestrike (ACC) | Hissrad the Span-Taker | 13–18 / 32–38 / 49–53 |
| 6 | Galehollow Cliffs | The Windward Rise | Swiftwind (SPD) | Vyss Galetongue | 16–21 / 34–40 / 50–54 |
| 7 | The Ashen Reach | The Windward Rise | Wardweave (RES) | Korrash Reachburner | 19–24 / 36–42 / 51–55 |
| 8 | Fenwrack Deeps | The Sunless Fen | Bloodthorn (Lifesteal) | Mama Fenwrack | 22–27 / 38–44 / 52–56 |
| 9 | The Hollow Vale | The Sunless Fen | Reaver (C.DMG) | Nulla Holloweye | 25–30 / 40–46 / 53–57 |
| 10 | Coilstone Terraces | The Coilstone | Gravebind (Provoke) | Tszar Coilstone | 28–33 / 42–48 / 54–58 |
| 11 | The Fallen Gates | The Coilstone | Stormcoil (TM-on-hit) | Ryssa Gatekeeper | 31–36 / 44–50 / 55–59 |
| 12 | The Coilmother's Court | The Coilstone | Mendersong (Regen) | **Ssyleth the Coilmother** | 34–40 / 46–52 / 56–60 |

- **Warlord signatures.** Every chapter boss carries `almightyImmunity`, an enrage ramp, and one signature `a3` of its own — so twelve fights against one lizard model are twelve fights. Four of them carry a keep-boss mechanic as a *teaching* version of what the Depths will charge for: Hissrad a six-hit `hitShield` (the Ashpriest asks 6/9/12), Mama Fenwrack `thresholdRetaliation` every 12.5% (the Sentinel every 10%), Ryssa a twelve-hit ward behind a Reflect, and Ssyleth `addSummon` 1/turn to a cap of 4 (the Broodmother 2/turn to 6). Warlord health tops out below the shallowest keep-boss on purpose — the campaign is the on-ramp.
- Slot-by-stage drops (source-faithful): s1 Weapon · s2 Helm · s3 Shield · s4 Gauntlets · s5 Cuirass · s6 Boots · s7 any. Drop rank bands ⚙ climb one per three chapters and one per difficulty (N ch1 ★1–2 → B ch12 ★6); rarity weights shift by difficulty and again from chapter 9 on.
- Waves: s1–6 = 3 waves; s7 = 2 waves + warlord. Wave width grows with the chapter (2 abreast in ch1–3, 4 by ch10), and each chapter has a **theme archetype** that appears in most of its waves — which is most of why a late stage is harder than an early one at the same level. Compositions are cursor-derived, not random: a published stage is the same stage tomorrow.
- Energy: N 4 (boss 5) / H 6 (7) / B 8 (9). **Difficulty unlock: clear 12-7 of the difficulty below** — Hard is a second pass over the whole vale, not an alternative to the chapter you are on.
- **Stars:** 1★ win · 2★ no deaths · 3★ no deaths + inside the turn limit ⚙ 〔dev vs source's "≤2 champions" rule — friendlier for a 7-champion roster〕. The limit **grows with the chapter** (boss 16 → 44, trash 12 → 20): a warlord with four times chapter 1's health takes four times as long to fell, and a fixed limit would put the third star out of reach for exactly the players who earned it.
- **Star chests** at 7 / 21 / 42 / 63★ per chapter, counting all three difficulties together (7 stages × 3 stars × 3 difficulties = 63). 21 is Normal cleared cleanly, 42 adds Hard, 63 is everything; chapter 12's last chest pays Valor Medals on top.
- First-clear bonuses on every stage — silver everywhere, crystals on the warlord.
- **Balance gates** (`pnpm sim`, enforced in CI): each chapter's Normal boss falls to a par team ≥70%; Hard and Brutal chapter 1 fall to the team that just unlocked them ≥70%; their chapter 12 falls to a maxed team ≥50%; and two *walls* — 12-7 Normal turns back a chapter-1 team, and Brutal 12-7 turns back a team fresh off Normal, both ≥90%. Without the walls a rebalance could flatten twelve chapters into one and nothing would notice.

## 4. The Depths

| Dungeon | Floors | Sets / loot | Boss | Energy ⚙ |
|---|---|---|---|---|
| Wyrm's Hollow | 15 | Swiftwind, Pathfinder, Stormcoil, Reaver | Broodwyrm | 6→16 by floor |
| Frostgrave Vault | 15 | Stoneguard, Ironroot, Wardweave, Leadenscale | Rimebound Sentinel | 6→16 |
| The Cinderspire | 15 | Hawkeye, Truestrike, Wolfsfang, Emberheart | the Ashpriest | 6→16 |
| Silkmire Depths | 15 | Bloodthorn, Mendersong, Gravebind, Bulwark of Thorns; **accessories floors 10+** | Broodmother Ssarethi | 6→16 |
| Proving Grounds | 10 | Emblems (Bronze F1–4 / Silver F5–7 / Gold F8–10) | Pitmaster Drazhak | 8→14 |
| Essence Springs ×5 | 10 each | Element essences (L/G/P; Prime floors 7+); Pure Spring daily, elements 2 days/week, Mist Sun | Spring Wardens (elite guards) | 6→12 |

Floors = 2 waves + boss; enemy levels scale 20→60 across floors ⚙ (springs 18→60); drop rank/rarity bands by floor tier (1–4 / 5–9 / 10–12 / 13–15 "deep", expressed as fractions of a keep's depth so a shortened dungeon still has a deep tier). A relic keep drops a relic on **every** clear — rank 2→5 by tier, rarity shifting from mostly-common to Epic-heavy — because a wasted run would make the energy price a swindle. **120 floors shipped** (4×15 + 10 + 5×10), generated from ten plan entries.

## 5. Relic sets (16 at EA — final)
2pc: Ironroot +15% HP · Wolfsfang +15% ATK · Stoneguard +15% DEF · Swiftwind +12% SPD · Hawkeye +12% C.RATE · Reaver +20% C.DMG · Truestrike +40 ACC · Wardweave +40 RES · Pathfinder +5% SPD +20 ACC.
4pc: Bloodthorn heal 30% of damage dealt · Mendersong heal 10% MaxHP at holder's turn start · Gravebind 25% chance Provoke (1t) on hit · Stormcoil +8% TM per 7% HP lost · Leadenscale 18% chance Stun (1t) on hit · Emberheart 25% chance HP Burn (2t) on hit · Bulwark of Thorns counterattack 20% chance when hit.
(Source-mapped: Life/Offense/Defense/Speed/CritRate/CritDmg/Acc/Res/Perception → 2pc; Lifesteal/Regeneration/Taunting/Frenzy/Stun/—/Retaliation → 4pc.)

## 6. Masteries (48 nodes, 16 per tree) — **shipped P6**
Structure per COMBAT §9 (2-of-3 trees, 2×T1 + 3×T2–T5 + 1×T6 picks, tiers gated on total picks below). Per tree — T1×3, T2×3, T3×3, T4×3, T5×2, T6×2. Every node below is live and engine-backed:
- **Onslaught:** T1 Blade Oath +75 ATK · Keen Eye +5% C.RATE · Heavy Hand +10% C.DMG | T2 Shieldcracker +25% dmg vs Shielded · Bloodrush heal 5% of dmg when <50% HP · Momentum +6 SPD per kill (max 18) | T3 Fell the Great +6% dmg vs higher-MaxHP · Opportunist +12% dmg vs CC'd · Grim Cycle 30% chance −1 random CD on hits ≥30% target HP | T4 Methodical A1 +2%/use (max +10%) · Bounty Shield 15% MaxHP shield on kill · Duelist's Focus +6% dmg in Arena | T5 Executioner +8% dmg vs <40% HP · Fury Brand +4% dmg per own debuff | **T6 Deathmark** (60%: +10% target MaxHP dmg, 4% vs bosses, 1/skill) · **Flawless Edge** +20% C.DMG.
- **Bulwark:** T1 Ironhide +75 DEF · Thickblood +810 HP · Braced −5% AoE dmg | T2 Mender's Gift +5% heals/shields received · Shieldwall redirect 5% ally dmg to self · First Stand Shield 10% MaxHP at battle start | T3 Grit 50% chance counter when losing ≥25% HP in a hit · Warden's Eye 20% chance counter when ally CC'd · Stonefoot +10% HP | T4 Bloodguard Ally Protection value +10% · Rooted +15% DEF while no buffs · Cleansing Surge 25% chance cleanse 1 self-debuff at turn start | T5 Unbroken +50 RES · Vengeful counter dmg +25% | **T6 Last Bastion** survive lethal at 1 HP (1/battle) · **Immovable** +5% chance to land Stun/Freeze/Provoke +10% self max HP.
- **Insight:** T1 Sharpened Senses +40 ACC · Quickstudy +5% SPD? 〔no: SPD too strong low〕→ +25 ACC & +10 RES · Lorekeeper +5% heals dealt | T2 Swarmreader +4 ACC per living enemy (max 16) · Bated Breath 30% chance +10% TM when own buff expires · Cold Read 30% chance +10% TM when own debuff expires | T3 Hexweaver debuff chance +5% · Springstep +5% TM on ally death · Sustained Ward set 2pc stat bonuses +15% (Lore-of-Steel-analog) | T4 First Strike −20% TM on first A1 vs each target · Longbrew buff durations on allies +1 turn 25% chance? 〔strong; keep〕 · Attuned +10% heal received | T5 Eagle Sight +50 ACC · Nullfield +30 RES aura-stack | **T6 Veilbinder** 30% own debuffs +1 turn (no hard CC) · **Wellspring** team +5% TM when this unit lands ≥2 debuffs in a turn.

## 7. Meta content
- **Quests:** dailies/weeklies/monthlies exactly as ECONOMY §11.
- **Missions (80, shipped):** 10 arcs × 8 (Awakening the Gate → First Steel → The Causeway → Depths-Delver → Proving Yourself → Arena Blooded → Silver Standard → The Deep Floors → Brutal Roads → Court of the Coilmother). Each arc's eighth step is its milestone and pays a sigil or tome; final: **Aureleth, Voice of the Vale** (exclusive Legendary, §1b) + title "Warden of the Reclamation". Arcs open in order and the eight inside one are open together; progress accrues on every arc regardless, so the ordering never costs a player something they earned.
- **Events at launch:** Champion Training (5d), Depths Delve (3d), Summon Surge (2d) staggered on a 2-week admin-cloneable calendar.
- **Login:** 30-day cycle (day 30 Epic selector), 7-day welcome track. **News:** seeded welcome post + patch-notes template.
- **Bazaar/Crystal shop:** per ECONOMY §9–10.
- **Tutorial (scripted, `tutorialStep` content — shipped P9):** the Wardenmaster, a Hollowborn lantern-keeper, walks a new warden from the first mist to the point the Valewarden's Path takes over. **Fourteen steps** as seeded: 1 the Haven → 2 starter choice (permanent) → 3 clear 1-1 → 4 first summon (granted Faded Sigils ×2) → 5 equip a relic → 6 upgrade one to +1 → 7 clear 1-2 → 8 quests intro (claim one) → 9 clear 1-3 → 10 level a champion three times + rank-up explainer → 11 clear 1-4 → 12 the Bazaar (buy one) → 13 clear through to Vrash the Fenblade at 1-7 → 14 the Depths tease and the Path. The **cold-open battle** GAME_DESIGN §5 opens on — all three starters borrowed, preset relics, a scripted near-loss — is a battle mode rather than a script step and becomes step 1 when it lands; nothing has to move, because progress is a position rather than a step key.
  - Each step's completion condition is an **ordinary goal**, so the tutorial is a subscriber to the same fan-out quests use and no reporting module knows it exists. A step with no goal is a *beat*.
  - The XP paid along the way is sized against the account curve to clear each feature gate **before** the step that needs it (level 2 by step 2 for the calendar, 3 by step 4 for the forge, 4 by step 6 for quests, 5 by step 8 for the Bazaar) — a step pointing at a locked screen is a step nobody can finish.
  - Rewards throughout ≈ 3 days of faucets ⚙ (~34k silver, 300 crystals, six sigils, plus the relic-upgrade money the forge step needs).
- **Bots (arena seed):** 60 bots at launch across bands (Bronze 24 / Silver 20 / Gold 12 / Platinum 4) ⚙, natural name pool ("Karrow", "Vessa Thornhand", "Old Berrin"…, no bot marker — owner-approved), teams synthesized at band power from the full 37-champion roster (rarity mix scales with band), nightly refresh ±5% power jitter, top-10 auto-yield on.

## 8. Seed-generation notes (Phase P1/P10)
Band tables above expand via `tools/` seed generator into full `stage_defs` rows (wave comps from per-chapter templates + level bands + drop tables). Generated seeds are committed JSON — reviewed like code, tweaked via Admin after deploy. Balance-sim CI gates (COMBAT §14) run against exactly these seeds.
