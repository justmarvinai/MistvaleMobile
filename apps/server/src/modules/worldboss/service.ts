import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { BattleEvent } from '@mistvale/engine';
import {
  NO_WORLD_BOSS,
  UNLOCK_LEVELS,
  claimsCloseOn,
  eventWindowAt,
  nextWindowStart,
  nextWorldBossTier,
  tiersReached,
  worldBossCounter,
  type DungeonDef,
  type EventWindow,
  type StageDef,
  type WorldBossRules,
  type WorldBossStanding,
  type WorldBossStrike,
  type WorldBossStriker,
  type WorldBossView,
} from '@mistvale/shared';
import { playerWorldBoss, players, worldBossWakes } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';
import { gameDayFrom } from '../../lib/game-day';
import {
  countersFor,
  record as recordUse,
  remaining,
  type DailyCounters,
} from '../../lib/daily-counters';
import { damageDealtTo } from '../titan/damage';

/**
 * The Wurm Wakes: one health pool, shared by everybody on the server.
 *
 * Almost nothing about *fighting* it lives here — a strike is an ordinary battle through
 * the ordinary route, exactly as a Titan run is. What lives here is the one thing Mistvale
 * has never had: a number that belongs to the server rather than to an account, and the
 * arithmetic that keeps it honest when several people hit it at once.
 *
 * **Why `damage_taken` counts up.** A strike is `damage_taken = damage_taken + $1`, one
 * atomic statement. Nothing reads the pool, decides a new value and writes it back, so
 * there is no window for two strikes to land on the same number and one of them to vanish
 * — which is the failure this whole feature would otherwise be made of, and the reason
 * nobody needs Redis or a lock held across a battle.
 *
 * **The wake row is created lazily**, by the first strike or the first read of a live
 * window. There is no job that opens one on Friday: the schedule is derived from the clock
 * like everything else, and a server that was down all weekend comes back correct.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** How many names the board shows. Enough to be a board, few enough to be one query. */
const BOARD_SIZE = 10;

export interface WorldBossKeep {
  dungeon: DungeonDef;
  rules: WorldBossRules;
  stage: StageDef;
}

/**
 * Every published world boss, paired with the stage it is struck on.
 *
 * A keep with no stage is skipped rather than thrown over: content is edited live, and a
 * half-published boss should take its own tile off the screen, not the screen down.
 */
export function keeps(content: ContentCache): WorldBossKeep[] {
  const bundle = content.current().bundle;
  const found: WorldBossKeep[] = [];
  for (const dungeon of bundle.dungeons) {
    if (dungeon.kind !== 'worldBoss' || !dungeon.worldBoss) continue;
    const stage = bundle.stages.find(
      (candidate: StageDef) =>
        candidate.mode === 'worldBoss' && candidate.parentKey === dungeon.key,
    );
    if (!stage) continue;
    found.push({ dungeon, rules: dungeon.worldBoss, stage });
  }
  return found;
}

/** The keep a `worldBoss` stage belongs to, or null when the stage is not one. */
export function keepForStage(content: ContentCache, stage: StageDef): WorldBossKeep | null {
  if (stage.mode !== 'worldBoss') return null;
  return keeps(content).find((keep) => keep.stage.key === stage.key) ?? null;
}

// ── When it is awake ────────────────────────────────────────────────────────

export interface WakeWindow {
  window: EventWindow;
  /** True while it can still be struck. False during the claim grace that follows. */
  live: boolean;
}

/**
 * The wake a boss is in, or the one that has just closed and still owes somebody something.
 *
 * The second half is not a nicety. A warden who spent their last strike on Sunday evening
 * and opened the game on Monday must still be able to collect what they earned — the work
 * was done, and taking it back over a scheduling boundary is how you teach people not to
 * turn up next week.
 */
