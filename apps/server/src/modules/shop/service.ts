import { randomInt } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { createRng, type Rng } from '@mistvale/engine';
import type { ChampionDef, ShopDef, ShopOffer, ShopSlot, ShopStock } from '@mistvale/shared';
import { gearInstances, players, shopStates } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import type { ShopStateRow } from '../../db/schema/inventory';
import { AppError } from '../../lib/errors';
import { track } from '../meta/progress';
import { grant, grantItems, payRewards } from '../rewards/service';
import { createGear, rollBand, toDto, type GearContext } from '../gear/service';
import { grantChampion } from '../roster/service';

/**
 * The Bazaar.
 *
 * Stock is rolled per player and stored: what a player is looking at has to still be
 * there when they tap it, and what they were offered has to be as auditable afterwards as
 * a drop. A read past the restock time rolls the next window in the same transaction that
 * serves it, so the shop refreshes itself without a scheduler.
 *
 * The seed comes from the OS CSPRNG, not from anything a player can see — the engine's
 * deterministic RNG is for replays, and a shop roll is not one.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** A slot as stored: enough to reconstruct the offer without re-rolling it. */
interface StoredSlot {
  index: number;
  offerKey: string;
  /** Relic id, for a `gear` offer whose piece was rolled at stock time. */
  gearId: string | null;
  price: number;
  purchased: boolean;
}

export interface ShopContext {
  def: ShopDef;
  gear: GearContext;
  champions: ReadonlyMap<string, ChampionDef>;
  itemNames: ReadonlyMap<string, string>;
}

/** A fresh 32-bit seed. Shop rolls must not be predictable from a battle replay. */
function freshSeed(): number {
  return randomInt(0, 2 ** 31 - 1);
}

/** Which day the daily limits are counted against. */
function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// ── Stocking ────────────────────────────────────────────────────────────────

/**
 * Chooses what fills each slot.
 *
 * Weighted without replacement, so one window never shows the same offer twice — four
 * identical Faded Sigil slots would read as a bug even though the weights allow it.
 * When the offers run out (a small shop, or a low-level player who qualifies for few of
 * them) the remaining slots repeat rather than sit empty.
 */
function chooseOffers(
  rng: Rng,
  def: ShopDef,
  slotCount: number,
  accountLevel: number,
): ShopOffer[] {
  const eligible = def.offers.filter((offer) => offer.minAccountLevel <= accountLevel);
  if (eligible.length === 0) return [];

  const pool = [...eligible];
  const chosen: ShopOffer[] = [];

  for (let slot = 0; slot < slotCount; slot += 1) {
    const source = pool.length > 0 ? pool : eligible;
    const total = source.reduce((sum, offer) => sum + Math.max(0, offer.weight), 0);
    if (total <= 0) {
      chosen.push(source[rng.int(0, source.length - 1)]!);
      continue;
    }

    let roll = rng.next() * total;
    let picked = source[source.length - 1]!;
    for (const offer of source) {
      roll -= Math.max(0, offer.weight);
      if (roll <= 0) {
        picked = offer;
        break;
      }
    }
    chosen.push(picked);
    if (pool.length > 0) {
      const index = pool.indexOf(picked);
      if (index >= 0) pool.splice(index, 1);
    }
  }

  return chosen;
}

