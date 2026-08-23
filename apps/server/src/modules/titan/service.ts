import { and, eq } from 'drizzle-orm';
import type { BattleEvent } from '@mistvale/engine';
import {
  type DungeonDef,
  type StageDef,
  type Titan,
  type TitanRules,
  type TitanRun,
  type TitanStanding,
  tierFor,
  titanCounter,
} from '@mistvale/shared';
import { players, titanRecords } from '../../db/schema/index';
import type { Database } from '../../db/client';
import { AppError } from '../../lib/errors';
import type { ContentCache } from '../../content/cache';
import {
  countersFor,
  record as recordUse,
  remaining,
  type DailyCounters,
} from '../../lib/daily-counters';
import { damageDealtTo } from './damage';

/**
 * The Solo Titan.
 *
 * A run is an ordinary battle — the same engine, the same route, the same playback, the
 * same Auto and speed and reload-mid-fight — so almost nothing about *fighting* one lives
 * here. What lives here are the three things that make it a different mode:
 *
 *  - **Keys instead of energy.** A few a day per keep, spent when the fight opens and gone
 *    whatever happens to it, because an attempt is the resource.
 *  - **The turn cap is the Titan's.** A campaign stage ends when a side is gone; a Titan
 *    is authored to outlast anybody, so its own `turnCap` replaces `combat.maxTurns` for
 *    the run and the ordinary ending is `turnLimit`.
 *  - **Paid on damage, on any ending.** Victory, defeat and the cap all pay the rung the
 *    run reached. A run that ends badly still pays; a run that ends slightly better pays
 *    slightly better, which is the whole feedback loop of the mode.
 *
 * Everything a screen shows is computed here, so the ladder a player is looking at and the
 * payout the server will make are one rule read twice rather than two rules.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** A published Titan: the keep, its rules and the single stage it is fought on. */
export interface TitanKeep {
  dungeon: DungeonDef;
  rules: TitanRules;
  stage: StageDef;
}

/**
 * Every published Titan, paired with the stage it is fought on.
 *
 * A keep with no stage is skipped rather than thrown over: content is edited live, and a
 * half-published Titan should take its own tile off the screen, not the screen down.
 */
export function keeps(content: ContentCache): TitanKeep[] {
  const bundle = content.current().bundle;
  const found: TitanKeep[] = [];
  for (const dungeon of bundle.dungeons) {
    if (dungeon.kind !== 'titan' || !dungeon.titan) continue;
    const stage = bundle.stages.find(
      (candidate: StageDef) => candidate.mode === 'titan' && candidate.parentKey === dungeon.key,
    );
    if (!stage) continue;
    found.push({ dungeon, rules: dungeon.titan, stage });
  }
  return found;
}

/** The keep a titan stage belongs to, or null when the stage is not a Titan's. */
export function keepForStage(content: ContentCache, stage: StageDef): TitanKeep | null {
  if (stage.mode !== 'titan') return null;
  return keeps(content).find((keep) => keep.stage.key === stage.key) ?? null;
}

// ── Records ─────────────────────────────────────────────────────────────────

export interface TitanRecord {
  bestDamage: number;
  bestTierKey: string | null;
  lastDamage: number;
  runs: number;
}

const NO_RECORD: TitanRecord = Object.freeze({
  bestDamage: 0,
  bestTierKey: null,
  lastDamage: 0,
  runs: 0,
});

/** What this account has managed against each keep, keyed by dungeon. */
export async function recordsFor(
  db: Executor,
  playerId: string,
): Promise<Map<string, TitanRecord>> {
  const rows = await db.select().from(titanRecords).where(eq(titanRecords.playerId, playerId));
  return new Map(
    rows.map((row) => [
      row.dungeonKey,
      {
        bestDamage: row.bestDamage,
        bestTierKey: row.bestTierKey,
        lastDamage: row.lastDamage,
        runs: row.runs,
      },
    ]),
  );
}

// ── The screen's read ───────────────────────────────────────────────────────

export interface TitanContext {
  playerId: string;
  level: number;
  dailyCounters: Record<string, number>;
  dailyCountersDay: string | null;
}

/**
 * Every Titan as the screen reads it: open or shut and why, keys left, the ladder, and
 * this account's own record against it.
 */
