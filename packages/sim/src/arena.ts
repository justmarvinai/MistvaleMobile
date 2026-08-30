import { ROLES, type Role } from '@mistvale/shared';
import {
  advance,
  buildRules,
  buildTeam,
  championScalingFrom,
  combatConfigFrom,
  createBattle,
  createRng,
  type ChampionEntry,
  type Rng,
} from '@mistvale/engine';
import type { LoadedContent } from './content';
import { withRelics, type TeamSpec } from './team';

/**
 * Is any champion mandatory in the Arena? (COMBAT_SYSTEM §14, gap G7.)
 *
 * The other half of the champion benchmark, and it asks a different question. `benchmark.ts`
 * measures a champion against a *stage* — how much faster does the wall fall with this
 * champion helping. This measures a champion against *other champions*, which is the only
 * question PvP actually poses: with power held equal, does one name keep turning up on the
 * winning side?
 *
 * Random comps, fought both ways. Two properties make it honest:
 *
 *  - **Equal power by construction.** Every champion in every comp is at the same level,
 *    rank, ascension and relic set, so the only thing separating two teams is which four
 *    champions they are. A measurement over teams of *different* power would be measuring
 *    the power.
 *  - **Every pairing is fought twice, sides swapped.** The Arena gives the attacker the
 *    first move, which is worth real win rate; counting one direction only would credit
 *    whichever comp happened to be drawn as the attacker.
 *
 * ## Why this is not "40% of winning comps"
 *
 * §14 has asked since P2 for *no EA champion in >40% of winning comps at equal power*, and
 * that number cannot be measured this way — not because the sample is too small, but
 * arithmetically. A champion is in 4 of 37 comp slots, so it appears in **10.8%** of random
 * comps; every battle produces exactly one winner, so half of all comps win. A champion
 * that won *every fight it ever appeared in* would still appear in only 0.108 / 0.5 =
 * **21.6%** of winning comps. The 40% line could never be crossed, and a gate that cannot
 * be crossed has not been checked.
 *
 * The figure means what it means in a *metagame*, where players choose their comps and a
 * mandatory champion is in most of them by selection. Mistvale has no such data — nobody
 * is picking here, the comps are drawn. So what is measured instead is the same question
 * asked in a form random comps can answer: **of the fights a champion was in, what share
 * did its side win?** Fifty per cent is neutral by construction, and a champion that must
 * be fielded shows as a high number rather than as a frequency nobody could reach.
 */

export interface ChampionArenaRecord {
  championKey: string;
  name: string;
  role: Role;
  /** Battles this champion was fielded in, on either side. */
  battles: number;
  wins: number;
  /** Share of its own battles won. 50% is neutral: every battle has exactly one winner. */
  winRate: number;
}

/**
 * A whole role's win rate — every battle every champion of that role fought.
 *
 * The figure worth gating, and the champion column is not. One champion in four cannot
 * escape the noise floor of its three random partners: a champion given **a hundred times**
 * its authored attack reaches 76.5%, against an authored best of 76.3% — indistinguishable
 * — and stripped to 1/1/1 it falls only to 20.6% against an authored worst of 24.9%. The
 * measure saturates at both ends, so no champion-level bound could be crossed by any
 * mutation, and a gate that cannot be made to fail has not been checked.
 *
 * A role pools six to fourteen champions over thousands of battles, and the noise averages
 * away with them: across two disjoint blocks of seeds a role's mean moved by **0.2 to 1.3
 * points**, against a spread of 42.5–56.9% between the strongest role and the weakest. That
 * is a statistic a gate can stand on, and it answers the question §14 is really asking —
 * not "is one champion mandatory", which the format prevents, but "must a comp be built
 * out of one role to compete".
 */
export interface RoleArenaBand {
  role: Role;
  battles: number;
  wins: number;
  winRate: number;
  champions: number;
}

export interface ArenaDiversity {
  /** Best win rate first — the question is who is mandatory, not who is alphabetical. */
  champions: ChampionArenaRecord[];
  /** The gateable half: every role, pooled. */
  roles: RoleArenaBand[];
  /** Battles fought. Each pairing is fought twice, so this is even. */
  battles: number;
  /** The middle champion, which a lopsided roster cannot drag the way a mean can. */
  medianWinRate: number;
}

export interface ArenaSetup {
  level: number;
  rank: number;
  ascension: number;
  /** Pairings drawn. Each is fought twice, once from each side. */
  pairings: number;
}