export function wakeAt(
  rules: WorldBossRules,
  config: Readonly<Record<string, unknown>>,
  now: Date,
): WakeWindow | null {
  const day = gameDayFrom(config, now);

  const live = eventWindowAt(rules.schedule, day.date, day.weekday, now);
  if (live) return { window: live, live: true };

  // Not awake. Walk back a day at a time through the grace period and ask the same
  // question of each — which finds the occurrence that just closed without needing a
  // second, subtly different piece of schedule arithmetic to keep in step with the first.
  for (let back = 1; back <= rules.claimGraceDays; back += 1) {
    const past = new Date(now.getTime() - back * 24 * 60 * 60 * 1000);
    const pastDay = gameDayFrom(config, past);
    const window = eventWindowAt(rules.schedule, pastDay.date, pastDay.weekday, past);
    if (window && day.date <= claimsCloseOn(window, rules.claimGraceDays)) {
      return { window, live: false };
    }
  }
  return null;
}

// ── The shared row ──────────────────────────────────────────────────────────

interface WakeRow {
  id: string;
  maxHp: number;
  damageTaken: number;
  felledAt: Date | null;
  strikes: number;
  wardens: number;
}

const EMPTY_WAKE = (maxHp: number): WakeRow => ({
  id: '',
  maxHp,
  damageTaken: 0,
  felledAt: null,
  strikes: 0,
  wardens: 0,
});

/** Reads a wake without creating one — what the screen does. */
async function readWake(
  db: Executor,
  dungeonKey: string,
  anchor: string,
  maxHp: number,
): Promise<WakeRow> {
  const [row] = await db
    .select()
    .from(worldBossWakes)
    .where(and(eq(worldBossWakes.dungeonKey, dungeonKey), eq(worldBossWakes.anchor, anchor)));
  return row
    ? {
        id: row.id,
        maxHp: row.maxHp,
        damageTaken: row.damageTaken,
        felledAt: row.felledAt,
        strikes: row.strikes,
        wardens: row.wardens,
      }
    : EMPTY_WAKE(maxHp);
}

/**
 * The wake row, created if this is the first anybody has touched it.
 *
 * `maxHp` is copied onto the row at creation rather than read from content on every strike,
 * so an operator who retunes the boss mid-week moves *next* week's bar rather than the one
 * wardens are already looking at. A bar that jumps is a bar nobody trusts.
 *
 * `onConflictDoNothing` plus a re-read is the whole concurrency story: two first strikes
 * racing both try to insert, one wins, and both then read the same row.
 */
async function openWake(tx: Tx, keep: WorldBossKeep, anchor: string): Promise<WakeRow> {
  await tx
    .insert(worldBossWakes)
    .values({ dungeonKey: keep.dungeon.key, anchor, maxHp: keep.rules.maxHp })
    .onConflictDoNothing();
  return readWake(tx, keep.dungeon.key, anchor, keep.rules.maxHp);
}

// ── What one account has done ───────────────────────────────────────────────

export interface Contribution {
  damage: number;
  strikes: number;
  claimedTiers: string[];
  spoilsClaimed: boolean;
}

const NO_CONTRIBUTION: Contribution = Object.freeze({
  damage: 0,
  strikes: 0,
  claimedTiers: [],
  spoilsClaimed: false,
});

async function contributionOf(
  db: Executor,
  playerId: string,
  dungeonKey: string,
  anchor: string,
): Promise<Contribution> {
  const [row] = await db
    .select()
    .from(playerWorldBoss)
    .where(
      and(
        eq(playerWorldBoss.playerId, playerId),
        eq(playerWorldBoss.dungeonKey, dungeonKey),
        eq(playerWorldBoss.anchor, anchor),
      ),
    );
  return row
    ? {
        damage: row.damage,
        strikes: row.strikes,
        claimedTiers: row.claimedTiers,
        spoilsClaimed: row.spoilsClaimed,
      }
    : NO_CONTRIBUTION;
}

