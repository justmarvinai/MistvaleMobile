import type { DungeonDefInput, GearSlot, StageDefInput } from '@mistvale/shared';

/**
 * The Depths — four relic keeps, the Proving Grounds, and five Essence Springs.
 *
 * Every floor is an ordinary `stage_defs` row, so the Depths inherits the whole of the
 * campaign's machinery: the unlock chain, stars, first-clear bonuses, drops, the results
 * screen. What is new is *where the rewards come from* — a keep drops the four sets it is
 * known for rather than a chapter's single one, and the springs pay in essence rather than
 * in relics (docs/CONTENT_PLAN_EA01.md §4).
 *
 * Generated from the plans below rather than written out: 130 floors by hand would be 130
 * chances to fat-finger an energy cost, and the shape of a keep is exactly the sort of
 * thing that should be one table entry.
 */

type Element = 'ember' | 'tide' | 'verdant' | 'mist';

interface DungeonPlan {
  key: string;
  name: string;
  kind: 'relic' | 'proving' | 'springs';
  region: string;
  lore: string;
  tagline: string;
  floors: number;
  unlockLevel: number;
  /** Weekdays it opens on, `0` = Sunday. Empty means every day. */
  openDays: number[];
  /** Relic sets its floors drop. */
  setKeys: string[];
  /** Stackables it is farmed for — display on the hub; the floors decide the real drops. */
  itemKeys: string[];
  /** The keeper at the bottom of each floor, by floor number. */
  bossFor: (floor: number) => string;
  /** Two waves of guards; the third wave is always the keeper alone. */
  guards: [string[], string[]];
  /** Energy at floor 1 and at the deepest floor. */
  energy: [number, number];
  /** Enemy level at floor 1 and at the deepest floor. */
  levels: [number, number];
  /** Which breath a spring gives up. Springs only. */
  element?: Element;
  sortOrder: number;
}

/** Armour only. Accessories are the Silkmire's deep-floor prize and nothing else's. */
const ARMOUR_SLOTS: GearSlot[] = ['weapon', 'helm', 'shield', 'gauntlets', 'cuirass', 'boots'];
const ALL_SLOTS: GearSlot[] = [...ARMOUR_SLOTS, 'ring', 'amulet', 'banner'];

const RELIC_KEEPS: DungeonPlan[] = [
  {
    key: 'wyrms_hollow',
    name: "Wyrm's Hollow",
    kind: 'relic',
    region: 'Under the Galehollow',
    lore: 'A wind-cut throat in the rock that goes down further than anyone has mapped. Something at the bottom of it has been breathing the same air for six hundred years.',
    tagline: 'Speed and crit damage — and the thing that has always lived here.',
    floors: 15,
    unlockLevel: 12,
    openDays: [],
    setKeys: ['swiftwind', 'pathfinder', 'stormcoil', 'reaver'],
    itemKeys: [],
    bossFor: () => 'boss_broodwyrm',
    guards: [
      ['hollow_broodling', 'hollow_broodling', 'hollow_wyrmguard'],
      ['hollow_wyrmguard', 'hollow_broodling', 'hollow_wyrmguard'],
    ],
    energy: [6, 16],
    levels: [20, 60],
    sortOrder: 10,
  },
  {
    key: 'frostgrave_vault',
    name: 'Frostgrave Vault',
    kind: 'relic',
    region: 'The Rimewood',
    lore: 'A strongroom the Sskarn did not build and cannot open, guarded by something that was left behind with instructions.',
    tagline: 'Guard, resistance, and a sentinel that answers every wound.',
    floors: 15,
    unlockLevel: 12,
    openDays: [],
    setKeys: ['stoneguard', 'ironroot', 'wardweave', 'leadenscale'],
    itemKeys: [],
    bossFor: () => 'boss_rimebound_sentinel',
    guards: [
      ['frostgrave_sentry', 'frostgrave_rimeguard', 'frostgrave_sentry'],
      ['frostgrave_rimeguard', 'frostgrave_sentry', 'frostgrave_rimeguard'],
    ],
    energy: [6, 16],
    levels: [20, 60],
    sortOrder: 11,
  },
  {
    key: 'cinderspire',
    name: 'The Cinderspire',
    kind: 'relic',
    region: 'The Ashen Reach',
    lore: 'A chimney of black glass with a rite burning at the top of it. The smoke has not changed colour in living memory.',
    tagline: 'Accuracy and crit rate — behind a shield that counts your blows.',
    floors: 15,
    unlockLevel: 12,
    openDays: [],
    setKeys: ['hawkeye', 'truestrike', 'wolfsfang', 'emberheart'],
    itemKeys: [],
    // The rite deepens as the spire climbs: six hits shallow, twelve at the top.
    bossFor: (floor) =>
      floor >= 10 ? 'boss_ashpriest_deep' : floor >= 5 ? 'boss_ashpriest' : 'boss_ashpriest_lesser',
    guards: [
      ['cinder_acolyte', 'cinder_emberguard', 'cinder_acolyte'],
      ['cinder_emberguard', 'cinder_acolyte', 'cinder_emberguard'],
    ],
    energy: [6, 16],
    levels: [20, 60],
    sortOrder: 12,
  },
  {
    key: 'silkmire_depths',
    name: 'Silkmire Depths',
    kind: 'relic',
    region: 'Fenwrack',
    lore: 'The warren under the warren. Every passage is somebody’s nursery, and she knows when one of them goes quiet.',
    tagline: 'Lifesteal and regeneration — and rings, amulets and banners below the tenth.',
    floors: 15,
    unlockLevel: 12,
    openDays: [],
    setKeys: ['bloodthorn', 'mendersong', 'gravebind', 'bulwark_of_thorns'],
    itemKeys: [],
    bossFor: () => 'boss_broodmother_ssarethi',
    guards: [
      ['silkmire_spinner', 'silkmire_weaver', 'silkmire_spinner'],
      ['silkmire_weaver', 'silkmire_spinner', 'silkmire_weaver'],
    ],
    energy: [6, 16],
    levels: [20, 60],
    sortOrder: 13,
  },
];

