import { eq } from 'drizzle-orm';
import type { DungeonDef } from '@mistvale/shared';
import { WEEKDAY_NAMES } from '@mistvale/shared';
import { stageProgress } from '../../db/schema/index';
import type { Database } from '../../db/client';
import { gameDay, type GameDay } from '../../lib/game-day';

/**
 * The Depths.
 *
 * A dungeon floor is a stage like any other — the same battle route, the same unlock
 * chain, the same stars and first-clear bonuses — so almost nothing about *fighting* one
 * lives here. What does live here are the two questions the campaign never had to ask:
 *
 *  - **Is this keep open today?** The Essence Springs rotate by weekday, which makes the
 *    week itself a resource: Sunday is Mist or it is nothing (docs/GAME_DESIGN.md §9.2).
 *    What "today" means is `lib/game-day` — shared with every other daily rule.
 *  - **Has this player earned the door?** Each dungeon has an account level, and a new
 *    account gets a grace period during which every spring stands open, so a first week
 *    is never spent waiting for a Tuesday.
 *
 * Both answers are computed once, here, and read by three consumers: the hub screen, the
 * progress payload the maps draw from, and the battle route that refuses a locked fight.
 * One rule, three readers — the same arrangement the campaign unlock uses.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

// ── Rotation ────────────────────────────────────────────────────────────────

export interface RotationContext {
  weekday: number;
  /** True while the new-account grace period is running: every rotation is ignored. */
  inGrace: boolean;
}

/** Whether the dungeon's rotation admits today. A dungeon with no days is always open. */
export function openToday(dungeon: DungeonDef, rotation: RotationContext): boolean {
  if (dungeon.openDays.length === 0) return true;
  if (rotation.inGrace) return true;
  return dungeon.openDays.includes(rotation.weekday);
}

/**
 * The next weekday this dungeon opens, as a name.
 *
 * Null when it is open today or opens every day — a player does not need to be told when
 * the door they are walking through will next be unlocked.
 */
export function nextOpenDay(dungeon: DungeonDef, rotation: RotationContext): string | null {
  if (dungeon.openDays.length === 0 || openToday(dungeon, rotation)) return null;
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const day = (rotation.weekday + ahead) % 7;
    if (dungeon.openDays.includes(day)) return WEEKDAY_NAMES[day] ?? null;
  }
  return null;
}

/** The days a dungeon opens on, written out: "Monday & Thursday". */
export function rotationLabel(dungeon: DungeonDef): string {
  if (dungeon.openDays.length === 0) return 'Every day';
  const names = [...dungeon.openDays]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_NAMES[day] ?? `day ${day}`);
  if (names.length === 1) return `${names[0]} only`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

// ── Gates ───────────────────────────────────────────────────────────────────

export interface DungeonGate {
  open: boolean;
  /** Why it is shut, phrased for the player. */
  reason: string | null;
}

/**
 * Whether a dungeon may be entered at all, before any per-floor rule applies.
 *
 * Level first, then the rotation: a player who is too low to be here should be told that
 * rather than told to come back on Thursday.
 */
export function gateFor(
  dungeon: DungeonDef,
  playerLevel: number,
  rotation: RotationContext,
): DungeonGate {
  if (playerLevel < dungeon.unlockLevel) {
    return { open: false, reason: `Opens at account level ${dungeon.unlockLevel}.` };
  }
  if (!openToday(dungeon, rotation)) {
    const next = nextOpenDay(dungeon, rotation);
    return {
      open: false,
      reason: next ? `Closed today — opens ${next}.` : 'Closed today.',
    };
  }
  return { open: true, reason: null };
}

/** When a player's all-springs-open grace period ends, or null if it already has. */
export function graceEndsAt(createdAt: Date, graceDays: number, now: Date): Date | null {
  if (graceDays <= 0) return null;
  const ends = new Date(createdAt.getTime() + graceDays * 24 * 60 * 60 * 1000);
  return ends > now ? ends : null;
}

export interface DepthsContext {
  day: GameDay;
  rotation: RotationContext;
  /** Null once the new-account grace period has run out. */
  graceUntil: Date | null;
}

/**
 * Everything the Depths rules need about *when* and *who*, resolved once.
 *
 * The hub, the progress payload and the battle route all build this the same way, which
 * is what stops the hub from showing a spring open that the server will refuse.
 */
export function contextFor(
  player: { createdAt: Date },
  config: Readonly<Record<string, unknown>>,
  now: Date,
): DepthsContext {
  const timezone = stringConfig(config, 'ops.dailyResetTimezone', 'UTC');
  const resetHour = numberConfig(config, 'ops.dailyResetHour', 4);
  const graceDays = numberConfig(config, 'depths.springsGraceDays', 7);

  const day = gameDay(now, timezone, resetHour);
  const graceUntil = graceEndsAt(player.createdAt, graceDays, now);
  return { day, rotation: { weekday: day.weekday, inGrace: graceUntil !== null }, graceUntil };
}

/** Every dungeon's gate, keyed by dungeon. */
export function gates(
  dungeons: readonly DungeonDef[],
  playerLevel: number,
  rotation: RotationContext,
): Map<string, DungeonGate> {
  return new Map(dungeons.map((dungeon) => [dungeon.key, gateFor(dungeon, playerLevel, rotation)]));
}

function numberConfig(
  config: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
): number {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringConfig(
  config: Readonly<Record<string, unknown>>,
  key: string,
  fallback: string,
): string {
  const value = config[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

// ── Progress ────────────────────────────────────────────────────────────────

export interface DungeonStandingRow {
  highestFloor: number;
  clears: number;
}

/**
 * How deep the player has been in each dungeon.
 *
 * Derived from the one progress table rather than kept in a second one: a floor *is* a
 * stage, its clear is already recorded, and "deepest floor" is the largest floor number
 * among the clears. A separate `dungeon_progress` row would be the same fact written
 * twice, and the second copy is the one that goes wrong.
 *
 * The floor number comes from the published stage rather than from the row, so a floor
 * renumbered in Admin reads correctly the moment it is published.
 */
export async function standings(
  db: Executor,
  playerId: string,
  floorNumbers: ReadonlyMap<string, number>,
): Promise<Map<string, DungeonStandingRow>> {
  const rows = await db
    .select({
      parentKey: stageProgress.parentKey,
      stageKey: stageProgress.stageKey,
      clears: stageProgress.clears,
    })
    .from(stageProgress)
    .where(eq(stageProgress.playerId, playerId));

  const standings = new Map<string, DungeonStandingRow>();
  for (const row of rows) {
    if (row.clears <= 0) continue;
    const entry = standings.get(row.parentKey) ?? { highestFloor: 0, clears: 0 };
    entry.clears += row.clears;
    entry.highestFloor = Math.max(entry.highestFloor, floorNumbers.get(row.stageKey) ?? 0);
    standings.set(row.parentKey, entry);
  }
  return standings;
}