/**
 * The top of the board, plus the reader's own row when they are off the end of it.
 *
 * The whole social layer of the game, and deliberately thin: a name and a number. There is
 * nothing to join, nothing to schedule and nobody to talk to — what makes the vale feel
 * populated is seeing that other people were here, not being able to message them.
 */
async function boardFor(
  db: Executor,
  dungeonKey: string,
  anchor: string,
  playerId: string,
): Promise<{ board: WorldBossStriker[]; yourRank: number | null }> {
  const rows = await db
    .select({
      playerId: playerWorldBoss.playerId,
      damage: playerWorldBoss.damage,
      profileName: players.profileName,
    })
    .from(playerWorldBoss)
    .innerJoin(players, eq(players.id, playerWorldBoss.playerId))
    .where(
      and(
        eq(playerWorldBoss.dungeonKey, dungeonKey),
        eq(playerWorldBoss.anchor, anchor),
        gt(playerWorldBoss.damage, 0),
      ),
    )
    .orderBy(desc(playerWorldBoss.damage))
    .limit(BOARD_SIZE);

  const board: WorldBossStriker[] = rows.map((row, index) => ({
    profileName: row.profileName,
    damage: row.damage,
    rank: index + 1,
    you: row.playerId === playerId,
  }));

  const mine = board.find((entry) => entry.you);
  if (mine) return { board, yourRank: mine.rank };

  // Off the end of the board: one counting query for the rank rather than reading every
  // row, and the reader's own line appended so they can see where they stand.
  const [own] = await db
    .select({ damage: playerWorldBoss.damage })
    .from(playerWorldBoss)
    .where(
      and(
        eq(playerWorldBoss.playerId, playerId),
        eq(playerWorldBoss.dungeonKey, dungeonKey),
        eq(playerWorldBoss.anchor, anchor),
      ),
    );
  if (!own || own.damage <= 0) return { board, yourRank: null };

  const [ahead] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(playerWorldBoss)
    .where(
      and(
        eq(playerWorldBoss.dungeonKey, dungeonKey),
        eq(playerWorldBoss.anchor, anchor),
        gt(playerWorldBoss.damage, own.damage),
      ),
    );
  return { board, yourRank: (ahead?.count ?? 0) + 1 };
}

// ── The screen's read ───────────────────────────────────────────────────────

export interface WorldBossPlayer {
  playerId: string;
  level: number;
  dailyCounters: Record<string, number>;
  dailyCountersDay: string | null;
}

/**
 * Why a boss cannot be struck right now, phrased for the button.
 *
 * One function so the sentence the screen shows and the sentence the server refuses with
 * are the same sentence — the rule this project applies everywhere a door can be shut.
 */
export function blockedReason(
  keep: WorldBossKeep,
  wake: WakeWindow | null,
  row: WakeRow,
  attemptsLeft: number,
  level: number,
): string | null {
  if (level < keep.dungeon.unlockLevel) {
    return `Opens at account level ${keep.dungeon.unlockLevel}.`;
  }
  if (!wake) return 'It is not awake yet.';
  if (!wake.live) return 'The wake is over. What you earned is still yours to collect.';
  if (row.damageTaken >= row.maxHp) return 'It has fallen. Nothing left to strike.';
  if (attemptsLeft < 1) return 'No strikes left today. They come back with the daily reset.';
  return null;
}

