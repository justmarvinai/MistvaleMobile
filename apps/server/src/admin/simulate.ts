import {
  SIMULATE_MAX_RUNS,
  type AdminSimulateRequest,
  type AdminSimulateResult,
  type BenchTierKey,
} from '@mistvale/shared';
import { benchTeam, contentFromBundle, simulateStage } from '@mistvale/sim';
import { AppError } from '../lib/errors';
import type { ContentCache } from '../content/cache';

/**
 * The balance sandbox.
 *
 * Fights a stage many times against a named bench team and reports how it went. It is the
 * difference between retuning a stage and *knowing* what the retune did: until this
 * existed, the only way to check a change was to publish it and go and play the stage,
 * which quietly made a balance edit a deploy (ROADMAP item 13, G4).
 *
 * Three things make it trustworthy rather than merely useful:
 *
 *  - **It is the same simulation CI runs.** `@mistvale/sim` holds one `simulateStage` and
 *    one definition of each bench team, and both the gates and this endpoint call it. A
 *    sandbox that answered a balance question differently from the gate guarding the same
 *    number would be worse than no sandbox.
 *  - **It can read the drafts.** An operator retuning a stage wants to know what the *edit*
 *    does, not what the published version already did, so `source: 'draft'` layers the
 *    pending edits over live exactly as a publish would.
 *  - **It writes nothing.** No player, no roster, no progress, no content. It is a read and
 *    an arithmetic, and the only thing it spends is a tenth of a second of CPU.
 */

export interface SimulateContext {
  content: ContentCache;
}

export async function simulate(
  ctx: SimulateContext,
  input: AdminSimulateRequest,
): Promise<AdminSimulateResult> {
  // Belt and braces over the schema's own ceiling: this is a loop whose length the caller
  // chooses, on a box that has a game to serve at the same time.
  const runs = Math.min(input.runs, SIMULATE_MAX_RUNS);

  const bundle =
    input.source === 'draft' ? await ctx.content.draftBundle() : ctx.content.current().bundle;
  const content = contentFromBundle(bundle);

  const stage = content.stages.get(input.stageKey);
  if (!stage)
    throw AppError.notFound(`No stage "${input.stageKey}" in the ${input.source} content.`);

  const team = teamFor(content, input.tier);
  const result = simulateStage(content, input.stageKey, team, runs);

  // The three-star turn limit, and how often the team came in under it. Usually the figure
  // an operator is really asking about: a stage can be perfectly clearable and still be
  // mis-tuned if nobody can three-star it.
  const starLimit = stage.starRules.maxTurns > 0 ? stage.starRules.maxTurns : null;

  return {
    stageKey: input.stageKey,
    stageLabel: labelFor(content, input.stageKey),
    source: input.source,
    tier: input.tier,
    team: team.map((member) => ({
      championKey: member.championKey,
      name: content.champions.get(member.championKey)?.name ?? member.championKey,
      level: member.level,
      rank: member.rank,
      ascension: member.ascension,
    })),
    runs: result.runs,
    wins: result.wins,
    winRate: result.winRate,
    // A mean of no numbers is not zero — a stage nobody won has no average turn count, and
    // reporting one would be the sandbox inventing the most reassuring possible answer.
    averageTurns: result.wins > 0 ? round(result.averageTurns, 1) : null,
    medianTurns: result.wins > 0 ? result.medianTurns : null,
    starTurnLimit: starLimit,
    winsWithinStarLimit: starLimit === null ? null : result.winsWithin(starLimit),
    msPerRun: round(result.msPerRun, 3),
  };
}

/** The bench team, with the one failure content can cause turned into a sentence. */
function teamFor(
  content: ReturnType<typeof contentFromBundle>,
  tier: BenchTierKey,
): ReturnType<typeof benchTeam> {
  try {
    return benchTeam(content, tier);
  } catch (cause) {
    throw new AppError(
      'CONTENT_STALE',
      cause instanceof Error ? cause.message : 'No bench team could be assembled.',
    );
  }
}

/**
 * What the stage is called, in the words an operator uses.
 *
 * "Veilwood Fringe 1-3 · Hard" rather than `c01_s3_hard`, read off the same chapter and
 * dungeon names the game shows a player — a sandbox that answers in keys is one an
 * operator has to translate before they can act on it.
 */
function labelFor(content: ReturnType<typeof contentFromBundle>, stageKey: string): string {
  const stage = content.stages.get(stageKey);
  if (!stage) return stageKey;
  const chapter = content.chapters.get(stage.parentKey);
  const dungeon = content.dungeons.get(stage.parentKey);
  const place = chapter?.name ?? dungeon?.name ?? null;
  if (!place) return stageKey;
  const where = chapter
    ? `${place} ${chapter.number}-${stage.number}`
    : `${place} · ${stage.number}`;
  return stage.difficulty === 'normal' ? where : `${where} · ${stage.difficulty}`;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
