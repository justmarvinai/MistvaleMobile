import {
  DEFAULT_BOT_BANDS,
  DEFAULT_BOT_EPITHETS,
  DEFAULT_BOT_GIVEN_NAMES,
  type GameConfigEntryInput,
  type ItemDefInput,
} from '@mistvale/shared';

/**
 * Every tunable constant.
 *
 * "Balance numbers never live in code" is a hard rule (CLAUDE.md), so each value the
 * design docs mark as tunable appears here and is edited in the Admin Suite. Defaults
 * are transcribed from docs/ECONOMY_BALANCE.md and docs/COMBAT_SYSTEM.md.
 */

const entry = (
  key: string,
  value: GameConfigEntryInput['value'],
  group: string,
  label: string,
  help: string,
): GameConfigEntryInput => ({ key, value, group, label, help });

export const GAME_CONFIG: GameConfigEntryInput[] = [
  // ── Energy ────────────────────────────────────────────────────────────────
  entry(
    'energy.regenSeconds',
    180,
    'energy',
    'Seconds per energy point',
    'How long one point of energy takes to return. The source game uses 180.',
  ),
  entry(
    'energy.capBase',
    18,
    'energy',
    'Energy cap base',
    'Cap is base + perLevel × account level; 18 + 1.85/level gives 20 at level 1 and 129 at 60.',
  ),
  entry(
    'energy.capPerLevel',
    1.85,
    'energy',
    'Energy cap per level',
    'Added to the cap for each account level.',
  ),
  entry(
    'energy.refillCrystals',
    40,
    'energy',
    'Crystal cost of a refill',
    'Flat cost of refilling the bar.',
  ),

  // ── Combat ────────────────────────────────────────────────────────────────
  entry(
    'combat.turnMeterPerTick',
    0.07,
    'combat',
    'Turn meter gained per speed per tick',
    'The tempo constant: TM per tick = SPD × this. 0.07 matches the source game.',
  ),
  entry(
    'combat.strongHitChance',
    0.5,
    'combat',
    'Strong hit chance',
    'Chance of a strong hit when attacking into a weaker element.',
  ),
  entry(
    'combat.strongHitBonus',
    0.3,
    'combat',
    'Strong hit damage bonus',
    'Extra damage on a strong hit.',
  ),
  entry(
    'combat.strongHitCritBonus',
    15,
    'combat',
    'Strong hit crit bonus',
    'Percentage points of critical rate added when attacking with advantage.',
  ),
  entry(
    'combat.weakHitChance',
    0.35,
    'combat',
    'Weak hit chance',
    'Chance of a weak hit when attacking into a stronger element.',
  ),
  entry(
    'combat.weakHitPenalty',
    0.3,
    'combat',
    'Weak hit damage penalty',
    'Damage lost on a weak hit.',
  ),
  entry(
    'combat.disadvantagePenalty',
    0.2,
    'combat',
    'Disadvantage damage penalty',
    'Blanket damage reduction when attacking into a stronger element.',
  ),
  entry(
    'combat.defenceConstantPerLevel',
    10,
    'combat',
    'Defence mitigation constant',
    'K in K/(K+DEF), computed as this × attacker level. 10 gives K=600 at level 60.',
  ),
  entry(
    'combat.damageVariance',
    0.05,
    'combat',
    'Damage variance',
    'Random spread applied to every damage roll.',
  ),
  entry(
    'combat.accuracyParityLandChance',
    0.9,
    'combat',
    'Land chance at ACC = RES',
    'Probability a debuff sticks when accuracy exactly matches resistance.',
  ),
  entry(
    'combat.accuracyMaxLandChance',
    0.97,
    'combat',
    'Maximum land chance',
    'Irreducible resist floor of 3%.',
  ),
  entry(
    'combat.accuracyMinLandChance',
    0.05,
    'combat',
    'Minimum land chance',
    'However high resistance climbs, debuffs still land occasionally.',
  ),
  entry(
    'combat.accuracyBonusPerPoint',
    0.0025,
    'combat',
    'Land chance gained per point of accuracy above resistance',
    'Added to the parity chance for each point of ACC over RES, up to the bonus cap.',
  ),
  entry(
    'combat.accuracyMaxBonus',
    0.07,
    'combat',
    'Cap on the accuracy bonus',
    'At the default 0.0025 per point this caps out at 28 accuracy over resistance.',
  ),
  entry(
    'combat.accuracyPenaltyPerPoint',
    0.01,
    'combat',
    'Land chance lost per point of resistance above accuracy',
    'Each point of RES over ACC costs roughly one percentage point of land chance.',
  ),
  entry(
    'combat.poisonStackCap',
    5,
    'combat',
    'Maximum poison stacks per unit',
    'Poison is the one status that stacks. The source game allows ten; five suits a smaller roster.',
  ),
  entry(
    'combat.effectBarCap',
    10,
    'combat',
    'Maximum buffs or debuffs per unit',
    'Buffs and debuffs are capped separately. A full bar rejects further effects of that kind.',
  ),
  entry(
    'combat.hpBurnSplashPct',
    3,
    'combat',
    'HP Burn splash to allies',
    "Share of the burning unit's max HP dealt to each of its allies when the burn ticks.",
  ),
  entry(
    'combat.waveHealPct',
    10,
    'combat',
    'Between-wave heal',
    'Share of max HP restored to survivors when a wave clears.',
  ),
  entry('combat.maxTurns', 300, 'combat', 'Hard turn cap', 'Battles cannot run longer than this.'),
  entry(
    'combat.arenaCcDiminishing',
    0.25,
    'combat',
    'Arena crowd-control resistance',
    'Extra resist chance per consecutive hard crowd control on the same unit, Arena only.',
  ),

  // ── Progression ───────────────────────────────────────────────────────────
  entry(
    'progression.maxAccountLevel',
    60,
    'progression',
    'Account level cap',
    'Highest reachable account level.',
  ),
  entry(
    'progression.xpCurveBase',
    120,
    'progression',
    'Account XP base',
    'XP needed for level 1 → 2.',
  ),
  entry(
    'progression.xpCurveGrowth',
    1.14,
    'progression',
    'Account XP growth',
    'Multiplier applied per level.',
  ),
  entry(
    'progression.starterGrant',
    { sigil_faded: 10, sigil_gleaming: 3 },
    'progression',
    'Welcome grant',
    'Items handed over with the starter champion. A new warden should be able to reach the Mistgate on their first evening — ten Faded Sigils is a ×10 on the brood banner, which teaches the mechanic and stocks the first rank-up.',
  ),
  entry(
    'progression.rosterCapacityDefault',
    60,
    'progression',
    'Starting roster slots',
    'How many champions a new account can hold.',
  ),

  // ── Champion stat derivation (COMBAT_SYSTEM §1) ───────────────────────────
  // A champion's authored base_stats are its values at ★6 / level 60 / ascension 6.
  // Everything below that is derived by scaling down, so one authored anchor covers
  // every tier a champion can be in.
  entry(
    'champion.levelCurveExponent',
    1.35,
    'progression',
    'Level curve exponent',
    "Primary stats scale as (level / 60) ^ exponent, then blend with the level-1 floor. Higher means more of a champion's power arrives late.",
  ),
  entry(
    'champion.levelFloorPct',
    18,
    'progression',
    'Level 1 share of final stats',
    'What percentage of its level-60 primaries a champion has at level 1, before rank.',
  ),
  entry(
    'champion.rankMultipliers',
    [0.42, 0.55, 0.68, 0.79, 0.9, 1],
    'progression',
    'Star rank multipliers',
    'One entry per star, ★1 first. Multiplies HP, ATK and DEF. ★6 must be 1.0 — it is the authored anchor.',
  ),
  entry(
    'champion.ascensionBonusPct',
    2,
    'progression',
    'Ascension bonus per level',
    'Each ascension level adds this percentage to HP, ATK and DEF.',
  ),

  // ── Economy ───────────────────────────────────────────────────────────────
  entry(
    'economy.gearUpgradeSuccess',
    {
      1: 1,
      2: 1,
      3: 1,
      4: 1,
      5: 0.85,
      6: 0.78,
      7: 0.71,
      8: 0.64,
      9: 0.55,
      10: 0.48,
      11: 0.42,
      12: 0.36,
      13: 0.3,
      14: 0.26,
      15: 0.23,
      16: 0.2,
    },
    'economy',
    'Relic upgrade success by level',
    'Probability each upgrade attempt succeeds. Failures still cost silver — the gamble is the sink.',
  ),
  entry(
    'economy.multiBattleDailyCap',
    30,
    'economy',
    'Multi-battle runs per day',
    'How many automated repeats a player gets each day. Resets at the daily reset hour, not at midnight.',
  ),
  entry(
    'economy.multiBattleMaxPerCall',
    10,
    'economy',
    'Multi-battle runs per press',
    'The largest batch one press may ask for. Smaller than the daily cap on purpose: a batch is a decision the player makes several times a day, not once.',
  ),
  entry(
    'unlocks.multiBattleLevel',
    6,
    'economy',
    'Multi-battle unlock level',
    'Account level at which farming without watching becomes available — late enough that a new player has fought a stage by hand first.',
  ),
  // ── The relic vault (Q5, answered 2026-08-18) ─────────────────────────────
  //
  // A cap is what makes selling and dismantling matter: without one a player keeps
  // everything, the sell button is never pressed, and the read that lists the vault grows
  // for the life of the account. Bought in slabs with silver, up to a ceiling, so the sink
  // is real without ever becoming a wall a player cannot get past.
  //
  // Only *loose* relics count. Equipping is a legitimate way to make room, which keeps the
  // pressure on hoarding rather than on collecting.
  entry(
    'economy.vaultBaseCapacity',
    250,
    'economy',
    'Vault slots to start with',
    'Loose relics a new account may hold. Equipped relics are not counted — they live on a champion, not in the vault.',
  ),
  entry(
    'economy.vaultMaxCapacity',
    1_000,
    'economy',
    'Vault slots at most',
    'The ceiling purchases cannot pass. Also the hard bound on how large the vault read can ever get, which is why it exists as well as the cost curve.',
  ),
  entry(
    'economy.vaultSlotsPerUpgrade',
    50,
    'economy',
    'Slots per purchase',
    'How many slots one purchase adds. Fifty takes the base of 250 to the ceiling of 1,000 in fifteen purchases — few enough that each one is a decision, large enough that nobody is pressing the button thirty times.',
  ),
  entry(
    'economy.vaultUpgradeCost',
    25_000,
    'economy',
    'First vault upgrade cost (silver)',
    'What the first slab of slots costs — an evening or two of farming, so the first one is never a wall. Each subsequent slab is multiplied by the growth below.',
  ),
  entry(
    'economy.vaultUpgradeCostGrowth',
    1.3,
    'economy',
    'Vault upgrade cost growth',
    'Multiplier per purchase already made. At 25,000 and 1.3 the fifteenth and last slab costs about 984,000 and the whole ceiling costs about 4.2M — expensive on purpose, since the alternative to buying room is pressing sell.',
  ),

  entry(
    'economy.gearRemovalFree',
    true,
    'economy',
    'Free relic removal',
    'The source game made removal free in 2025; Mistvale adopts that from the start.',
  ),
  entry(
    'economy.gearUpgradeCost',
    [
      3_000, 3_000, 3_000, 3_000, 6_000, 6_000, 6_000, 6_000, 12_000, 12_000, 12_000, 12_000,
      28_000, 28_000, 28_000, 28_000,
    ],
    'economy',
    'Relic upgrade cost per level (★6)',
    'Silver per attempt at each level 1–16, for a ★6 relic. Lower ranks scale by the rank multipliers. Expected total to +16 at ★6 ≈ 1.8M.',
  ),
  entry(
    'economy.gearUpgradeCostByRank',
    [0.1, 0.18, 0.3, 0.45, 0.65, 1],
    'economy',
    'Relic upgrade cost by rank',
    'Multiplier applied to the per-level cost, indexed by rank − 1.',
  ),
  entry(
    'economy.gearSellBase',
    [120, 300, 800, 1_800, 3_400, 8_000],
    'economy',
    'Relic sell base by rank',
    'Before the rarity multiplier and the per-level bonus. About 95% of drops are meant to be sold — this is the silver faucet.',
  ),
  entry(
    'economy.gearSellRarityMultiplier',
    { common: 1, uncommon: 1.2, rare: 1.5, epic: 2, legendary: 2.8 },
    'economy',
    'Relic sell multiplier by rarity',
    'Multiplies the rank base.',
  ),
  entry(
    'economy.gearSellPerLevel',
    0.35,
    'economy',
    'Relic sell bonus per upgrade level',
    'Sell value is base × rarity × (1 + this × level), so upgrading is never wholly wasted.',
  ),
  entry(
    'economy.gearSubstatsByRarity',
    { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 },
    'economy',
    'Relic starting substats by rarity',
    'How many substats a relic drops with. It gains one at +4, +8, +12 and +16 until it holds four.',
  ),
  entry(
    'economy.gearDropRarityWeights',
    { common: 45, uncommon: 30, rare: 18, epic: 6, legendary: 1 },
    'economy',
    'Default relic rarity weights',
    'Used when a stage or shop offer names no distribution of its own.',
  ),
  entry(
    'economy.powerWeights',
    { hp: 0.06, atk: 1, def: 0.9, spd: 12, critRate: 8, critDmg: 4, res: 3, acc: 3 },
    'economy',
    'Power score weights',
    'Informational only — power sorts lists and bands the arena, and is never a combat input.',
  ),
  entry(
    'economy.championReleaseSilver',
    { common: 250, uncommon: 500, rare: 1_500, epic: 6_000, legendary: 25_000 },
    'economy',
    'Silver for releasing a champion',
    'By the released champion’s rarity, scaled by its star rank.',
  ),
  entry(
    'economy.rankUpSilver',
    [2_000, 8_000, 30_000, 100_000, 300_000],
    'economy',
    'Rank-up silver fee',
    'Indexed by the current rank − 1: 1★→2★ costs the first entry. Food champions are consumed on top.',
  ),
  entry(
    'economy.ascensionCosts',
    {
      1: { element_lesser: 8 },
      2: { element_lesser: 15, essence_pure: 5 },
      3: { element_greater: 12, essence_pure: 8 },
      4: { element_greater: 20, essence_pure: 12 },
      5: { element_prime: 15, essence_pure: 20 },
      6: { element_prime: 25, essence_pure: 30 },
    },
    'economy',
    'Ascension cost per level',
    'Costs for an Epic champion. `element_*` resolves to the champion’s own element. Rare champions pay the Rare multiplier, Legendary the Legendary one.',
  ),
  entry(
    'economy.ascensionRarityMultiplier',
    { common: 0.4, uncommon: 0.5, rare: 0.6, epic: 1, legendary: 1.6 },
    'economy',
    'Ascension cost by rarity',
    'Multiplies every essence in the ascension table.',
  ),
  entry(
    'economy.maxAscensionByRank',
    [0, 1, 2, 3, 4, 6],
    'economy',
    'Ascension cap by star rank',
    'A champion cannot ascend past this for its rank — indexed by rank − 1, so ★1 cannot ascend at all and ★6 reaches 6.',
  ),
  entry(
    'economy.awakeningCosts',
    {
      1: { waking_shard: 4 },
      2: { waking_shard: 8 },
      3: { waking_shard: 14 },
      4: { waking_shard: 22 },
      5: { waking_shard: 34 },
      6: { waking_shard: 50 },
    },
    'economy',
    'Awakening cost per level',
    'Waking Shards for an Epic champion, scaled by the same rarity multiplier ascension uses. One material and no element token — a shard is a shard whatever breath the champion has.',
  ),
  entry(
    'economy.awakeningSilver',
    [20_000, 50_000, 120_000, 250_000, 500_000, 1_000_000],
    'economy',
    'Awakening silver fee',
    'Indexed by the awakening level being bought − 1, and scaled by the rarity multiplier. Paid alongside the shards.',
  ),
  // ── Playback ──────────────────────────────────────────────────────────
  //
  // Speed is animation and nothing else: it divides the delay between events the server
  // has already decided. What is gated is the *rung*, and gating it is the owner's rule
  // (2026-08-22) — ×1 and ×2 from the first fight, ×3 for walking the whole vale on
  // Normal, ×4 for walking it again on Brutal. A speed not named here is open to
  // everybody, which is how the two starting rungs are expressed without a special case.
  entry(
    'battle.speedUnlocks',
    { '3': 'normal', '4': 'brutal' },
    'battle',
    'Playback speeds and the campaign that earns them',
    'Keyed by speed, valued by the campaign difficulty that must be finished outright — every stage of it cleared once. A speed left out is available from the start.',
  ),

  entry(
    'economy.brewXp',
    1_500,
    'economy',
    'Champion experience per Mistbrew',
    'One brew, poured. There is deliberately only one kind — four brews split by breath is an inventory chore rather than a decision.',
  ),
  entry(
    'champion.awakeningBonusPct',
    3,
    'champion',
    'Awakening stat bonus per level',
    'Percent added to HP, ATK and DEF per awakening level. The only ladder that carries a champion past its authored ★6/60/Asc6 anchor, which is what makes the shards worth chasing.',
  ),
  entry(
    'economy.masteryCosts',
    {
      1: { itemKey: 'emblem_bronze', amount: 20 },
      2: { itemKey: 'emblem_bronze', amount: 20 },
      3: { itemKey: 'emblem_silver', amount: 100 },
      4: { itemKey: 'emblem_silver', amount: 100 },
      5: { itemKey: 'emblem_gold', amount: 150 },
      6: { itemKey: 'emblem_gold', amount: 500 },
    },
    'economy',
    'Mastery cost per tier',
    'What one node of each tier costs. A full fifteen-node build comes to 100 Bronze, 600 Silver and 950 Gold (ECONOMY_BALANCE §7).',
  ),
  entry(
    'economy.masteryResetCrystals',
    150,
    'economy',
    'Mastery reset cost',
    'Crystals to forget a champion’s masteries. The first reset on each champion is free.',
  ),
  entry(
    'unlocks.masteryLevel',
    14,
    'economy',
    'Masteries unlock level',
    'Account level at which champions may be trained — the same level the Proving Grounds opens at, because that is where emblems come from.',
  ),
  entry(
    'economy.skillUpgradeMaxLevel',
    5,
    'economy',
    'Maximum skill upgrade level',
    'How many tome or duplicate upgrades one skill can take, on top of its published ladder.',
  ),
  entry(
    'economy.tomeByRarity',
    {
      common: 'tome_rare',
      uncommon: 'tome_rare',
      rare: 'tome_rare',
      epic: 'tome_epic',
      legendary: 'tome_legendary',
    },
    'economy',
    'Which tome a rarity needs',
    'Tome rarity must match the champion’s (GAME_DESIGN §7).',
  ),

  // ── Live operations ───────────────────────────────────────────────────────
  entry(
    'ops.dailyResetHour',
    4,
    'ops',
    'Daily reset hour',
    'Local hour at which quests, shops and rotations roll over.',
  ),
  entry(
    'depths.springsGraceDays',
    7,
    'ops',
    'Springs grace period (days)',
    'A new account sees every Essence Spring open, rotation or not, for this many days after registering — so a first week is never spent waiting for a Tuesday.',
  ),
  entry(
    'ops.dailyResetTimezone',
    'Europe/Berlin',
    'ops',
    'Reset timezone',
    'Timezone the reset hour is interpreted in.',
  ),
  entry(
    'ops.retainBattleDays',
    14,
    'ops',
    'Keep finished battles (days)',
    'Resolved battles and the event logs they carry. Active battles are never pruned at any setting — somebody who left a fight open over a weekend comes back to it. Nothing a player sees depends on this: the prune is about disk.',
  ),
  entry(
    'ops.retainMailDays',
    30,
    'ops',
    'Keep expired mail (days)',
    'How long an expired message stays in the database after it has already vanished from the inbox. Kept a while on purpose: “what did that compensation mail say” is asked after it is gone. Mail with no expiry is never pruned.',
  ),
  entry(
    'ops.retainEconomyDays',
    90,
    'ops',
    'Keep the economy log (days)',
    'The audit trail behind the player inspector and the economy dashboards. Lower it on a box that is filling up; raise it before an investigation.',
  ),
  entry(
    'ops.retainQuestDays',
    90,
    'ops',
    'Keep quest instances (days)',
    'One row per active quest per player per day, so this is the table that grows fastest. A period older than the longest quest period is dead weight — nothing reads it.',
  ),
  entry(
    'ops.retainEventDays',
    60,
    'ops',
    'Keep event scores (days)',
    'A past occurrence’s points and claimed milestones. Dead once the claim grace closes; kept longer so a question about last month’s ladder can still be answered.',
  ),

  // ── The Arena ─────────────────────────────────────────────────────────────
  entry(
    'arena.tierThresholds',
    {
      bronze_1: 0,
      bronze_2: 800,
      bronze_3: 1_000,
      silver_1: 1_200,
      silver_2: 1_400,
      silver_3: 1_700,
      gold_1: 2_000,
      gold_2: 2_300,
      gold_3: 2_600,
      platinum: 3_000,
    },
    'arena',
    'Tier thresholds',
    'Rating at which each rung of the ladder begins. Where the rungs sit is the main lever on how a season feels (ECONOMY_BALANCE §8).',
  ),
  entry(
    'arena.startingRating',
    900,
    'arena',
    'Starting rating',
    'Where a new account joins the ladder — inside Bronze II, so the first win is a promotion rather than a rounding error.',
  ),
  entry(
    'arena.ratingK',
    32,
    'arena',
    'Rating K-factor',
    'How far one result can move a rating. Elo-lite: the swing shrinks as the gap between the two ratings grows.',
  ),
  entry(
    'arena.bronzeFloor',
    true,
    'arena',
    'Bronze loss protection',
    'A loss inside Bronze cannot drop a rating below its tier floor. A friendlier smalltown ladder than the source game’s — a new account should not be able to fall out of the bottom.',
  ),
  entry(
    'arena.medalsPerWin',
    { bronze: 1, silver: 2, gold: 3, platinum: 4 },
    'arena',
    'Valor Medals per win',
    'By band. The only faucet for the Hall of Valor besides the weekly chest.',
  ),
  entry(
    'arena.weeklyChest',
    {
      bronze: { valorMedals: 20, crystals: 25 },
      silver: { valorMedals: 50, crystals: 50 },
      gold: { valorMedals: 100, crystals: 100 },
      platinum: { valorMedals: 150, crystals: 150 },
    },
    'arena',
    'Weekly tier chest',
    'Paid against the best tier held during the week, not the tier held on Monday morning — falling out of Gold on Sunday evening must not cost a week of Gold.',
  ),
  entry(
    'arena.tokenCap',
    10,
    'arena',
    'Attack token cap',
    'Tokens accrue to this and stop. Source-faithful.',
  ),
  entry(
    'arena.tokenRegenSeconds',
    3_600,
    'arena',
    'Attack token regen',
    'Seconds per token. Derived from the clock like energy — there is no ticking job to fall behind.',
  ),
  entry(
    'arena.offerCount',
    5,
    'arena',
    'Opponents on offer',
    'How many opponents the hub shows at once.',
  ),
  entry(
    'arena.freeRefreshesPerDay',
    5,
    'arena',
    'Free offer refreshes per day',
    'After these, a refresh costs crystals. Resets on the daily reset hour with every other allowance.',
  ),
  entry(
    'arena.refreshCrystals',
    10,
    'arena',
    'Paid offer refresh',
    'Crystals for a refresh once the free ones are gone.',
  ),
  entry(
    'arena.weeklyDecayPct',
    10,
    'arena',
    'Weekly rating decay',
    'Percentage of the distance from the current rating down to its tier floor, shed at the Monday reset. Keeps an abandoned account from holding a Platinum slot forever without resetting anybody to zero.',
  ),
  entry(
    'arena.botBands',
    DEFAULT_BOT_BANDS,
    'arena',
    'Bot ladder recipes',
    'How many bots each band holds and what they are built from: the rating window they spread across, the level they show, and the champions and relics their defence is synthesised at. The ladder must never be empty — a new account has to find somebody to fight on its first evening. Sixty by default, weighted to the bottom (ECONOMY_BALANCE §12).',
  ),
  entry(
    'arena.botGivenNames',
    [...DEFAULT_BOT_GIVEN_NAMES],
    'arena',
    'Bot names — given',
    'The first half of a bot’s name. Multiplied by the epithet list, so adding one word here adds a name for every epithet. Natural names with no bot marker, by the owner’s decision (GAME_DESIGN §9.3) — keep them ≤7 characters so every combination fits a profile name.',
  ),
  entry(
    'arena.botEpithets',
    [...DEFAULT_BOT_EPITHETS],
    'arena',
    'Bot names — epithets',
    'The second half of a bot’s name. Keep them ≤8 characters: a profile name is at most sixteen, and a name that will not fit is a bot that cannot be created.',
  ),
  entry(
    'arena.hallCosts',
    [40, 60, 90, 130, 180, 240, 310, 390, 480, 580],
    'arena',
    'Hall of Valor level costs',
    'Medals for each level of one track, 1 → 10. Twenty-four tracks at ~2,500 each is a year-scale sink by design.',
  ),
  entry(
    'arena.hallPerLevel',
    { hp: 2, atk: 2, def: 2, critDmg: 1, acc: 4, res: 4 },
    'arena',
    'Hall of Valor per level',
    'What one level of a track gives: a percentage for HP/ATK/DEF/C.DMG, flat points for ACC/RES.',
  ),
  entry(
    'unlocks.arenaLevel',
    8,
    'arena',
    'Arena unlock level',
    'Account level at which the Arena and the Hall of Valor open.',
  ),

  // ── Quests ────────────────────────────────────────────────────────────────
  entry(
    'quests.periodChests',
    {
      daily: { crystals: 10, playerXp: 400, sigil_faded: 1 },
    },
    'quests',
    'Completion chests',
    'Paid for claiming every chest-counting quest of a period. A period left out of this map simply has no chest — which is how the weekly and monthly currently stand, their pull being the quests themselves. Worth more than any single line, so the last quest of a day is still worth doing.',
  ),
  entry(
    'quests.firstWinBonuses',
    {
      campaign: { silver: 3_000, playerXp: 120 },
      dungeon: { silver: 5_000, emblem_bronze: 5 },
      springs: { silver: 4_000, essence_pure: 1 },
      proving: { silver: 4_000, emblem_bronze: 8 },
      arena: { valorMedals: 3 },
    },
    'quests',
    'First win of the day, per mode',
    'Paid automatically on the day’s first victory in each mode — no claim, because it is a reason to open the game rather than a thing to remember. A mode left out pays nothing. Practice is deliberately absent: it costs nothing and pays nothing by design.',
  ),
  entry(
    'events.claimGraceDays',
    3,
    'quests',
    'Event claim grace (days)',
    'How long after an event shuts its milestones can still be collected. Points stop the moment the window closes — this is only about picking up what was already earned, so somebody who finished a ladder on Sunday evening still has it on Monday morning.',
  ),
  entry(
    'unlocks.loginCalendarLevel',
    2,
    'quests',
    'Login calendar unlock level',
    'Account level at which the calendar opens. Nothing is lost by arriving late: a track pays its Nth day on the Nth claim, so somebody who unlocks it on their third evening still starts at day one.',
  ),
  entry(
    'unlocks.questsLevel',
    4,
    'quests',
    'Quests unlock level',
    'Account level at which the checklist appears. Below it, quests still track — so the first day’s progress is not lost — but nothing is claimable.',
  ),
];