export async function overview(
  db: Executor,
  content: ContentCache,
  player: WorldBossPlayer,
  now: Date,
): Promise<WorldBossView> {
  const config = content.current().bundle.config;
  const counters = countersFor(player, config, now);
  if (player.level < UNLOCK_LEVELS.worldBoss) return { ...NO_WORLD_BOSS, today: counters.day };

  const bosses: WorldBossStanding[] = [];
  for (const keep of keeps(content)) {
    const wake = wakeAt(keep.rules, config, now);
    const anchor = wake?.window.anchor ?? null;
    const row = anchor
      ? await readWake(db, keep.dungeon.key, anchor, keep.rules.maxHp)
      : EMPTY_WAKE(keep.rules.maxHp);
    const mine = anchor
      ? await contributionOf(db, player.playerId, keep.dungeon.key, anchor)
      : NO_CONTRIBUTION;
    const { board, yourRank } = anchor
      ? await boardFor(db, keep.dungeon.key, anchor, player.playerId)
      : { board: [] as WorldBossStriker[], yourRank: null };

    const attemptsLeft = remaining(
      counters,
      worldBossCounter(keep.dungeon.key),
      keep.rules.attemptsPerDay,
    );
    const claimed = new Set(mine.claimedTiers);

    bosses.push({
      dungeonKey: keep.dungeon.key,
      stageKey: keep.stage.key,
      name: keep.dungeon.name,
      tagline: keep.dungeon.tagline,
      lore: keep.dungeon.lore,

      anchor,
      awake: wake?.live === true,
      startsOn: wake?.window.startsOn ?? null,
      endsOn: wake?.window.endsOn ?? null,
      claimsCloseOn: wake ? claimsCloseOn(wake.window, keep.rules.claimGraceDays) : null,
      wakesOn: wake?.live
        ? null
        : nextWindowStart(keep.rules.schedule, counters.day, gameDayFrom(config, now).weekday, now),

      maxHp: row.maxHp,
      damageTaken: Math.min(row.damageTaken, row.maxHp),
      felled: row.damageTaken >= row.maxHp && row.id !== '',
      felledAt: row.felledAt?.toISOString() ?? null,

      wardens: row.wardens,
      strikes: row.strikes,

      yourDamage: mine.damage,
      yourStrikes: mine.strikes,
      yourRank,

      attemptsLeft,
      attemptsPerDay: keep.rules.attemptsPerDay,
      turnCap: keep.rules.turnCap,

      tiers: keep.rules.tiers.map((tier) => ({
        key: tier.key,
        name: tier.name,
        damage: tier.damage,
        rewards: tier.rewards,
        reached: mine.damage >= tier.damage,
        claimed: claimed.has(tier.key),
      })),
      fellingRewards: keep.rules.fellingRewards,
      fellingClaimed: mine.spoilsClaimed,

      board,
      blockedReason: blockedReason(keep, wake, row, attemptsLeft, player.level),
    });
  }

  return { today: counters.day, bosses };
}

/** The next rung an account has not reached, for the screen's "so close" line. */
export function nextRung(keep: WorldBossKeep, damage: number) {
  return nextWorldBossTier(damage, keep.rules.tiers);
}

// ── Opening a strike ────────────────────────────────────────────────────────

/**
 * Refuses a strike the player cannot take, and spends the attempt for the one they can.
 *
 * Called from inside `battle.start`'s transaction, under the player-row lock it already
 * holds — which is what stops two taps on a flaky connection from spending one attempt
 * twice. The attempt is spent when the fight *opens*: a strike retreated from has still
 * been an attempt, and refunding it would make retreat a free look at the boss.
 */
export async function spendStrike(
  tx: Tx,
  content: ContentCache,
  player: WorldBossPlayer,
  keep: WorldBossKeep,
  now: Date,
): Promise<void> {
  const config = content.current().bundle.config;
  const counters = countersFor(player, config, now);
  const wake = wakeAt(keep.rules, config, now);
  const anchor = wake?.window.anchor ?? null;
  const row = anchor
    ? await readWake(tx, keep.dungeon.key, anchor, keep.rules.maxHp)
    : EMPTY_WAKE(keep.rules.maxHp);
  const attemptsLeft = remaining(
    counters,
    worldBossCounter(keep.dungeon.key),
    keep.rules.attemptsPerDay,
  );

  const refusal = blockedReason(keep, wake, row, attemptsLeft, player.level);
  if (refusal) {
    // A shut door and an empty allowance are different failures, and a client that retries
    // on a cooldown must not retry on a level gate.
    const code =
      player.level < keep.dungeon.unlockLevel
        ? 'LOCKED_CONTENT'
        : attemptsLeft < 1
          ? 'COOLDOWN'
          : 'VALIDATION';
    throw new AppError(code, refusal);
  }

  await recordUse(tx, player.playerId, counters, worldBossCounter(keep.dungeon.key), 1);
}