const PROVING_GROUNDS: DungeonPlan = {
  key: 'proving_grounds',
  name: 'The Proving Grounds',
  kind: 'proving',
  region: 'The Old Ring',
  lore: 'A fighting pit older than the invasion, taken over and run exactly as it was. Drazhak keeps the rules; nobody has asked him to.',
  tagline: 'Emblems, and a pitmaster whose patience runs out on a timer.',
  floors: 10,
  unlockLevel: 14,
  openDays: [],
  setKeys: [],
  itemKeys: ['emblem_bronze', 'emblem_silver', 'emblem_gold'],
  bossFor: () => 'boss_pitmaster_drazhak',
  guards: [
    ['pit_challenger', 'pit_veteran', 'pit_challenger'],
    ['pit_veteran', 'pit_challenger', 'pit_veteran'],
  ],
  energy: [8, 14],
  levels: [24, 60],
  sortOrder: 20,
};

/**
 * The springs, and the week they make.
 *
 * Pure stands open every day; each breath gets two, and Mist gets Sunday alone. That
 * rotation is the reason a Mistvale week has a shape — and it is content, so an operator
 * who decides Mist deserves two days changes it with an edit and a publish.
 */
const SPRINGS: {
  key: string;
  name: string;
  element: Element;
  warden: string;
  openDays: number[];
  lore: string;
}[] = [
  {
    key: 'spring_pure',
    name: 'The Pure Spring',
    element: 'mist',
    warden: 'warden_pure',
    openDays: [],
    lore: 'Colourless, tasteless, and useful to absolutely everyone — which is why it is the only one never barred.',
  },
  {
    key: 'spring_verdant',
    name: 'The Verdant Spring',
    element: 'verdant',
    warden: 'warden_verdant',
    openDays: [1, 4],
    lore: 'It runs green and slow through a root-cellar of a cave, and only on the days the roots allow.',
  },
  {
    key: 'spring_ember',
    name: 'The Ember Spring',
    element: 'ember',
    warden: 'warden_ember',
    openDays: [2, 5],
    lore: 'Not water so much as heat that has agreed to hold a shape. It will not hold it every day.',
  },
  {
    key: 'spring_tide',
    name: 'The Tide Spring',
    element: 'tide',
    warden: 'warden_tide',
    openDays: [3, 6],
    lore: 'Salt, this far inland, and it rises and falls to something that is certainly not the moon.',
  },
  {
    key: 'spring_mist',
    name: 'The Mist Spring',
    element: 'mist',
    warden: 'warden_mist',
    openDays: [0],
    lore: 'Open one day in seven. Wardens who have tried to find it on a Monday report finding nothing at all.',
  },
];

const SPRING_PLANS: DungeonPlan[] = SPRINGS.map((spring, index) => ({
  key: spring.key,
  name: spring.name,
  kind: 'springs',
  region: 'The Wellsprings',
  lore: spring.lore,
  tagline:
    spring.openDays.length === 0
      ? 'Pure Essence, every day of the week.'
      : `${spring.element[0]!.toUpperCase()}${spring.element.slice(1)} essence, on its own days.`,
  floors: 10,
  unlockLevel: 10,
  openDays: spring.openDays,
  setKeys: [],
  itemKeys:
    spring.key === 'spring_pure'
      ? ['essence_pure']
      : [
          `essence_${spring.element}_lesser`,
          `essence_${spring.element}_greater`,
          `essence_${spring.element}_prime`,
        ],
  bossFor: () => spring.warden,
  guards: [
    ['spring_adept', 'spring_keeper', 'spring_adept'],
    ['spring_keeper', 'spring_adept', 'spring_keeper'],
  ],
  energy: [6, 12],
  levels: [18, 60],
  element: spring.element,
  sortOrder: 30 + index,
}));