/** Rolls a whole window and writes it, replacing whatever was there. */
async function stock(
  tx: Executor,
  playerId: string,
  accountLevel: number,
  context: ShopContext,
  existing: ShopStateRow | null,
  now: Date,
  contentRev: number,
): Promise<ShopStateRow> {
  const seed = freshSeed();
  const rng = createRng(seed);
  const unlocked = existing?.unlockedSlots ?? 0;
  const slotCount = context.def.baseSlots + Math.min(unlocked, context.def.crystalSlots);
  const offers = chooseOffers(rng, context.def, slotCount, accountLevel);

  const slots: StoredSlot[] = [];
  for (const [index, offer] of offers.entries()) {
    let gearId: string | null = null;
    let price = offer.price;

    if (offer.kind === 'gear' && offer.gear) {
      const request = rollBand(
        rng,
        {
          setKeys: offer.gear.setKeys,
          slots: [],
          rankMin: offer.gear.rankMin,
          rankMax: offer.gear.rankMax,
          rarityWeights: offer.gear.rarityWeights,
        },
        context.gear,
      );
      if (!request) continue;
      // The relic is created up front and simply reassigned on purchase — that is what
      // lets the shop show the actual main stat and substats before anyone commits.
      const row = await createGear(
        tx,
        playerId,
        { ...request, source: `shop:${context.def.key}` },
        rng,
        context.gear,
      );
      gearId = row.id;
      price = offer.price + offer.pricePerRank * (request.rank - offer.gear.rankMin);
    }

    slots.push({ index, offerKey: offer.key, gearId, price, purchased: false });
  }

  const restocksAt = new Date(now.getTime() + context.def.restockMinutes * 60_000);
  const values = {
    playerId,
    shopKey: context.def.key,
    restocksAt,
    unlockedSlots: unlocked,
    slots,
    dailyCounts: existing?.dailyCountsOn === today(now) ? existing.dailyCounts : {},
    dailyCountsOn: today(now),
    seed,
    contentRev,
    updatedAt: now,
  };

  const [row] = await tx
    .insert(shopStates)
    .values(values)
    .onConflictDoUpdate({
      target: [shopStates.playerId, shopStates.shopKey],
      set: {
        restocksAt: values.restocksAt,
        slots: values.slots,
        dailyCounts: values.dailyCounts,
        dailyCountsOn: values.dailyCountsOn,
        seed: values.seed,
        contentRev: values.contentRev,
        updatedAt: values.updatedAt,
      },
    })
    .returning();
  if (!row) throw new AppError('INTERNAL', 'The shop could not be stocked.');

  // Relics rolled for a window that is being replaced are no longer for sale; the ones
  // nobody bought are cleaned up by the caller's own stock replacement below.
  return row;
}

/** Drops the unsold relics a replaced window had rolled. */
async function discardUnsold(tx: Executor, previous: ShopStateRow | null): Promise<void> {
  if (!previous) return;
  const stored = previous.slots as StoredSlot[];
  const ids = stored.filter((slot) => !slot.purchased && slot.gearId).map((slot) => slot.gearId!);
  if (ids.length === 0) return;
  await tx.delete(gearInstances).where(inArray(gearInstances.id, ids));
}

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * The player's current stock, restocking first if the window has expired.
 *
 * Reads are writes here, which is unusual enough to say out loud: a shop with an expired
 * window has to roll a new one before it can answer, and doing that lazily on read is
 * what keeps the game free of a scheduler for something only a fraction of players look
 * at in any given hour.
 */
export async function stockFor(
  db: Database,
  playerId: string,
  context: ShopContext,
  contentRev: number,
  now: Date = new Date(),
): Promise<ShopStock> {
  const row = await db.transaction(async (tx) => {
    const [player] = await tx
      .select({ level: players.level })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');

    const [existing] = await tx
      .select()
      .from(shopStates)
      .where(and(eq(shopStates.playerId, playerId), eq(shopStates.shopKey, context.def.key)));

    if (existing && existing.restocksAt > now) return existing;

    await discardUnsold(tx, existing ?? null);
    return stock(tx, playerId, player.level, context, existing ?? null, now, contentRev);
  });

  return presentStock(db, row, context);
}

/** Turns a stored window into the DTO, resolving names and relics. */
export async function presentStock(
  db: Executor,
  row: ShopStateRow,
  context: ShopContext,
): Promise<ShopStock> {
  const stored = row.slots as StoredSlot[];
  const offers = new Map(context.def.offers.map((offer) => [offer.key, offer]));
  const counts = row.dailyCounts as Record<string, number>;

  const gearIds = stored.map((slot) => slot.gearId).filter((id): id is string => id !== null);
  const gearRows = await loadGear(db, gearIds);

  const slots: ShopSlot[] = stored.map((slot) => {
    const offer = offers.get(slot.offerKey);
    const gearRow = slot.gearId ? gearRows.get(slot.gearId) : undefined;
    const bought = counts[slot.offerKey] ?? 0;
    const limitHit = offer !== undefined && offer.dailyLimit > 0 && bought >= offer.dailyLimit;

    return {
      index: slot.index,
      offerKey: slot.offerKey,
      kind: offer?.kind ?? 'item',
      name: offer?.name ?? slot.offerKey,
      price: slot.price,
      currency: offer?.currency ?? 'silver',
      quantity: offer?.quantity ?? 1,
      refKey: offer?.refKey ?? '',
      gear: gearRow ? toDto(gearRow, context.gear) : null,
      purchased: slot.purchased,
      slotLocked: slot.index >= context.def.baseSlots + row.unlockedSlots,
      unavailableReason: slot.purchased
        ? 'Bought'
        : limitHit
          ? 'That is all of those for today'
          : null,
    };
  });

  return {
    shopKey: context.def.key,
    name: context.def.name,
    description: context.def.description,
    restocksAt: row.restocksAt.toISOString(),
    refreshCost: context.def.refreshCost,
    crystalSlotCost: context.def.crystalSlotCost,
    unlockedCrystalSlots: row.unlockedSlots,
    slots,
  };
}

