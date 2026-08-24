import {
  NO_TRIALS,
  UNLOCK_LEVELS,
  type StageDef,
  type TrialState,
  type TrialsOverview,
} from '@mistvale/shared';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import * as progress from '../progress/service';

/**
 * Trials — a fixed enemy, a loaned team, and a turn count to beat.
 *
 * There is **no table behind this module and there should not be one**. A trial is an
 * ordinary stage of `mode: 'trial'`, so `stage_progress` already carries everything the
 * screen needs: whether it has been cleared, and the fewest turns it ever took. Adding a
 * `player_trials` would mean two records of the same fight, and the second one would be
 * the one that went stale.
 *
 * The same goes for the fight itself: a trial is started, played, auto-battled, sped up
 * and resumed through the ordinary battle routes. This module is a **read** — what the
 * trials are, what the account has managed on each, and why one cannot be fought yet.
 */

export interface TrialContext {
  db: Database;
  content: ContentCache;
}

/** Every published trial, in the order an operator put them in. */
export function published(content: ContentCache): StageDef[] {
  return content
    .current()
    .bundle.stages.filter((stage) => stage.mode === 'trial')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
}

export async function overview(
  ctx: TrialContext,
  playerId: string,
  playerLevel: number,
): Promise<TrialsOverview> {
  if (playerLevel < UNLOCK_LEVELS.trials) return NO_TRIALS;

  const stages = published(ctx.content);
  if (stages.length === 0) return NO_TRIALS;

  const standings = await progress.standings(ctx.db, playerId);
  const names = new Map(stages.map((stage) => [stage.key, stage.trial?.name ?? stage.key]));

  const trials: TrialState[] = stages.map((stage) => {
    const standing = standings.get(stage.key);
    // A trial has no par unless content gave it one, and publish validation refuses to let
    // one ship without. Reading it defensively anyway, because a cache holding a bundle
    // published before the rule existed must not crash a screen.
    const parTurns = stage.trial?.parTurns ?? 0;
    const bestTurns = standing?.bestTurns ?? null;

    // The stage's own unlock chain, read with the same rule the battle route enforces —
    // one gate, two consumers, so the button never promises what the server refuses. A
    // trial's chain asks for a *clear* rather than a beat: clearing is the easy half, and
    // walling the next puzzle behind a perfect run on this one would strand exactly the
    // players the mode was built for.
    const check = progress.checkUnlock(
      stage,
      playerLevel,
      (stageKey) => standings.get(stageKey)?.cleared === true,
      (stageKey) => names.get(stageKey) ?? 'the trial before it',
    );

    return {
      key: stage.key,
      name: stage.trial?.name ?? stage.key,
      hint: stage.trial?.hint ?? '',
      parTurns,
      bestTurns,
      cleared: standing?.cleared === true,
      beaten: parTurns > 0 && bestTurns !== null && bestTurns <= parTurns,
      parRewards: stage.trial?.parRewards ?? {},
      team: stage.presetTeam.map((member) => member.championKey),
      blockedReason: check.open ? null : (check.reason ?? 'That trial is shut.'),
    };
  });

  return {
    trials,
    beaten: trials.filter((trial) => trial.beaten).length,
    total: trials.length,
  };
}
