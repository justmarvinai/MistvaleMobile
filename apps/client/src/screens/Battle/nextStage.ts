import type { StageDef, StageStanding } from '@mistvale/shared';

/**
 * What a player does after a fight, decided from what they just fought.
 *
 * Three of the four things the results screen offers are about the *same* stage or the
 * one after it, and every one of them is a question with an answer already in the client's
 * hands: the content bundle knows what a stage costs and what follows it, and the progress
 * the server sends knows whether that next one is open. None of it is a decision — the
 * server refuses a stage that is shut and a purse that is short either way. It is only
 * about which buttons are worth drawing, and drawing one that cannot work is the failure
 * this file exists to avoid.
 *
 * Pure, and tested, because it is arithmetic over content: a component that did it inline
 * would be arithmetic nothing could reach.
 */

/** How much energy pressing a button really costs, in this mode. */
export function energyCost(stage: StageDef, mode: string): number {
  // The sandbox fights a campaign stage and pays nothing for it — its own rule, and the
  // one place a stage's own cost is not what a fight on it costs.
  return mode === 'practice' ? 0 : stage.energyCost;
}

/**
 * Whether this fight is one a player can simply have again from here.
 *
 * The test is the *cost*: energy is the only currency the results screen can honestly
 * spend, because a key, a strike and an attack token are three allowances with three
 * screens that own them, and a Replay button that quietly spent the last Titan key of the
 * day would be the results screen making a decision that belongs somewhere else.
 *
 * It falls out of content rather than an enumeration of modes: every attempt-limited mode
 * in the game is authored at zero energy, and a new one published in Admin gets the same
 * answer with no change here.
 */
export function canRefight(stage: StageDef | undefined, mode: string): stage is StageDef {
  if (!stage) return false;
  // The cold open is fought with borrowed champions on a stage that exists once per
  // account; there is nothing to repeat and no team to repeat it with.
  if (mode === 'tutorial') return false;
  return mode === 'practice' || stage.energyCost > 0;
}

/**
 * The stage after this one, when there is one and it is open.
 *
 * "After" is within the same parent *and the same difficulty* — a chapter's Normal 1-7 is
 * followed by Hard 1-1 in the campaign's own ordering, and offering that as "Next" would
 * quietly walk a player onto a wall. The end of a chapter simply has no next.
 *
 * A stage with no standing is treated as **open**, which is the same hopeful default the
 * chapter page uses (`chapterView.stageRows`): progress arrives after the first paint, and
 * the server is the authority either way.
 */
export function nextStage(
  stage: StageDef,
  stages: readonly StageDef[],
  standings: ReadonlyMap<string, StageStanding>,
): StageDef | null {
  const candidate = stages.find(
    (entry) =>
      entry.parentKey === stage.parentKey &&
      entry.difficulty === stage.difficulty &&
      entry.mode === stage.mode &&
      entry.number === stage.number + 1,
  );
  if (!candidate) return null;
  return (standings.get(candidate.key)?.open ?? true) ? candidate : null;
}
