import type { EnemyDefInput, SkillDefInput } from '@mistvale/shared';

/**
 * What lives in the Depths.
 *
 * The keeps are older than the invasion — the Sskarn moved into them rather than built
 * them — so the garrisons read as *settled* where the campaign's read as marching: wards,
 * broods, rites. Same one lizard model throughout, differentiated by name, kit and stat
 * budget, exactly as the campaign roster is (docs/CONTENT_PLAN_EA01.md §2).
 *
 * The five keep-bosses are the first content in the game to use the composable boss
 * behaviours the engine gained with the Depths, and each one asks a different question:
 * the Ashpriest asks how many times you can hit, the Rimebound Sentinel how few times,
 * the Broodmother whether you brought an AoE, and Pitmaster Drazhak how fast.
 */

export const DEPTHS_SKILLS: SkillDefInput[] = [
  // ── Wyrm's Hollow ─────────────────────────────────────────────────────────
  {
    key: 'depths_a1_wyrm_rake',
    name: 'Rake',
    description: 'A low, fast swipe from something that has never had to hurry.',
    slot: 'a1',
    cooldown: 0,
    targeting: { side: 'enemy', mode: 'single' },
    components: [{ type: 'damage', scale: 'atk', mult: 2.1 }],
    upgrades: [],
    aiHints: {},
    animation: { track: 'attack', vfx: 'claw' },
    sortOrder: 1,
  },
  {
    key: 'depths_a2_wyrm_breath',
    name: 'Hollow Breath',
    description: 'Cave-damp exhaled hot across the whole line, slowing what it touches.',
    slot: 'a2',
    cooldown: 3,
    targeting: { side: 'enemy', mode: 'all' },
    components: [
      { type: 'damage', scale: 'atk', mult: 2.3 },
      { type: 'applyStatus', status: 'spd_down_30', turns: 2, chance: 0.6, target: 'hitTargets' },
    ],
    upgrades: [],
    aiHints: {},
    animation: { track: 'cast', vfx: 'breath', shake: true },
    sortOrder: 2,
  },
  {
    key: 'depths_a3_wyrm_carapace',
    name: 'Stone Carapace',
    description: 'It folds in on itself, and the scales thicken.',
    slot: 'a3',
    cooldown: 4,
    targeting: { side: 'self', mode: 'single' },
    components: [
      { type: 'shield', scale: 'maxHp', mult: 0.18, turns: 2, target: 'self' },
      { type: 'applyStatus', status: 'def_up_60', turns: 2, target: 'self' },
    ],
    upgrades: [],
    aiHints: { openWith: true, dontRepeatWhileActive: 'def_up_60' },
    animation: { track: 'cast', vfx: 'carapace' },
    sortOrder: 3,
  },

  // ── Frostgrave Vault ──────────────────────────────────────────────────────
  {
    key: 'depths_a1_rime_strike',
    name: 'Rimebrand',
    description: 'A cold, deliberate blow that scales with the sentinel’s own guard.',
    slot: 'a1',
    cooldown: 0,
    targeting: { side: 'enemy', mode: 'single' },
    components: [{ type: 'damage', scale: 'def', mult: 3.4 }],
    upgrades: [],
    aiHints: {},
    animation: { track: 'attack', vfx: 'frost' },
    sortOrder: 1,
  },
  {
    key: 'depths_a2_rime_gaze',
    name: 'Rime Gaze',
    description: 'It looks at you, and the air between stops moving.',
    slot: 'a2',
    cooldown: 4,
    targeting: { side: 'enemy', mode: 'single' },
    components: [
      { type: 'damage', scale: 'def', mult: 2.4 },
      { type: 'applyStatus', status: 'freeze', turns: 1, chance: 0.55, target: 'hitTargets' },
    ],
    upgrades: [],
    aiHints: { prefer: 'highestAtk' },
    animation: { track: 'cast', vfx: 'gaze' },
    sortOrder: 2,
  },
  {
    key: 'depths_a3_rime_mend',
    name: 'Vaultmend',
    description: 'Cracks close over as if they had never been there.',
    slot: 'a3',
    cooldown: 5,
    targeting: { side: 'self', mode: 'single' },
    components: [
      { type: 'heal', scale: 'maxHp', mult: 0.16, target: 'self' },
      { type: 'cleanse', count: 2, target: 'self' },
    ],
    upgrades: [],
    aiHints: { prefer: 'lowestHpAlly' },
    animation: { track: 'cast', vfx: 'mend' },
    sortOrder: 3,
  },

  // ── The Cinderspire ───────────────────────────────────────────────────────
  {
    key: 'depths_a1_ash_brand',
    name: 'Ashbrand',
    description: 'A brand pressed rather than swung.',
    slot: 'a1',
    cooldown: 0,
    targeting: { side: 'enemy', mode: 'single' },
    components: [
      { type: 'damage', scale: 'atk', mult: 1.9 },
      { type: 'applyStatus', status: 'hp_burn', turns: 2, chance: 0.35, target: 'hitTargets' },
    ],
    upgrades: [],
    aiHints: {},
    animation: { track: 'attack', vfx: 'ember' },
    sortOrder: 1,
  },
  {
    key: 'depths_a2_ash_censer',
    name: 'Swinging Censer',
    description: 'Coals scattered wide, and everything they land on starts to smoke.',
    slot: 'a2',
    cooldown: 3,
    targeting: { side: 'enemy', mode: 'all' },
    components: [
      { type: 'damage', scale: 'atk', mult: 1.8 },
      { type: 'applyStatus', status: 'hp_burn', turns: 2, chance: 0.5, target: 'hitTargets' },
    ],
    upgrades: [],
    aiHints: {},
    animation: { track: 'cast', vfx: 'censer' },
    sortOrder: 2,
  },
  {
    key: 'depths_a3_ash_pyre',
    name: 'Pyre Rite',
    description: 'The rite finishes, and one of you is the offering.',
    slot: 'a3',
    cooldown: 4,
    targeting: { side: 'enemy', mode: 'single' },
    components: [{ type: 'damage', scale: 'atk', mult: 4.4, ignoreDefPct: 0.3 }],
    upgrades: [],
    aiHints: { prefer: 'lowestHp' },
    animation: { track: 'attack', vfx: 'pyre', shake: true },
    sortOrder: 3,
  },

  // ── Silkmire Depths ───────────────────────────────────────────────────────
  {
    key: 'depths_a1_brood_bite',
    name: 'Brood Bite',
    description: 'Small, quick, and there are more behind it.',
    slot: 'a1',
    cooldown: 0,
    targeting: { side: 'enemy', mode: 'single' },
    components: [{ type: 'damage', scale: 'atk', mult: 1.6 }],
    upgrades: [],
    aiHints: {},
    animation: { track: 'attack', vfx: 'bite' },
    sortOrder: 1,
  },
  {
    key: 'depths_a2_brood_spit',
    name: 'Brood Spit',
    description: 'A wide, sour spray that keeps working after it lands.',
    slot: 'a2',
    cooldown: 3,
    targeting: { side: 'enemy', mode: 'all' },
    components: [
      { type: 'damage', scale: 'atk', mult: 1.7 },
      { type: 'applyStatus', status: 'poison_5', turns: 3, chance: 0.55, target: 'hitTargets' },
    ],
    upgrades: [],
    aiHints: {},
    animation: { track: 'cast', vfx: 'spray' },
    sortOrder: 2,
  },
  {
    key: 'depths_a3_devour',
    name: 'Devour',
    description: 'She takes a bite and looks better for it.',
    slot: 'a3',
    cooldown: 4,
    targeting: { side: 'enemy', mode: 'single' },
    components: [
      { type: 'damage', scale: 'atk', mult: 3.4 },
      { type: 'heal', scale: 'maxHp', mult: 0.08, target: 'self' },
    ],
    upgrades: [],
    aiHints: { prefer: 'lowestHp' },
    animation: { track: 'attack', vfx: 'devour', shake: true },
    sortOrder: 3,
  },

  // ── Proving Grounds ───────────────────────────────────────────────────────
  {
    key: 'depths_a1_pit_cut',
    name: 'Pit Cut',
    description: 'Technique, not temper.',
    slot: 'a1',
    cooldown: 0,
    targeting: { side: 'enemy', mode: 'single' },
    components: [{ type: 'damage', scale: 'atk', mult: 2.2 }],
    upgrades: [],
    aiHints: {},
    animation: { track: 'attack', vfx: 'cut' },
    sortOrder: 1,
  },
  {
    key: 'depths_a2_pit_sweep',
    name: 'Ring Sweep',
    description: 'One turn on the heel, and the whole ring is in range.',
    slot: 'a2',
    cooldown: 3,
    targeting: { side: 'enemy', mode: 'all' },
    components: [
      { type: 'damage', scale: 'atk', mult: 2.1 },
      { type: 'applyStatus', status: 'def_down_30', turns: 2, chance: 0.5, target: 'hitTargets' },
    ],
    upgrades: [],
    aiHints: {},
    animation: { track: 'attack', vfx: 'sweep', shake: true },
    sortOrder: 2,
  },
  {
    key: 'depths_a3_pit_challenge',
    name: 'Called Out',
    description: 'The pitmaster names one of you, and means it.',
    slot: 'a3',
    cooldown: 4,
    targeting: { side: 'enemy', mode: 'single' },
    components: [
      { type: 'damage', scale: 'atk', mult: 3.8 },
      { type: 'applyStatus', status: 'atk_up_25', turns: 2, target: 'self' },
    ],
    upgrades: [],
    aiHints: { prefer: 'highestAtk' },
    animation: { track: 'attack', vfx: 'challenge', shake: true },
    sortOrder: 3,
  },

  // ── Essence Springs ───────────────────────────────────────────────────────
  {
    key: 'depths_a1_warden_lash',
    name: 'Warden’s Lash',
    description: 'A warning, delivered properly.',
    slot: 'a1',
    cooldown: 0,
    targeting: { side: 'enemy', mode: 'single' },
    components: [{ type: 'damage', scale: 'atk', mult: 2 }],
    upgrades: [],
    aiHints: {},
    animation: { track: 'attack', vfx: 'lash' },
    sortOrder: 1,
  },
  {
    key: 'depths_a2_warden_ward',
    name: 'Springward',
    description: 'The water answers, and closes over the keepers.',
    slot: 'a2',
    cooldown: 4,
    targeting: { side: 'ally', mode: 'all' },
    components: [
      { type: 'shield', scale: 'maxHp', mult: 0.12, turns: 2, target: 'allAllies' },
      { type: 'applyStatus', status: 'def_up_30', turns: 2, target: 'allAllies' },
    ],
    upgrades: [],
    aiHints: { openWith: true, dontRepeatWhileActive: 'def_up_30' },
    animation: { track: 'cast', vfx: 'ward' },
    sortOrder: 2,
  },
  {
    key: 'depths_a3_warden_surge',
    name: 'Wellspring Surge',
    description: 'The spring rises all at once, and takes the wind out of everything.',
    slot: 'a3',
    cooldown: 4,
    targeting: { side: 'enemy', mode: 'all' },
    components: [
      { type: 'damage', scale: 'atk', mult: 2.4 },
      { type: 'applyStatus', status: 'atk_down_25', turns: 2, chance: 0.5, target: 'hitTargets' },
    ],
    upgrades: [],
    aiHints: {},
    animation: { track: 'cast', vfx: 'surge', shake: true },
    sortOrder: 3,
  },
];

