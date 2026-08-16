import { and, eq, inArray, sql } from 'drizzle-orm';
import type { CampaignChapterDef, StageDef } from '@mistvale/shared';
import { chapterRewards, stageProgress } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { StageProgressRow } from '../../db/schema/game';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';
import { grant, type RewardBundle } from '../rewards/service';

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
 */
export function checkUnlock(
  stage: StageDef,
  playerLevel: number,
  cleared: (stageKey: string) => boolean,
  stageName: (stageKey: string) => string,
): UnlockCheck {
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
  /** Rewards paid on top of the stage's normal payout. */
  bonus: RewardBundle;
  /** Star-chest tiers this clear unlocked, if any. */
  chestTiers: number[];
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

  const bonus: RewardBundle = {};
  if (firstClear) mergeBundle(bonus, stage.firstClearRewards);

  const chestTiers = await claimStarChests(tx, playerId, stage, content, bonus);

  if (Object.keys(bonus).length > 0) {
    await grant(tx, playerId, bonus, `progress:${stage.key}`);
  }

  return { stars: row.stars, firstClear, bonus, chestTiers };
}

/**
 * Pays any chapter star chest the new total has crossed.
 *
 * Tiers already taken are recorded rather than recomputed from the star total, because a
 * player who three-stars a chapter, then has content re-tuned under them, must not be
 * offered the same chest again.
 */
async function claimStarChests(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  playerId: string,
  stage: StageDef,
  content: ContentCache,
  bonus: RewardBundle,
): Promise<number[]> {
  if (stage.mode !== 'campaign') return [];

  const bundle = content.current().bundle;
  const chapter: CampaignChapterDef | undefined = bundle.campaignChapters.find(
    (entry) => entry.key === stage.parentKey,
  );
  if (!chapter || chapter.starRewards.length === 0) return [];

  // Stars across every difficulty of the chapter — the campaign map totals them the
  // same way, so a chest tier means what the map says it means.
  const chapterStages = bundle.stages
    .filter((entry) => entry.mode === 'campaign' && entry.parentKey === chapter.key)
    .map((entry) => entry.key);

  const [{ total } = { total: 0 }] = await tx
    .select({ total: sql<number>`coalesce(sum(${stageProgress.stars}), 0)::int` })
    .from(stageProgress)
    .where(
      and(
        eq(stageProgress.playerId, playerId),
        inArray(stageProgress.stageKey, chapterStages.length > 0 ? chapterStages : ['']),
      ),
    );

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
    mergeBundle(bonus, tier.rewards);
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

/** Folds a `{silver: 500, crystals: 10}` reward record into a bundle. */
function mergeBundle(bundle: RewardBundle, rewards: Readonly<Record<string, number>>): void {
  for (const [key, amount] of Object.entries(rewards)) {
    if (typeof amount !== 'number' || amount === 0) continue;
    if (key === 'silver' || key === 'crystals' || key === 'valorMedals' || key === 'playerXp') {
      bundle[key] = (bundle[key] ?? 0) + amount;
    }
  }
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