export async function overview(
  db: Executor,
  content: ContentCache,
  player: TitanContext,
  now: Date,
): Promise<Titan> {
  const config = content.current().bundle.config;
  const counters = countersFor(player, config, now);
  const records = await recordsFor(db, player.playerId);

  const titans: TitanStanding[] = keeps(content).map(({ dungeon, rules, stage }) => {
    const held = records.get(dungeon.key) ?? NO_RECORD;
    const open = player.level >= dungeon.unlockLevel;
    return {
      dungeonKey: dungeon.key,
      stageKey: stage.key,
      open,
      lockedReason: open ? null : `Opens at account level ${dungeon.unlockLevel}.`,
      keysLeft: remaining(counters, titanCounter(dungeon.key), rules.keysPerDay),
      keysPerDay: rules.keysPerDay,
      turnCap: rules.turnCap,
      bestDamage: held.bestDamage,
      bestTierKey: held.bestTierKey,
      lastDamage: held.lastDamage,
      runs: held.runs,
      tiers: rules.tiers.map((tier) => ({
        key: tier.key,
        name: tier.name,
        damage: tier.damage,
        rewards: tier.rewards,
        // Against the best ever rather than the last run: a rung once reached stays
        // reached, which is what makes the ladder a record of progress.
        reached: held.bestDamage >= tier.damage,
      })),
    };
  });

  return { today: counters.day, titans };
}

// ── Opening a run ───────────────────────────────────────────────────────────

/**
 * Refuses a run the player cannot take, and spends the key for the one they can.
 *
 * Called from inside `battle.start`'s transaction, under the player-row lock it already
 * holds — which is what stops two taps on a flaky connection from spending one key twice.
 *
 * The key is spent when the fight *opens*, not when it ends. A Titan run that is retreated
 * out of, or abandoned by closing the tab, has still been an attempt; refunding it would
 * make retreat a free look at the boss's opening moves.
 */
export async function spendKey(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  content: ContentCache,
  player: TitanContext,
  keep: TitanKeep,
  now: Date,
): Promise<void> {
  if (player.level < keep.dungeon.unlockLevel) {
    throw new AppError(
      'LOCKED_CONTENT',
      `${keep.dungeon.name} opens at account level ${keep.dungeon.unlockLevel}.`,
    );
  }
  const counters = countersFor(player, content.current().bundle.config, now);
  const left = remaining(counters, titanCounter(keep.dungeon.key), keep.rules.keysPerDay);
  if (left < 1) {
    throw new AppError('COOLDOWN', 'No keys left today. They come back with the daily reset.');
  }
  await recordUse(tx, player.playerId, counters, titanCounter(keep.dungeon.key), 1);
}

// ── Settling a run ──────────────────────────────────────────────────────────

/**
 * Scores a finished run and writes the record.
 *
 * Returns what the run was worth, for the results screen; the caller grants the rewards,
 * because every payout in the game goes through `RewardService` and this module is not
 * about to become a second one.
 */
export async function settleRun(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  playerId: string,
  keep: TitanKeep,
  events: readonly BattleEvent[],
  counters: DailyCounters,
): Promise<TitanRun> {
  const now = new Date();
  const damage = damageDealtTo(events, 'enemy');
  const tier = tierFor(damage, keep.rules.tiers);

  const [existing] = await tx
    .select()
    .from(titanRecords)
    .where(and(eq(titanRecords.playerId, playerId), eq(titanRecords.dungeonKey, keep.dungeon.key)));

  const previousBest = existing?.bestDamage ?? 0;
  const personalBest = damage > previousBest;
  // The rung on the record is the rung the *record run* reached, so a worse run afterwards
  // does not demote it. Only a new best moves it.
  const bestTierKey = personalBest ? (tier?.key ?? null) : (existing?.bestTierKey ?? null);

  if (existing) {
    await tx
      .update(titanRecords)
      .set({
        bestDamage: Math.max(previousBest, damage),
        bestTierKey,
        lastDamage: damage,
        runs: existing.runs + 1,
        updatedAt: now,
      })
      .where(eq(titanRecords.id, existing.id));
  } else {
    await tx.insert(titanRecords).values({
      playerId,
      dungeonKey: keep.dungeon.key,
      bestDamage: damage,
      bestTierKey: tier?.key ?? null,
      lastDamage: damage,
      runs: 1,
    });
  }

  return {
    dungeonKey: keep.dungeon.key,
    damage,
    tierKey: tier?.key ?? null,
    tierName: tier?.name ?? null,
    rewards: tier?.rewards ?? {},
    personalBest,
    previousBest,
    // The key was spent when the run opened, so what is left is what the counters already
    // say — read from the row rather than re-queried, so the results screen and the Titan
    // screen agree without a second round trip.
    keysLeft: remaining(counters, titanCounter(keep.dungeon.key), keep.rules.keysPerDay),
  };
}

/** The counters a settle needs, read under the caller's lock. */
export async function countersOf(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  content: ContentCache,
  playerId: string,
  now: Date,
): Promise<DailyCounters> {
  const [row] = await tx
    .select({
      dailyCounters: players.dailyCounters,
      dailyCountersDay: players.dailyCountersDay,
    })
    .from(players)
    .where(eq(players.id, playerId));
  return countersFor(
    { dailyCounters: row?.dailyCounters ?? {}, dailyCountersDay: row?.dailyCountersDay ?? null },
    content.current().bundle.config,
    now,
  );
}
