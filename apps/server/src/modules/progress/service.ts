import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  mergeRewards,
  type CampaignChapterDef,
  type Difficulty,
  type StageDef,
} from '@mistvale/shared';
import { chapterRewards, stageProgress } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { StageProgressRow } from '../../db/schema/game';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';
import { payRewards } from '../rewards/service';

/**
 * What a player has cleared.
 *
 * Progress is one table across every mode, which is what lets three separate rules be
 * written once: whether a stage is open, how many stars a chapter is worth, and whether a
 * first clear still owes its bonus. Dungeon floors chain exactly like campaign stages, so
 * the Depths needs no second implementation of any of it.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface StageStanding {
  stageKey: string;
  stars: number;
  clears: number;
  bestTurns: number | null;
  cleared: boolean;
}

export async function standings(
  db: Executor,
  playerId: string,
): Promise<Map<string, StageStanding>> {
  const rows = await db.select().from(stageProgress).where(eq(stageProgress.playerId, playerId));
  return new Map(rows.map((row) => [row.stageKey, toStanding(row)]));
}

function toStanding(row: StageProgressRow): StageStanding {
  return {
    stageKey: row.stageKey,
    stars: row.stars,
    clears: row.clears,
    bestTurns: row.bestTurns,
    cleared: row.clears > 0,
  };
}

/** Whether one stage has ever been cleared. Cheap enough to call per battle start. */
export async function hasCleared(
  db: Executor,
  playerId: string,
  stageKey: string,
): Promise<boolean> {
  const [row] = await db
    .select({ clears: stageProgress.clears })
    .from(stageProgress)
    .where(and(eq(stageProgress.playerId, playerId), eq(stageProgress.stageKey, stageKey)));
  return (row?.clears ?? 0) > 0;
}

/**
 * Which campaign difficulties an account has finished outright.
 *
 * "Finished" is every published campaign stage of that difficulty cleared at least once —
 * all 84 of them, twelve chapters of seven. It is read for the playback speeds a player
 * has earned (`speedsFor`), which is why it is one query rather than a `standings()` load:
 * this runs on `GET /api/player`, which the shell refetches after every fight.
 *
 * Derived rather than stored, because a stored flag is a flag that can be wrong — a
 * republished chapter would add stages the counter never saw.
 */
export async function campaignsFinished(
  db: Executor,
  playerId: string,
  content: ContentCache,
): Promise<Partial<Record<Difficulty, boolean>>> {
  const wanted = new Map<Difficulty, Set<string>>();
  for (const stage of content.current().bundle.stages) {
    if (stage.mode !== 'campaign') continue;
    const set = wanted.get(stage.difficulty) ?? new Set<string>();
    set.add(stage.key);
    wanted.set(stage.difficulty, set);
  }

  const keys = [...wanted.values()].flatMap((set) => [...set]);
  if (keys.length === 0) return {};

  const rows = await db
    .select({ stageKey: stageProgress.stageKey })
    .from(stageProgress)
    .where(
      and(
        eq(stageProgress.playerId, playerId),
        gt(stageProgress.clears, 0),
        inArray(stageProgress.stageKey, keys),
      ),
    );
  const cleared = new Set(rows.map((row) => row.stageKey));

  const finished: Partial<Record<Difficulty, boolean>> = {};
  for (const [difficulty, set] of wanted) {
    finished[difficulty] = [...set].every((key) => cleared.has(key));
  }
  return finished;
}

// ── Unlocks ─────────────────────────────────────────────────────────────────

export interface UnlockCheck {
  open: boolean;
  /** Why it is shut, phrased for the player. */
  reason: string | null;
}

/**
 * Whether a stage may be entered.
 *
 * The unlock chain has been authored in content since P1 but was never enforced, which
 * meant a fresh account could walk into a chapter-3 boss. It is checked here rather than
 * in the battle route so the campaign map can grey out the same stages the server will
 * refuse — one rule, two consumers.
 *
 * `parentGate` is how the Depths joins in: a dungeon can be shut for reasons a stage knows
 * nothing about — an account level, a rotation day — and those are the Depths module's
 * rules, not this one's. Asked first, because "closed today, opens Thursday" is more use
 * to a player than "clear floor 3 first" when both are true.
 */
export function checkUnlock(
  stage: StageDef,
  playerLevel: number,
  cleared: (stageKey: string) => boolean,
  stageName: (stageKey: string) => string,
  parentGate?: (parentKey: string) => UnlockCheck | null,
): UnlockCheck {
  const gate = parentGate?.(stage.parentKey);
  if (gate && !gate.open) return gate;

  const required = stage.unlock.previousStageKey;
  if (required && !cleared(required)) {
    return { open: false, reason: `Clear ${stageName(required)} first.` };
  }
  const level = stage.unlock.playerLevel;
  if (level !== undefined && playerLevel < level) {
    return { open: false, reason: `Opens at account level ${level}.` };
  }
  return { open: true, reason: null };
}