async function loadGear(db: Executor, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, Awaited<ReturnType<typeof rowsById>>[number]>();
  const rows = await rowsById(db, ids);
  return new Map(rows.map((row) => [row.id, row]));
}

async function rowsById(db: Executor, ids: readonly string[]) {
  return db
    .select()
    .from(gearInstances)
    .where(inArray(gearInstances.id, [...ids]));
}

// ── Buying ──────────────────────────────────────────────────────────────────

export interface PurchaseOutcome {
  stock: ShopStock;
  silver: number;
  crystals: number;
  granted: {
    itemKey: string | null;
    quantity: number;
    gear: ShopSlot['gear'];
    championKey: string | null;
  };
}

export async function buy(
  db: Database,
  playerId: string,
  slotIndex: number,
  context: ShopContext,
  content: ContentCache,
  now: Date = new Date(),
): Promise<PurchaseOutcome> {
  const { row, granted } = await db.transaction(async (tx) => {
    const [player] = await tx
      .select({ level: players.level })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');

    const [state] = await tx
      .select()
      .from(shopStates)
      .where(and(eq(shopStates.playerId, playerId), eq(shopStates.shopKey, context.def.key)))
      .for('update');
    if (!state) throw AppError.notFound('The shop has no stock for you yet.');
    if (state.restocksAt <= now) {
      throw new AppError('ALREADY_EXISTS', 'That stock has expired. Open the shop again.');
    }

    const stored = [...(state.slots as StoredSlot[])];
    const slot = stored.find((entry) => entry.index === slotIndex);
    if (!slot) throw AppError.notFound('No such slot.');
    if (slot.purchased) throw new AppError('ALREADY_EXISTS', 'You already bought that.');
    if (slot.index >= context.def.baseSlots + state.unlockedSlots) {
      throw new AppError('VALIDATION', 'That slot is not unlocked.');
    }

    const offer = context.def.offers.find((entry) => entry.key === slot.offerKey);
    if (!offer) throw AppError.notFound('That offer is no longer published.');
    if (offer.minAccountLevel > player.level) {
      throw new AppError('VALIDATION', `That needs account level ${offer.minAccountLevel}.`);
    }

    const counts = { ...(state.dailyCounts as Record<string, number>) };
    const sameDay = state.dailyCountsOn === today(now);
    const bought = sameDay ? (counts[offer.key] ?? 0) : 0;
    if (offer.dailyLimit > 0 && bought >= offer.dailyLimit) {
      throw new AppError('VALIDATION', 'You have bought all of those for today.');
    }

    await grant(
      tx,
      playerId,
      offer.currency === 'silver' ? { silver: -slot.price } : { crystals: -slot.price },
      `shop:${context.def.key}:${offer.key}`,
    );

    const result: PurchaseOutcome['granted'] = {
      itemKey: null,
      quantity: offer.quantity,
      gear: null,
      championKey: null,
    };

    if (offer.kind === 'item') {
      await grantItems(
        tx,
        playerId,
        { [offer.refKey]: offer.quantity },
        `shop:${context.def.key}:${offer.key}`,
      );
      result.itemKey = offer.refKey;
    } else if (offer.kind === 'champion') {
      const def = context.champions.get(offer.refKey);
      if (!def) throw AppError.notFound('That champion is no longer published.');
      await grantChampion(tx, playerId, def.key, {}, [def]);
      result.championKey = def.key;
    } else if (offer.kind === 'gear') {
      // The relic already exists and already belongs to the player; buying it is what
      // stops the next restock from sweeping it away.
      if (!slot.gearId) throw new AppError('INTERNAL', 'That slot has no relic attached.');
      const [gearRow] = await rowsById(tx, [slot.gearId]);
      if (!gearRow) throw AppError.notFound('That relic is gone.');
      result.gear = toDto(gearRow, context.gear);
    } else if (offer.kind === 'currency') {
      // `currency` has been a published offer kind since P4 with **no branch here**, so an
      // offer authored with it took the payment and granted nothing — the one failure a
      // shop must never have. Nothing in the seeds used it, so nobody was ever charged for
      // it, and publish refuses a scalar it cannot pay now (`validate.ts`).
      //
      // Paid through `payRewards` rather than a bespoke grant, so a shop selling energy or
      // hours of XP boost needs no more code than one selling silver: it is the same
      // reward map every other content family pays.
      await payRewards(
        tx,
        playerId,
        { [offer.refKey]: offer.quantity },
        `shop:${context.def.key}:${offer.key}`,
      );
      result.itemKey = offer.refKey;
    }

    slot.purchased = true;
    counts[offer.key] = bought + 1;

    const [updated] = await tx
      .update(shopStates)
      .set({
        slots: stored,
        dailyCounts: counts,
        dailyCountsOn: today(now),
        updatedAt: now,
      })
      .where(eq(shopStates.id, state.id))
      .returning();
    if (!updated) throw new AppError('INTERNAL', 'The purchase could not be recorded.');

    // Which shop rides along, so a daily can ask for the Bazaar specifically rather than
    // being satisfied by a crystal-shop energy refill.
    await track(tx, { content }, playerId, [
      { type: 'shopPurchase', facts: { shopKey: context.def.key } },
    ]);

    return { row: updated, granted: result };
  });

  const [wallet] = await db
    .select({ silver: players.silver, crystals: players.crystals })
    .from(players)
    .where(eq(players.id, playerId));

  return {
    stock: await presentStock(db, row, context),
    silver: wallet?.silver ?? 0,
    crystals: wallet?.crystals ?? 0,
    granted,
  };
}