// ── Settling a strike ───────────────────────────────────────────────────────

/**
 * Folds a finished strike into the shared pool and the striker's own total.
 *
 * The two writes are one transaction — the caller's — so a strike either counts for both
 * or for neither. Nothing is granted here: every payout in the game goes through
 * `RewardService`, and the contribution ladder is *claimed* rather than paid on the spot,
 * because a rung is about the week rather than about this fight.
 */
export async function settleStrike(
  tx: Tx,
  content: ContentCache,
  playerId: string,
  keep: WorldBossKeep,
  events: readonly BattleEvent[],
  now: Date,
): Promise<WorldBossStrike | null> {
  const config = content.current().bundle.config;
  const wake = wakeAt(keep.rules, config, now);
  // Struck a boss that has gone back to sleep mid-fight. The strike happened and cannot be
  // filed against a wake that is over; saying nothing beats inventing an occurrence.
  if (!wake) return null;

  const anchor = wake.window.anchor;
  const damage = damageDealtTo(events, 'enemy');
  const row = await openWake(tx, keep, anchor);
  const wasFelled = row.damageTaken >= row.maxHp;

  // The account's own row first, because whether this is their *first* strike decides
  // whether the wake's warden count moves.
  const [existing] = await tx
    .select()
    .from(playerWorldBoss)
    .where(
      and(
        eq(playerWorldBoss.playerId, playerId),
        eq(playerWorldBoss.dungeonKey, keep.dungeon.key),
        eq(playerWorldBoss.anchor, anchor),
      ),
    );

  let totalDamage = damage;
  if (existing) {
    totalDamage = existing.damage + damage;
    await tx
      .update(playerWorldBoss)
      .set({ damage: totalDamage, strikes: existing.strikes + 1, updatedAt: now })
      .where(eq(playerWorldBoss.id, existing.id));
  } else {
    await tx.insert(playerWorldBoss).values({
      playerId,
      dungeonKey: keep.dungeon.key,
      anchor,
      damage,
      strikes: 1,
    });
  }

  // The shared pool, as one atomic statement. Nothing is read and written back, so two
  // strikes landing at the same instant both count — which is the whole reason the column
  // counts up rather than down.
  const [updated] = await tx
    .update(worldBossWakes)
    .set({
      damageTaken: sql`${worldBossWakes.damageTaken} + ${damage}`,
      strikes: sql`${worldBossWakes.strikes} + 1`,
      wardens: existing ? worldBossWakes.wardens : sql`${worldBossWakes.wardens} + 1`,
    })
    .where(and(eq(worldBossWakes.dungeonKey, keep.dungeon.key), eq(worldBossWakes.anchor, anchor)))
    .returning({ damageTaken: worldBossWakes.damageTaken, maxHp: worldBossWakes.maxHp });

  const damageTaken = updated?.damageTaken ?? row.damageTaken + damage;
  const maxHp = updated?.maxHp ?? row.maxHp;

  // Whoever crossed the line gets the credit, and only once: the `felled_at is null` guard
  // means the second strike to arrive on an already-empty pool cannot overwrite the first.
  const felledIt = !wasFelled && damageTaken >= maxHp;
  if (felledIt) {
    await tx
      .update(worldBossWakes)
      .set({ felledAt: now, felledBy: playerId })
      .where(
        and(
          eq(worldBossWakes.dungeonKey, keep.dungeon.key),
          eq(worldBossWakes.anchor, anchor),
          sql`${worldBossWakes.felledAt} is null`,
        ),
      );
  }

  const before = totalDamage - damage;
  const newly = tiersReached(totalDamage, keep.rules.tiers)
    .filter((tier) => before < tier.damage)
    .map((tier) => tier.key);

  return {
    dungeonKey: keep.dungeon.key,
    damage,
    totalDamage,
    damageTaken: Math.min(damageTaken, maxHp),
    maxHp,
    felledIt,
    tiersReached: newly,
  };
}

