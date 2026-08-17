import { and, eq, inArray } from 'drizzle-orm';
import {
  QUEST_PERIODS,
  mergeRewards,
  rewardsAreEmpty,
  type FirstWinBonus,
  type GoalProgress,
  type QuestChest,
  type QuestDef,
  type QuestPeriod,
  type QuestStanding,
  type QuestsView,
} from '@mistvale/shared';
import { playerQuests, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';
import { countersFor, record as recordCounter, type DailyCounters } from '../../lib/daily-counters';
import { gameDayFrom } from '../../lib/game-day';
import * as rewards from '../rewards/service';
import { activeQuests, periodAnchor, questComplete, track } from './progress';

/**
 * Quests: the checklist, its chests, and the day's first win in each mode.
 *
 * The read is one query and the claim is one transaction, both deliberately. A screen with
 * three tabs and three meters is still one *state* — "where is this player in today" — and
 * answering it three times is how two panels end up disagreeing about whether the day has
 * turned over.
 *
 * Nothing here decides what a quest asks or pays: that is content, tracked by
 * `ProgressService` (`progress.ts`). This module only knows how to show progress and how
 * to hand over what finishing earned.
 */

type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface QuestContext {
  db: Database;
  content: ContentCache;
}

/** Modes that pay a first win of the day, and what to call them on screen. */
const MODE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  campaign: 'Campaign',
  dungeon: 'Relic keeps',
  springs: 'Essence Springs',
  proving: 'Proving Grounds',
  arena: 'Arena',
});

/** The counter name a mode's first win is recorded under. */
export const firstWinCounter = (mode: string): string => `firstWin:${mode}`;

// ── Configuration ───────────────────────────────────────────────────────────

interface QuestConfig {
  chests: Partial<Record<QuestPeriod, Record<string, number>>>;
  firstWins: Record<string, Record<string, number>>;
  unlockLevel: number;
}

export function questConfigFrom(config: Readonly<Record<string, unknown>>): QuestConfig {
  return {
    chests: asRewardsByKey(config['quests.periodChests']) as QuestConfig['chests'],
    firstWins: asRewardsByKey(config['quests.firstWinBonuses']),
    unlockLevel:
      typeof config['unlocks.questsLevel'] === 'number' ? config['unlocks.questsLevel'] : 1,
  };
}

/** Reads a `{group: {rewardKey: amount}}` config value, dropping anything malformed. */
function asRewardsByKey(value: unknown): Record<string, Record<string, number>> {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const [group, map] of Object.entries(value as Record<string, unknown>)) {
    if (typeof map !== 'object' || map === null) continue;
    const rewardMap: Record<string, number> = {};
    for (const [key, amount] of Object.entries(map as Record<string, unknown>)) {
      if (typeof amount === 'number' && Number.isFinite(amount)) rewardMap[key] = amount;
    }
    out[group] = rewardMap;
  }
  return out;
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** The whole Quests screen, in one read. */
export async function overview(
  ctx: QuestContext,
  playerId: string,
  now = new Date(),
): Promise<QuestsView> {
  const [player] = await ctx.db
    .select({
      level: players.level,
      dailyCounters: players.dailyCounters,
      dailyCountersDay: players.dailyCountersDay,
      chestClaims: players.chestClaims,
    })
    .from(players)
    .where(eq(players.id, playerId));
  if (!player) throw AppError.notFound('No such player.');

  const rows = await ctx.db.select().from(playerQuests).where(eq(playerQuests.playerId, playerId));
  return build(ctx, player, rows, now);
}

export type PlayerFacts = {
  level: number;
  dailyCounters: Record<string, number>;
  dailyCountersDay: string | null;
  chestClaims: Record<string, { anchor: string; actionId: string }>;
};

/**
 * How many things are waiting to be claimed — the dock's red pip.
 *
 * Takes the player row the caller already has and costs exactly one query, because this
 * rides on `GET /player`, which the shell re-fetches after every battle. A badge that
 * needed its own request would be a badge that is wrong for a second after every fight.
 */
export async function claimableCount(
  ctx: QuestContext,
  playerId: string,
  player: PlayerFacts,
  now = new Date(),
): Promise<number> {
  const rows = await ctx.db.select().from(playerQuests).where(eq(playerQuests.playerId, playerId));
  return build(ctx, player, rows, now).claimable;
}

