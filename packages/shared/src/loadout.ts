import { z } from 'zod';
import { ACCESSORY_ASCENSION_REQUIREMENT, GEAR_SLOTS, type GearSlot } from './enums';

/**
 * Relic loadouts — a champion's nine pieces, saved and swapped as one thing.
 *
 * Moving a build today is nine unequips, nine equips, and nine things to remember; the
 * owner's list (2026-08-22) named it as the small change felt most often. So a loadout is
 * a **named list of relic ids belonging to the account**, not to a champion — which is the
 * shape that serves both of the things players actually want:
 *
 *  - *One good set, moved between champions as content demands.* Apply it to whoever needs
 *    it; the relics come off whoever had them.
 *  - *Two builds for one champion — an arena set and a Titan set.* Two loadouts, both
 *    applied to the same champion.
 *
 * The planning is pure and lives here, because what applying a loadout *would do* is the
 * part worth being certain about: relics get sold, champions ascend at different times, and
 * the vault has a cap that unequipping can hit. The server plans first and then writes, and
 * the screen shows the same plan before the player commits — one rule read twice, not two.
 */

// ── The saved thing ─────────────────────────────────────────────────────────

export const loadoutSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Relic ids, in no particular order — a relic's own slot is where it goes. */
  gearIds: z.array(z.string()),
  /** The champion it was captured from, for the "saved from" line. May no longer own it. */
  fromChampionId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Loadout = z.infer<typeof loadoutSchema>;

export const LOADOUT_NAME_MAX = 32;

export const saveLoadoutRequestSchema = z.object({
  name: z.string().trim().min(1).max(LOADOUT_NAME_MAX),
  /** Whose gear to capture. Every relic they are wearing goes into the loadout. */
  championId: z.string().uuid(),
});
export type SaveLoadoutRequest = z.infer<typeof saveLoadoutRequestSchema>;

export const applyLoadoutRequestSchema = z.object({
  championId: z.string().uuid(),
  actionId: z.string().min(8).max(64),
});
export type ApplyLoadoutRequest = z.infer<typeof applyLoadoutRequestSchema>;

export const renameLoadoutRequestSchema = z.object({
  name: z.string().trim().min(1).max(LOADOUT_NAME_MAX),
});
export type RenameLoadoutRequest = z.infer<typeof renameLoadoutRequestSchema>;

// ── Planning ────────────────────────────────────────────────────────────────

/** Why a relic in a loadout is not going to be worn. */
export const LOADOUT_SKIPS = ['missing', 'ascension', 'alreadyOn'] as const;
export type LoadoutSkip = (typeof LOADOUT_SKIPS)[number];

export interface LoadoutPlanEntry {
  gearId: string;
  slot: GearSlot;
  /** Who is wearing it right now, if anybody. */
  fromChampionId: string | null;
}

export interface LoadoutSkipEntry {
  gearId: string;
  reason: LoadoutSkip;
  /** Phrased for the player. */
  detail: string;
}

export interface LoadoutPlan {
  /** Relics that will be put on, each with the slot it fills. */
  equip: LoadoutPlanEntry[];
  /** Relics coming off the target champion to make room. */
  remove: LoadoutPlanEntry[];
  /** Relics in the loadout that are staying where they are, and why. */
  skipped: LoadoutSkipEntry[];
  /**
   * How many more loose relics the vault will hold afterwards.
   *
   * Not simply `remove.length`: a relic taken off *another* champion goes straight onto
   * this one and never touches the vault, while a loose relic being worn frees a slot.
   * Getting this wrong is a loadout that overflows a full vault halfway through.
   */
  vaultDelta: number;
}

/** A relic as the planner needs to see it — the subset every caller already holds. */
export interface PlannableGear {
  id: string;
  slot: GearSlot;
  equippedChampionId: string | null;
}