// ── Crystal actions ─────────────────────────────────────────────────────────

/** Pays crystals to roll a new window immediately. */
export async function refresh(
  db: Database,
  playerId: string,
  context: ShopContext,
  contentRev: number,
  now: Date = new Date(),
): Promise<ShopStock> {
  const row = await db.transaction(async (tx) => {
    const [player] = await tx
      .select({ level: players.level })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');

    const [existing] = await tx
      .select()
      .from(shopStates)
      .where(and(eq(shopStates.playerId, playerId), eq(shopStates.shopKey, context.def.key)))
      .for('update');

    if (context.def.refreshCost > 0) {
      await grant(
        tx,
        playerId,
        { crystals: -context.def.refreshCost },
        `shop:${context.def.key}:refresh`,
      );
    }

    await discardUnsold(tx, existing ?? null);
    return stock(tx, playerId, player.level, context, existing ?? null, now, contentRev);
  });

  return presentStock(db, row, context);
}

/** Opens one more crystal slot, permanently. It fills on the next restock. */
export async function unlockSlot(
  db: Database,
  playerId: string,
  context: ShopContext,
): Promise<ShopStock> {
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(shopStates)
      .where(and(eq(shopStates.playerId, playerId), eq(shopStates.shopKey, context.def.key)))
      .for('update');
    if (!existing) throw AppError.notFound('The shop has no stock for you yet.');
    if (existing.unlockedSlots >= context.def.crystalSlots) {
      throw new AppError('VALIDATION', 'Every slot is already open.');
    }

    await grant(
      tx,
      playerId,
      { crystals: -context.def.crystalSlotCost },
      `shop:${context.def.key}:slot`,
    );

    const [updated] = await tx
      .update(shopStates)
      .set({ unlockedSlots: existing.unlockedSlots + 1, updatedAt: new Date() })
      .where(eq(shopStates.id, existing.id))
      .returning();
    if (!updated) throw new AppError('INTERNAL', 'The slot could not be opened.');
    return updated;
  });

  return presentStock(db, row, context);
}
