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
- **Champion XP** to max per rank ⚙: ★1 6.3k · ★2 34k · ★3 116k · ★4 400k · ★5 1.55M · ★6 5.4M (geometric per-level curve, `xp(level) ≈ A × e^(0.076·level)` shape like the source; total 1→60 ≈ 7.1M by the shipped curve, `180 × 1.16^(level−1)`).
- Stage champ-XP scales with chapter & difficulty, and with the chapter **faster than silver does** (`chapterScale^1.6` against `chapterScale`) — which is what makes deep Brutal the intended *levelling* farm rather than merely the richest stage. **Brutal 12-3 ≈4.4k and 12-6 ≈6.2k per champion per run** ⚙ (a stage's champion XP is a total, split across the deployed team, so the "farmer carries 3 food" loop is deliberately preserved). 12-6 pays half again as much for the same energy because it is a harder fight further in — the reason to push past 12-3 rather than settle there.
- **Rank-up:** at max level, consume `R` champions of exactly `R`★ + silver fee ⚙ (1→2: 1×1★ … 5→6: 5×5★; silver 2k/8k/30k/100k/300k). Food chain (owner-approved): Broodlings/Broodguards from Faded Sigils + campaign drops; pre-ranked food (2★–4★ Broodguards, chicken-analog) from events/login.
- **Duplicates:** feeding an identical champion grants +1 skill level on a chosen skill 〔dev: choice, not random〕 — the dupe economy for a 7-champion pool.
- **Account XP:** per energy spent (≈8 XP/energy ⚙) + quest chunks (100/500/1,000). L60 cap ≈ 3–4 months of active play ⚙.

## 4. Relic (gear) economy
- **Acquisition:** campaign (set by chapter, slot by stage number 1–6, boss stage any slot — source-faithful), Depths (sets by dungeon, accessories from Silkmire deep floors 〔dev: no separate accessory dungeon at EA〕), Bazaar, arena weekly chests, events. Rank/rarity bands scale by chapter/floor & difficulty (tables in CONTENT_PLAN).
- **Upgrade success** ⚙ (gentler low end than source, same shape): +1–4 100% · +5–8 85/78/71/64% · +9–12 55/48/42/36% · +13–16 30/26/23/20%. Failures consume silver, no pity 〔source-faithful; the gamble IS the sink〕.
- **Upgrade cost/attempt** ⚙ (rank 5 / rank 6): +1–4 2k/3k · +5–8 4k/6k · +9–12 8k/12k · +13–16 18k/28k. Expected total to +16: r5 ≈ 0.9M, r6 ≈ **1.8M silver** (source parity).
- **Main stats:** per-slot pools exactly as source (weapon flat ATK, helm flat HP, shield flat DEF; gauntlets +C.RATE/C.DMG; cuirass +ACC/RES; boots +SPD; ring flat; amulet +C.DMG; banner +ACC/RES). Max at r6+16 ⚙: HP 4,080 · ATK/DEF 265 · HP/ATK/DEF% 60% · SPD 45 · C.RATE 60% · C.DMG 80% · ACC/RES 96.
- **Substats:** start count by rarity 0/1/2/3/4 (C/U/R/E/L); roll at +4/8/12/16 (new until 4, then upgrade random); per-roll ranges ⚙ (r6): SPD 4–6, %-stats 4–6%, ACC/RES 8–12, flats scaled.
- **Selling:** `base(rank) × rarityMult × (1 + 0.35 × level)` ⚙ → r5 ≈ 3–9k, r6 ≈ 8–25k. Mass-sell UX with rarity guardrails. **Unequip free** (adopting the source's 2025 change). ~95% of drops are intended sell-fodder — that's the silver faucet.

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

## 7. Masteries (Emblems)
Full build = 100 Bronze + 600 Silver + 950 Gold Emblems (source-faithful shape; per-node costs in COMBAT §9). Proving Grounds run yields by floor ⚙: F1–4 Bronze 20–32, F5–7 Silver 10–16, F8–10 Gold 8–12 → first full mastery build ≈ 2 focused weeks. Crystal buyout 800 ⚙; reset first-free then 150 ⚙.

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
- **Dailies (8, source-mirrored):** 5 arena battles → energy 30 · 3 summons → silver 5k · spend 50 energy → 2 Lesser Pure Essences · 3 champion level-ups → 5k · 4 relic upgrade attempts → 5k · 1 Bazaar purchase → 5 arena tokens · rotating (3 boss kills / 7 campaign wins) → 5k · claim-all bonus → **10 Crystals + 400 account XP + daily chest** (chest = small relic/sigil roll).
- **Weeklies (6):** incl. "claim all-dailies 5×" → **1 Gleaming Sigil** + crystals; **Monthlies (5):** → **1 Radiant Sigil + 1 Mistwoven Sigil** + Epic tome.
- **Missions (~80 at EA):** silver/energy early → sigils/tomes/emblems mid → final: **Aureleth, Voice of the Vale** (exclusive Legendary, Arbiter-analog) + title.
- **Events (presets):** Champion Training (points/level gained scaled by rank), Depths Delve (points/floor energy), Summon Surge (Faded 1 / Gleaming 20 / Mistwoven 120 / Radiant 500 — source-faithful weights); milestone ladders sized to ~60–70% completion for a daily-active player ⚙.
- **Login:** 30-day cycle (sigil days 7/14/21/28; day 30 = **Epic selector** — choice of the 4 non-starters; monthly re-roll of calendar via admin); 7-day welcome track ending in Gleaming ×2 + starter relic set.

## 12. Bots (economy isolation)
Bots never earn or consume economy resources; their rosters/gear are synthesized from content defs per rating band (`arena.botBands` ⚙ — count, rating window, account level, team size, champion level/rank/ascension, and the relics' slots/rank/rarity/level, per band) and rebuilt nightly with a ±5% rating drift. Sixty at EA, weighted to the bottom where a small ladder's traffic is: **Bronze 24 · Silver 20 · Gold 12 · Platinum 4**. Names come from two multiplied pools (`arena.botGivenNames` × `arena.botEpithets` ⚙ — 40 × 24 = 960 combinations) and carry no marker, per the owner's decision.

Win medals against bots are real (that's the point), but bot "accounts" hold no balances, write nothing to `economy_log`, appear in no economy report, and auto-yield top-10 leaderboard slots to humans at the weekly reset ⚙. A bot is an ordinary `players` row with `is_bot` set — matchmaking, the leaderboard and the engine need no special case — and its account password is CSPRNG bytes hashed and discarded, so nobody can log into one.

## 13. Balance workflow (how numbers stay sane)
1. Every constant here seeds `game_config`/content tables (SEED.sh); the Admin Game-config editor is the only tuning surface post-deploy.
2. `tools/balance-sim` gates (COMBAT §14) run in CI against seeds — a content change that breaks tutorial clearability or farm-loop viability fails the build.
3. The Admin dashboard charts weekly faucet/sink actuals vs this doc's targets (summon-rate drift, silver inflation, energy usage) — tuning is evidence-based from day one.
4. This doc is updated whenever config defaults change (doc-drift is a review-blocker per CLAUDE.md).