// ── Claims ──────────────────────────────────────────────────────────────────

/** The keep, the wake and this account's row — everything a claim has to check. */
async function claimContext(
  tx: Tx,
  content: ContentCache,
  playerId: string,
  dungeonKey: string,
  now: Date,
) {
  const keep = keeps(content).find((entry) => entry.dungeon.key === dungeonKey);
  if (!keep) throw AppError.notFound('No such world boss.');

  const wake = wakeAt(keep.rules, content.current().bundle.config, now);
  if (!wake) {
    throw new AppError('VALIDATION', 'That wake is over, and what it owed has been settled.');
  }

  const anchor = wake.window.anchor;
  const [row] = await tx
    .select()
    .from(playerWorldBoss)
    .where(
      and(
        eq(playerWorldBoss.playerId, playerId),
        eq(playerWorldBoss.dungeonKey, dungeonKey),
        eq(playerWorldBoss.anchor, anchor),
      ),
    )
    .for('update');
  return { keep, anchor, row };
}

/** Claims one rung of the contribution ladder. Returns what it paid. */
export async function claimTier(
  tx: Tx,
  content: ContentCache,
  playerId: string,
  dungeonKey: string,
  tierKey: string,
  now: Date,
): Promise<Record<string, number>> {
  const { keep, row } = await claimContext(tx, content, playerId, dungeonKey, now);

  const tier = keep.rules.tiers.find((entry) => entry.key === tierKey);
  if (!tier) throw AppError.notFound('No such tier on that boss.');
  if (!row || row.damage < tier.damage) {
    throw new AppError('VALIDATION', `That rung wants ${tier.damage.toLocaleString()} damage.`);
  }
  if (row.claimedTiers.includes(tierKey)) {
    throw new AppError('ALREADY_EXISTS', 'That rung has already been collected.');
  }

  await tx
    .update(playerWorldBoss)
    .set({ claimedTiers: [...row.claimedTiers, tierKey], updatedAt: now })
    .where(eq(playerWorldBoss.id, row.id));

  return tier.rewards;
}

/**
 * Claims the felling chest — what everybody who struck it gets when it actually falls.
 *
 * Gated on having struck it *at all* rather than on a threshold, and that is the point of
 * the mode: the last hit and the first are worth the same chest, so somebody who could only
 * spare one strike is still glad the rest of the vale turned up.
 */
export async function claimSpoils(
  tx: Tx,
  content: ContentCache,
  playerId: string,
  dungeonKey: string,
  now: Date,
): Promise<Record<string, number>> {
  const { keep, anchor, row } = await claimContext(tx, content, playerId, dungeonKey, now);

  const wake = await readWake(tx, dungeonKey, anchor, keep.rules.maxHp);
  if (wake.id === '' || wake.damageTaken < wake.maxHp) {
    throw new AppError('VALIDATION', 'It is still standing.');
  }
  if (!row || row.damage <= 0) {
    throw new AppError('VALIDATION', 'The spoils are for the wardens who struck it.');
  }
  if (row.spoilsClaimed) {
    throw new AppError('ALREADY_EXISTS', 'You have already taken your share.');
  }

  await tx
    .update(playerWorldBoss)
    .set({ spoilsClaimed: true, updatedAt: now })
    .where(eq(playerWorldBoss.id, row.id));

  return keep.rules.fellingRewards;
}

export type { DailyCounters };
