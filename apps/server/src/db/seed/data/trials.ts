import type { EnemyDefInput, RelicGrant, SkillDefInput, StageDefInput } from '@mistvale/shared';

/**
 * Trials — four puzzles, four loaned teams, four turn counts to beat (C10d).
 *
 * Every other mode in Mistvale asks what an account has farmed. A trial asks nothing: the
 * four champions, their levels, their relics, the enemy and even the dice are the same for
 * everybody, so the only variable left is which skill goes on which target on which turn.
 * That is the whole design, and it is the answer to a collection game's oldest problem —
 * that a player who has out-farmed the content has nothing interesting left to do with it,
 * while a player who has farmed nothing has nothing to do at all.
 *
 * Each one teaches exactly one thing, and each is built on a mechanic the engine has had
 * since P6 and the game has never made anybody *use*:
 *
 *  1. **The Warded Coil** — a hit-counter shield. Blows, not damage, and a window to use.
 *  2. **The Mending Fen** — a healer behind a wall. Everything you spend elsewhere is given
 *     straight back.
 *  3. **The Brood Crown** — endless adds. Everything except the crown is a distraction.
 *  4. **The Standing Stone** — it answers every wound. A poison is not a wound.
 *
 * Nothing here is new content in the engine's sense: every skill an enemy swings is one the
 * Depths or the Sunken Road already published, and every champion is one the game already
 * has. A trial is authored out of the parts on the table, which is what makes a fifth one
 * an Admin edit rather than a release.
 *
 * **The pars are measured, not guessed.** `pnpm sim` fights every trial twice — once with
 * the engine's own auto-battle, once with the line the puzzle is authored around — and
 * gates both halves: the line comes in inside par, and Auto does not. A trial whose par
 * Auto can reach is a stage with a longer name; a trial whose par the line cannot reach is
 * a wall. Two puzzles were cut during that tuning for failing the second gate, which is the
 * gate doing its job.
 */

/** Where a trial hangs. Not a dungeon and not a chapter — trials are their own place. */
export const TRIALS_PARENT = 'trials';

/**
 * The kit every loaned champion wears: six pieces of one set, ★5 Epic, unforged.
 *
 * Identical across all four trials on purpose. A trial that handed out better relics than
 * the one before it would be measuring the relics again, which is the one thing this mode
 * exists not to do.
 */
const kit = (setKey: string): RelicGrant[] => [
  { setKey, slot: 'weapon', rank: 5, rarity: 'epic' },
  { setKey, slot: 'helm', rank: 5, rarity: 'epic' },
  { setKey, slot: 'shield', rank: 5, rarity: 'epic' },
  { setKey, slot: 'gauntlets', rank: 5, rarity: 'epic' },
  { setKey, slot: 'cuirass', rank: 5, rarity: 'epic' },
  { setKey, slot: 'boots', rank: 5, rarity: 'epic' },
];

/** A loaned champion. Level, rank and ascension are the same for every one of them. */
const lent = (championKey: string, setKey: string) => ({
  championKey,
  level: 50,
  rank: 5,
  ascension: 4,
  relics: kit(setKey),
});

/**
 * The one skill a trial needed that no enemy already had.
 *
 * A heal scales on its **caster's** maximum health, so the marsh-menders already in the
 * game top up a broodmate for a fraction of what a wall of a creature has lost — which is
 * exactly right on the Sunken Road and useless as a puzzle. This mends for half of the
 * mender's own considerable bulk every other turn, which is enough to undo a team that
 * spreads its damage and nothing at all against one that does not.
 */
export const TRIAL_SKILLS: SkillDefInput[] = [
  {
    key: 'trial_a2_deep_mend',
    name: 'Deep Mend',
    description: 'The fen gives back what was taken out of it, and it gives back generously.',
    slot: 'a2',
    cooldown: 2,
    targeting: { side: 'ally', mode: 'all' },
    components: [{ type: 'heal', scale: 'maxHp', mult: 0.8, target: 'allAllies' }],
    upgrades: [],
    aiHints: { prefer: 'lowestHpAlly' },
    animation: { track: 'cast', vfx: 'mend' },
    sortOrder: 910,
  },
];

/** A trial's opponent is a boss by definition: it carries the mechanic the puzzle is. */
const adversary = (
  key: string,
  name: string,
  archetype: string,
  element: EnemyDefInput['element'],
  role: EnemyDefInput['role'],
  baseStats: EnemyDefInput['baseStats'],
  skills: string[],
  sortOrder: number,
  mechanics: NonNullable<EnemyDefInput['bossMechanics']>,
): EnemyDefInput => ({
  key,
  name,
  archetype,
  element,
  role,
  baseStats,
  growth: 1.045,
  skills,
  assetKey: 'enemy_lizard',
  isBoss: true,
  bossMechanics: mechanics,
  sortOrder,
});