/** A readable name for a stage key — `1-7`, or the key itself if content moved on. */
export function stageLabel(stage: StageDef | undefined, chapterNumber: number | undefined): string {
  if (!stage) return 'the stage before it';
  return chapterNumber ? `${chapterNumber}-${stage.number}` : `stage ${stage.number}`;
}

// ── Recording a clear ───────────────────────────────────────────────────────

export interface ClearOutcome {
  /** Stars after the clear — the best ever, not the latest. */
  stars: number;
  /** True the first time this stage has ever been beaten. */
  firstClear: boolean;
  /** Rewards paid on top of the stage's normal payout — currencies and items alike. */
  bonus: Record<string, number>;
  /** Star-chest tiers this clear unlocked, if any. */
  chestTiers: number[];
  /**
   * Stars held across the whole chapter after this clear — every difficulty totalled, the
   * way the campaign map counts them. `0` outside the campaign.
   */
  chapterStars: number;
  /**
   * True when this clear was the first ever to come in at or under a trial's par (C10d).
   *
   * Decided from the *previous* best rather than from the new one, so the bonus is paid
   * exactly once — the run that solves the puzzle — and never again by a re-run that also
   * happens to land inside the limit. Always false outside a trial.
   */
  beatPar: boolean;
  /**
   * The fewest turns this stage had ever been beaten in **before** this run, or null when
   * this was the first clear.
   *
   * Read before the upsert for the same reason `beatPar` is: afterwards it is unanswerable,
   * because `least(...)` has already folded this run's turn count into the record. The
   * results screen is what wants it — "12 turns, best 9" is the pair a player reads, and
   * a best recomputed after the clear would say 9 and 9 on the run that set it.
   */
  previousBest: number | null;
}

/**
 * Records a clear and pays what it owes beyond the normal payout.
 *
 * Two bonuses live here because both are once-only and both are earned by *progress*
 * rather than by the fight: the stage's first-clear reward, and any chapter star chest the
 * new star total crossed. Keeping them out of the battle payout is what stops a re-farm
 * from paying them twice.
 */
export async function recordClear(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  playerId: string,
  stage: StageDef,
  content: ContentCache,
  turns: number,
  stars: number,
): Promise<ClearOutcome> {
  const now = new Date();

  // Read before the upsert, because "did this run beat par for the first time" is a
  // question about what the record *was*. Afterwards it is unanswerable: the upsert has
  // already folded the new turn count into `bestTurns`.
  const [previous] = await tx
    .select({ bestTurns: stageProgress.bestTurns })
    .from(stageProgress)
    .where(and(eq(stageProgress.playerId, playerId), eq(stageProgress.stageKey, stage.key)));

  const [row] = await tx
    .insert(stageProgress)
    .values({
      playerId,
      stageKey: stage.key,
      parentKey: stage.parentKey,
      mode: stage.mode,
      stars,
      clears: 1,
      bestTurns: turns,
      firstClearedAt: now,
      lastClearedAt: now,
    })
    .onConflictDoUpdate({
      target: [stageProgress.playerId, stageProgress.stageKey],
      set: {
        // Best ever, never latest: a sloppy re-run must not cost a star already earned.
        stars: sql`greatest(${stageProgress.stars}, ${stars})`,
        clears: sql`${stageProgress.clears} + 1`,
        bestTurns: sql`least(coalesce(${stageProgress.bestTurns}, ${turns}), ${turns})`,
        lastClearedAt: now,
      },
    })
    .returning();

  if (!row) throw new AppError('INTERNAL', 'The clear could not be recorded.');
  const firstClear = row.clears === 1;

  const bonus: Record<string, number> = {};
  if (firstClear) mergeRewards(bonus, stage.firstClearRewards);

  // A trial's par: paid the first time a clear lands at or under it, and never again.
  const par = stage.trial?.parTurns;
  const beatPar =
    par !== undefined &&
    turns <= par &&
    (previous?.bestTurns === null || previous?.bestTurns === undefined || previous.bestTurns > par);
  if (beatPar) mergeRewards(bonus, stage.trial?.parRewards ?? {});

  // Totalled once and used twice: the chest tiers are cut against it, and the goal engine
  // is told the standing so a mission asking for "3★ chapter 2" is satisfied by the total
  // rather than by having watched every star arrive.
  const chapterTotal = await starsInChapterOf(tx, playerId, stage, content);
  const chestTiers = await claimStarChests(tx, playerId, stage, content, bonus, chapterTotal);

  if (Object.keys(bonus).length > 0) {
    await payRewards(tx, playerId, bonus, `progress:${stage.key}`, knownItem(content));
  }

  return {
    stars: row.stars,
    firstClear,
    bonus,
    chestTiers,
    chapterStars: chapterTotal,
    beatPar,
    previousBest: previous?.bestTurns ?? null,
  };
}

