import type { DungeonDefInput, StageDefInput, TeamRestriction } from '@mistvale/shared';

/**
 * The Mistspire — thirty floors, and the only thing in Mistvale that pays for a *broad*
 * roster rather than a deep one.
 *
 * Every other mode in the game is won by one good team. The campaign is; the Arena is; a
 * Depths keep is one good team per element and the Titan is one good team plus a
 * multi-hitter. So the honest answer to "is this thirty-eighth champion worth keeping" has
 * been *no* for most of the roster, and a game about collecting champions in which most
 * champions are food is a game arguing with itself.
 *
 * A **warded floor** is the answer, and it is the source game's secret rooms rather than
 * its tower: the door names an element, a faction, a role or a rarity floor, and the only
 * team allowed up is four champions who meet it. One excellent ember team reaches floor
 * nine and stops. The Tide support nearly fed away last week is the way past it.
 *
 * The wards below are ordered by how much of the roster satisfies them — ember (eleven
 * champions in the game) at floor three, hp (six) at floor twenty-seven — so the tower
 * gets harder in the dimension it is *about* as well as in the numbers. None of them is
 * unsatisfiable: publish validation counts the roster and refuses a ward fewer than four
 * champions could ever meet, which is not hypothetical here — three of Mistvale's eight
 * factions hold two or three champions, so a faction ward is only safe on the large ones.
 */

const SPIRE_KEY = 'spire_mistspire';
const FLOORS = 30;

/**
 * The ward on each warded floor, by floor number.
 *
 * Every third floor, skipping the keepers' floors — a boss is already a wall, and stacking
 * a roster restriction on top of one would make two problems out of a floor that should
 * pose one. Nine wards over thirty floors is roughly a third of the climb, which is enough
 * that a narrow roster is stopped and not so much that a broad one is never fighting.
 */
const WARDS: Readonly<Record<number, TeamRestriction>> = {
  3: { kind: 'element', value: 'ember' },
  6: { kind: 'role', value: 'attack' },
  9: { kind: 'element', value: 'mist' },
  12: { kind: 'element', value: 'tide' },
  15: { kind: 'role', value: 'support' },
  18: { kind: 'element', value: 'verdant' },
  21: { kind: 'faction', value: 'hollowborn' },
  24: { kind: 'role', value: 'defense' },
  27: { kind: 'role', value: 'hp' },
};

/**
 * Who stands on an ordinary floor, by band.
 *
 * Drawn from the enemies the campaign and the Depths already use rather than authored
 * fresh: the Mistspire is the vale's own tower, and a floor of it should look like a place
 * in the world instead of a bestiary nobody has met. What makes a floor hard is its level
 * and its ward, not a creature invented for it.
 */
const RANK_AND_FILE: readonly (readonly string[])[] = [
  // Floors 1–10 (levels 15–29): what a warden meets on the road.
  ['sskarn_skirmisher', 'sskarn_spearguard', 'hollow_broodling', 'cinder_acolyte'],
  // Floors 11–20 (levels 30–44): what is waiting once the road runs out.
  ['silkmire_spinner', 'frostgrave_sentry', 'pit_challenger', 'silkmire_weaver'],
  // Floors 21–30 (levels 45–60): the things that live at the top of it. The same four the
  // Depths' deepest floors field, because those are the hardest rank-and-file authored and
  // a tower's last third should not be softer than a keep's.
  ['hollow_wyrmguard', 'cinder_emberguard', 'pit_veteran', 'frostgrave_rimeguard'],
];

/**
 * The keeper on each tenth floor, climbing in menace with the tower.
 *
 * Ordered by what they actually are rather than by story: 25k, 55k and 72k of base health,
 * the last being the heaviest thing in the game that is not a Titan. The first cut had
 * them the other way round and `pnpm sim` said floor 30 fell in four turns.
 */
const KEEPERS: Readonly<Record<number, string>> = {
  10: 'boss_hessk_marshbinder',
  20: 'boss_ssyleth_coilmother',
  30: 'boss_rimebound_sentinel',
};

/** Floor 1 opens at 15 and floor 30 at 60, evenly. Levels are absolute, never scaled. */
function levelFor(floor: number): number {
  return Math.round(15 + ((floor - 1) * 45) / (FLOORS - 1));
}

function bandFor(floor: number): number {
  return Math.min(RANK_AND_FILE.length - 1, Math.floor((floor - 1) / 10));
}

