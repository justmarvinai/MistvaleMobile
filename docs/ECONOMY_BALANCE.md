# Mistvale — Economy & Balance

> Status: **Planning.** Initial numbers for every faucet, sink, curve, and probability — all stored in `game_config`/content tables (⚙ = admin-tunable, which is nearly everything here). Grounded in `docs/research/RAID_REFERENCE.md` Part III; deviations 〔dev〕 are deliberate. EA-0.1 has **no payments**: Crystals are earnable-only, priced as if they were premium so the economy survives a future shop without rebalancing.

## 1. Currencies

| Currency | Faucets | Sinks |
|---|---|---|
| **Silver** | Selling relics (main), campaign/dungeon clears, arena wins, quests, events, login, Bazaar flips | Relic upgrades (dominant), rank-ups, Bazaar stock, roster expansion |
| **Crystals** (premium-shaped, F2P-only at EA) | Crystal Mine, dailies chain, weekly/monthly quests, missions, arena weekly chests, events, star-chests, level-ups | Energy refills, mastery buyout/reset, Bazaar slot unlocks + manual refresh, Training Yard slots, roster expansion, arena token refills, cosmetic reserve |
| **Energy** | Regen, level-ups (full bar), quests, events, login, refills | Every PvE stage entry |
| **Arena Tokens** | +1/hour, cap 10; crystal refill | Arena battles (1 each) |
| **Valor Medals** | Arena wins (tier-scaled), weekly tier chest | Hall of Valor upgrades (only) |
| **Sigils** (Faded/Gleaming/Mistwoven/Radiant) | §5 | Mistgate summons |
| **Essences** (4 elements × L/G/P + Pure) | Essence Springs, events, star-chests | Ascension |
| **Emblems** (Bronze/Silver/Gold) | Proving Grounds, events | Masteries |
| **Skill Tomes** (R/E/L) | Missions, events, monthly quests, deep-floor first-clears | Skill upgrades |
| **XP Boosts** (100%, timed) | Events, login, missions | Consumed on activation |

Every grant/spend flows through `RewardService` → `economy_log`, so the Admin dashboard can chart faucet/sink actuals against this design (drift detection).

## 2. Energy
- **Cap:** `18 + ⌈1.85 × level⌉` ⚙ → 20 at L1, 129 at L60 (source: 18→130). **Regen:** 1 per 3 min ⚙ below cap. Level-up: full-bar refill (overfill allowed).
- **Refill:** 40 Crystals for a full bar ⚙, flat, repeatable (source-faithful); +30/+60 energy consumable items from events/login.
- Costs recap (details in CONTENT_PLAN): campaign N 4 / H 6 / B 8 (boss stage +1); Depths floors 6→16 by floor band; springs 6–12; Proving Grounds 8–14.
- Sizing target ⚙: a fully-active free day ≈ 2 caps' worth of energy (regen 480 + quests/events ~100–150) ≈ 70–90 campaign runs equivalent. Multi-battle cap 30 runs/day ⚙ (source-faithful) keeps sessions humane without inflating totals.
- **Multi-battle** (`economy.multiBattleDailyCap` 30 ⚙, `economy.multiBattleMaxPerCall` 10 ⚙, `unlocks.multiBattleLevel` 6 ⚙): the cap is a *time* limit, not an economy one — a batch pays exactly what the same runs would have paid by hand, energy included, so it changes how long farming takes rather than how much it yields. The per-press cap is smaller than the daily one on purpose: a batch should be a decision a player makes several times a day. The allowance resets at the daily reset hour (`ops.dailyResetHour` 4 ⚙, `ops.dailyResetTimezone` UTC ⚙), which is the same game-day the Essence Springs rotation runs on.
- **Practice** costs nothing and pays nothing — no energy, no silver, no XP, no drops, no clear. It is a *time* faucet only: it lets a player find out whether a team clears a floor without spending the energy to find out the expensive way.