function build(
  ctx: QuestContext,
  player: PlayerFacts,
  rows: (typeof playerQuests.$inferSelect)[],
  now: Date,
): QuestsView {
  const bundle = ctx.content.current().bundle;
  const settings = questConfigFrom(bundle.config);
  const unlocked = player.level >= settings.unlockLevel;
  const held = new Map(rows.map((row) => [`${row.questKey}:${row.periodAnchor}`, row]));
  const active = activeQuests({ content: ctx.content }, player.level, now);

  const quests: QuestStanding[] = active
    .map(({ def, anchor }) => {
      const row = held.get(`${def.key}:${anchor}`);
      const progress = def.goals.map((_, index) => row?.progress[index] ?? 0);
      return {
        questKey: def.key,
        periodAnchor: anchor,
        goals: def.goals.map<GoalProgress>((goal, index) => ({
          goal,
          progress: progress[index] ?? 0,
          complete: (progress[index] ?? 0) >= goal.target,
        })),
        complete: questComplete(def, progress),
        claimed: row?.claimedAt !== null && row?.claimedAt !== undefined,
        rewards: def.rewards,
      };
    })
    .sort((a, b) => sortIndex(bundle.quests, a.questKey) - sortIndex(bundle.quests, b.questKey));

  const chests: QuestChest[] = QUEST_PERIODS.flatMap((period) => {
    const chestRewards = settings.chests[period];
    // A period with no chest configured has no chest — reported by its absence rather than
    // by an empty meter nobody can fill.
    if (!chestRewards || rewardsAreEmpty(chestRewards)) return [];

    const counting = active.filter(({ def }) => def.period === period && def.countsTowardChest);
    const claimedQuests = counting.filter(
      ({ def, anchor }) => held.get(`${def.key}:${anchor}`)?.claimedAt,
    ).length;
    const anchor = periodAnchor(period, bundle.config, now);
    const claimed = player.chestClaims[period]?.anchor === anchor;

    return [
      {
        period,
        claimedQuests,
        required: counting.length,
        rewards: chestRewards,
        // Claimed *quests*, not merely completed ones: the chest is the reward for
        // finishing the list, and a list finished but not collected is not finished.
        claimable: unlocked && !claimed && counting.length > 0 && claimedQuests >= counting.length,
        claimed,
      },
    ];
  });

  const counters = countersFor(player, bundle.config, now);
  const firstWins: FirstWinBonus[] = Object.entries(settings.firstWins)
    .filter(([, reward]) => !rewardsAreEmpty(reward))
    .map(([mode, reward]) => ({
      mode,
      label: MODE_LABELS[mode] ?? mode,
      claimed: (counters.used[firstWinCounter(mode)] ?? 0) > 0,
      rewards: reward,
      lockedReason: lockedReasonFor(ctx, mode, player.level),
    }));

  const claimable =
    (unlocked ? quests.filter((quest) => quest.complete && !quest.claimed).length : 0) +
    chests.filter((chest) => chest.claimable).length;

  return {
    today: gameDayFrom(bundle.config, now).date,
    dailyResetAt: nextResetAt(bundle.config, now).toISOString(),
    weekAnchor: periodAnchor('weekly', bundle.config, now),
    monthAnchor: periodAnchor('monthly', bundle.config, now),
    quests,
    chests,
    firstWins,
    claimable,
  };
}

function sortIndex(defs: readonly QuestDef[], key: string): number {
  const def = defs.find((entry) => entry.key === key);
  return def ? def.sortOrder : Number.MAX_SAFE_INTEGER;
}

/**
 * Why a mode's first win is out of reach, phrased for the player.
 *
 * Only the two level gates the config actually knows about; a mode gated by progress
 * rather than by level (a keep that wants a chapter cleared) reports nothing, because
 * "locked" without a reason is worse than no badge at all.
 */
function lockedReasonFor(ctx: QuestContext, mode: string, level: number): string | null {
  const config = ctx.content.current().bundle.config;
  const gate = mode === 'arena' ? config['unlocks.arenaLevel'] : null;
  if (typeof gate === 'number' && level < gate) {
    return `Opens at account level ${gate}.`;
  }
  return null;
}

/** The instant the current game-day ends — what a "resets in" line counts down to. */
export function nextResetAt(config: Readonly<Record<string, unknown>>, now: Date): Date {
  // Walk forward in hours from now until the game-day changes. The reset hour is read in
  // an operator-chosen timezone whose offset can shift under daylight saving, so stepping
  // and re-asking `gameDayFrom` is right where arithmetic on the offset would be wrong
  // twice a year.
  const today = gameDayFrom(config, now).date;
  const probe = new Date(now.getTime());
  for (let hour = 0; hour < 26; hour += 1) {
    probe.setTime(probe.getTime() + 60 * 60 * 1000);
    if (gameDayFrom(config, probe).date !== today) {
      // Found the hour it turns over; walk back down to the minute.
      const minute = new Date(probe.getTime() - 60 * 60 * 1000);
      for (let step = 0; step < 60; step += 1) {
        minute.setTime(minute.getTime() + 60 * 1000);
        if (gameDayFrom(config, minute).date !== today) return minute;
      }
      return probe;
    }
  }
  return probe;
}

