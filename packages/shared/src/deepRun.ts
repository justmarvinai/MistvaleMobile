import { z } from 'zod';
import { DEEP_RUN_ROOM_KINDS } from './content/entities';
import type { DeepRunBoon, DeepRunDef, DeepRunRoom, DeepRunTier } from './content/entities';

/**
 * The Deep Run — a descent your relics do not come on.
 *
 * Every other mode measures what an account has assembled. This one takes the assembly
 * away: four champions go down at their own levels and ranks with **no relics**, and the
 * build that gets them deep is put together inside the run out of whatever boons the
 * descent offers. What you own decides who walks in; what you are given decides how far.
 *
 * Two rules make it a rogue-lite rather than a longer dungeon, and both are about *cost*:
 * damage carries between floors, so a fight won badly is still a wound, and a champion who
 * falls stays fallen for the rest of the descent. Nothing is lost outside the run — the
 * roster is untouched — but inside it the party thins, and the deepest floors are fought
 * with whatever is left standing.
 */

/** The counter a descent is spent against, per run. */
export function deepRunCounter(runKey: string): string {
  return `deeprun:${runKey}`;
}

/** How many rungs of the depth ladder a run reached. Paid at the deepest, once. */
export function deepestTier(floor: number, tiers: readonly DeepRunTier[]): DeepRunTier | null {
  let best: DeepRunTier | null = null;
  for (const tier of tiers) {
    if (floor < tier.floor) continue;
    if (!best || tier.floor > best.floor) best = tier;
  }
  return best;
}

/**
 * Whether a Deep Run's content is usable, as a list of complaints.
 *
 * Read by publish validation rather than by the schema, for the reason its two siblings
 * give: these are statements about whole arrays, and a Zod refinement reports them at the
 * wrong place. What is checked is the thing that actually breaks a descent — a floor with
 * no room in band is a run that cannot continue, and a player halfway down finds a door
 * that is not there.
 */
export function deepRunProblems(def: DeepRunDef): string[] {
  const problems: string[] = [];

  for (let floor = 1; floor <= def.floors; floor += 1) {
    const inBand = def.rooms.filter((room) => floor >= room.minFloor && floor <= room.maxFloor);
    if (inBand.length < def.forks) {
      problems.push(
        `Floor ${floor} has ${inBand.length} room${inBand.length === 1 ? '' : 's'} in band but the descent offers ${def.forks} doors; a run would stall there.`,
      );
      // One complaint is enough to fix the band. Twelve identical ones are noise.
      break;
    }
  }

  const roomKeys = new Set<string>();
  for (const room of def.rooms) {
    if (roomKeys.has(room.key)) problems.push(`Two rooms share the key "${room.key}".`);
    roomKeys.add(room.key);
    if (room.minFloor > room.maxFloor) {
      problems.push(
        `Room "${room.key}" opens at floor ${room.minFloor} and shuts at ${room.maxFloor}.`,
      );
    }
    const fights = room.kind === 'fight' || room.kind === 'elite';
    if (fights && room.waves.length === 0) {
      problems.push(`Room "${room.key}" is a ${room.kind} with nothing in it to fight.`);
    }
    if (!fights && room.waves.length > 0) {
      problems.push(`Room "${room.key}" is a ${room.kind} and carries waves nothing will fight.`);
    }
    if (room.kind === 'rest' && room.healPct <= 0) {
      problems.push(`Room "${room.key}" is a rest that mends nothing.`);
    }
  }

  const boonKeys = new Set<string>();
  for (const boon of def.boons) {
    if (boonKeys.has(boon.key)) problems.push(`Two boons share the key "${boon.key}".`);
    boonKeys.add(boon.key);
  }
  if (def.boons.filter((boon) => boon.minFloor <= 1).length < 3) {
    problems.push('Fewer than three boons are available on floor 1; the first offer would repeat.');
  }

  let previous = 0;
  for (const [index, tier] of def.depthTiers.entries()) {
    if (index > 0 && tier.floor <= previous) {
      problems.push(
        `Depth tier ${index + 1} ("${tier.name}") is not deeper than the one above it.`,
      );
    }
    if (tier.floor > def.floors) {
      problems.push(
        `Depth tier "${tier.name}" wants floor ${tier.floor}, past the bottom at ${def.floors}.`,
      );
    }
    previous = tier.floor;
  }
  return problems;
}

// ── What a screen reads ─────────────────────────────────────────────────────

/** One champion on the descent, as they stand right now. */
export const deepRunMemberSchema = z.object({
  championId: z.string(),
  championKey: z.string(),
  name: z.string(),
  level: z.number().int(),
  rank: z.number().int(),
  /** Health left as a percentage of their maximum, carried between floors. */
  hpPct: z.number(),
  alive: z.boolean(),
});
export type DeepRunMember = z.infer<typeof deepRunMemberSchema>;

