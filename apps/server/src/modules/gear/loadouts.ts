import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  LOADOUT_NAME_MAX,
  planLoadout,
  type Loadout,
  type LoadoutPlan,
  type PlannableGear,
  type GearSlot,
} from '@mistvale/shared';
import { gearInstances, gearLoadouts, playerChampions } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import type { GearLoadoutRow } from '../../db/schema/inventory';
import { AppError } from '../../lib/errors';
import { track } from '../meta/progress';
import { vaultState, type GearContext } from './service';

/**
 * Saved relic sets.
 *
 * Moving a build was nine unequips, nine equips and nine things to remember. A loadout is
 * a named list of relic ids on the account — see `@mistvale/shared/loadout` for why that
 * shape rather than one hung off a champion.
 *
 * **The planning is pure and shared with the client** (`planLoadout`), and this module is
 * the part that cannot be: reading what is owned, checking the vault, and writing the
 * moves in one transaction. The order of the writes is the only subtle thing here and it
 * is the same subtlety `equip` has — the partial unique index on `(champion, slot)` must
 * never see two occupants, so every slot is cleared before anything is put into it.
 */

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * How many loadouts an account may keep.
 *
 * Operator-editable like every other limit in the game, because "how many is too many" is
 * a judgement about the screen rather than a fact about the code — and a list nobody can
 * scan is not a feature.
 */
export const DEFAULT_MAX_LOADOUTS = 12;

export function maxLoadouts(config: Readonly<Record<string, unknown>>): number {
  const value = config['gear.maxLoadouts'];
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_MAX_LOADOUTS;
}