const SLOT_NAMES: Readonly<Record<GearSlot, string>> = Object.freeze({
  weapon: 'Weapon',
  helm: 'Helm',
  shield: 'Shield',
  gauntlets: 'Gauntlets',
  cuirass: 'Cuirass',
  boots: 'Boots',
  ring: 'Ring',
  amulet: 'Amulet',
  banner: 'Banner',
});

/**
 * What applying this loadout to this champion would do.
 *
 * Pure, and the same function the server plans with and the screen previews with. Three
 * things it has to get right, and each of them is a bug somebody would otherwise find the
 * hard way:
 *
 *  - **A sold relic is skipped, not fatal.** A loadout naming a piece that has been sold or
 *    fed away is an ordinary state of the world months after saving it, and refusing the
 *    whole apply would make loadouts rot.
 *  - **An accessory the champion has not ascended to is skipped**, with the requirement in
 *    the sentence — the same gate `equip` enforces, so the preview cannot promise something
 *    the server will refuse.
 *  - **A relic already on the target stays put**, and does not appear as a removal. Two
 *    applies in a row should be one apply and one no-op.
 */
export function planLoadout(
  gearIds: readonly string[],
  owned: readonly PlannableGear[],
  target: { id: string; ascension: number },
): LoadoutPlan {
  const byId = new Map(owned.map((piece) => [piece.id, piece]));
  const equip: LoadoutPlanEntry[] = [];
  const skipped: LoadoutSkipEntry[] = [];
  // Slots the loadout is going to fill, so the removals are exactly those and no more —
  // a loadout missing its boots must not strip the boots the champion is already wearing.
  const filling = new Set<GearSlot>();
  // And the pieces that are *staying*, which is not the same as the pieces being put on:
  // a relic the target already wears is skipped rather than equipped, and a removal list
  // built from "everything not in `equip`" would take it straight back off. That is a
  // second apply undoing the first.
  const keeping = new Set<string>();

  for (const gearId of gearIds) {
    const piece = byId.get(gearId);
    if (!piece) {
      skipped.push({
        gearId,
        reason: 'missing',
        detail: 'No longer in the vault — sold, or fed to something.',
      });
      continue;
    }
    const required = ACCESSORY_ASCENSION_REQUIREMENT[piece.slot] ?? 0;
    if (target.ascension < required) {
      skipped.push({
        gearId,
        reason: 'ascension',
        detail: `${SLOT_NAMES[piece.slot]} needs ascension ${required}; this champion is at ${target.ascension}.`,
      });
      continue;
    }
    if (piece.equippedChampionId === target.id) {
      skipped.push({ gearId, reason: 'alreadyOn', detail: 'Already worn by this champion.' });
      filling.add(piece.slot);
      keeping.add(piece.id);
      continue;
    }
    equip.push({ gearId, slot: piece.slot, fromChampionId: piece.equippedChampionId });
    filling.add(piece.slot);
  }

  const remove = owned
    .filter(
      (piece) =>
        piece.equippedChampionId === target.id && filling.has(piece.slot) && !keeping.has(piece.id),
    )
    .map((piece) => ({ gearId: piece.id, slot: piece.slot, fromChampionId: target.id }));

  // Every removal adds a loose relic; every loose relic put on takes one away. A relic
  // moved from another champion is neither.
  const freed = equip.filter((entry) => entry.fromChampionId === null).length;
  return { equip, remove, skipped, vaultDelta: remove.length - freed };
}

/** Every slot a loadout covers — the paperdoll's "this is a full set" line. */
export function slotsCovered(
  gearIds: readonly string[],
  owned: readonly PlannableGear[],
): GearSlot[] {
  const byId = new Map(owned.map((piece) => [piece.id, piece]));
  const slots = new Set<GearSlot>();
  for (const gearId of gearIds) {
    const slot = byId.get(gearId)?.slot;
    if (slot) slots.add(slot);
  }
  return GEAR_SLOTS.filter((slot) => slots.has(slot));
}