/**
 * Stars climb with the floor, as they do on every other stage in the game.
 *
 * Written when the field was **inert** — `scaleEnemyStats` took a def and a level and never
 * looked at `stars`, on this stage or on any of the other 379 — and written on the real
 * ★1–6 ladder anyway, so that a decision to honour it would need no re-authoring here.
 * That decision is C13 (Q8, answered 2026-08-26) and this needed no re-authoring: ★6 is full
 * strength and a keeper is ★6, so the top of the tower is exactly what it was measured at.
 */
function starsFor(floor: number): number {
  return Math.min(6, 3 + Math.floor(floor / 8));
}

/**
 * How many waves a floor is, which is the difficulty lever that actually works.
 *
 * One near the bottom, two in the middle, three at the top — the same shape a campaign
 * chapter uses, and the reason the top of the tower is a fight rather than a formality.
 * It is the lever that carries the climb because the other two barely move: enemy stats are
 * anchored at level 60, so a level-60 floor gets exactly the base stats and no more, and
 * the star band above spans 0.68→1.00 across thirty floors.
 */
function wavesInFloor(floor: number): number {
  if (floor <= 10) return 1;
  if (floor <= 20) return 2;
  return 3;
}

/**
 * The line-up on one floor.
 *
 * A keeper comes with two of its floor's own, which is what the Depths' deepest floors do
 * and is proven content. The first cut stood the keeper alone because it read better, and
 * `pnpm sim` disagreed: a lone boss is one target that focused fire deletes, and the top of
 * the tower fell in four turns. Escorts are what make a boss's mechanics matter, because
 * something else is happening while they resolve.
 *
 * An ordinary floor fields four from its band, rotated by floor so consecutive floors are
 * not the same picture.
 */
function wavesFor(floor: number): StageDefInput['waves'] {
  const level = levelFor(floor);
  const stars = starsFor(floor);
  const pool = RANK_AND_FILE[bandFor(floor)]!;
  const keeper = KEEPERS[floor];
  const count = wavesInFloor(floor);

  const rankAndFile = (offset: number) =>
    pool.map((_, index) => ({
      enemyKey: pool[(index + floor + offset) % pool.length]!,
      level,
      stars,
      slot: index,
    }));

  const waves = Array.from({ length: count }, (_, wave) => rankAndFile(wave));
  if (keeper) {
    // The keeper takes the last wave, with two of its floor's own beside it. The Depths'
    // deepest floors are built the same way, and for the same reason: a lone boss is one
    // target that focused fire deletes, and its mechanics never get a chance to matter.
    waves[waves.length - 1] = [
      { enemyKey: keeper, level, stars: 6, slot: 1 },
      { enemyKey: pool[0]!, level, stars, slot: 0 },
      { enemyKey: pool[1]!, level, stars, slot: 2 },
    ];
  }
  return waves as StageDefInput['waves'];
}

/**
 * What a floor pays on the way past.
 *
 * Deliberately modest and deliberately *not* the reason to climb: the landings are that.
 * A floor pays about what a campaign stage of its level does, because a climber has spent
 * a key rather than energy and should not come away feeling they farmed at a loss — but a
 * tower whose floors paid well would be farmed for the floors, and the floors can each be
 * cleared exactly once a month.
 */
function rewardsFor(floor: number): StageDefInput['rewards'] {
  const level = levelFor(floor);
  const boss = KEEPERS[floor] !== undefined;
  return {
    silverMin: 600 * level,
    silverMax: 900 * level,
    playerXp: 20 + floor * 2,
    championXp: 400 + floor * 40,
    drops: boss
      ? {
          gearChance: 1,
          gearRankMin: Math.min(6, 3 + Math.floor(floor / 10)),
          gearRankMax: Math.min(6, 4 + Math.floor(floor / 10)),
          gearRarityWeights: { rare: 5, epic: 3, legendary: 1 },
          gearSlots: [],
          gearSetKeys: [],
          items: [{ itemKey: 'essence_pure', chance: 1, min: 1, max: 2 }],
        }
      : {
          gearChance: 0.25,
          gearRankMin: 2,
          gearRankMax: 4,
          gearRarityWeights: { uncommon: 6, rare: 3, epic: 1 },
          gearSlots: [],
          gearSetKeys: [],
          items: [],
        },
  };
}

