import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ChampionEntry } from '@mistvale/engine';
import {
  NO_DEEP_RUN,
  UNLOCK_LEVELS,
  deepRunCounter,
  deepestTier,
  type ChampionDef,
  type DeepRunDef,
  type DeepRunDoor,
  type DeepRunMember,
  type DeepRunOutcome,
  type DeepRunPhase,
  type DeepRunState,
  type DeepRunView,
  type MasteryEffect,
  type Stat,
} from '@mistvale/shared';
import { playerChampions, playerDeepRuns } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import type { PlayerDeepRunRow } from '../../db/schema/game';
import { AppError } from '../../lib/errors';
import { countersFor, record as recordUse, remaining } from '../../lib/daily-counters';
import { assertAvailable } from '../meta/expeditions';
import { boonsFor, drawBoons, drawDoors, roomsFor } from './draw';

/**
 * The Deep Run: a descent your relics do not come on.
 *
 * The module owns the *state machine* and nothing else. A fight inside a run is an ordinary
 * battle through the ordinary route, and the boons a party has taken reach the engine as
 * flat stat bonuses and mastery effects — the vocabulary the mastery trees already speak —
 * so the engine knows nothing about Deep Runs at all.
 *
 * The machine has four states and they are stored rather than inferred:
 *
 * ```
 *   choosingDoor ──enter(fight)──> inBattle ──battle ends──> choosingBoon ──take──┐
 *        ^                                                                        │
 *        │        └─enter(rest|cache)────────────────────────> choosingBoon ──────┘
 *        └────────────────────────────────────────────────────────────────────────┘
 *                                    (deeper, or ended)
 * ```
 *
 * **Everything a descent is made of lives on one row**, because a run spans battles and a
 * player who closes the tab on floor 7 has to find floor 7. And the draws are seeded from
 * the run with a nonce that only moves when something is *taken*, so refusing an offer and
 * asking again returns the same three — a rogue-lite whose offers re-roll for free has no
 * decisions in it.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface DeepRunPlayer {
  playerId: string;
  level: number;
  dailyCounters: Record<string, number>;
  dailyCountersDay: string | null;
}

/** Every published Deep Run, in the order an operator put them in. */
export function published(content: ContentCache): DeepRunDef[] {
  return [...content.current().bundle.deepRuns].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function defFor(content: ContentCache, runKey: string): DeepRunDef | null {
  return published(content).find((entry) => entry.key === runKey) ?? null;
}

/** The live descent for one account and one run, or null. */
export async function activeRun(
  db: Executor,
  playerId: string,
  runKey: string,
): Promise<PlayerDeepRunRow | null> {
  const [row] = await db
    .select()
    .from(playerDeepRuns)
    .where(
      and(
        eq(playerDeepRuns.playerId, playerId),
        eq(playerDeepRuns.runKey, runKey),
        eq(playerDeepRuns.status, 'active'),
      ),
    );
  return row ?? null;
}

/** The descent a battle belongs to, or null when the battle is not part of one. */
export async function runForBattle(
  db: Executor,
  playerId: string,
  battleId: string,
): Promise<PlayerDeepRunRow | null> {
  const [row] = await db
    .select()
    .from(playerDeepRuns)
    .where(
      and(
        eq(playerDeepRuns.playerId, playerId),
        eq(playerDeepRuns.battleId, battleId),
        eq(playerDeepRuns.status, 'active'),
      ),
    );
  return row ?? null;
}

// ── The party ───────────────────────────────────────────────────────────────

export interface PartyMember {
  championId: string;
  hpPct: number;
  alive: boolean;
}

/**
 * The champions a descent fields *right now*: alive, in the order they went in.
 *
 * A fallen champion is left on the row rather than removed, so the screen can show the
 * casualty. What they are excluded from is the next fight, which is what "stays fallen"
 * means — and the roster outside the run is untouched either way.
 */
export function standing(party: readonly PartyMember[]): PartyMember[] {
  return party.filter((member) => member.alive);
}

async function partyView(
  db: Executor,
  content: ContentCache,
  party: readonly PartyMember[],
): Promise<DeepRunMember[]> {
  if (party.length === 0) return [];

  // One query rather than one per member: this is a screen that redraws on every press.
  const owned = await db
    .select()
    .from(playerChampions)
    .where(
      inArray(
        playerChampions.id,
        party.map((member) => member.championId),
      ),
    );
  const byId = new Map(owned.map((row) => [row.id, row]));
  const champions = new Map(
    content.current().bundle.champions.map((def: ChampionDef) => [def.key, def]),
  );

  // The party's order rather than the database's: slot one went in first and stays first.
  return party.map((member) => {
    const row = byId.get(member.championId);
    const def = row ? champions.get(row.championKey) : undefined;
    return {
      championId: member.championId,
      championKey: row?.championKey ?? '',
      // A champion fed away mid-descent. The run remembers who went down, and says so
      // rather than dropping a slot the player is looking at.
      name: def?.name ?? 'Someone who has gone',
      level: row?.level ?? 0,
      rank: row?.rank ?? 0,
      hpPct: member.hpPct,
      alive: member.alive,
    };
  });
}

// ── The screen's read ───────────────────────────────────────────────────────

function doorView(def: DeepRunDef, keys: readonly string[]): DeepRunDoor[] {
  return roomsFor(def, keys).map((room) => ({
    roomKey: room.key,
    name: room.name,
    kind: room.kind,
    description: room.description,
    waves: room.waves.map((wave) => wave.map((unit) => unit.enemyKey)),
    healPct: room.healPct,
    rewards: room.rewards,
  }));
}

function boonView(def: DeepRunDef, keys: readonly string[]) {
  const counted = new Map<string, number>();
  for (const key of keys) counted.set(key, (counted.get(key) ?? 0) + 1);
  return [...counted.entries()].flatMap(([key, count]) => {
    const boon = def.boons.find((entry) => entry.key === key);
    if (!boon) return [];
    return [
      {
        key: boon.key,
        name: boon.name,
        description: boon.description,
        rarity: boon.rarity as string,
        count,
      },
    ];
  });
}

export async function overview(
  db: Executor,
  content: ContentCache,
  player: DeepRunPlayer,
  now: Date,
): Promise<DeepRunView> {
  const config = content.current().bundle.config;
  const counters = countersFor(player, config, now);
  if (player.level < UNLOCK_LEVELS.deepRun) return { ...NO_DEEP_RUN, today: counters.day };

  const runs: DeepRunState[] = [];
  for (const def of published(content)) {
    const row = await activeRun(db, player.playerId, def.key);
    const runsLeft = remaining(counters, deepRunCounter(def.key), def.runsPerDay);

    const [last] = row
      ? []
      : await db
          .select()
          .from(playerDeepRuns)
          .where(
            and(
              eq(playerDeepRuns.playerId, player.playerId),
              eq(playerDeepRuns.runKey, def.key),
              eq(playerDeepRuns.status, 'ended'),
            ),
          )
          .orderBy(desc(playerDeepRuns.endedAt))
          .limit(1);

    const party = (row?.party ?? []) as PartyMember[];
    const held = (row?.boons ?? []) as string[];

    runs.push({
      runKey: def.key,
      name: def.name,
      tagline: def.tagline,
      lore: def.lore,
      runsLeft,
      runsPerDay: def.runsPerDay,
      floors: def.floors,
      phase: row ? (row.phase as DeepRunPhase) : null,
      floor: row?.floor ?? 0,
      deepest: row?.deepest ?? 0,
      party: await partyView(db, content, party),
      boons: boonView(def, held),
      doors: row?.phase === 'choosingDoor' ? doorView(def, (row.doors as string[]) ?? []) : [],
      boonOffer:
        row?.phase === 'choosingBoon'
          ? boonView(def, (row.boonOffer as string[]) ?? []).map((entry) => ({
              ...entry,
              count: 1,
            }))
          : [],
      battleId: row?.battleId ?? null,
      depthTiers: def.depthTiers.map((tier) => ({
        key: tier.key,
        name: tier.name,
        floor: tier.floor,
        rewards: tier.rewards,
        reached: (row?.deepest ?? 0) >= tier.floor,
      })),
      lastRunRewards: (last?.rewards ?? {}) as Record<string, number>,
      lastRunFloor: last?.deepest ?? 0,
      blockedReason: row
        ? null
        : player.level < def.unlockLevel
          ? `Opens at account level ${def.unlockLevel}.`
          : runsLeft < 1
            ? 'No descents left today. They come back with the daily reset.'
            : null,
    });
  }

  return { today: counters.day, runs };
}

// ── Beginning a descent ─────────────────────────────────────────────────────

/** A seed the player cannot predict, so the doors of a fresh run are a surprise. */
function freshSeed(): number {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return bytes[0]! >>> 1 || 1;
}

export async function begin(
  tx: Tx,
  content: ContentCache,
  player: DeepRunPlayer,
  runKey: string,
  championIds: readonly string[],
  now: Date,
): Promise<PlayerDeepRunRow> {
  const def = defFor(content, runKey);
  if (!def) throw AppError.notFound('No such descent.');
  if (player.level < Math.max(def.unlockLevel, UNLOCK_LEVELS.deepRun)) {
    throw new AppError(
      'LOCKED_CONTENT',
      `${def.name} opens at account level ${Math.max(def.unlockLevel, UNLOCK_LEVELS.deepRun)}.`,
    );
  }
  if (await activeRun(tx, player.playerId, runKey)) {
    throw new AppError('ALREADY_EXISTS', 'You are already down there. Finish or walk out first.');
  }
  if (championIds.length === 0) throw new AppError('VALIDATION', 'Somebody has to go down.');
  if (new Set(championIds).size !== championIds.length) {
    throw new AppError('VALIDATION', 'A champion cannot take two places in the party.');
  }

  const counters = countersFor(player, content.current().bundle.config, now);
  if (remaining(counters, deepRunCounter(runKey), def.runsPerDay) < 1) {
    throw new AppError('COOLDOWN', 'No descents left today. They come back with the daily reset.');
  }

  const owned = await tx
    .select({ id: playerChampions.id })
    .from(playerChampions)
    .where(eq(playerChampions.playerId, player.playerId));
  const ownedIds = new Set(owned.map((row) => row.id));
  for (const id of championIds) {
    if (!ownedIds.has(id)) throw AppError.notFound('One of those champions is not yours.');
  }
  // A descent fields a team, so the expedition rule applies exactly as it does to a battle.
  await assertAvailable(tx, player.playerId, championIds);

  // Spent when the descent *begins*. A run that ends on floor two has still been a descent,
  // and refunding it would make retreating from a bad first door free.
  await recordUse(tx, player.playerId, counters, deepRunCounter(runKey), 1);

  const seed = freshSeed();
  const [row] = await tx
    .insert(playerDeepRuns)
    .values({
      playerId: player.playerId,
      runKey,
      seed,
      offerNonce: 0,
      status: 'active',
      phase: 'choosingDoor',
      floor: 1,
      deepest: 0,
      party: championIds.map((championId) => ({ championId, hpPct: 100, alive: true })),
      boons: [],
      doors: drawDoors(def, seed, 0, 1),
      boonOffer: [],
    })
    .returning();
  if (!row) throw new AppError('INTERNAL', 'Could not open that descent.');
  return row;
}

// ── Walking through a door ──────────────────────────────────────────────────

export interface DoorOutcome {
  /** The room chosen, so the caller can start a battle when it is one. */
  room: ReturnType<typeof roomsFor>[number];
  /** Set when the room resolved on the spot — a rest or a cache. */
  paid: Record<string, number>;
}

/**
 * Opens one of this floor's doors.
 *
 * A fight leaves the run in `inBattle` and the caller starts the battle; a rest or a cache
 * resolves here and moves straight to the boon offer. Either way the door is *consumed* —
 * the doors array is cleared — so a second press cannot walk through twice.
 */
export async function enterRoom(
  tx: Tx,
  content: ContentCache,
  playerId: string,
  runKey: string,
  roomKey: string,
): Promise<DoorOutcome> {
  const def = defFor(content, runKey);
  if (!def) throw AppError.notFound('No such descent.');
  const row = await activeRun(tx, playerId, runKey);
  if (!row) throw new AppError('VALIDATION', 'No descent is under way.');
  if (row.phase !== 'choosingDoor') {
    throw new AppError('VALIDATION', 'That is not what the descent is waiting for.');
  }
  if (!(row.doors as string[]).includes(roomKey)) {
    throw new AppError('VALIDATION', 'That door is not on this floor.');
  }
  const room = def.rooms.find((entry) => entry.key === roomKey);
  if (!room) throw new AppError('CONTENT_STALE', 'That room is no longer published.');

  if (room.kind === 'fight' || room.kind === 'elite') {
    await tx
      .update(playerDeepRuns)
      .set({ phase: 'inBattle', currentRoom: roomKey, doors: [] })
      .where(eq(playerDeepRuns.id, row.id));
    return { room, paid: {} };
  }

  // A rest or a cache: nothing is fought, so the floor is survived by definition.
  const party = (row.party as PartyMember[]).map((member) =>
    member.alive && room.healPct > 0
      ? { ...member, hpPct: Math.min(100, member.hpPct + room.healPct) }
      : member,
  );
  await advanceAfterRoom(tx, def, { ...row, party }, room.boonsOffered);
  return { room, paid: room.rewards };
}

/**
 * Moves a descent on from a resolved room: deeper, to a boon offer, or out.
 *
 * The one place the floor number changes, so "how deep did it get" has a single answer.
 * A room that offers no boon skips straight to the next floor's doors, which is what makes
 * a cache a *cheap* room rather than a free boon.
 */
async function advanceAfterRoom(
  tx: Tx,
  def: DeepRunDef,
  row: PlayerDeepRunRow & { party: PartyMember[] },
  boonsOffered: number,
): Promise<void> {
  const deepest = Math.max(row.deepest, row.floor);
  const bottom = row.floor >= def.floors;
  const nonce = row.offerNonce + 1;

  if (bottom) {
    // The party reached the bottom. Nothing is drawn; the caller ends the run.
    await tx
      .update(playerDeepRuns)
      .set({ party: row.party, deepest, phase: 'choosingBoon', boonOffer: [], currentRoom: null })
      .where(eq(playerDeepRuns.id, row.id));
    return;
  }

  const offer =
    boonsOffered > 0
      ? drawBoons(def, row.seed, nonce, row.floor, row.boons as string[], boonsOffered)
      : [];

  if (offer.length > 0) {
    await tx
      .update(playerDeepRuns)
      .set({
        party: row.party,
        deepest,
        phase: 'choosingBoon',
        boonOffer: offer,
        offerNonce: nonce,
        currentRoom: null,
        battleId: null,
      })
      .where(eq(playerDeepRuns.id, row.id));
    return;
  }

  await tx
    .update(playerDeepRuns)
    .set({
      party: row.party,
      deepest,
      floor: row.floor + 1,
      phase: 'choosingDoor',
      doors: drawDoors(def, row.seed, nonce, row.floor + 1),
      boonOffer: [],
      offerNonce: nonce,
      currentRoom: null,
      battleId: null,
    })
    .where(eq(playerDeepRuns.id, row.id));
}

// ── Taking a boon ───────────────────────────────────────────────────────────

export async function takeBoon(
  tx: Tx,
  content: ContentCache,
  playerId: string,
  runKey: string,
  boonKey: string,
): Promise<void> {
  const def = defFor(content, runKey);
  if (!def) throw AppError.notFound('No such descent.');
  const row = await activeRun(tx, playerId, runKey);
  if (!row) throw new AppError('VALIDATION', 'No descent is under way.');
  if (row.phase !== 'choosingBoon') {
    throw new AppError('VALIDATION', 'That is not what the descent is waiting for.');
  }
  if (!(row.boonOffer as string[]).includes(boonKey)) {
    throw new AppError('VALIDATION', 'That boon is not on offer.');
  }

  const nonce = row.offerNonce + 1;
  await tx
    .update(playerDeepRuns)
    .set({
      boons: [...(row.boons as string[]), boonKey],
      floor: row.floor + 1,
      phase: 'choosingDoor',
      doors: drawDoors(def, row.seed, nonce, row.floor + 1),
      boonOffer: [],
      offerNonce: nonce,
    })
    .where(eq(playerDeepRuns.id, row.id));
}

// ── Ending it ───────────────────────────────────────────────────────────────

/**
 * Closes a descent and works out what it was worth.
 *
 * Paid on **any** ending — the bottom, a wipe, or walking out — at the deepest rung the run
 * reached, exactly as a Titan run is paid for the damage it did. Nothing is granted here:
 * the caller pays it through `RewardService`, because every payout in the game goes through
 * one place.
 */
export async function endRun(
  tx: Tx,
  content: ContentCache,
  playerId: string,
  runKey: string,
  reason: 'retired' | 'wiped' | 'completed',
  now: Date,
): Promise<DeepRunOutcome> {
  const def = defFor(content, runKey);
  if (!def) throw AppError.notFound('No such descent.');
  const row = await activeRun(tx, playerId, runKey);
  if (!row) throw new AppError('VALIDATION', 'No descent is under way.');

  const deepest = Math.max(row.deepest, reason === 'completed' ? def.floors : 0);
  const tier = deepestTier(deepest, def.depthTiers);
  const rewards = tier?.rewards ?? {};

  await tx
    .update(playerDeepRuns)
    .set({
      status: 'ended',
      phase: 'ended',
      deepest,
      rewards,
      endedAt: now,
      doors: [],
      boonOffer: [],
      battleId: null,
      currentRoom: null,
    })
    .where(eq(playerDeepRuns.id, row.id));

  return {
    floor: deepest,
    completed: reason === 'completed',
    tierKey: tier?.key ?? null,
    tierName: tier?.name ?? null,
    rewards,
  };
}

/** Whether the descent has reached its bottom and is waiting to be closed out. */
export function atTheBottom(def: DeepRunDef, row: PlayerDeepRunRow): boolean {
  return row.floor >= def.floors && (row.boonOffer as string[]).length === 0;
}

// ── Dressing a descent's fight ──────────────────────────────────────────────

/**
 * Folds a run's boons and carried health into the entries a fight is assembled from.
 *
 * Called from `battle.start` with the entries already built (gearless, because the caller
 * asked for that) and mutates them in place — which is the honest shape here: the caller
 * owns the array and this is one more layer of the same assembly, exactly as masteries and
 * the Hall are.
 *
 * **Boons reach the engine as mastery effects.** That is the whole reason the Deep Run
 * needed no engine work: a boon's flat bonuses join `bonuses` beside the Hall's, and its
 * conditional effects join `masteries` beside the trees'. Anything a mastery can do, a
 * boon can do, and `battle.ts` has never heard of a descent.
 */
export async function dressForTheDescent(
  tx: Tx,
  content: ContentCache,
  playerId: string,
  runKey: string,
  entries: ChampionEntry[],
): Promise<void> {
  const def = defFor(content, runKey);
  const row = await activeRun(tx, playerId, runKey);
  if (!def || !row) return;

  const boons = boonsFor(def, row.boons as string[]);
  const health = new Map(
    (row.party as PartyMember[]).map((member) => [member.championId, member.hpPct]),
  );
  const order = (row.party as PartyMember[]).filter((member) => member.alive);

  entries.forEach((entry, index) => {
    // The party's own order, which is the order `start` was handed and therefore the order
    // the entries are in. Matching by index rather than by champion key, because a party may
    // legitimately hold two copies of the same champion.
    const member = order[index];
    if (member) {
      const pct = health.get(member.championId);
      if (pct !== undefined && pct < 100) entry.startHpPct = pct;
    }

    const bonuses: Partial<Record<Stat, number>> = { ...(entry.bonuses ?? {}) };
    const effects: MasteryEffect[] = [...(entry.masteries ?? [])];
    for (const boon of boons) {
      for (const [stat, value] of Object.entries(boon.bonuses) as [Stat, number][]) {
        if (typeof value === 'number') bonuses[stat] = (bonuses[stat] ?? 0) + value;
      }
      effects.push(...boon.effects);
    }
    entry.bonuses = bonuses;
    entry.masteries = effects;
  });
}

// ── Settling a floor ────────────────────────────────────────────────────────

export interface FloorOutcome {
  /** What the party looks like now, health carried and casualties recorded. */
  party: PartyMember[];
  /** True when nobody is left standing — the descent is over. */
  wiped: boolean;
  /** True when the floor just fought was the bottom one. */
  bottom: boolean;
}

/**
 * Folds a finished fight back into the descent.
 *
 * This is where the two rules that make it a rogue-lite are actually enforced: the health
 * each champion ends the fight on is written back as the health they start the next one on,
 * and anybody who fell is marked fallen for the rest of the run. Read off the **battle
 * state** rather than the event log, because what matters is where they finished, not how
 * they got there.
 *
 * A lost fight is not special-cased. If somebody is still standing the descent goes on —
 * which is right, because the party could survive a defeat on the turn cap — and if nobody
 * is, the caller ends the run. That is the only place "one life" is decided.
 */
export async function settleFloor(
  tx: Tx,
  content: ContentCache,
  playerId: string,
  runKey: string,
  state: { allies: readonly { hp: number; maxHp: number; alive: boolean }[] },
): Promise<FloorOutcome | null> {
  const def = defFor(content, runKey);
  const row = await activeRun(tx, playerId, runKey);
  if (!def || !row) return null;

  const before = row.party as PartyMember[];
  const fielded = before.filter((member) => member.alive);

  // The engine's allies are the fielded party in order, so index is the join. A unit the
  // engine dropped entirely would leave the tail unchanged, which is the safe direction.
  const party = before.map((member) => {
    if (!member.alive) return member;
    const unit = state.allies[fielded.indexOf(member)];
    if (!unit) return member;
    return {
      championId: member.championId,
      hpPct: unit.maxHp > 0 ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100)) : 0,
      alive: unit.alive,
    };
  });

  const wiped = party.every((member) => !member.alive);
  const bottom = row.floor >= def.floors;

  if (wiped) {
    // Nothing is advanced. The caller ends the run, and `deepest` already holds the floor
    // they got to — a party that dies on floor 9 reached floor 9.
    await tx
      .update(playerDeepRuns)
      .set({ party, deepest: Math.max(row.deepest, row.floor), battleId: null, currentRoom: null })
      .where(eq(playerDeepRuns.id, row.id));
    return { party, wiped, bottom };
  }

  const room = def.rooms.find((entry) => entry.key === row.currentRoom);
  await advanceAfterRoom(tx, def, { ...row, party }, bottom ? 0 : (room?.boonsOffered ?? 0));
  return { party, wiped, bottom };
}

/** Notes which battle a descent is in, so a reload can be pointed back at it. */
export async function noteBattle(
  tx: Tx,
  playerId: string,
  runKey: string,
  battleId: string,
): Promise<void> {
  await tx
    .update(playerDeepRuns)
    .set({ battleId })
    .where(
      and(
        eq(playerDeepRuns.playerId, playerId),
        eq(playerDeepRuns.runKey, runKey),
        eq(playerDeepRuns.status, 'active'),
      ),
    );
}
