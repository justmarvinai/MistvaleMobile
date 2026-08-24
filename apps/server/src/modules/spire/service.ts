import { and, eq, sql } from 'drizzle-orm';
import {
  type DungeonDef,
  type SpireClimb,
  type SpireFloor,
  type SpireLandingState,
  type SpireOverview,
  type SpireRules,
  type SpireView,
  type StageDef,
  type TeamRestriction,
  landingsUpTo,
  restrictionLabel,
  spireAnchor,
  spireClosesOn,
  spireCounter,
  teamRestrictionFailure,
  type RestrictableChampion,
} from '@mistvale/shared';
import { playerSpireClimbs, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import { AppError } from '../../lib/errors';
import type { ContentCache } from '../../content/cache';
import {
  countersFor,
  record as recordUse,
  remaining,
  type DailyCounters,
} from '../../lib/daily-counters';

/**
 * The Mistspire.
 *
 * A tower whose floors are ordinary stages fought by the ordinary engine — so almost
 * nothing about *fighting* one lives here. What lives here are the three things that make
 * it a different mode:
 *
 *  - **Warded floors.** Some floors name an element, a faction, a role or a rarity floor,
 *    and only four champions who meet it may climb. This is the whole reason the tower
 *    exists: it is the only thing in Mistvale that pays for a *broad* roster rather than a
 *    deep one.
 *  - **Keys spent on a clear, not an attempt.** A failed ward costs nothing, because a
 *    floor that has to be solved should be free to fail at. The key comes off when the
 *    floor is beaten, which is also the moment the climb advances.
 *  - **The climb resets with the month.** The anchor is the game-day's `YYYY-MM` and there
 *    is no job: next month finds no row and starts at floor zero.
 *
 * Everything a screen shows is computed here, so the tower a player is looking at and the
 * floor the server will let them into are one rule read twice rather than two rules.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** A published tower: the keep, its rules and its floors in order. */
export interface SpireKeep {
  dungeon: DungeonDef;
  rules: SpireRules;
  /** Indexed by floor number, ascending. Gaps are refused at publish. */
  stages: StageDef[];
}

/**
 * Every published tower, with its floors sorted.
 *
 * A tower with no floors is skipped rather than thrown over: content is edited live, and a
 * half-published spire should take its own tile off the screen, not the screen down.
 */
export function keeps(content: ContentCache): SpireKeep[] {
  const bundle = content.current().bundle;
  const found: SpireKeep[] = [];
  for (const dungeon of bundle.dungeons) {
    if (dungeon.kind !== 'spire' || !dungeon.spire) continue;
    const stages = bundle.stages
      .filter(
        (candidate: StageDef) => candidate.mode === 'spire' && candidate.parentKey === dungeon.key,
      )
      .sort((a: StageDef, b: StageDef) => a.number - b.number);
    if (stages.length === 0) continue;
    found.push({ dungeon, rules: dungeon.spire, stages });
  }
  return found;
}

/** The tower a spire stage belongs to, or null when the stage is not a floor. */
export function keepForStage(content: ContentCache, stage: StageDef): SpireKeep | null {
  if (stage.mode !== 'spire') return null;
  return keeps(content).find((keep) => keep.dungeon.key === stage.parentKey) ?? null;
}

// ── The climb row ───────────────────────────────────────────────────────────

export interface ClimbState {
  highestFloor: number;
  claimedLandings: string[];
  clears: number;
}

const FRESH_CLIMB: ClimbState = Object.freeze({
  highestFloor: 0,
  claimedLandings: [],
  clears: 0,
});

/**
 * This account's climb of one tower this month, or a fresh one.
 *
 * Deliberately does not create the row: a player who has looked at the tower and not
 * climbed it owes the database nothing, and the first clear is a natural place to insert.
 */
export async function climbFor(
  db: Executor,
  playerId: string,
  dungeonKey: string,
  anchor: string,
): Promise<ClimbState> {
  const [row] = await db
    .select()
    .from(playerSpireClimbs)
    .where(
      and(
        eq(playerSpireClimbs.playerId, playerId),
        eq(playerSpireClimbs.dungeonKey, dungeonKey),
        eq(playerSpireClimbs.anchor, anchor),
      ),
    )
    .limit(1);
  if (!row) return { ...FRESH_CLIMB, claimedLandings: [] };
  return {
    highestFloor: row.highestFloor,
    claimedLandings: row.claimedLandings,
    clears: row.clears,
  };
}

/**
 * The highest floor this account has ever reached in a tower, across every climb.
 *
 * Bragging rather than gating — a tower you re-enter halfway up is a tower with no first
 * floor — so it is read with a cheap aggregate rather than kept on the player row.
 */
export async function bestEverFloor(
  db: Executor,
  playerId: string,
  dungeonKey: string,
): Promise<number> {
  const [row] = await db
    .select({ best: sql<number>`coalesce(max(${playerSpireClimbs.highestFloor}), 0)` })
    .from(playerSpireClimbs)
    .where(
      and(eq(playerSpireClimbs.playerId, playerId), eq(playerSpireClimbs.dungeonKey, dungeonKey)),
    );
  return Number(row?.best ?? 0);
}

// ── Wards ───────────────────────────────────────────────────────────────────

/**
 * How a ward reads on the door, using content's own display names.
 *
 * A faction's name comes from the faction entity; the other three are enum values whose
 * words live in shared (`ROLE_NAMES` and friends), because there is no `element` entity
 * holding "Tide" and inventing one to hold four strings would be a content type nobody
 * edits — but capitalising the key gives "Hp champions", which a browser found.
 */
export function wardLabel(content: ContentCache, restriction: TeamRestriction): string {
  if (restriction.kind !== 'faction') return restrictionLabel(restriction);
  const faction = content
    .current()
    .bundle.factions.find((candidate) => candidate.key === restriction.value);
  return restrictionLabel(restriction, faction?.name);
}

/**
 * Refuses a team that does not meet a floor's ward.
 *
 * Called from inside `battle.start`, from the same place every other team rule is checked,
 * and it names the champions who fail rather than restating the rule — "Kaelen and Vorr do
 * not qualify" is something to act on, where "team must be Tide" is a riddle about which
 * two of four are wrong.
 */
export function assertTeamMeetsWard(
  content: ContentCache,
  stage: StageDef,
  team: readonly RestrictableChampion[],
): void {
  if (!stage.teamRestriction) return;
  const failure = teamRestrictionFailure(
    stage.teamRestriction,
    team,
    wardLabel(content, stage.teamRestriction),
  );
  if (failure) throw new AppError('VALIDATION', failure);
}

// ── The screen's read ───────────────────────────────────────────────────────

export interface SpireContext {
  playerId: string;
  level: number;
  dailyCounters: Record<string, number>;
  dailyCountersDay: string | null;
}

function floorsFor(content: ContentCache, keep: SpireKeep, highestFloor: number): SpireFloor[] {
  const { rules, stages } = keep;
  return stages.map((stage) => ({
    floor: stage.number,
    stageKey: stage.key,
    boss: rules.bossEvery > 0 && stage.number % rules.bossEvery === 0,
    cleared: stage.number <= highestFloor,
    current: stage.number === highestFloor + 1,
    ward: stage.teamRestriction
      ? {
          kind: stage.teamRestriction.kind,
          value: stage.teamRestriction.value,
          label: wardLabel(content, stage.teamRestriction),
        }
      : null,
    maxTurns: stage.starRules.maxTurns,
  }));
}

function landingStates(keep: SpireKeep, climb: ClimbState): SpireLandingState[] {
  return keep.rules.landings.map((landing) => ({
    key: landing.key,
    name: landing.name,
    floor: landing.floor,
    rewards: landing.rewards,
    reached: climb.highestFloor >= landing.floor,
    claimed: climb.claimedLandings.includes(landing.key),
  }));
}

async function viewFor(
  db: Executor,
  content: ContentCache,
  player: SpireContext,
  keep: SpireKeep,
  counters: DailyCounters,
): Promise<SpireView> {
  const anchor = spireAnchor(counters.day);
  const [climb, bestEver] = await Promise.all([
    climbFor(db, player.playerId, keep.dungeon.key, anchor),
    bestEverFloor(db, player.playerId, keep.dungeon.key),
  ]);
  const open = player.level >= keep.dungeon.unlockLevel;
  return {
    dungeonKey: keep.dungeon.key,
    name: keep.dungeon.name,
    tagline: keep.dungeon.tagline,
    lore: keep.dungeon.lore,
    backgroundAsset: keep.dungeon.backgroundAsset,
    open,
    lockedReason: open ? null : `Opens at account level ${keep.dungeon.unlockLevel}.`,
    anchor,
    closesOn: spireClosesOn(anchor),
    keysLeft: remaining(counters, spireCounter(keep.dungeon.key), keep.rules.keysPerDay),
    keysPerDay: keep.rules.keysPerDay,
    highestFloor: climb.highestFloor,
    bestEverFloor: bestEver,
    floors: floorsFor(content, keep, climb.highestFloor),
    landings: landingStates(keep, climb),
  };
}

/** Every tower as the screen reads it. */
export async function overview(
  db: Executor,
  content: ContentCache,
  player: SpireContext,
  now: Date,
): Promise<SpireOverview> {
  const config = content.current().bundle.config;
  const counters = countersFor(player, config, now);
  const spires = await Promise.all(
    keeps(content).map((keep) => viewFor(db, content, player, keep, counters)),
  );
  return { today: counters.day, spires };
}

// ── Opening a floor ─────────────────────────────────────────────────────────

/**
 * Refuses a floor the player cannot enter — but spends nothing.
 *
 * The key comes off on the *clear*, which is the mode's own rule (a ward that has to be
 * solved should be free to fail at), so this only checks that there is a key to spend.
 * Checking it here rather than at the end is what stops somebody spending an evening on a
 * floor they were never going to be paid for.
 */
export async function assertFloorOpen(
  db: Executor,
  content: ContentCache,
  player: SpireContext,
  keep: SpireKeep,
  stage: StageDef,
  now: Date,
): Promise<void> {
  if (player.level < keep.dungeon.unlockLevel) {
    throw new AppError(
      'LOCKED_CONTENT',
      `${keep.dungeon.name} opens at account level ${keep.dungeon.unlockLevel}.`,
    );
  }
  const counters = countersFor(player, content.current().bundle.config, now);
  const left = remaining(counters, spireCounter(keep.dungeon.key), keep.rules.keysPerDay);
  if (left < 1) {
    throw new AppError(
      'COOLDOWN',
      'No keys left today. They come back with the daily reset — and a floor you failed cost nothing.',
    );
  }

  const anchor = spireAnchor(counters.day);
  const climb = await climbFor(db, player.playerId, keep.dungeon.key, anchor);
  // Strictly the next floor: a climb is walked in order, and letting somebody jump to the
  // floor above the one they are stuck on would make the whole ladder decorative.
  if (stage.number > climb.highestFloor + 1) {
    throw new AppError(
      'LOCKED_CONTENT',
      climb.highestFloor === 0
        ? 'The climb starts at the first floor.'
        : `Floor ${climb.highestFloor + 1} is next; the tower is climbed in order.`,
    );
  }
  if (stage.number <= climb.highestFloor) {
    throw new AppError(
      'LOCKED_CONTENT',
      'That floor is already behind you. The Mistspire is climbed once a month, not farmed.',
    );
  }
}

// ── Settling a floor ────────────────────────────────────────────────────────

/**
 * Records a cleared floor: spends the key, advances the climb, and says what it opened.
 *
 * Called from the battle's own settlement, inside its transaction, and **only on a win** —
 * which is the mode's rule rather than an implementation detail. A defeat leaves the row,
 * the key and the climb exactly as they were, so a hard ward can be attacked all evening
 * with a different four each time.
 *
 * The landings a clear brings into reach are *reported* rather than paid: they are
 * collected on the tower's own screen, because a floor's own rewards already land in the
 * results modal and a second bag of loot inside the same modal reads as a bug.
 */
export async function settleClear(
  tx: Tx,
  content: ContentCache,
  player: SpireContext,
  keep: SpireKeep,
  stage: StageDef,
  now: Date,
): Promise<SpireClimb> {
  const counters = countersFor(player, content.current().bundle.config, now);
  const anchor = spireAnchor(counters.day);
  const climb = await climbFor(tx, player.playerId, keep.dungeon.key, anchor);

  // A clear of a floor already behind us pays nothing and costs nothing. Reachable only if
  // content was re-cut mid-fight, but silently double-counting would be the worse answer.
  const advanced = stage.number === climb.highestFloor + 1;
  if (advanced) {
    await recordUse(tx, player.playerId, counters, spireCounter(keep.dungeon.key), 1);
    await tx
      .insert(playerSpireClimbs)
      .values({
        playerId: player.playerId,
        dungeonKey: keep.dungeon.key,
        anchor,
        highestFloor: stage.number,
        claimedLandings: [],
        clears: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          playerSpireClimbs.playerId,
          playerSpireClimbs.dungeonKey,
          playerSpireClimbs.anchor,
        ],
        set: {
          // `greatest` rather than a plain assignment: two settlements racing on a retried
          // request must never walk the climb backwards.
          highestFloor: sql`greatest(${playerSpireClimbs.highestFloor}, ${stage.number})`,
          clears: sql`${playerSpireClimbs.clears} + 1`,
          updatedAt: now,
        },
      });
  }

  const highestFloor = advanced ? Math.max(climb.highestFloor, stage.number) : climb.highestFloor;
  const reached = landingsUpTo(highestFloor, keep.rules.landings)
    .filter((landing) => landing.floor > climb.highestFloor)
    .map((landing) => landing.key);

  return {
    dungeonKey: keep.dungeon.key,
    floor: stage.number,
    advanced,
    highestFloor,
    // The counters were read before the spend, so the key this clear cost is subtracted
    // here rather than re-read: a second `countersFor` would answer from the same stale
    // player row and report a key that has already gone.
    keysLeft: Math.max(
      0,
      remaining(counters, spireCounter(keep.dungeon.key), keep.rules.keysPerDay) -
        (advanced ? 1 : 0),
    ),
    landingsReached: reached,
  };
}