/**
 * How many trials this account has solved inside par (C10d).
 *
 * Counted from `stage_progress` against the *published* pars rather than stored, because
 * the par is content: an operator who loosens one should find yesterday's runs already
 * counted, and one who tightens it should not have to hunt down a stored flag that has
 * become a lie.
 */
export async function trialsBeaten(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  playerId: string,
  content: ContentCache,
): Promise<number> {
  const pars = new Map(
    content
      .current()
      .bundle.stages.filter((stage) => stage.mode === 'trial' && stage.trial)
      .map((stage) => [stage.key, stage.trial!.parTurns]),
  );
  if (pars.size === 0) return 0;

  const rows = await tx
    .select({ stageKey: stageProgress.stageKey, bestTurns: stageProgress.bestTurns })
    .from(stageProgress)
    .where(and(eq(stageProgress.playerId, playerId), eq(stageProgress.mode, 'trial')));

  return rows.filter((row) => {
    const par = pars.get(row.stageKey);
    return par !== undefined && row.bestTurns !== null && row.bestTurns <= par;
  }).length;
}

/**
 * Pays any chapter star chest the new total has crossed.
 *
 * Tiers already taken are recorded rather than recomputed from the star total, because a
 * player who three-stars a chapter, then has content re-tuned under them, must not be
 * offered the same chest again.
 */
/**
 * Stars held across every difficulty of a stage's chapter.
 *
 * Totalled the way the campaign map totals them, so a chest tier and a mission goal both
 * mean what the map says they mean. `0` outside the campaign — the Depths has no chapters.
 */
async function starsInChapterOf(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  playerId: string,
  stage: StageDef,
  content: ContentCache,
): Promise<number> {
  if (stage.mode !== 'campaign') return 0;

  const chapterStages = content
    .current()
    .bundle.stages.filter(
      (entry) => entry.mode === 'campaign' && entry.parentKey === stage.parentKey,
    )
    .map((entry) => entry.key);
  if (chapterStages.length === 0) return 0;

  const [{ total } = { total: 0 }] = await tx
    .select({ total: sql<number>`coalesce(sum(${stageProgress.stars}), 0)::int` })
    .from(stageProgress)
    .where(
      and(eq(stageProgress.playerId, playerId), inArray(stageProgress.stageKey, chapterStages)),
    );
  return total;
}

async function claimStarChests(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  playerId: string,
  stage: StageDef,
  content: ContentCache,
  bonus: Record<string, number>,
  total: number,
): Promise<number[]> {
  if (stage.mode !== 'campaign') return [];

  const chapter: CampaignChapterDef | undefined = content
    .current()
    .bundle.campaignChapters.find((entry) => entry.key === stage.parentKey);
  if (!chapter || chapter.starRewards.length === 0) return [];

  const [claimRow] = await tx
    .select()
    .from(chapterRewards)
    .where(and(eq(chapterRewards.playerId, playerId), eq(chapterRewards.chapterKey, chapter.key)))
    .for('update');

  const claimed = new Set(claimRow?.claimedTiers ?? []);
  const earned = chapter.starRewards
    .filter((tier) => total >= tier.stars && !claimed.has(tier.stars))
    .sort((a, b) => a.stars - b.stars);
  if (earned.length === 0) return [];

  for (const tier of earned) {
    mergeRewards(bonus, tier.rewards);
    claimed.add(tier.stars);
  }

  const tiers = [...claimed].sort((a, b) => a - b);
  await tx
    .insert(chapterRewards)
    .values({ playerId, chapterKey: chapter.key, claimedTiers: tiers })
    .onConflictDoUpdate({
      target: [chapterRewards.playerId, chapterRewards.chapterKey],
      set: { claimedTiers: tiers, updatedAt: new Date() },
    });

  return earned.map((tier) => tier.stars);
}

/** Whether a reward's item key is still in the published catalogue. */
function knownItem(content: ContentCache): (itemKey: string) => boolean {
  const items = new Set(content.current().bundle.items.map((item) => item.key));
  return (itemKey) => items.has(itemKey);
}

/** Stars per chapter, for the campaign map's header. */
export async function chapterStars(db: Executor, playerId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      parentKey: stageProgress.parentKey,
      stars: sql<number>`coalesce(sum(${stageProgress.stars}), 0)::int`,
    })
    .from(stageProgress)
    .where(eq(stageProgress.playerId, playerId))
    .groupBy(stageProgress.parentKey);
  return new Map(rows.map((row) => [row.parentKey, row.stars]));
}