/** Every Depths enemy is quoted at level 60, the same anchor the campaign uses. */
const guard = (
  key: string,
  name: string,
  archetype: string,
  element: EnemyDefInput['element'],
  role: EnemyDefInput['role'],
  stats: EnemyDefInput['baseStats'],
  skills: string[],
  sortOrder: number,
  extra: Partial<EnemyDefInput> = {},
): EnemyDefInput => ({
  key,
  name,
  archetype,
  element,
  role,
  baseStats: stats,
  growth: 1.048,
  skills,
  assetKey: 'enemy_lizard',
  isBoss: false,
  bossMechanics: { almightyImmunity: false, tmReductionImmune: false },
  sortOrder,
  ...extra,
});

/**
 * A keep-boss.
 *
 * Every one of them carries Almighty immunity — a boss that can be stunned into silence is
 * a boss with no mechanic — and an enrage ramp, so no fight can be stalled out. What makes
 * them different from each other is the third flag.
 */
const keeper = (
  key: string,
  name: string,
  archetype: string,
  element: EnemyDefInput['element'],
  role: EnemyDefInput['role'],
  stats: EnemyDefInput['baseStats'],
  skills: string[],
  sortOrder: number,
  mechanics: Partial<NonNullable<EnemyDefInput['bossMechanics']>> = {},
): EnemyDefInput => ({
  key,
  name,
  archetype,
  element,
  role,
  baseStats: stats,
  growth: 1.05,
  skills,
  assetKey: 'enemy_lizard',
  isBoss: true,
  bossMechanics: {
    almightyImmunity: true,
    tmReductionImmune: false,
    enrage: { afterTurn: 40, dmgPctPerTurn: 6 },
    ...mechanics,
  },
  sortOrder,
});