const PLANS: DungeonPlan[] = [...RELIC_KEEPS, PROVING_GROUNDS, ...SPRING_PLANS];

export const DUNGEONS: DungeonDefInput[] = PLANS.map((plan) => ({
  key: plan.key,
  name: plan.name,
  kind: plan.kind,
  lore: plan.lore,
  region: plan.region,
  tagline: plan.tagline,
  backgroundAsset: 'bg_veilwood',
  floors: plan.floors,
  setKeys: plan.setKeys,
  itemKeys: plan.itemKeys,
  bossEnemyKey: plan.bossFor(plan.floors),
  openDays: plan.openDays,
  unlockLevel: plan.unlockLevel,
  sortOrder: plan.sortOrder,
}));

// ── Floors ──────────────────────────────────────────────────────────────────

/**
 * Which band a floor belongs to: shallow, middle, lower, deep.
 *
 * Expressed as a fraction of the dungeon's depth rather than as fixed numbers, so a keep
 * shortened to ten floors in Admin still has a deep tier — and the fifteen-floor keeps
 * land on 1–4 / 5–9 / 10–12 / 13–15 exactly as CONTENT_PLAN §4 sets out.
 */
function floorTier(floor: number, floors: number): 0 | 1 | 2 | 3 {
  const depth = floor / floors;
  if (depth > 0.8) return 3;
  if (depth > 0.6) return 2;
  if (depth > 0.28) return 1;
  return 0;
}

/** Linear interpolation across the dungeon's depth, rounded. */
function acrossFloors(plan: DungeonPlan, floor: number, [start, end]: [number, number]): number {
  if (plan.floors <= 1) return end;
  return Math.round(start + ((end - start) * (floor - 1)) / (plan.floors - 1));
}

/** Relic drops in a keep: four sets, rank and rarity climbing with the floor band. */
function relicDrops(plan: DungeonPlan, floor: number): StageDefInput['rewards']['drops'] {
  const tier = floorTier(floor, plan.floors);
  const rankMin = [2, 3, 4, 5][tier]!;
  // The Silkmire's lower floors are the only place accessories drop at EA, which is what
  // makes floor 10 a destination rather than a waypoint (ECONOMY_BALANCE §4).
  const accessories = plan.key === 'silkmire_depths' && tier >= 2;

  return {
    // A keep run is *the* gear faucet: a wasted run would make the energy price a swindle.
    gearChance: 1,
    gearRankMin: rankMin,
    gearRankMax: Math.min(6, rankMin + 1),
    gearRarityWeights: [
      { common: 34, uncommon: 36, rare: 22, epic: 7, legendary: 1 },
      { common: 20, uncommon: 34, rare: 30, epic: 14, legendary: 2 },
      { common: 8, uncommon: 26, rare: 38, epic: 24, legendary: 4 },
      { common: 0, uncommon: 16, rare: 38, epic: 36, legendary: 10 },
    ][tier]!,
    gearSlots: accessories ? ALL_SLOTS : ARMOUR_SLOTS,
    gearSetKeys: plan.setKeys,
    items: [],
  };
}

/** Emblems in the Proving Grounds: bronze shallow, silver in the middle, gold at the end. */
function provingDrops(plan: DungeonPlan, floor: number): StageDefInput['rewards']['drops'] {
  const depth = floor / plan.floors;
  const [itemKey, min, max] =
    depth > 0.7
      ? (['emblem_gold', 8, 12] as const)
      : depth > 0.4
        ? (['emblem_silver', 10, 16] as const)
        : (['emblem_bronze', 20, 32] as const);

  return {
    gearChance: 0,
    gearRankMin: 1,
    gearRankMax: 1,
    gearRarityWeights: {},
    gearSlots: [],
    gearSetKeys: [],
    items: [{ itemKey, chance: 1, min, max }],
  };
}

/**
 * Essence in a spring: more of it the deeper you go, and Prime only past the seventh floor.
 *
 * The Pure Spring pays Pure Essence and nothing else, which is what makes it worth the
 * daily slot even on a day when your own breath is running.
 */