/** Fights one comp against another in the Arena's own mode, and says who won. */
function fight(
  content: LoadedContent,
  attackers: readonly TeamSpec[],
  defenders: readonly TeamSpec[],
  seed: number,
): 'attacker' | 'defender' {
  const combat = combatConfigFrom(content.config);
  const scaling = championScalingFrom(content.config);
  const rules = buildRules('arena', content.skills, content.statuses);

  const entries = (team: readonly TeamSpec[]): ChampionEntry[] =>
    team.map((member) => {
      const def = content.champions.get(member.championKey);
      if (!def) throw new Error(`No champion "${member.championKey}" in the content.`);
      return {
        def,
        level: member.level,
        rank: member.rank,
        ascension: member.ascension,
        ...(member.bonuses ? { bonuses: member.bonuses } : {}),
      };
    });

  const opened = createBattle(
    {
      seed,
      mode: 'arena',
      allies: buildTeam(entries(attackers), scaling, 'arena'),
      // A defence team is a wave of champions rather than of enemies, which is what
      // `buildTeam` produces — the same shape the Arena service builds, and the engine has
      // never cared which side a unit is on.
      waves: [
        buildTeam(entries(defenders), scaling, 'arena').map((unit) => ({
          ...unit,
          ref: { ...unit.ref, side: 'enemy' as const },
        })),
      ],
    },
    rules,
    combat,
  );
  const result = advance(opened.state, rules, combat, { auto: true });
  // A timed-out attack is a loss for the attacker, which is the Arena's own rule: the
  // defender holds the ladder position when nothing else decides it.
  return result.state.outcome === 'victory' ? 'attacker' : 'defender';
}

/**
 * Draws `size` distinct champions. A comp cannot field the same champion twice, which is
 * the game's own rule — a roster copy is a copy, but a team slot is a slot.
 *
 * `Rng.shuffle` returns a new array by contract, so the pool it is handed is safe.
 */
export function drawComp(
  pool: readonly string[],
  size: number,
  rng: Pick<Rng, 'shuffle'>,
): string[] {
  return rng.shuffle(pool).slice(0, size);
}

/**
 * Every role, pooled over all of its champions' battles.
 *
 * **Pooled rather than a mean of means**, which matters the moment the draw is uneven: a
 * role holding one champion who fought twice and thirteen who fought a thousand times each
 * should not have that one count for a fourteenth of the answer. A champion that never
 * fought is left out entirely rather than counted as a nil — it has said nothing, and a
 * zero would be a claim it lost.
 */
export function poolRoles(champions: readonly ChampionArenaRecord[]): RoleArenaBand[] {
  return ROLES.map((role) => {
    const members = champions.filter((row) => row.role === role && row.battles > 0);
    const battles = members.reduce((sum, row) => sum + row.battles, 0);
    const wins = members.reduce((sum, row) => sum + row.wins, 0);
    return {
      role,
      battles,
      wins,
      winRate: battles > 0 ? wins / battles : 0,
      champions: members.length,
    };
  }).filter((band) => band.champions > 0);
}

export function arenaDiversity(
  content: LoadedContent,
  setup: ArenaSetup,
  seedBase = 1,
): ArenaDiversity {
  const pool = [...content.champions.values()]
    .filter((champion) => !champion.isFood)
    .sort((a, b) => a.key.localeCompare(b.key));
  const keys = pool.map((champion) => champion.key);

  const record = new Map<string, { battles: number; wins: number }>(
    keys.map((key) => [key, { battles: 0, wins: 0 }]),
  );

  const rng = createRng(seedBase);
  const investment = { level: setup.level, rank: setup.rank, ascension: setup.ascension };
  const comp = (championKeys: readonly string[]): TeamSpec[] =>
    withRelics(
      content,
      championKeys.map((championKey) => ({ championKey, ...investment })),
    );

  let battles = 0;
  for (let pairing = 0; pairing < setup.pairings; pairing += 1) {
    const left = drawComp(keys, 4, rng);
    const right = drawComp(keys, 4, rng);
    if (left.length < 4 || right.length < 4) break;

    const leftComp = comp(left);
    const rightComp = comp(right);
    // Both ways round. The attacker moves first and that is worth real win rate, so a
    // pairing scored in one direction only would be crediting the draw rather than the
    // champions.
    const seed = seedBase + pairing * 2;
    const first = fight(content, leftComp, rightComp, seed);
    const second = fight(content, rightComp, leftComp, seed + 1);

    for (const [side, winner] of [
      [left, first === 'attacker'],
      [right, first === 'defender'],
      [right, second === 'attacker'],
      [left, second === 'defender'],
    ] as const) {
      for (const key of side) {
        const row = record.get(key);
        if (!row) continue;
        row.battles += 1;
        if (winner) row.wins += 1;
      }
    }
    battles += 2;
  }

  const champions: ChampionArenaRecord[] = pool
    .map((champion) => {
      const row = record.get(champion.key) ?? { battles: 0, wins: 0 };
      return {
        championKey: champion.key,
        name: champion.name,
        role: champion.role,
        battles: row.battles,
        wins: row.wins,
        winRate: row.battles > 0 ? row.wins / row.battles : 0,
      };
    })
    .sort((a, b) => b.winRate - a.winRate);

  const rates = champions
    .filter((row) => row.battles > 0)
    .map((row) => row.winRate)
    .sort((a, b) => a - b);

  return {
    champions,
    roles: poolRoles(champions),
    battles,
    medianWinRate: rates.length ? (rates[Math.floor(rates.length / 2)] ?? 0) : 0,
  };
}