/** A door on the current floor. */
export const deepRunDoorSchema = z.object({
  roomKey: z.string(),
  name: z.string(),
  kind: z.enum(DEEP_RUN_ROOM_KINDS),
  description: z.string(),
  /** Enemy keys behind it, wave by wave — a fight you can look at before choosing it. */
  waves: z.array(z.array(z.string())),
  healPct: z.number(),
  rewards: z.record(z.string(), z.number()),
});
export type DeepRunDoor = z.infer<typeof deepRunDoorSchema>;

/** A boon on offer, or one already held. */
export const deepRunBoonStandingSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  rarity: z.string(),
  /** How many copies are held. Always 1 on an offer. */
  count: z.number().int(),
});
export type DeepRunBoonStanding = z.infer<typeof deepRunBoonStandingSchema>;

export const deepRunTierStandingSchema = z.object({
  key: z.string(),
  name: z.string(),
  floor: z.number().int(),
  rewards: z.record(z.string(), z.number()),
  reached: z.boolean(),
});
export type DeepRunTierStanding = z.infer<typeof deepRunTierStandingSchema>;

/**
 * What the descent is waiting for.
 *
 * A run is a small state machine and the screen is a drawing of it, so the phase is sent
 * rather than inferred from which arrays happen to be empty — three near-identical
 * emptiness checks on the client is how two of them end up disagreeing.
 */
export const DEEP_RUN_PHASES = ['choosingDoor', 'inBattle', 'choosingBoon', 'ended'] as const;
export type DeepRunPhase = (typeof DEEP_RUN_PHASES)[number];

export const deepRunStateSchema = z.object({
  runKey: z.string(),
  name: z.string(),
  tagline: z.string(),
  lore: z.string(),

  /** Descents left today, and how many a day there are. */
  runsLeft: z.number().int(),
  runsPerDay: z.number().int(),
  /** The bottom of the descent — reaching it ends the run in triumph. */
  floors: z.number().int(),

  /** Null when no descent is under way. Everything below it is about the live run. */
  phase: z.enum(DEEP_RUN_PHASES).nullable(),
  /** The floor being fought or chosen on. 0 before a run begins. */
  floor: z.number().int(),
  /** The deepest floor this run has reached. */
  deepest: z.number().int(),
  party: z.array(deepRunMemberSchema),
  boons: z.array(deepRunBoonStandingSchema),
  /** The doors on this floor, when the run is waiting for one to be chosen. */
  doors: z.array(deepRunDoorSchema),
  /** The boons on offer, when the run is waiting for one to be taken. */
  boonOffer: z.array(deepRunBoonStandingSchema),
  /** The battle to resume, when a fight is under way. */
  battleId: z.string().nullable(),

  depthTiers: z.array(deepRunTierStandingSchema),
  /** What the *last finished* run was paid, so the screen can say so. */
  lastRunRewards: z.record(z.string(), z.number()),
  lastRunFloor: z.number().int(),

  /** Why a descent cannot be begun, in the sentence the button shows. Null when it can. */
  blockedReason: z.string().nullable(),
});
export type DeepRunState = z.infer<typeof deepRunStateSchema>;

export const deepRunViewSchema = z.object({
  today: z.string(),
  runs: z.array(deepRunStateSchema),
});
export type DeepRunView = z.infer<typeof deepRunViewSchema>;

export const NO_DEEP_RUN: DeepRunView = Object.freeze({ today: '', runs: [] });

export const beginDeepRunRequestSchema = z.object({
  championIds: z.array(z.string().uuid()).min(1).max(4),
  actionId: z.string().min(8).max(64),
});

export const enterDeepRunRoomRequestSchema = z.object({
  roomKey: z.string().min(1).max(64),
  actionId: z.string().min(8).max(64),
});

export const takeDeepRunBoonRequestSchema = z.object({
  boonKey: z.string().min(1).max(64),
  actionId: z.string().min(8).max(64),
});

export const retireDeepRunRequestSchema = z.object({
  actionId: z.string().min(8).max(64),
});

/** What a finished descent paid, for the screen that says so. */
export const deepRunOutcomeSchema = z.object({
  floor: z.number().int(),
  /** True when the party reached the bottom rather than being stopped. */
  completed: z.boolean(),
  tierKey: z.string().nullable(),
  tierName: z.string().nullable(),
  rewards: z.record(z.string(), z.number()),
});
export type DeepRunOutcome = z.infer<typeof deepRunOutcomeSchema>;

export type { DeepRunBoon, DeepRunDef, DeepRunRoom, DeepRunTier };