## 3. Champion XP & rank economy
- **Level caps by star rank** ⚙ (`LEVEL_CAP_BY_RANK`, owner 2026-08-22): **★1 20 · ★2 20 · ★3 30 · ★4 40 · ★5 50 · ★6 60**. 60 is the ceiling for every champion. ★1 and ★2 share a cap because a Common is food rather than a project, and its whole career is getting to 20 and being eaten.
- **Champion XP** to max per rank ⚙: ★1/★2 34k · ★3 116k · ★4 400k · ★5 1.55M · ★6 5.4M (geometric per-level curve, `xp(level) ≈ A × e^(0.076·level)` shape like the source; total 1→60 ≈ 7.1M by the shipped curve, `180 × 1.16^(level−1)`).
- **Mistbrew** (`xp_brew`) ⚙: one XP consumable rather than one per element, worth `economy.brewXp` = **1,500 champion XP** each. Falls off campaign stages (≈35% on a trash stage, 80% on a warlord, in bigger handfuls further in) and is sold at the Bazaar — 5 for 4,000 silver, or 40 for 60 crystals from account level 4. Deliberately generous: the bottleneck on a warband should be the *food chain* that ranks it up, not the experience that levels it.
- Stage champ-XP scales with chapter & difficulty, and with the chapter **faster than silver does** (`chapterScale^1.6` against `chapterScale`) — which is what makes deep Brutal the intended *levelling* farm rather than merely the richest stage. **Brutal 12-3 ≈4.4k and 12-6 ≈6.2k per champion per run** ⚙ (a stage's champion XP is a total, split across the deployed team, so the "farmer carries 3 food" loop is deliberately preserved). 12-6 pays half again as much for the same energy because it is a harder fight further in — the reason to push past 12-3 rather than settle there.
- **Rank-up:** at the level cap, consume `R` champions of exactly `R`★ + silver fee ⚙ (`economy.rankUpSilver` 2k/8k/30k/100k/300k for 1→2 … 5→6). **The champion resets to level 1** against its new cap. Food chain (owner-approved): Broodlings/Broodguards from Faded Sigils + campaign drops; pre-ranked food (2★–4★ Broodguards, chicken-analog) from events/login.
- **Star ceilings are the rarity's, not the champion's** (owner, 2026-08-22): Common stays where it was called (★1 or ★2), Uncommon ★2–3→★5, Rare ★3→★5, Epic ★4→★6, Legendary ★5→★6. The table lives in `packages/shared/src/progression.ts` because it is a *rule* rather than a tunable — a Common must not be authorable into a six-star. What **is** content is where a champion is called: `champion.baseRank`, defaulting to the bottom of its rarity's band.
- **Duplicates:** feeding an identical champion grants +1 skill level on a chosen skill 〔dev: choice, not random〕 — the dupe economy for a 7-champion pool.
- **Account XP:** per energy spent (≈8 XP/energy ⚙) + quest chunks (100/500/1,000). L60 cap ≈ 3–4 months of active play ⚙.

## 3b. Watching a fight
- **Playback speeds** ⚙ (`battle.speedUnlocks`, owner 2026-08-22): **×1 · ×2 · ×4** — the first two from the first fight, **×4 for the campaign finished on Normal**. Brutal opens no speed; the rung it used to open was removed and ×4's condition did not move. Adding one back is this key plus `BATTLE_SPEEDS`. "Finished" is all 84 stages of that difficulty cleared at least once. A speed the config does not name is open to everybody, which is how the two starting rungs are expressed; there is deliberately no way to spell "never".
- **Skip** (jumping a fight to its end) is offered on a stage already cleared once, and always in the Arena. Not an economy lever — a skipped fight pays exactly what a watched one pays — but it lives here because it is the other thing the campaign's completion buys.

## 4. Relic (gear) economy
- **Acquisition:** campaign (set by chapter, slot by stage number 1–6, boss stage any slot — source-faithful), Depths (sets by dungeon, accessories from Silkmire deep floors 〔dev: no separate accessory dungeon at EA〕), Bazaar, arena weekly chests, events. Rank/rarity bands scale by chapter/floor & difficulty (tables in CONTENT_PLAN).
- **Upgrade success** ⚙ (gentler low end than source, same shape): +1–4 100% · +5–8 85/78/71/64% · +9–12 55/48/42/36% · +13–16 30/26/23/20%. Failures consume silver, no pity 〔source-faithful; the gamble IS the sink〕.
- **Upgrade cost/attempt** ⚙ (rank 5 / rank 6): +1–4 2k/3k · +5–8 4k/6k · +9–12 8k/12k · +13–16 18k/28k. Expected total to +16: r5 ≈ 0.9M, r6 ≈ **1.8M silver** (source parity).
- **Main stats:** per-slot pools exactly as source (weapon flat ATK, helm flat HP, shield flat DEF; gauntlets +C.RATE/C.DMG; cuirass +ACC/RES; boots +SPD; ring flat; amulet +C.DMG; banner +ACC/RES). Max at r6+16 ⚙: HP 4,080 · ATK/DEF 265 · HP/ATK/DEF% 60% · SPD 45 · C.RATE 60% · C.DMG 80% · ACC/RES 96.
- **Substats:** start count by rarity 0/1/2/3/4 (C/U/R/E/L); roll at +4/8/12/16 (new until 4, then upgrade random); per-roll ranges ⚙ (r6): SPD 4–6, %-stats 4–6%, ACC/RES 8–12, flats scaled.
- **Selling:** `base(rank) × rarityMult × (1 + 0.35 × level)` ⚙ → r5 ≈ 3–9k, r6 ≈ 8–25k. Mass-sell UX with rarity guardrails. **Unequip free** (adopting the source's 2025 change). ~95% of drops are intended sell-fodder — that's the silver faucet.
- **The vault is capped** ⚙ (Q5, owner-answered 2026-08-18) — **250 loose relics**, bought up **50 at a time** to a ceiling of **1,000**; first slab 25,000 silver, each one after ×1.3, so the whole ceiling is ≈ **4.2M**. Without a cap nothing is ever sold, the faucet above has no drain, and the read that lists the vault grows for the life of the account. **Only loose relics count** — a relic on a champion lives there, not in the vault, so equipping is a legitimate way to make room and the pressure lands on hoarding rather than on collecting. **A drop that will not fit is sold on the road for its value, not lost**, and the results screen says so: farming ten runs is one press, and a player who comes back to nine relics and no explanation has been punished for a cap they never saw themselves hit. All five numbers are `game_config` (`economy.vault*`), so the whole thing retunes without a deploy.
- **Reforging** ⚙ (C10a) — a substat rerolled into a different one, keeping the rolls that went into it. Paid in **Reliquary Dust**, which has **no drop table of its own**: it comes only from **dismantling** relics, which is the whole design. The vault's cap already obliges a player to get rid of relics, so this makes what they get rid of into the currency that fixes what they kept, and reforging is self-limiting without a second faucet to balance. Dismantle yield `base(rank) × rarityMult × (1 + 0.4 × level)` ⚙ → a ★6 legendary at +16 grinds to ≈ **1,040 dust**, the junk a farmed evening produces (★5–6 at +0) to 50–110 each. A reroll of a ★6 costs **1,000 dust + 100,000 silver**, growing **×1.6 per reforge already done to that relic** and capped at **6 per relic** — so one keeper's worth of overflow buys one reroll of the keeper, and exhausting a single relic costs ≈ 26,000 dust. Growth compounds **per relic, not per account**, so months of work on an old piece never price a player out of fixing a new drop. The reroll excludes the line's own *form*, so it always comes back different (flat DEF may become DEF%, which at these numbers is a real change). Every number is `game_config` (`economy.gearDismantle*`, `economy.gearReforge*`).

## 4b. The collection (Imprint & Standing) ⚙ — C10b
Two ways a collection pays beyond the four champions fielded. Both are **percentages of a champion's base stats**, added to the same block and resolved the way relic percentages already are (COMBAT_SYSTEM §1) — so they never compound with each other or with a relic, and application order cannot matter. **Neither grants SPD**, and the three-field shape (`hpPct`/`atkPct`/`defPct`) enforces that rather than merely documenting it: speed decides turn order before anything else in the engine, and an account-wide speed bonus would silently retune every boss mechanic built around a turn count.

- **Imprint** — copies **obtained**, never copies held. Feeding a duplicate away is how a champion ranks up, so a count derived from the roster would punish the correct play. Every ladder starts at **two** copies: the first copy is the champion, the second is the first mark. Thresholds are rarity-scaled and the bonus curve is shared, because "a second copy" is an afternoon for an Uncommon and a month for a Legendary. Copies ⚙: L 2/3/4/5/6 · E 2/3/5/7/10 · R 3/5/9/15/23 · U 4/8/16/29/46 · C 6/13/26/46/71. Bonus ⚙: +3 / +6 / +10 / +15 / +21 % to HP, ATK and DEF, front-loaded so the first duplicate is the one that feels like something.
- **Standing** — distinct **non-food champions held**, so letting your only copy of somebody go is a real cost and "is this worth more as food" stays a decision. Food is excluded from both sides: it exists to be spent, and counting it would make the correct play lower a number the screen tells a player to raise. Tiers ⚙ at 5/10/15/20/25/30/37 champions for +1 → +8 % to everything. An order of magnitude under imprint on purpose: it applies to every champion at once and asks for no decision, so it is a reward for playing broadly rather than a build.

**The balance gates measure this.** `pnpm sim`'s *maxed* teams carry `withCollection` (imprint 3 + a full standing tier = +18%), because a finished account has duplicates of what it built and holds most of the roster — leaving it out would make every ceiling gate understate a real endgame team. The fresh and par teams deliberately do not: a new account has neither. The Titan's ceiling gate has the least headroom of any of them and is the one to watch when another power feature lands.

## 5. Summoning & sigil flow
Rates & mercy: GAME_DESIGN §10 (source-verified values). Expected cost per Epic on Gleaming ≈ 11.4 pulls with mercy; per Legendary ≈ 174 ⚙-derived — right for a years-long chase, generous vs the 7-champion EA pool.
**Sigil faucets (per active day/week, initial):**
| Sigil | Sources |
|---|---|
| Faded | Bazaar 5k silver (2 stocked/day), daily quest, login (~1/day), events |
| Gleaming | Bazaar 200k silver (1/day stocked), weekly quest chain, ~6 login/month, star-chests, missions, events (≈ 2–4/week F2P) |
| Mistwoven | 1/month via monthly quest, login day 21, rare event milestones (≈ 2/month) |
| Radiant | Monthly quest, full-clear star-chests per difficulty, deep mission milestones, big event finals (≈ 1/month) |
**Summon events** (admin-scheduled presets): ×2 rarity weekends (Epic+Leg base doubled), featured ×10 weighting — the framework supports both from EA.

## 6. Ascension essences
Per-level cost pattern ⚙ (Epic): Asc1 8 Lesser · Asc2 15 Lesser + 5 Pure · Asc3 12 Greater + 8 Pure · Asc4 20 Greater + 12 Pure · Asc5 15 Prime + 20 Pure · Asc6 25 Prime + 30 Pure (element-matched; Rare ≈ ×0.6, Legendary ≈ ×1.6). Springs floor yields scale 2→10 essences/run by floor; Prime only from floors 7+ ⚙. Full Epic Asc6 ≈ 3–4 weeks of rotation-day farming — the mid-game treadmill.

## 6b. Awakening (Waking Shards)
Six levels, Rare and above only, and the last ladder — gated on the rarity's star ceiling, that rank's level cap **and** a full ascension, so nothing else is left when it opens. Per-level cost ⚙ (`economy.awakeningCosts` / `economy.awakeningSilver`): Awk1 4 shards + 20k silver · Awk2 8 + 50k · Awk3 14 + 120k · Awk4 22 + 250k · Awk5 34 + 500k · Awk6 50 + 1M. Each level adds `champion.awakeningBonusPct` = 3% to base stats, against ascension's 2%.

**Waking Shards fall in the back half of the Depths and nowhere else** ⚙ — nothing below halfway down a dungeon, 45% for 1–2 between halfway and four-fifths, 90% for 1–3 deeper than that. That is what makes pushing deeper worth more than farming the floor that is comfortable. One material, one source: the source game funds awakening from a second summoning economy with its own currency and its own pity, and Mistvale puts the depth in *reaching* the shard instead. Full Awk6 on one champion ≈ 132 shards ≈ a month of deep Depths running alongside everything else it pays for — deliberately the longest single project in the game.

## 7. Masteries (Emblems)
Full build = 100 Bronze + 600 Silver + 950 Gold Emblems (source-faithful shape; per-node costs in COMBAT §9). Proving Grounds run yields by floor ⚙: F1–4 Bronze 20–32, F5–7 Silver 10–16, F8–10 Gold 8–12 → first full mastery build ≈ 2 focused weeks. Crystal buyout 800 ⚙; reset first-free then 150 ⚙.

## 7b. The Valewurm (Solo Titan)
**Two keys a day**, restored by the daily rollover, spent when a run opens and never refunded — the mode is attempts-limited rather than resource-limited, which is what stops a fixed wall being brute-forced with a big enough energy bar. No energy cost and no multi-battle.

**Paid per run at the highest rung reached**, on any ending — victory, defeat, the cap, or a retreat. Six rungs ⚙, priced against **measured** damage rather than guessed: `pnpm sim` fights the Valewurm with a fresh, a middling and a fully-built team, and the ladder is set so a fresh account clears the bottom rung on a typical first key while the top rung sits above what a fully-built team (on the sim's deliberately modest relic set) usually manages.

| Rung | Damage ⚙ | Pays ⚙ |
|---|---|---|
| Splintered Hoard | 8,000 | 12k silver · 2 Bronze Emblem |
| Mossbound Cache | 25,000 | 28k silver · 4 Bronze Emblem · 2 Mistbrew |
| Rootdeep Coffer | 60,000 | 55k silver · 2 Silver Emblem · 1 Pure Essence |
| Wyrmscale Vault | 110,000 | 95k silver · 4 Silver Emblem · 2 Pure Essence · 25 crystals |
| Heart of the Vale | 175,000 | 160k silver · 2 Gold Emblem · 2 Waking Shard · 50 crystals |
| Titanshard | 250,000 | 260k silver · 4 Gold Emblem · 4 Waking Shard · 1 Mistwoven Sigil · 100 crystals |

**What it is a faucet for** is deliberately the two materials the deep game is short of — mastery emblems and Waking Shards — at a rate that is meaningful but capped by the keys, so it accelerates a build rather than replacing the Proving Grounds and the deep Depths floors that supply them.

## 8. Arena & Hall of Valor
- **Rating:** Elo-lite K=32 vs snapshot defense; win +20–35 by gap ⚙; loss-floor protection in Bronze 〔dev — friendlier smalltown ladder〕. Weekly reset Monday 04:00 (config timezone): rating soft-decays toward tier floors ⚙.
- **Tier thresholds** ⚙: Bronze I 0 / II 800 / III 1,000; Silver I 1,200 / II 1,400 / III 1,700; Gold I 2,000 / II 2,300 / III 2,600; Platinum 3,000.
- **Valor Medals per win** ⚙: Bronze 1 · Silver 2 · Gold 3 · Platinum 4; weekly chest 20–150 medals + crystals/tomes/gear by tier.
- **Hall of Valor** 〔dev: single medal currency vs source's 3-tier medals — simpler for one ladder〕: 4 elements × 6 stats (HP%/ATK%/DEF% 2%/lvl → 20%; C.DMG 1%/lvl → 10%; ACC & RES 4/lvl → 40), 10 levels each; cost curve per level ⚙ 40/60/90/130/180/240/310/390/480/580 medals (≈2,500/stat, ≈60k total — a year-scale sink, source-proportional).

## 9. Crystal economy (F2P-fair by construction)
**Faucets/day (active):** dailies chain 10 + Crystal Mine 5/10/15 (L1/2/3) + quest/event/arena extras ≈ **40–70/day**, plus 90–150/week from weeklies/arena chest, milestone bursts from star-chests/missions.
**Sinks:** energy refill 40 · mastery buyout 800/champion · mastery reset 150 (first free) · Bazaar hidden slots 250 (4 unlockable) · Bazaar manual refresh 10 (escalating daily ×2 ⚙) · Training Yard slot 2 300 (EA ships 2 slots) · roster +10 slots: silver **or** crystals, scaling 50→ · arena token refill 30/10 tokens · cosmetic reserve post-EA.
Mine: 3 levels × 500 crystals, 5/10/15 per day (source-faithful ~100-day payback each — the classic first purchase).

## 10. The Bazaar (market)
Rotating stock, restock every 60 min ⚙, 4 base slots + 4 crystal-unlockable: Faded Sigil 5k (always in pool) · relics (all EA sets, rank ≤ player-band, rarity-weighted) 8k–120k · essence bundles · Gleaming Sigil 200k (1/day) · food champions (Broodlings 6k / Broodguards 39k). Prices/stock weights all content-table-driven; sanity-checked against faucet targets in the Admin shop editor.

## 11. Quests, missions, events, login (reward sizing)
- **Dailies (8, source-mirrored, as shipped):** 7 campaign wins → silver 5k · spend 50 energy → 2 Pure Essences · 3 summons → 5k · 3 champion level-ups → 5k · 4 relic upgrade attempts → 5k · 1 Bazaar purchase → 1 Traveller's Ration · 5 arena battles → 1 Traveller's Ration · 3 boss kills → 5k. Claim all eight → **10 Crystals + 400 account XP + 1 Faded Sigil** (`quests.periodChests` ⚙). The chest is a fixed payout rather than a roll: a daily a player can plan around is worth more than one they gamble on, and the sigil *is* the "small relic/sigil roll" the design asked for. The weekly and monthly have **no chest** — a period absent from the config simply has none, and their pull is the quests themselves.
- **First win of the day, per mode** (`quests.firstWinBonuses` ⚙): campaign → 3k silver + 120 XP · relic keeps → 5k + 5 Bronze Emblems · springs → 4k + 1 Pure Essence · Proving → 4k + 8 Bronze Emblems · arena → 3 Valor Medals. Paid automatically on the win, with no claim — it is a reason to open the game rather than one more thing to collect. Practice is deliberately absent: it costs nothing and pays nothing by design.
- **The unlock gate:** the checklist opens at account level 4 (`unlocks.questsLevel` ⚙). Progress is tracked from level 1 regardless, so a first day is never thrown away by a gate the player could not see — it simply becomes claimable when the screen does.
- **Weeklies (6):** incl. "claim all-dailies 5×" → **1 Gleaming Sigil** + crystals; **Monthlies (5):** → **1 Radiant Sigil + 1 Mistwoven Sigil** + Epic tome.
- **Missions (80 at EA, as shipped):** ten arcs of eight. Silver and energy through arcs 1–2 where a new account is poor in both; sigils, tomes and emblems through 3–7 where progress is gated on materials; crystals and Radiant sigils in 8–10. Each arc's eighth step is its milestone and pays the most. The finale (`m10_the_voice`) wants Brutal 12-7 cleared at account level 55 and pays **Aureleth, Voice of the Vale** (exclusive Legendary, Arbiter-analog, unsummonable) + 500 crystals + the title "Warden of the Reclamation". Arcs open in order; progress accrues on every arc regardless, so the gate costs a player nothing they earned.
- **Events (3 presets, shipped, all weekly and staggered):** **Champion Training** Mon–Fri (10 pts/champion level · 400/rank · 600/ascension · 150/mastery node) · **Depths Delve** Fri–Sun (100/floor · 150/floor boss · 4/energy, opens L10) · **Summon Surge** Sat–Sun (source-faithful sigil weights: Faded 1 · Gleaming 20 · Mistwoven 120 · Radiant 500). Six-rung ladders each ⚙, sized so a typical player finishes rung 4–5 of 6: Training tops at 6,000 against a ~3,000–5,600 week, Delve at 9,000 against a ~5,000–8,000 weekend, Surge at **200** against a ~50–150 weekend. Surge is deliberately sized to the *sigils a player can spend* rather than to the weights, so one Radiant pull (500) tops it outright — see USER_QUESTIONS Q2. **Recurring rather than the planned two-week absolute calendar** — a calendar that must be re-cut by hand every fortnight is one that stops being cut, and at EA nobody is running live-ops; the absolute form is still supported and is what an operator schedules for a one-off. Points stop when the window shuts; milestones already earned stay collectable for `events.claimGraceDays` (3 ⚙) afterwards. The *screen* opens at account level 7 like every other dock destination; each event additionally carries its own `unlockLevel` (Training 1, Delve 10, Surge 1), which is content rather than a second global knob. An event that scores below the screen gate banks the points — the same kindness the quest list does.
- **Login (2 tracks, shipped):** the **calendar** is 30 days and cycles forever — sigil days at 7 / 14 / 21 / 28 climbing Gleaming → Gleaming ×2 → Mistwoven → Mistwoven ×2, crystals on 5 / 10 / 15 / 20 / 25, and day 30 the **Epic selector**: a choice of four non-starter Epics, one per role (`darius` · `castellan_ordwin` · `lady_merrow` · `aldemar_the_cartographer`), plus 150 crystals. No Radiant Sigil on the track — the monthly quest set already pays one, and a second guaranteed Radiant every thirty days would make the rarest pull in the game a subscription. **~315 crystals a month**: §9 targets 40–70/day for an active account and the Crystal Mine that was to supply most of that is post-EA, so this closes part of a gap nothing else is meeting rather than overshooting. The **welcome track** is 7 days walked once, ending in Gleaming ×2 and a relic set — four Ironroot and two Swiftwind at rank 2 uncommon, which is two copies of the HP bonus and one of the speed bonus across six of nine slots, so it teaches that sets stack and that two can be worn at once while leaving the accessories to earn. **A day is paid on the Nth claim, not the Nth of the month**, so missing a Tuesday loses that Tuesday and not the player's place; both tracks are `loginTrack` content, so a monthly re-cut is an Admin draft rather than a deploy. The screen opens at level 2 (`unlocks.loginCalendarLevel` ⚙) and arriving late costs nothing — the first claim is still day one.

## 12. Bots (economy isolation)
Bots never earn or consume economy resources; their rosters/gear are synthesized from content defs per rating band (`arena.botBands` ⚙ — count, rating window, account level, team size, champion level/rank/ascension, and the relics' slots/rank/rarity/level, per band) and rebuilt nightly with a ±5% rating drift. Within a band, champion level and relic upgrade level are interpolated by where the bot's rating sits in the band's window, so a rating predicts difficulty and the stakes shown on an offer are a real guide. Sixty at EA, weighted to the bottom where a small ladder's traffic is: **Bronze 24 · Silver 20 · Gold 12 · Platinum 4**. Names come from two multiplied pools (`arena.botGivenNames` × `arena.botEpithets` ⚙ — 40 × 24 = 960 combinations) and carry no marker, per the owner's decision.

Win medals against bots are real (that's the point), but bot "accounts" hold no balances, write nothing to `economy_log`, appear in no economy report, and auto-yield top-10 leaderboard slots to humans at the weekly reset ⚙. A bot is an ordinary `players` row with `is_bot` set — matchmaking, the leaderboard and the engine need no special case — and its account password is CSPRNG bytes hashed and discarded, so nobody can log into one.

## 13. Balance workflow (how numbers stay sane)
1. Every constant here seeds `game_config`/content tables (SEED.sh); the Admin Game-config editor is the only tuning surface post-deploy.
2. `tools/balance-sim` gates (COMBAT §14) run in CI against seeds — a content change that breaks tutorial clearability or farm-loop viability fails the build.
3. The Admin dashboard charts weekly faucet/sink actuals vs this doc's targets (summon-rate drift, silver inflation, energy usage) — tuning is evidence-based from day one.
4. This doc is updated whenever config defaults change (doc-drift is a review-blocker per CLAUDE.md).