// ── Claiming ────────────────────────────────────────────────────────────────

export interface ClaimResult {
  paid: Record<string, number>;
  levelsGained: number;
  quests: QuestsView;
}

/** Pays one finished quest. */
export async function claim(
  ctx: QuestContext,
  playerId: string,
  questKey: string,
  actionId: string,
  now = new Date(),
): Promise<ClaimResult> {
  return ctx.db.transaction(async (tx) => {
    const player = await lockPlayer(tx, playerId);
    assertUnlocked(ctx, player.level);

    const bundle = ctx.content.current().bundle;
    const def = bundle.quests.find((entry) => entry.key === questKey);
    if (!def || !def.active) throw AppError.notFound('No such quest.');
    if (player.level < def.unlockLevel) {
      throw new AppError('LOCKED_CONTENT', `That quest opens at account level ${def.unlockLevel}.`);
    }

    const anchor = periodAnchor(def.period, bundle.config, now);
    const [row] = await tx
      .select()
      .from(playerQuests)
      .where(
        and(
          eq(playerQuests.playerId, playerId),
          eq(playerQuests.questKey, questKey),
          eq(playerQuests.periodAnchor, anchor),
        ),
      );

    if (row?.claimActionId === actionId) {
      // A retried claim: pay nothing again, and answer with what it paid the first time.
      return finish(ctx, tx, playerId, def.rewards, 0, now);
    }
    if (row?.claimedAt) throw new AppError('ALREADY_EXISTS', 'That one is already claimed.');
    if (!row || !questComplete(def, row.progress)) {
      throw new AppError('VALIDATION', 'That quest is not finished yet.');
    }

    await tx
      .update(playerQuests)
      .set({ claimedAt: now, claimActionId: actionId, updatedAt: now })
      .where(eq(playerQuests.id, row.id));

    const paid = await rewards.payRewards(
      tx,
      playerId,
      def.rewards,
      `quest:${questKey}`,
      knownItem(ctx),
    );

    // Reported after the row is marked, so a listener that reads quests back sees this one
    // claimed. Nothing in the quest set counts it — a quest that advanced on quest claims
    // could advance itself — but the tutorial's "claim your first one" step does, and so
    // could a future event.
    await track(tx, { content: ctx.content }, playerId, [
      { type: 'questClaim', facts: { period: def.period } },
    ]);

    return finish(ctx, tx, playerId, paid.applied, paid.levelsGained, now);
  });
}

/**
 * Pays a period's completion chest.
 *
 * This is also where `claimAllDailies` is reported, which is what the "claim a full day of
 * quests five times" weekly counts. It is reported on the *chest*, not on the last quest,
 * because the chest is the thing that means "the day was finished".
 */
export async function claimChest(
  ctx: QuestContext,
  playerId: string,
  period: QuestPeriod,
  actionId: string,
  now = new Date(),
): Promise<ClaimResult> {
  return ctx.db.transaction(async (tx) => {
    const player = await lockPlayer(tx, playerId);
    assertUnlocked(ctx, player.level);

    const bundle = ctx.content.current().bundle;
    const settings = questConfigFrom(bundle.config);
    const chestRewards = settings.chests[period];
    if (!chestRewards || rewardsAreEmpty(chestRewards)) {
      throw AppError.notFound('That period has no chest.');
    }

    const anchor = periodAnchor(period, bundle.config, now);
    const previous = player.chestClaims[period];
    if (previous?.anchor === anchor && previous.actionId === actionId) {
      return finish(ctx, tx, playerId, chestRewards, 0, now);
    }
    if (previous?.anchor === anchor) {
      throw new AppError('ALREADY_EXISTS', 'That chest is already claimed.');
    }

    const counting = activeQuests({ content: ctx.content }, player.level, now).filter(
      ({ def }) => def.period === period && def.countsTowardChest,
    );
    if (counting.length === 0) throw new AppError('VALIDATION', 'There is nothing to finish.');

    const claimedRows = await tx
      .select({ questKey: playerQuests.questKey, claimedAt: playerQuests.claimedAt })
      .from(playerQuests)
      .where(
        and(
          eq(playerQuests.playerId, playerId),
          eq(playerQuests.periodAnchor, anchor),
          inArray(
            playerQuests.questKey,
            counting.map(({ def }) => def.key),
          ),
        ),
      );
    const claimedCount = claimedRows.filter((row) => row.claimedAt).length;
    if (claimedCount < counting.length) {
      throw new AppError(
        'VALIDATION',
        `Claim all ${counting.length} first — ${claimedCount} so far.`,
      );
    }

    await tx
      .update(players)
      .set({
        chestClaims: { ...player.chestClaims, [period]: { anchor, actionId } },
        updatedAt: now,
      })
      .where(eq(players.id, playerId));

    const paid = await rewards.payRewards(
      tx,
      playerId,
      chestRewards,
      `quest:chest:${period}`,
      knownItem(ctx),
    );

    // Only the daily chest reports: "claim a full day of quests" is what the weeklies and
    // monthlies are built on, and a weekly chest reporting the same event would let the
    // weekly advance itself.
    if (period === 'daily') {
      await track(tx, { content: ctx.content }, playerId, [{ type: 'claimAllDailies' }], { now });
    }

    return finish(ctx, tx, playerId, paid.applied, paid.levelsGained, now);
  });
}