function springDrops(plan: DungeonPlan, floor: number): StageDefInput['rewards']['drops'] {
  const element = plan.element ?? 'mist';
  const deep = floor / plan.floors > 0.65;
  const quantity: [number, number] = [
    Math.max(2, Math.round(2 + (floor - 1) * 0.5)),
    Math.max(3, Math.round(4 + (floor - 1) * 0.7)),
  ];

  if (plan.key === 'spring_pure') {
    return {
      gearChance: 0,
      gearRankMin: 1,
      gearRankMax: 1,
      gearRarityWeights: {},
      gearSlots: [],
      gearSetKeys: [],
      items: [{ itemKey: 'essence_pure', chance: 1, min: quantity[0], max: quantity[1] }],
    };
  }

  return {
    gearChance: 0,
    gearRankMin: 1,
    gearRankMax: 1,
    gearRarityWeights: {},
    gearSlots: [],
    gearSetKeys: [],
    items: [
      { itemKey: `essence_${element}_lesser`, chance: 1, min: quantity[0], max: quantity[1] },
      {
        itemKey: `essence_${element}_greater`,
        chance: floor >= 4 ? 0.7 : 0.2,
        min: 1,
        max: Math.max(1, Math.round(floor / 3)),
      },
      // Prime is the whole reason to push a spring past its middle floors.
      ...(deep
        ? [
            {
              itemKey: `essence_${element}_prime`,
              chance: 0.55,
              min: 1,
              max: Math.max(1, Math.round(floor / 4)),
            },
          ]
        : []),
      { itemKey: 'essence_pure', chance: 0.35, min: 1, max: 3 },
    ],
  };
}

function dropsFor(plan: DungeonPlan, floor: number): StageDefInput['rewards']['drops'] {
  if (plan.kind === 'relic') return relicDrops(plan, floor);
  if (plan.kind === 'proving') return provingDrops(plan, floor);
  return springDrops(plan, floor);
}

/** The mode a floor is fought in — one per dungeon kind, matching `BATTLE_MODES`. */
const MODE_BY_KIND = {
  relic: 'dungeon',
  proving: 'proving',
  springs: 'springs',
} as const;

function buildFloor(plan: DungeonPlan, floor: number): StageDefInput {
  const level = acrossFloors(plan, floor, plan.levels);
  const bossLevel = Math.min(60, level + 2);
  const energy = acrossFloors(plan, floor, plan.energy);
  const tier = floorTier(floor, plan.floors);

  // Guards scale one star per band, so the deep floors look as heavy as they hit.
  const guardStars = Math.min(6, 2 + tier);
  const waves: StageDefInput['waves'] = [
    plan.guards[0].map((enemyKey, slot) => ({
      enemyKey,
      level: level - 1,
      stars: guardStars,
      slot,
    })),
    plan.guards[1].map((enemyKey, slot) => ({ enemyKey, level, stars: guardStars, slot })),
    [{ enemyKey: plan.bossFor(floor), level: bossLevel, stars: 6, slot: 1 }],
  ];

  const payScale = 1 + (floor - 1) * 0.22;
  const silverBase = plan.kind === 'springs' ? 260 : plan.kind === 'proving' ? 420 : 560;

  return {
    key: floorKey(plan.key, floor),
    mode: MODE_BY_KIND[plan.kind],
    parentKey: plan.key,
    number: floor,
    difficulty: 'normal',
    energyCost: energy,
    waves,
    rewards: {
      silverMin: Math.round(silverBase * payScale),
      silverMax: Math.round(silverBase * 1.6 * payScale),
      playerXp: Math.round((22 + floor * 4) * (plan.kind === 'springs' ? 0.8 : 1)),
      championXp: Math.round((280 + floor * 70) * (plan.kind === 'springs' ? 0.7 : 1)),
      drops: dropsFor(plan, floor),
    },
    // A keeper fight is longer than a campaign stage by design, so the turn limit is too.
    starRules: { noDeaths: true, maxTurns: 20 },
    firstClearRewards: {
      silver: Math.round(1_200 * payScale),
      crystals: floor % 5 === 0 ? 25 : 5,
    },
    unlock:
      floor === 1
        ? { playerLevel: plan.unlockLevel }
        : { previousStageKey: floorKey(plan.key, floor - 1) },
    sortOrder: floor,
  };
}

/** `wyrms_hollow_f07` — the key convention DATA_MODEL §3 sets out for a floor. */
function floorKey(dungeonKey: string, floor: number): string {
  return `${dungeonKey}_f${String(floor).padStart(2, '0')}`;
}

export const DEPTHS_STAGES: StageDefInput[] = PLANS.flatMap((plan) =>
  Array.from({ length: plan.floors }, (_, index) => buildFloor(plan, index + 1)),
);
