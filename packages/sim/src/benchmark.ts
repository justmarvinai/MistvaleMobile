import { ROLES, type Role } from '@mistvale/shared';
import {
  advance,
  buildRules,
  buildStageWaves,
  buildTeam,
  championScalingFrom,
  combatConfigFrom,
  contributions,
  createBattle,
  type ChampionEntry,
} from '@mistvale/engine';
import type { LoadedContent } from './content';
import { withRelics, type TeamSpec } from './team';

/**
 * What one champion is worth, measured rather than asserted (COMBAT_SYSTEM §14, gap G7).
 *
 * The gate that wants this has been documented since P2 and unenforceable until now: it
 * asks whether every champion sims within a band of its *role's* benchmark, and the repo
 * had no way to ask what a single champion contributes. `contributions()` (C21) answers it
 * off the event log, and `packages/sim` (C27) is where a measurement lives that CI and the
 * Admin sandbox can both call.
 *
 * ## The bench
 *
 * One champion at a time, in a **fixed team, on a fixed stage, at a fixed investment**,
 * over seeded runs. Everything except the champion is held still, so what moves between
 * two rows is the champion and nothing else.
 *
 * Three choices in it are load-bearing and each is a trap avoided:
 *
 *  - **Rates, not totals.** A better champion ends the fight sooner, so a champion measured
 *    on total damage is punished for winning quickly. Per *turn* removes fight length from
 *    the comparison entirely, which is the only reason a 6-turn row and a 30-turn row can
 *    sit in one table.
 *  - **A fight with no boss mechanic.** The Titan and the world boss are the obvious
 *    dummies — nobody kills them and they run to a turn cap — and both are disqualified by
 *    the same feature: a hit-counter shield turns the measurement into "is this champion a
 *    multi-hitter", which is a fact about that boss rather than about the champion. Nothing
 *    in the campaign, the Depths or the Spire carries a mechanic, so the bench is an
 *    ordinary deep fight.
 *  - **The partners are role-diverse and picked by key.** A support measured beside three
 *    other supports never gets a fight to help with, and "the best three" moves the moment
 *    any champion is retuned — a baseline that drifts under the thing it is measuring
 *    cannot be compared to last week's answer. If the champion under test is one of the
 *    three it simply fights beside itself, which is legal in the game and uniform here.
 *
 * ## What it deliberately does not do
 *
 * It does not score the four roles against each other. A `defense` champion deals less
 * damage than an `attack` one **by design** — that is what the roles are — so the only
 * honest comparison is within a role, which is exactly what the documented gate says.
 */

/** How a champion's output is read once the fight is over. */
export interface ChampionBenchmark {
  championKey: string;
  name: string;
  role: Role;
  /**
   * **The score.** Mean turns the bench team took to clear, with this champion in it.
   *
   * Turns rather than any per-champion figure, and that was settled by measurement rather
   * than by argument. The first cut scored the three fighting roles on damage and `support`
   * on healing plus shielding — and the roster says that is wrong: **six of Mistvale's ten
   * supports neither heal nor shield**. They buff, they debuff, they move the turn meter.
   * Scored on sustain, six of ten read as zero and the role's median came out at 3, which
   * turns every ratio in the column into noise — a benchmark that cannot see its subject,
   * which is the failure this project keeps finding.
   *
   * Turns has none of that. It is defined for every champion whatever its kit, it is what a
   * player actually feels, and it credits the four roles in their own currencies without
   * naming any of them: an attacker shortens the fight by killing, a tank by keeping the
   * party alive to keep killing, a support by making the other three better at it.
   *
   * One property of it is worth stating rather than discovering later: `state.turn` counts
   * **unit turns**, not rounds — it ticks once for every unit that acts, which is the
   * currency `bestTurns` and every three-star limit in the game are already denominated in.
   * Two consequences follow. A fast champion contributes turns of its own to the count, so
   * speed is not free here any more than it is on a star limit. And a team of three is
   * **not** comparable with a team of four: an empty fourth slot takes fewer unit turns per
   * round, so "how does this champion compare with nobody" is a question this number cannot
   * answer, and the band below deliberately never asks it. Every row fields four.
   *
   * `NaN` when no run was won, which the win rate is what to read instead.
   */
  turnsToClear: number;
  /** Share of runs the bench team won with this champion in it. */
  winRate: number;
  /** Diagnostic: damage this champion itself dealt, per turn of fighting. */
  damagePerTurn: number;
  /** Diagnostic: healing plus shielding it produced, per turn. */
  sustainPerTurn: number;
  /** Diagnostic: how often it was still standing at the end. */
  survivalRate: number;
  runs: number;
}

export interface BenchSetup {
  stageKey: string;
  level: number;
  rank: number;
  ascension: number;
  runs: number;
}

/**
 * The three champions every measured champion fights beside.
 *
 * One `attack`, one `defense`, one `support`, each the first of its role by key among the
 * summonable non-food champions — role-diverse so the fight is an ordinary one, and picked
 * by key so the baseline is the same team on every machine and after every retune.
 */
export function benchPartners(content: LoadedContent): string[] {
  const pool = [...content.champions.values()]
    .filter((champion) => !champion.isFood && champion.summonable)
    .sort((a, b) => a.key.localeCompare(b.key));
  const partners: string[] = [];
  for (const role of ['attack', 'defense', 'support'] as const) {
    const pick = pool.find((champion) => champion.role === role);
    if (pick) partners.push(pick.key);
  }
  return partners;
}