export const DEPTHS_ENEMIES: EnemyDefInput[] = [
  // ── Wyrm's Hollow ─────────────────────────────────────────────────────────
  guard(
    'hollow_broodling',
    'Hollow Broodling',
    'broodling',
    'verdant',
    'attack',
    { hp: 6_400, atk: 430, def: 240, spd: 106, critRate: 18, critDmg: 55, res: 30, acc: 20 },
    ['depths_a1_wyrm_rake', 'sskarn_a2_lunge'],
    200,
  ),
  guard(
    'hollow_wyrmguard',
    'Hollow Wyrmguard',
    'wyrmguard',
    'verdant',
    'defense',
    { hp: 9_800, atk: 300, def: 470, spd: 94, critRate: 15, critDmg: 50, res: 45, acc: 0 },
    ['sskarn_a1_spearguard', 'depths_a3_wyrm_carapace'],
    201,
  ),
  keeper(
    'boss_broodwyrm',
    'The Broodwyrm',
    'broodwyrm',
    'verdant',
    'hp',
    { hp: 58_000, atk: 560, def: 520, spd: 99, critRate: 20, critDmg: 60, res: 60, acc: 45 },
    ['depths_a1_wyrm_rake', 'depths_a2_wyrm_breath', 'depths_a3_wyrm_carapace'],
    210,
    // Tempo will not save you here: the answer to the Broodwyrm is damage.
    { tmReductionImmune: true },
  ),

  // ── Frostgrave Vault ──────────────────────────────────────────────────────
  guard(
    'frostgrave_sentry',
    'Frostgrave Sentry',
    'sentry',
    'tide',
    'attack',
    { hp: 6_900, atk: 405, def: 300, spd: 103, critRate: 15, critDmg: 50, res: 40, acc: 25 },
    ['depths_a1_rime_strike', 'sskarn_a2_stunning_blow'],
    220,
  ),
  guard(
    'frostgrave_rimeguard',
    'Frostgrave Rimeguard',
    'rimeguard',
    'tide',
    'defense',
    { hp: 11_200, atk: 280, def: 530, spd: 90, critRate: 15, critDmg: 50, res: 55, acc: 0 },
    ['depths_a1_rime_strike', 'sskarn_a2_shieldwall'],
    221,
  ),
  keeper(
    'boss_rimebound_sentinel',
    'The Rimebound Sentinel',
    'sentinel',
    'tide',
    'defense',
    { hp: 72_000, atk: 480, def: 760, spd: 92, critRate: 15, critDmg: 55, res: 70, acc: 40 },
    ['depths_a1_rime_strike', 'depths_a2_rime_gaze', 'depths_a3_rime_mend'],
    230,
    // Chip it down and it answers every tenth of the way. Burst, or bring a cleanser.
    { thresholdRetaliation: { perHpPct: 10, skipIfDot: true } },
  ),

  // ── The Cinderspire ───────────────────────────────────────────────────────
  guard(
    'cinder_acolyte',
    'Cinderspire Acolyte',
    'acolyte',
    'ember',
    'support',
    { hp: 6_600, atk: 400, def: 265, spd: 108, critRate: 15, critDmg: 50, res: 45, acc: 35 },
    ['depths_a1_ash_brand', 'sskarn_a2_mire_mend'],
    240,
  ),
  guard(
    'cinder_emberguard',
    'Cinderspire Emberguard',
    'emberguard',
    'ember',
    'defense',
    { hp: 10_400, atk: 330, def: 460, spd: 96, critRate: 15, critDmg: 50, res: 50, acc: 10 },
    ['depths_a1_ash_brand', 'sskarn_a2_broodguard_taunt'],
    241,
  ),
  // Three Ashpriests, one rite: the shield thickens the deeper the spire goes, which is
  // the whole of CONTENT_PLAN's "6–12 hits by floor" expressed as content rather than as
  // a special case in code.
  keeper(
    'boss_ashpriest_lesser',
    'The Ashpriest',
    'ashpriest',
    'ember',
    'support',
    { hp: 46_000, atk: 610, def: 470, spd: 101, critRate: 20, critDmg: 60, res: 60, acc: 50 },
    ['depths_a1_ash_brand', 'depths_a2_ash_censer', 'depths_a3_ash_pyre'],
    250,
    { hitShield: { hits: 6, punishTmPct: 25 } },
  ),
  keeper(
    'boss_ashpriest',
    'The Ashpriest',
    'ashpriest',
    'ember',
    'support',
    { hp: 50_000, atk: 640, def: 500, spd: 101, critRate: 20, critDmg: 60, res: 65, acc: 55 },
    ['depths_a1_ash_brand', 'depths_a2_ash_censer', 'depths_a3_ash_pyre'],
    251,
    { hitShield: { hits: 9, punishTmPct: 30 } },
  ),
  keeper(
    'boss_ashpriest_deep',
    'The Ashpriest',
    'ashpriest',
    'ember',
    'support',
    { hp: 54_000, atk: 680, def: 530, spd: 103, critRate: 22, critDmg: 65, res: 70, acc: 60 },
    ['depths_a1_ash_brand', 'depths_a2_ash_censer', 'depths_a3_ash_pyre'],
    252,
    { hitShield: { hits: 12, punishTmPct: 35 } },
  ),

  // ── Silkmire Depths ───────────────────────────────────────────────────────
  guard(
    'silkmire_spawn',
    'Silkmire Spawn',
    'spawn',
    'verdant',
    'attack',
    { hp: 3_200, atk: 320, def: 170, spd: 112, critRate: 15, critDmg: 50, res: 20, acc: 10 },
    ['depths_a1_brood_bite'],
    260,
  ),
  guard(
    'silkmire_spinner',
    'Silkmire Spinner',
    'spinner',
    'verdant',
    'attack',
    { hp: 6_800, atk: 445, def: 250, spd: 107, critRate: 18, critDmg: 55, res: 35, acc: 40 },
    ['depths_a1_brood_bite', 'sskarn_a2_venom_cloud'],
    261,
  ),
  guard(
    'silkmire_weaver',
    'Silkmire Weaver',
    'weaver',
    'mist',
    'support',
    { hp: 8_200, atk: 360, def: 330, spd: 100, critRate: 15, critDmg: 50, res: 50, acc: 45 },
    ['depths_a1_brood_bite', 'sskarn_a3_warcall'],
    262,
  ),
  keeper(
    'boss_broodmother_ssarethi',
    'Broodmother Ssarethi',
    'broodmother',
    'verdant',
    'hp',
    { hp: 64_000, atk: 590, def: 560, spd: 97, critRate: 18, critDmg: 60, res: 65, acc: 50 },
    ['depths_a1_brood_bite', 'depths_a2_brood_spit', 'depths_a3_devour'],
    270,
    // Ignore the brood and the fight widens until there is no room left to stand.
    { addSummon: { unitKey: 'silkmire_spawn', perTurn: 2, cap: 6 } },
  ),

  // ── Proving Grounds ───────────────────────────────────────────────────────
  guard(
    'pit_challenger',
    'Pit Challenger',
    'challenger',
    'ember',
    'attack',
    { hp: 7_200, atk: 460, def: 285, spd: 109, critRate: 20, critDmg: 60, res: 35, acc: 30 },
    ['depths_a1_pit_cut', 'sskarn_a2_lunge'],
    280,
  ),
  guard(
    'pit_veteran',
    'Pit Veteran',
    'veteran',
    'mist',
    'defense',
    { hp: 10_600, atk: 370, def: 440, spd: 98, critRate: 18, critDmg: 55, res: 50, acc: 20 },
    ['depths_a1_pit_cut', 'sskarn_a2_shieldwall'],
    281,
  ),
  keeper(
    'boss_pitmaster_drazhak',
    'Pitmaster Drazhak',
    'pitmaster',
    'mist',
    'attack',
    { hp: 60_000, atk: 700, def: 540, spd: 105, critRate: 25, critDmg: 70, res: 60, acc: 55 },
    ['depths_a1_pit_cut', 'depths_a2_pit_sweep', 'depths_a3_pit_challenge'],
    290,
    // The Proving Grounds are a test of speed: Drazhak's ramp starts early and never stops.
    { enrage: { afterTurn: 12, dmgPctPerTurn: 8 } },
  ),

  // ── Essence Springs ───────────────────────────────────────────────────────
  guard(
    'spring_adept',
    'Spring Adept',
    'adept',
    'mist',
    'support',
    { hp: 6_200, atk: 380, def: 280, spd: 104, critRate: 15, critDmg: 50, res: 45, acc: 30 },
    ['depths_a1_warden_lash', 'sskarn_a2_mire_mend'],
    300,
  ),
  guard(
    'spring_keeper',
    'Spring Keeper',
    'keeper',
    'mist',
    'defense',
    { hp: 9_400, atk: 320, def: 430, spd: 95, critRate: 15, critDmg: 50, res: 50, acc: 10 },
    ['depths_a1_warden_lash', 'depths_a2_warden_ward'],
    301,
  ),
];