// ── The day's first win ─────────────────────────────────────────────────────

/**
 * Pays the day's first victory in a mode, if it has not been paid yet.
 *
 * Called from the battle settle path, inside its transaction. There is no claim and no
 * screen action: the bonus lands with the win, which is what makes it a reason to open the
 * game rather than one more thing to remember to collect (GAME_DESIGN §15.6).
 *
 * Uses the same stamped daily-counter map as every other per-day allowance, so it needs no
 * reset job and an account away for a month is current the moment it returns.
 *
 * Reads the player row *locked*, and reads it here rather than taking it as an argument.
 * The counter map is a read-modify-write over a shared jsonb column, so two wins landing
 * together would otherwise both see the counter at zero and both pay — and the whole point
 * of this bonus is that it is paid once.
 */
export async function awardFirstWin(
  tx: Executor,
  ctx: { content: ContentCache },
  playerId: string,
  mode: string,
  now = new Date(),
): Promise<Record<string, number>> {
  const bundle = ctx.content.current().bundle;
  const bonus = questConfigFrom(bundle.config).firstWins[mode];
  if (!bonus || rewardsAreEmpty(bonus)) return {};

  const [player] = await tx
    .select({
      dailyCounters: players.dailyCounters,
      dailyCountersDay: players.dailyCountersDay,
    })
    .from(players)
    .where(eq(players.id, playerId))
    .for('update');
  if (!player) return {};

  const counters: DailyCounters = countersFor(player, bundle.config, now);
  const counter = firstWinCounter(mode);
  if ((counters.used[counter] ?? 0) > 0) return {};

  await recordCounter(tx, playerId, counters, counter, 1);
  const paid = await rewards.payRewards(tx, playerId, bonus, `quest:firstWin:${mode}`, (itemKey) =>
    bundle.items.some((item) => item.key === itemKey),
  );
  return paid.applied;
}

// ── Shared bits ─────────────────────────────────────────────────────────────

async function lockPlayer(tx: Executor, playerId: string): Promise<PlayerFacts> {
  const [player] = await tx
    .select({
      level: players.level,
      dailyCounters: players.dailyCounters,
      dailyCountersDay: players.dailyCountersDay,
      chestClaims: players.chestClaims,
    })
    .from(players)
    .where(eq(players.id, playerId))
    .for('update');
  if (!player) throw AppError.notFound('No such player.');
  return player;
}

function assertUnlocked(ctx: QuestContext, level: number): void {
  const gate = questConfigFrom(ctx.content.current().bundle.config).unlockLevel;
  if (level < gate) {
    throw new AppError('LOCKED_CONTENT', `Quests open at account level ${gate}.`);
  }
}

/** Re-reads the whole screen inside the claim's own transaction, so it cannot be stale. */
async function finish(
  ctx: QuestContext,
  tx: Executor,
  playerId: string,
  paid: Record<string, number>,
  levelsGained: number,
  now: Date,
): Promise<ClaimResult> {
  const [player] = await tx
    .select({
      level: players.level,
      dailyCounters: players.dailyCounters,
      dailyCountersDay: players.dailyCountersDay,
      chestClaims: players.chestClaims,
    })
    .from(players)
    .where(eq(players.id, playerId));
  if (!player) throw AppError.notFound('No such player.');

  const rows = await tx.select().from(playerQuests).where(eq(playerQuests.playerId, playerId));
  const applied: Record<string, number> = {};
  mergeRewards(applied, paid);

  return { paid: applied, levelsGained, quests: build(ctx, player, rows, now) };
}

/** Whether a reward's item key is still in the published catalogue. */
function knownItem(ctx: QuestContext): (itemKey: string) => boolean {
  const items = new Set(ctx.content.current().bundle.items.map((item) => item.key));
  return (itemKey) => items.has(itemKey);
}