/** Every champion the benchmark has something to say about: the playable roster. */
export function benchmarkedChampions(content: LoadedContent): string[] {
  return [...content.champions.values()]
    .filter((champion) => !champion.isFood)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((champion) => champion.key);
}

/** Runs the bench fight for one champion. */
export function benchmarkChampion(
  content: LoadedContent,
  championKey: string,
  setup: BenchSetup,
  seedBase = 1,
): ChampionBenchmark {
  const def = content.champions.get(championKey);
  if (!def) throw new Error(`No champion "${championKey}" in the content.`);
  const stage = content.stages.get(setup.stageKey);
  if (!stage) throw new Error(`No stage "${setup.stageKey}" in the content.`);

  const investment = { level: setup.level, rank: setup.rank, ascension: setup.ascension };
  const bare: TeamSpec[] = [championKey, ...benchPartners(content)].map((key) => ({
    championKey: key,
    ...investment,
  }));
  const team = withRelics(content, bare);

  const combat = combatConfigFrom(content.config);
  const scaling = championScalingFrom(content.config);
  const mode = stage.mode === 'tutorial' ? 'campaign' : stage.mode;
  const rules = buildRules(mode, content.skills, content.statuses);

  const entries: ChampionEntry[] = team.map((member) => {
    const memberDef = content.champions.get(member.championKey);
    if (!memberDef) throw new Error(`No champion "${member.championKey}" in the content.`);
    return {
      def: memberDef,
      level: member.level,
      rank: member.rank,
      ascension: member.ascension,
      ...(member.bonuses ? { bonuses: member.bonuses } : {}),
    };
  });

  let damage = 0;
  let sustain = 0;
  let turns = 0;
  let survived = 0;
  const winningTurns: number[] = [];

  for (let run = 0; run < setup.runs; run += 1) {
    const allies = buildTeam(entries, scaling, mode);
    const waves = buildStageWaves(stage, content.enemies, scaling);
    const opened = createBattle({ seed: seedBase + run, mode, allies, waves }, rules, combat);
    const result = advance(opened.state, rules, combat, { auto: true });
    const events = [...opened.events, ...result.events];

    // Slot 0 is the champion under test — `buildTeam` keeps the order it is given, which
    // is what makes one row of the contribution table the answer.
    const row = contributions(events).find((entry) => entry.ref.slot === 0);
    damage += row?.damage ?? 0;
    sustain += (row?.healing ?? 0) + (row?.shielding ?? 0);
    if (row && !row.fell) survived += 1;

    // At least one turn, always: a fight decided on the opening volley still happened, and
    // dividing by zero would report an infinity rather than a big number.
    const ran = Math.max(1, result.state.turn);
    turns += ran;
    // Winning runs only. A loss ends at the turn cap whatever caused it, so averaging losses
    // in would compress every bad champion onto the same number and hide which is which —
    // the win rate is the honest reading of a champion that does not get there.
    if (result.state.outcome === 'victory') winningTurns.push(ran);
  }

  return {
    championKey,
    name: def.name,
    role: def.role,
    turnsToClear: winningTurns.length
      ? winningTurns.reduce((sum, ran) => sum + ran, 0) / winningTurns.length
      : Number.NaN,
    winRate: winningTurns.length / setup.runs,
    damagePerTurn: damage / turns,
    sustainPerTurn: sustain / turns,
    survivalRate: survived / setup.runs,
    runs: setup.runs,
  };
}

/**
 * The whole roster, measured, and each champion placed against its own role.
 *
 * The role's yardstick is its **median**, not its mean: one champion authored far out of
 * band would drag a mean toward itself and quietly widen the band for everybody else,
 * which is the opposite of what a benchmark is for.
 *
 * Within a role and never across one. A `defense` champion clears more slowly than an
 * `attack` one **by design** — that is what the roles are — so a table that ranked all
 * thirty-seven against one median would report the design as a fault.
 */
export interface RoleBand {
  role: Role;
  /** The role's yardstick: the median turns its champions take to clear the bench. */
  medianTurns: number;
  /** Fastest first, which is the order the role's own question is asked in. */
  members: ChampionBenchmark[];
}

/**
 * Where a champion sits against its role, as a percentage.
 *
 * Inverted, because the score is turns and fewer is better: 100% is the role's median,
 * above it is faster than the median and below it is slower. Reading it the other way up
 * would put the best champion at the bottom of every column.
 */
export function roleIndex(row: ChampionBenchmark, band: RoleBand): number {
  if (!Number.isFinite(row.turnsToClear) || row.turnsToClear <= 0) return 0;
  return (band.medianTurns / row.turnsToClear) * 100;
}

export function benchmarkRoster(
  content: LoadedContent,
  setup: BenchSetup,
  seedBase = 1,
): RoleBand[] {
  const rows = benchmarkedChampions(content).map((key) =>
    benchmarkChampion(content, key, setup, seedBase),
  );

  return ROLES.map((role) => {
    const members = rows
      .filter((row) => row.role === role)
      .sort((a, b) => (a.turnsToClear || Infinity) - (b.turnsToClear || Infinity));
    // Champions that never cleared have no turn count to average into the yardstick; the
    // win-rate gate is what speaks about them, and letting a `NaN` in here would take the
    // whole role's median with it.
    const cleared = members
      .map((row) => row.turnsToClear)
      .filter((turns) => Number.isFinite(turns))
      .sort((a, b) => a - b);
    return {
      role,
      medianTurns: cleared.length ? (cleared[Math.floor(cleared.length / 2)] ?? 0) : Number.NaN,
      members,
    };
  }).filter((band) => band.members.length > 0);
}