/**
 * The five Spring Wardens.
 *
 * One per spring, and the only difference between them is the breath they carry — which is
 * the point: the springs are the game's straight fight, where the answer is simply to
 * bring the right element and enough of it.
 */
const SPRING_WARDENS: {
  key: string;
  name: string;
  element: EnemyDefInput['element'];
}[] = [
  { key: 'warden_ember', name: 'Warden of the Ember Spring', element: 'ember' },
  { key: 'warden_tide', name: 'Warden of the Tide Spring', element: 'tide' },
  { key: 'warden_verdant', name: 'Warden of the Verdant Spring', element: 'verdant' },
  { key: 'warden_mist', name: 'Warden of the Mist Spring', element: 'mist' },
  { key: 'warden_pure', name: 'Warden of the Pure Spring', element: 'mist' },
];

DEPTHS_ENEMIES.push(
  ...SPRING_WARDENS.map((warden, index) =>
    keeper(
      warden.key,
      warden.name,
      'spring_warden',
      warden.element,
      'support',
      { hp: 40_000, atk: 520, def: 500, spd: 100, critRate: 18, critDmg: 55, res: 60, acc: 40 },
      ['depths_a1_warden_lash', 'depths_a2_warden_ward', 'depths_a3_warden_surge'],
      310 + index,
    ),
  ),
);