/** An ordinary unit standing beside one. Not a boss, and carries no mechanic. */
const escort = (
  key: string,
  name: string,
  archetype: string,
  element: EnemyDefInput['element'],
  role: EnemyDefInput['role'],
  baseStats: EnemyDefInput['baseStats'],
  skills: string[],
  sortOrder: number,
): EnemyDefInput => ({
  key,
  name,
  archetype,
  element,
  role,
  baseStats,
  growth: 1.045,
  skills,
  assetKey: 'enemy_lizard',
  isBoss: false,
  bossMechanics: { almightyImmunity: false, tmReductionImmune: false },
  sortOrder,
});

export const TRIAL_ENEMIES: EnemyDefInput[] = [
  // ── 1. The Warded Coil ────────────────────────────────────────────────────
  // Six blows between its turns. Four champions with two-hit openers manage eight; four
  // champions saving their big single-target skills manage four and get thrown back down
  // the order for it. The punish is turn meter rather than damage, so failing the puzzle
  // costs *time* — which is exactly the currency the par is counted in.
  adversary(
    'trial_warded_coil',
    'The Warded Coil',
    'coilward',
    'tide',
    'defense',
    { hp: 24_000, atk: 520, def: 640, spd: 96, critRate: 15, critDmg: 50, res: 60, acc: 40 },
    ['depths_a1_rime_strike', 'depths_a2_rime_gaze', 'boss_a3_brood_bulwark'],
    900,
    {
      almightyImmunity: true,
      tmReductionImmune: false,
      hitShield: { hits: 8, punishTmPct: 60 },
      enrage: { afterTurn: 30, dmgPctPerTurn: 8 },
    },
  ),

  // ── 2. The Mending Fen ────────────────────────────────────────────────────
  // The hulk is the wall and the mender is the reason the wall never comes down: 15% of
  // everything's maximum health, every third turn. It has high RES, so a heal reduction
  // thrown at it without accuracy behind it simply resists — the answer is to debuff the
  // *hulk* being healed instead, or to reach past the wall and kill the mender first.
  adversary(
    'trial_fen_hulk',
    'The Fen Hulk',
    'fenhulk',
    'verdant',
    'hp',
    { hp: 50_000, atk: 470, def: 120, spd: 88, critRate: 15, critDmg: 50, res: 45, acc: 30 },
    ['sskarn_a1_brute_slam', 'sskarn_a2_lunge'],
    901,
    {
      almightyImmunity: true,
      tmReductionImmune: false,
      enrage: { afterTurn: 30, dmgPctPerTurn: 8 },
    },
  ),
  escort(
    'trial_fen_warden',
    'Fen Warden',
    'fenwarden',
    'verdant',
    'defense',
    { hp: 26_000, atk: 400, def: 150, spd: 96, critRate: 15, critDmg: 50, res: 40, acc: 20 },
    ['sskarn_a1_spearguard', 'sskarn_a2_shieldwall'],
    903,
  ),
  escort(
    'trial_fen_mender',
    'The Fen Mender',
    'fenmender',
    'verdant',
    'support',
    { hp: 26_000, atk: 380, def: 150, spd: 130, critRate: 15, critDmg: 50, res: 70, acc: 60 },
    ['sskarn_a1_venom_spit', 'trial_a2_deep_mend'],
    902,
  ),

  // ── 3. The Brood Crown ────────────────────────────────────────────────────
  // Two hatchlings a turn to a field of six, forever. Clearing them is a treadmill nobody
  // wins; the crown is the only thing on the field with a health bar that stays down. The
  // hatchling is weak on purpose — the trap is that it is *killable*, not that it is
  // dangerous.
  adversary(
    'trial_brood_crown',
    'The Brood Crown',
    'broodcrown',
    'verdant',
    'hp',
    { hp: 45_000, atk: 560, def: 200, spd: 94, critRate: 20, critDmg: 55, res: 55, acc: 45 },
    ['depths_a1_brood_bite', 'depths_a2_brood_spit', 'depths_a3_devour'],
    904,
    {
      almightyImmunity: true,
      tmReductionImmune: true,
      addSummon: { unitKey: 'trial_crown_hatchling', perTurn: 2, cap: 6 },
      enrage: { afterTurn: 30, dmgPctPerTurn: 8 },
    },
  ),
  escort(
    'trial_crown_hatchling',
    'Crown Hatchling',
    'hatchling',
    'verdant',
    'attack',
    { hp: 12_000, atk: 1_100, def: 300, spd: 150, critRate: 15, critDmg: 50, res: 20, acc: 20 },
    ['depths_a1_brood_bite'],
    905,
  ),

  // ── 4. The Standing Stone ─────────────────────────────────────────────────
  // Every 8% of its health that a *blow* takes off, it answers. Poison takes health off
  // without landing a blow, and the engine already knows the difference — `skipIfDot`
  // reads the same true-damage flag a damage-over-time tick sets. Enormous defence, so
  // hitting it is bad value even before the retaliation; enormous health, so out-damaging
  // the answer is not a plan. Slow enough that a poisoned clock is a clock you can wait on.
  adversary(
    'trial_standing_stone',
    'The Standing Stone',
    'standingstone',
    'ember',
    'defense',
    { hp: 55_000, atk: 620, def: 900, spd: 78, critRate: 15, critDmg: 50, res: 55, acc: 40 },
    ['sskarn_a1_spearguard', 'boss_a3_coilstone_quake'],
    906,
    {
      almightyImmunity: true,
      tmReductionImmune: false,
      thresholdRetaliation: { perHpPct: 8, skipIfDot: true },
      enrage: { afterTurn: 30, dmgPctPerTurn: 10 },
    },
  ),
];

