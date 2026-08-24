import type { DungeonDefInput, EnemyDefInput, StageDefInput } from '@mistvale/shared';
import { TITAN_SKILLS } from './titan';

/**
 * The Wurm Wakes — Mistvale's one world boss, and the only shared number in the game.
 *
 * It is **the same creature** as the Solo Titan, and that is the whole idea. All week the
 * Valewurm lies under the vale and wardens go down alone to find out how much of it they
 * can move. At the weekend it comes up, and the question changes from *how far can I get*
 * to *how far can we get* — one health bar, everybody's damage on it, and a chest for
 * everyone who helped if the vale actually gets through it.
 *
 * What it deliberately is **not**: a guild, a raid group, a chat, a schedule to keep with
 * anybody. There is nothing to join and nobody to coordinate with. The only social act
 * available is turning up, and the only evidence anybody else exists is that the bar moved
 * while you were away — which is exactly the amount of populated world a game with no
 * social layer and no WebSockets can honestly offer.
 *
 * **No bots strike it.** The Arena has bots because a ladder needs opponents and a synthetic
 * one is still a real fight. A fabricated line on this board would be a lie about who was
 * here, and the bar moving on its own would be a lie about what a strike is worth. If the
 * population is too small to fell it, it is not felled — and the contribution ladder, which
 * is the reliable payout, does not care either way. `maxHp` is the number an operator moves
 * as the vale fills up.
 */

const WORLD_BOSS_KEY = 'worldboss_wurm_wakes';

/**
 * The roused Valewurm.
 *
 * Its own health is far above anything one strike can do, exactly as the Titan's is: a
 * strike is not meant to kill it, and a battle that ended in victory would cap the damage
 * the run could contribute. What falls is the **shared pool** on the wake, which is a
 * different number in a different table and the one the screen draws.
 *
 * Its kit is the Titan's, unchanged, because it is the Titan. What differs is that it hits
 * harder, guards harder, and enrages sooner — the weekend version of a fight wardens have
 * been practising all week.
 */
export const WORLD_BOSS_ENEMIES: EnemyDefInput[] = [
  {
    key: 'worldboss_valewurm_roused',
    name: 'The Valewurm, Roused',
    archetype: 'valewurm',
    element: 'verdant',
    role: 'hp',
    baseStats: {
      hp: 1_500_000,
      atk: 1_450,
      def: 1_400,
      spd: 92,
      critRate: 20,
      critDmg: 70,
      res: 100,
      acc: 140,
    },
    growth: 1,
    skills: TITAN_SKILLS.map((skill) => skill.key),
    assetKey: 'enemy_lizard',
    isBoss: true,
    bossMechanics: {
      almightyImmunity: true,
      // The same half-puzzle the Titan poses, and left open for the same reason: slowing it
      // is what earns a support a slot on a team built to hit things.
      tmReductionImmune: false,
      // One hit harsher than the Titan's, and it matters more here: the punish costs turn
      // meter, and a strike is fifty turns of a shared clock rather than a private one.
      hitShield: { hits: 6, punishTmPct: 45 },
      // Sooner than the Titan's thirty. A wake is a sprint against a bar somebody else is
      // also pulling down; the back half of a strike is meant to be the frightening half.
      enrage: { afterTurn: 25, dmgPctPerTurn: 6 },
    },
    sortOrder: 410,
  },
];

