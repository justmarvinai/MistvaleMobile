import {
  advance,
  buildRules,
  buildStageWaves,
  buildTeam,
  championScalingFrom,
  combatConfigFrom,
  createBattle,
  type ChampionEntry,
} from '@mistvale/engine';
import type { LoadedContent } from './content';
import type { TeamSpec } from './team';

/**
 * One stage, fought many times, headlessly.
 *
 * The engine's own tests use hand-built fixtures so a rebalance cannot break them. This
 * runs the opposite check: the *shipped* champions, enemies, stages and constants, many
 * times over, to answer the question the unit tests deliberately cannot — is the content
 * actually tuned (COMBAT_SYSTEM §14)?
 *
 * Pure and IO-free, which is what lets it run in CI with no database *and* inside an Admin
 * request against content that has not been published yet.
 */

export interface StageResult {
  stageKey: string;
  runs: number;
  wins: number;
  winRate: number;
  /** Mean turns across winning runs; losses would skew it to the cap. */
  averageTurns: number;
  medianTurns: number;
  /**
   * Share of *all* runs that were won inside `limit` turns.
   *
   * A farm gate cares about the whole distribution rather than the average: "usually
   * fourteen turns" is no comfort if one run in twenty grinds to forty. Losses count
   * against it, because a run that did not finish did not finish quickly either.
   */
  winsWithin: (limit: number) => number;
  /** Wall-clock milliseconds per simulated stage. */
  msPerRun: number;
}

/** Runs one stage many times and reports how the team fared. */
export function simulateStage(
  content: LoadedContent,
  stageKey: string,
  team: readonly TeamSpec[],
  runs: number,
  seedBase = 1,
): StageResult {
  const stage = content.stages.get(stageKey);
  if (!stage) throw new Error(`No stage "${stageKey}" in the content.`);

  const combat = combatConfigFrom(content.config);
  const scaling = championScalingFrom(content.config);
  // A floor is fought in its own mode, not in `campaign`: leader auras scoped to the
  // Depths only apply there, and simulating the wrong mode would measure a team the
  // player never fields.
  const mode = stage.mode === 'tutorial' ? 'campaign' : stage.mode;
  const rules = buildRules(mode, content.skills, content.statuses);

  const entries: ChampionEntry[] = team.map((member) => {
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

  let wins = 0;
  const winningTurns: number[] = [];
  const started = performance.now();

  for (let run = 0; run < runs; run += 1) {
    const allies = buildTeam(entries, scaling, mode);
    const waves = buildStageWaves(stage, content.enemies, scaling);
    const { state } = createBattle({ seed: seedBase + run, mode, allies, waves }, rules, combat);
    advance(state, rules, combat, { auto: true });

    if (state.outcome === 'victory') {
      wins += 1;
      winningTurns.push(state.turn);
    }
  }

  const elapsed = performance.now() - started;
  const sorted = [...winningTurns].sort((a, b) => a - b);

  return {
    stageKey,
    runs,
    wins,
    winRate: wins / runs,
    averageTurns: winningTurns.length
      ? winningTurns.reduce((sum, turns) => sum + turns, 0) / winningTurns.length
      : Number.NaN,
    medianTurns: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : Number.NaN,
    winsWithin: (limit) => winningTurns.filter((turns) => turns <= limit).length / runs,
    msPerRun: elapsed / runs,
  };
}
