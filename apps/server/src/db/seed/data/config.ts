import type { GameConfigEntryInput, ItemDefInput } from '@mistvale/shared';

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
    'How many automated repeats a player gets each day.',
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

  // ── Summoning ─────────────────────────────────────────────────────────────
  entry(
    'summon.rates.gleaming',
    { rare: 0.915, epic: 0.08, legendary: 0.005 },
    'summon',
    'Gleaming Sigil rates',
    'Must sum to 1. Shown to players on the Odds & Mercy panel.',
  ),
  entry(
    'summon.rates.radiant',
    { epic: 0.94, legendary: 0.06 },
    'summon',
    'Radiant Sigil rates',
    'Must sum to 1.',
  ),
  entry(
    'summon.rates.faded',
    { common: 0.74, uncommon: 0.2, rare: 0.06 },
    'summon',
    'Faded Sigil rates',
    'Must sum to 1.',
  ),
  entry(
    'summon.mercy.gleamingEpicAfter',
    20,
    'summon',
    'Epic mercy threshold',
    'Pulls without an Epic before the bonus starts accruing.',
  ),
  entry(
    'summon.mercy.gleamingEpicStep',
    0.02,
    'summon',
    'Epic mercy step',
    'Added to the Epic chance per pull past the threshold.',
  ),
  entry(
    'summon.mercy.legendaryAfter',
    200,
    'summon',
    'Legendary mercy threshold',
    'Pulls without a Legendary before the bonus starts.',
  ),
  entry(
    'summon.mercy.legendaryStep',
    0.05,
    'summon',
    'Legendary mercy step',
    'Added to the Legendary chance per pull past the threshold.',
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
    'ops.dailyResetTimezone',
    'Europe/Berlin',
    'ops',
    'Reset timezone',
    'Timezone the reset hour is interpreted in.',
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