function toDto(row: GearLoadoutRow): Loadout {
  return {
    id: row.id,
    name: row.name,
    gearIds: row.gearIds,
    fromChampionId: row.fromChampionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function list(db: Database, playerId: string): Promise<Loadout[]> {
  const rows = await db
    .select()
    .from(gearLoadouts)
    .where(eq(gearLoadouts.playerId, playerId))
    .orderBy(gearLoadouts.createdAt);
  return rows.map(toDto);
}

/**
 * Captures what a champion is wearing, under a name.
 *
 * A champion wearing nothing is refused rather than saved empty: an empty loadout can only
 * ever do nothing, and finding out why is a worse minute than being told now.
 */
export async function save(
  db: Database,
  playerId: string,
  content: ContentCache,
  name: string,
  championId: string,
): Promise<Loadout> {
  return db.transaction(async (tx) => {
    const [champion] = await tx
      .select({ id: playerChampions.id })
      .from(playerChampions)
      .where(and(eq(playerChampions.id, championId), eq(playerChampions.playerId, playerId)));
    if (!champion) throw AppError.notFound('No such champion.');

    const worn = await tx
      .select({ id: gearInstances.id })
      .from(gearInstances)
      .where(
        and(eq(gearInstances.playerId, playerId), eq(gearInstances.equippedChampionId, championId)),
      );
    if (worn.length === 0) {
      throw new AppError(
        'VALIDATION',
        'That champion is wearing nothing — there is no set to save.',
      );
    }

    const trimmed = name.trim().slice(0, LOADOUT_NAME_MAX);
    const [existing] = await tx
      .select({ id: gearLoadouts.id })
      .from(gearLoadouts)
      .where(and(eq(gearLoadouts.playerId, playerId), eq(gearLoadouts.name, trimmed)));

    // Saving over a name replaces it rather than refusing. "Save my current gear as Speed
    // set" said twice in a week means the second one, and a player who wanted a second set
    // would have given it a second name.
    if (existing) {
      const [updated] = await tx
        .update(gearLoadouts)
        .set({
          gearIds: worn.map((piece) => piece.id),
          fromChampionId: championId,
          updatedAt: new Date(),
        })
        .where(eq(gearLoadouts.id, existing.id))
        .returning();
      if (!updated) throw AppError.notFound('No such loadout.');
      return toDto(updated);
    }

    const [held] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(gearLoadouts)
      .where(eq(gearLoadouts.playerId, playerId));
    const cap = maxLoadouts(content.current().bundle.config);
    if ((held?.count ?? 0) >= cap) {
      throw new AppError(
        'VALIDATION',
        `You can keep ${cap} loadouts. Rename or delete one to make room.`,
      );
    }

    const [row] = await tx
      .insert(gearLoadouts)
      .values({
        playerId,
        name: trimmed,
        gearIds: worn.map((piece) => piece.id),
        fromChampionId: championId,
      })
      .returning();
    if (!row) throw new AppError('INTERNAL', 'Could not save that loadout.');
    return toDto(row);
  });
}

export async function rename(
  db: Database,
  playerId: string,
  loadoutId: string,
  name: string,
): Promise<Loadout> {
  const [row] = await db
    .update(gearLoadouts)
    .set({ name: name.trim().slice(0, LOADOUT_NAME_MAX), updatedAt: new Date() })
    .where(and(eq(gearLoadouts.id, loadoutId), eq(gearLoadouts.playerId, playerId)))
    .returning();
  if (!row) throw AppError.notFound('No such loadout.');
  return toDto(row);
}

export async function remove(db: Database, playerId: string, loadoutId: string): Promise<void> {
  const [row] = await db
    .delete(gearLoadouts)
    .where(and(eq(gearLoadouts.id, loadoutId), eq(gearLoadouts.playerId, playerId)))
    .returning({ id: gearLoadouts.id });
  if (!row) throw AppError.notFound('No such loadout.');
}

/** What the loadout's relics look like to the planner, read under the caller's lock. */
async function plannable(tx: Tx, playerId: string): Promise<PlannableGear[]> {
  const rows = await tx
    .select({
      id: gearInstances.id,
      slot: gearInstances.slot,
      equippedChampionId: gearInstances.equippedChampionId,
    })
    .from(gearInstances)
    .where(eq(gearInstances.playerId, playerId));
  return rows.map((row) => ({
    id: row.id,
    slot: row.slot as GearSlot,
    equippedChampionId: row.equippedChampionId,
  }));
}

export interface ApplyResult {
  plan: LoadoutPlan;
  /** Every relic that moved, so the client can re-read exactly what changed. */
  changed: string[];
}

/**
 * Puts a saved set on a champion.
 *
 * Planned first and written second, and the plan is the same pure function the screen
 * previews with — so what a player is shown before they press it is what happens.
 *
 * Two refusals rather than a partial apply:
 *
 *  - **A vault that cannot hold what comes off.** Unequipping puts relics back in the
 *    vault, and the cap counts loose relics (Q5). The plan's `vaultDelta` is the *net*
 *    change, so a set arriving from another champion costs nothing and a set arriving from
 *    the vault frees room — a naive `remove.length` check would refuse applies that fit.
 *  - **A loadout with nothing left to do.** Every piece sold, or every piece already worn.
 *    Silence would read as a broken button.
 */
export async function apply(
  db: Database,
  playerId: string,
  content: ContentCache,
  loadoutId: string,
  championId: string,
  context: GearContext,
): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const [loadout] = await tx
      .select()
      .from(gearLoadouts)
      .where(and(eq(gearLoadouts.id, loadoutId), eq(gearLoadouts.playerId, playerId)));
    if (!loadout) throw AppError.notFound('No such loadout.');

    const [champion] = await tx
      .select({ id: playerChampions.id, ascension: playerChampions.ascension })
      .from(playerChampions)
      .where(and(eq(playerChampions.id, championId), eq(playerChampions.playerId, playerId)))
      .for('update');
    if (!champion) throw AppError.notFound('No such champion.');

    const owned = await plannable(tx, playerId);
    const plan = planLoadout(loadout.gearIds, owned, {
      id: champion.id,
      ascension: champion.ascension,
    });

    if (plan.equip.length === 0 && plan.remove.length === 0) {
      const gone = plan.skipped.filter((entry) => entry.reason === 'missing').length;
      throw new AppError(
        'VALIDATION',
        gone === loadout.gearIds.length && gone > 0
          ? 'Every relic in that loadout has been sold.'
          : 'That loadout is already on this champion.',
      );
    }

    if (plan.vaultDelta > 0) {
      const vault = await vaultState(tx, playerId, context);
      if (vault.used + plan.vaultDelta > vault.capacity) {
        throw new AppError(
          'VALIDATION',
          `Your vault has room for ${vault.capacity - vault.used} more and this would put ${plan.vaultDelta} back. Sell something, or buy more room.`,
        );
      }
    }

    const now = new Date();
    // Everything comes off first — the target's displaced pieces *and* whatever the
    // incoming relics are currently on. The partial unique index on `(champion, slot)`
    // would otherwise see two occupants for the instant between two statements, which is
    // the same reason `equip` clears a slot before filling it.
    const clearing = [
      ...plan.remove.map((entry) => entry.gearId),
      ...plan.equip.map((entry) => entry.gearId),
    ];
    await tx
      .update(gearInstances)
      .set({ equippedChampionId: null, updatedAt: now })
      .where(and(eq(gearInstances.playerId, playerId), inArray(gearInstances.id, clearing)));

    if (plan.equip.length > 0) {
      await tx
        .update(gearInstances)
        .set({ equippedChampionId: championId, updatedAt: now })
        .where(
          and(
            eq(gearInstances.playerId, playerId),
            inArray(
              gearInstances.id,
              plan.equip.map((entry) => entry.gearId),
            ),
          ),
        );
    }

    // Applying a set *is* equipping relics — a daily asking for one is satisfied by doing
    // it the fast way, which is the only reading that does not punish using the feature.
    // One report per piece, with its slot, exactly as `equip` sends them.
    if (plan.equip.length > 0) {
      await track(
        tx,
        { content },
        playerId,
        plan.equip.map((entry) => ({ type: 'gearEquip' as const, facts: { slot: entry.slot } })),
      );
    }

    return { plan, changed: clearing };
  });
}