export const SPIRE_DUNGEONS: DungeonDefInput[] = [
  {
    key: SPIRE_KEY,
    name: 'The Mistspire',
    kind: 'spire',
    region: 'Above the mist line',
    lore: 'It was a watchtower once, before the mist came up past its third window. Nobody built the other twenty-seven floors. They were simply there the next time anyone looked, and the wards on the stairs were already old — each one shut to all but a certain kind of warden, as though whoever set them knew exactly who would come and wanted to be sure it was not the same four people every time.',
    tagline: 'Thirty floors, and no two of them want the same team.',
    backgroundAsset: 'bg_veilwood',
    floors: FLOORS,
    setKeys: [],
    itemKeys: ['essence_pure', 'emblem_gold', 'sigil_mistwoven'],
    bossEnemyKey: KEEPERS[30],
    openDays: [],
    // Above the Depths and below the world boss. A tower about breadth is pointless to an
    // account with nine champions, and this is roughly where a roster starts having some.
    unlockLevel: 16,
    spire: {
      // Five a day against thirty floors: a whole climb is six days of turning up at the
      // very least, which is the shape a monthly tower wants — never finishable in an
      // evening, always finishable by somebody who comes back.
      keysPerDay: 5,
      bossEvery: 10,
      // Paid once per climb, for having got that high. The reason to climb, as opposed to
      // the floors themselves — which pay about what a campaign stage does, on purpose.
      landings: [
        {
          key: 'spire_landing_05',
          name: 'The Fifth Window',
          floor: 5,
          rewards: { silver: 30_000, essence_pure: 2, crystals: 15 },
        },
        {
          key: 'spire_landing_10',
          name: 'The Marshbinder’s Landing',
          floor: 10,
          rewards: { silver: 75_000, emblem_silver: 3, essence_pure: 4, crystals: 40 },
        },
        {
          key: 'spire_landing_15',
          name: 'Where the Stair Turns',
          floor: 15,
          rewards: { silver: 140_000, emblem_silver: 5, xp_brew: 25, crystals: 60 },
        },
        {
          key: 'spire_landing_20',
          name: 'The Coilmother’s Landing',
          floor: 20,
          rewards: { silver: 220_000, emblem_gold: 2, waking_shard: 1, crystals: 90 },
        },
        {
          key: 'spire_landing_25',
          name: 'Above the Mist Line',
          floor: 25,
          rewards: { silver: 320_000, emblem_gold: 3, waking_shard: 2, crystals: 120 },
        },
        {
          key: 'spire_landing_30',
          name: 'The Top of the Mistspire',
          floor: 30,
          rewards: {
            silver: 500_000,
            emblem_gold: 5,
            waking_shard: 4,
            sigil_mistwoven: 1,
            crystals: 200,
          },
        },
      ],
    },
    sortOrder: 40,
  },
];

/**
 * The thirty floors.
 *
 * Generated rather than hand-written for the reason the campaign's 252 stages are: thirty
 * near-identical entities differing in three numbers is thirty chances to fat-finger one,
 * and an operator retunes them in Admin afterwards either way. What is hand-authored is
 * the part that is a *decision* — which floors are warded and to what, and who keeps the
 * tenth, twentieth and thirtieth.
 */
export const SPIRE_STAGES: StageDefInput[] = Array.from({ length: FLOORS }, (_, index) => {
  const floor = index + 1;
  const ward = WARDS[floor];
  const stage: StageDefInput = {
    key: `${SPIRE_KEY}_f${String(floor).padStart(2, '0')}`,
    mode: 'spire',
    parentKey: SPIRE_KEY,
    number: floor,
    difficulty: 'normal',
    // Keys, not energy — and the key comes off on the *clear*, so a warded floor can be
    // attempted all evening with a different four each time and cost nothing until it is
    // solved. That is the mode's whole bargain with the player.
    energyCost: 0,
    waves: wavesFor(floor),
    rewards: rewardsFor(floor),
    // Generous on turns and strict on deaths: a warded floor is often climbed by four
    // champions who are not the account's best four, so a turn limit tuned for a main team
    // would punish exactly the play the tower exists to reward.
    starRules: { noDeaths: true, maxTurns: 30 },
    firstClearRewards: {},
    // The climb is walked in order and the server enforces it against the *climb* rather
    // than against stage progress, since a month's reset must send everybody back to floor
    // one. What is here is the tower's own door.
    unlock: { playerLevel: 16 },
    sortOrder: floor,
  };
  if (ward) stage.teamRestriction = ward;
  return stage;
});