/** Stackable items. P1 seeds the currencies and consumables the later phases grant. */
const item = (
  key: string,
  name: string,
  category: ItemDefInput['category'],
  rarity: ItemDefInput['rarity'],
  description: string,
  sortOrder: number,
  payload: Record<string, unknown> = {},
): ItemDefInput => ({
  key,
  name,
  category,
  rarity,
  description,
  icon: `mv-item-${category}`,
  payload,
  sortOrder,
});

export const ITEMS: ItemDefInput[] = [
  item(
    'sigil_faded',
    'Faded Sigil',
    'sigil',
    'common',
    'A worn anchor. Calls the least of what the mist holds.',
    10,
  ),
  item(
    'sigil_gleaming',
    'Gleaming Sigil',
    'sigil',
    'rare',
    'Still bright. The mist answers it properly.',
    20,
  ),
  item(
    'sigil_mistwoven',
    'Mistwoven Sigil',
    'sigil',
    'epic',
    'Woven from the fog itself; it calls only its own.',
    30,
  ),
  item(
    'sigil_radiant',
    'Radiant Sigil',
    'sigil',
    'legendary',
    'It does not so much call as demand.',
    40,
  ),

  item(
    'essence_ember_lesser',
    'Lesser Ember Essence',
    'essence',
    'common',
    'A guttering coal of the Ember breath.',
    50,
  ),
  item(
    'essence_tide_lesser',
    'Lesser Tide Essence',
    'essence',
    'common',
    'A cupful of the deep.',
    51,
  ),
  item(
    'essence_verdant_lesser',
    'Lesser Verdant Essence',
    'essence',
    'common',
    'Sap from something still growing.',
    52,
  ),
  item(
    'essence_mist_lesser',
    'Lesser Mist Essence',
    'essence',
    'common',
    'Fog in a stoppered jar.',
    53,
  ),
  // Greater and Prime tiers, for ascension levels 3–6 (ECONOMY_BALANCE §6). Element
  // essences are matched to the champion's own breath; Pure is the universal top-up.
  ...(
    [
      ['ember', 'Ember', 'A coal that has not gone out in a century.'],
      ['tide', 'Tide', 'Water under pressure, still moving.'],
      ['verdant', 'Verdant', 'Growth that has learned to be patient.'],
      ['mist', 'Mist', 'Fog that remembers a shape.'],
    ] as const
  ).flatMap(([key, label, lore], index) => [
    item(`essence_${key}_greater`, `Greater ${label} Essence`, 'essence', 'rare', lore, 54 + index),
    item(
      `essence_${key}_prime`,
      `Prime ${label} Essence`,
      'essence',
      'epic',
      `${lore} Concentrated past what the springs give up willingly.`,
      58 + index,
    ),
  ]),

  item(
    'essence_pure',
    'Pure Essence',
    'essence',
    'rare',
    'Elementally silent, and useful to everyone.',
    70,
  ),

  // ── The two the ladders run on ────────────────────────────────────────────
  //
  // One brew, not one per breath. The source game splits its experience potions four ways
  // by affinity, which turns levelling into an inventory-sorting exercise and adds nothing
  // to the decision — you always want the one you cannot spend.
  item(
    'xp_brew',
    'Mistbrew',
    'consumable',
    'uncommon',
    'Bottled fog with something bright still moving in it. Champions drink it and remember fights they never had.',
    64,
  ),
  // The awakening material, and the only one. It is the whole simplification: the source
  // game pays for awakening out of a second summoning economy with its own currency and
  // its own pity, where here the depth is in *getting* the shard rather than in a second
  // system to learn.
  item(
    'waking_shard',
    'Waking Shard',
    'material',
    'legendary',
    'A splinter of something that was never asleep. Held too long, it starts to hold back.',
    65,
  ),

  item('tome_rare', 'Rare Tome', 'tome', 'rare', 'Teaches a Rare champion a little more.', 70),
  item('tome_epic', 'Epic Tome', 'tome', 'epic', 'Teaches an Epic champion a little more.', 71),
  item(
    'tome_legendary',
    'Legendary Tome',
    'tome',
    'legendary',
    'Teaches a Legendary champion a little more.',
    72,
  ),

  item(
    'emblem_bronze',
    'Bronze Emblem',
    'emblem',
    'common',
    'Mastery training, in its coarsest form.',
    80,
  ),
  item(
    'emblem_silver',
    'Silver Emblem',
    'emblem',
    'rare',
    'Mastery training for the committed.',
    81,
  ),
  item(
    'emblem_gold',
    'Gold Emblem',
    'emblem',
    'epic',
    'Mastery training few champions ever finish.',
    82,
  ),

  item(
    'energy_pack_small',
    'Traveller’s Ration',
    'consumable',
    'common',
    'Restores 30 energy.',
    90,
    { energy: 30 },
  ),
  item('energy_pack_large', 'Warden’s Ration', 'consumable', 'rare', 'Restores 60 energy.', 91, {
    energy: 60,
  }),
];