// ── Collecting a landing ────────────────────────────────────────────────────

export interface LandingClaim {
  landingKey: string;
  name: string;
  rewards: Record<string, number>;
}

/**
 * Marks a landing collected, inside the caller's paying transaction.
 *
 * The claim is written *before* the payout so a crash between them loses the reward rather
 * than paying it twice, and the `array_position` guard makes the update itself the lock: a
 * second request finds the key already in the list and comes away with nothing to pay.
 */
export async function claimLanding(
  tx: Tx,
  content: ContentCache,
  player: SpireContext,
  dungeonKey: string,
  landingKey: string,
  now: Date,
): Promise<LandingClaim> {
  const keep = keeps(content).find((candidate) => candidate.dungeon.key === dungeonKey);
  if (!keep) throw new AppError('NOT_FOUND', 'No such tower.');
  const landing = keep.rules.landings.find((candidate) => candidate.key === landingKey);
  if (!landing) throw new AppError('NOT_FOUND', 'No such landing.');

  const counters = countersFor(player, content.current().bundle.config, now);
  const anchor = spireAnchor(counters.day);
  const climb = await climbFor(tx, player.playerId, dungeonKey, anchor);
  if (climb.highestFloor < landing.floor) {
    throw new AppError('LOCKED_CONTENT', `That landing is at floor ${landing.floor}.`);
  }
  if (climb.claimedLandings.includes(landingKey)) {
    throw new AppError('ALREADY_EXISTS', 'That landing has already been collected this climb.');
  }

  const updated = await tx
    .update(playerSpireClimbs)
    .set({
      claimedLandings: sql`${playerSpireClimbs.claimedLandings} || ${JSON.stringify([landingKey])}::jsonb`,
      updatedAt: now,
    })
    .where(
      and(
        eq(playerSpireClimbs.playerId, player.playerId),
        eq(playerSpireClimbs.dungeonKey, dungeonKey),
        eq(playerSpireClimbs.anchor, anchor),
        sql`not (${playerSpireClimbs.claimedLandings} @> ${JSON.stringify([landingKey])}::jsonb)`,
      ),
    )
    .returning({ id: playerSpireClimbs.id });
  if (updated.length === 0) {
    throw new AppError('ALREADY_EXISTS', 'That landing has already been collected this climb.');
  }

  return { landingKey, name: landing.name, rewards: landing.rewards };
}

/** The player row a spire read needs, without dragging the whole record around. */
export async function contextFor(db: Executor, playerId: string): Promise<SpireContext> {
  const [row] = await db
    .select({
      id: players.id,
      level: players.level,
      dailyCounters: players.dailyCounters,
      dailyCountersDay: players.dailyCountersDay,
    })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (!row) throw new AppError('NOT_FOUND', 'No such player.');
  return {
    playerId: row.id,
    level: row.level,
    dailyCounters: row.dailyCounters,
    dailyCountersDay: row.dailyCountersDay,
  };
}