export const WORLD_BOSS_DUNGEONS: DungeonDefInput[] = [
  {
    key: WORLD_BOSS_KEY,
    name: 'The Wurm Wakes',
    kind: 'worldBoss',
    region: 'Over the whole vale',
    lore: 'On most days it is a rumour under the ground. At the end of the week it comes up through the mist with the marsh still running off it, and every lantern in the Vale is lit at once — not because anyone expects to kill it, but because everything anybody does to it counts toward the same wound.',
    tagline: 'One health bar. Everybody in the Vale. Whatever you take off it stays off.',
    backgroundAsset: 'bg_veilwood',
    floors: 1,
    setKeys: [],
    itemKeys: ['emblem_gold', 'waking_shard', 'sigil_mistwoven'],
    bossEnemyKey: 'worldboss_valewurm_roused',
    openDays: [],
    unlockLevel: 18,
    worldBoss: {
      // Friday through Sunday, in game-days, so it turns over at the operator's own reset
      // hour along with the dailies rather than at some midnight of its own.
      schedule: { kind: 'weekly', startWeekday: 5, durationDays: 3 },

      // **The number to move as the vale fills up**, and it is measured rather than guessed.
      // `pnpm sim` fights this very stage: a fully built warden manages about 181,000 in a
      // fifty-turn strike and a modest one about 6,700, and a wake allows nine strikes — so
      // one very good account contributes roughly 1.6 million and one modest account roughly
      // 60,000. Eight million is therefore "about five built wardens, or a rather larger
      // crowd of ordinary ones, all turning up": out of reach for one person, which is the
      // whole point, and reachable for a small live population, which is the other half of
      // it. `worldboss-needs-a-crowd` gates the first half.
      maxHp: 8_000_000,
      turnCap: 50,
      attemptsPerDay: 3,

      // Cumulative across the wake, not per strike, and cut against the same measurements
      // the pool is. The bottom rung is **one day's strikes from a modest account** — about
      // 20,000 — so somebody who turns up on Friday and never comes back has still earned
      // something; the second is that account's whole wake. The top sits just above what a
      // fully built warden manages across a wake, so it is a genuine stretch for the best
      // account in the vale rather than a formality.
      tiers: [
        {
          key: 'wake_t1',
          name: 'First Blood on the Coil',
          damage: 18_000,
          rewards: { silver: 30_000, emblem_bronze: 3 },
        },
        {
          key: 'wake_t2',
          name: 'The Vale Answers',
          damage: 75_000,
          rewards: { silver: 70_000, emblem_silver: 2, xp_brew: 3 },
        },
        {
          key: 'wake_t3',
          name: 'Scale and Splinter',
          damage: 250_000,
          rewards: { silver: 140_000, emblem_silver: 4, essence_pure: 2, crystals: 40 },
        },
        {
          key: 'wake_t4',
          name: 'Down to the Root',
          damage: 600_000,
          rewards: { silver: 240_000, emblem_gold: 2, waking_shard: 2, crystals: 75 },
        },
        {
          key: 'wake_t5',
          name: 'Lanternbreaker',
          damage: 1_100_000,
          rewards: { silver: 400_000, emblem_gold: 4, waking_shard: 4, crystals: 125 },
        },
        {
          key: 'wake_t6',
          name: 'Wurmbane of the Vale',
          damage: 1_800_000,
          rewards: {
            silver: 650_000,
            emblem_gold: 6,
            waking_shard: 6,
            sigil_mistwoven: 2,
            crystals: 200,
          },
        },
      ],

      // The one reward in Mistvale nobody can earn alone, and it is deliberately flat: the
      // warden who landed the last blow and the one who managed a single strike on Friday
      // take exactly the same chest. Anything scaled here would turn "did we get it?" back
      // into "did I do enough?", which is the question every other mode already asks.
      fellingRewards: {
        silver: 200_000,
        crystals: 150,
        waking_shard: 3,
        sigil_mistwoven: 1,
      },
      claimGraceDays: 3,
    },
    sortOrder: 91,
  },
];

export const WORLD_BOSS_STAGES: StageDefInput[] = [
  {
    key: `${WORLD_BOSS_KEY}_strike`,
    mode: 'worldBoss',
    parentKey: WORLD_BOSS_KEY,
    number: 1,
    difficulty: 'normal',
    // Strikes a day, not energy. The resource the mode limits is *attempts*, exactly as the
    // Titan's is — a shared bar you could farm down with a big enough energy bar would make
    // felling it a question of who had the most energy rather than who turned up.
    energyCost: 0,
    waves: [[{ enemyKey: 'worldboss_valewurm_roused', level: 60, stars: 6, slot: 1 }]],
    // Nothing is paid on the strike itself. What a wake is worth is claimed on its own
    // screen against the week's total, which is the one payout the stage rewards
    // deliberately do not describe.
    rewards: { silverMin: 0, silverMax: 0, playerXp: 0, championXp: 0, drops: {} },
    // Stars mean nothing against something nobody is expected to kill. Set where they can
    // never be earned rather than left to imply that a fifty-turn strike went badly.
    starRules: { noDeaths: true, maxTurns: 1 },
    firstClearRewards: {},
    unlock: { playerLevel: 18 },
    sortOrder: 1,
  },
];