/**
 * A trial stage.
 *
 * Zero energy and no drops — the par bonus is the whole payout, and it is paid once. Stars
 * are set where they can be earned normally, because a trial *is* a stage and a player who
 * clears one should see it go three-star like everything else; the par is the separate
 * thing, and the screen says so.
 */
const trial = (
  key: string,
  sortOrder: number,
  number: number,
  team: StageDefInput['presetTeam'],
  waves: StageDefInput['waves'],
  rules: NonNullable<StageDefInput['trial']>,
  unlock: StageDefInput['unlock'],
): StageDefInput => ({
  key,
  sortOrder,
  mode: 'trial',
  parentKey: TRIALS_PARENT,
  number,
  difficulty: 'normal',
  energyCost: 0,
  waves,
  rewards: { silverMin: 0, silverMax: 0, playerXp: 0, championXp: 0 },
  // Stars are the ordinary stage rule and stay ordinary: a trial *is* a stage, and a player
  // who clears one should watch it go three-star like everything else. The limit is cut a
  // dozen turns above the par so the two never say the same thing — beating par is the
  // achievement, three stars is the clear.
  starRules: { noDeaths: true, maxTurns: Math.min(60, rules.parTurns + 12) },
  firstClearRewards: {},
  unlock,
  presetTeam: team,
  trial: rules,
});

const at = (enemyKey: string, slot: number) => ({ enemyKey, level: 50, stars: 6, slot });

export const TRIAL_STAGES: StageDefInput[] = [
  trial(
    'trial_warded_coil',
    1,
    1,
    [
      lent('anuria', 'hawkeye'),
      lent('bracken_puck', 'swiftwind'),
      lent('ashka_torchhand', 'reaver'),
      lent('cantor_maelis', 'truestrike'),
    ],
    [[at('trial_warded_coil', 1)]],
    {
      name: 'The Warded Coil',
      parTurns: 20,
      hint: 'Six blows between its turns, or the whole line is thrown back down the order. It counts blows landed — not damage done.',
      parRewards: { silver: 60_000, crystals: 75, xp_brew: 4 },
    },
    { playerLevel: 9 },
  ),
  trial(
    'trial_mending_fen',
    2,
    2,
    [
      lent('wisp_of_hallen', 'truestrike'),
      lent('vessaryn', 'reaver'),
      lent('kerra_palewatch', 'hawkeye'),
      lent('thordakk', 'wolfsfang'),
    ],
    [
      [
        at('trial_fen_hulk', 0),
        at('trial_fen_warden', 1),
        at('trial_fen_mender', 2),
        at('trial_fen_warden', 3),
      ],
    ],
    {
      name: 'The Mending Fen',
      parTurns: 30,
      hint: 'It closes faster than the line can open it. Something has to stop the mending — or get past the wall to the one doing it.',
      parRewards: { silver: 70_000, crystals: 75, reliquary_dust: 400 },
    },
    { previousStageKey: 'trial_warded_coil' },
  ),
  trial(
    'trial_brood_crown',
    3,
    3,
    [
      lent('kerra_palewatch', 'hawkeye'),
      lent('khazgor', 'stoneguard'),
      lent('thordakk', 'reaver'),
      lent('darius', 'truestrike'),
    ],
    [[at('trial_brood_crown', 1)]],
    {
      name: 'The Brood Crown',
      parTurns: 18,
      hint: 'It calls two more every turn and it will always out-call you. Nothing on that field matters except the one wearing the crown.',
      parRewards: { silver: 90_000, crystals: 100, sigil_gleaming: 1 },
    },
    { previousStageKey: 'trial_mending_fen' },
  ),
  trial(
    'trial_standing_stone',
    4,
    4,
    [
      lent('maruan', 'bloodthorn'),
      lent('old_gharssa', 'bloodthorn'),
      lent('szarran_coilfather', 'gravebind'),
      lent('briar_knight', 'bulwark_of_thorns'),
    ],
    [[at('trial_standing_stone', 1)]],
    {
      name: 'The Standing Stone',
      parTurns: 26,
      hint: 'Every wound it feels, it answers — and it cannot answer what it never felt land. A poison is not a blow.',
      parRewards: { silver: 120_000, crystals: 150, sigil_mistwoven: 1 },
    },
    { previousStageKey: 'trial_brood_crown' },
  ),
];
