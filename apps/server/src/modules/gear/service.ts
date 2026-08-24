import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { createRng, type Rng } from '@mistvale/engine';
import {
  ACCESSORY_ASCENSION_REQUIREMENT,
  GEAR_MAX_LEVEL,
  GEAR_SLOTS,
  REFORGE_DUST_ITEM,
  type BulkUpgradeEntry,
  type BulkUpgradeResult,
  type DismantleResult,
  type GearInstance,
  type GearSlot,
  type GearStatLine,
  type GearUpgradeAttempt,
  type Rarity,
  type ReforgeQuote,
  type ReforgeResult,
  type Stat,
  type StatBlock,
} from '@mistvale/shared';
import { gearInstances, playerChampions, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import type { GearInstanceRow } from '../../db/schema/inventory';
import { AppError } from '../../lib/errors';
import { grant, grantItems, itemQuantities } from '../rewards/service';
import { track } from '../meta/progress';
import {
  applyReforge,
  applyUpgrade,
  assembleGearBonus,
  dismantleValue,
  gearEconomyFrom,
  gearTablesFrom,
  mainStatValue,
  pickRarity,
  powerScore,
  reforgeCandidates,
  reforgePrice,
  rollGear,
  sellValue,
  substatRange,
  statFormKey,
  upgradeChance,
  upgradeCost,
  vaultCapacity,
  vaultUpgradeCost,
  vaultUpgradeSlots,
  type GearEconomyConfig,
  type GearPiece,
  type GearTables,
} from './stats';

/**
 * Relics: acquiring them, wearing them, upgrading them, selling them.
 *
 * Every operation here is a transaction that holds the player row lock, because all of
 * them move something a player cares about. Equipping is the interesting one: it is a
 * *swap*, and the partial unique index on `(equipped_champion_id, slot)` means the
 * database rejects a second relic in a slot rather than trusting this code to have
 * unequipped the first one.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** The content a gear operation reads. */
export interface GearContext {
  tables: GearTables;
  economy: GearEconomyConfig;
}

export function gearContextFrom(bundle: {
  gearStats: GearContextContent['gearStats'];
  gearSlots: GearContextContent['gearSlots'];
  gearSets: GearContextContent['gearSets'];
  config: Readonly<Record<string, unknown>>;
}): GearContext {
  return {
    tables: gearTablesFrom(bundle),
    economy: gearEconomyFrom(bundle.config),
  };
}

type GearContextContent = Parameters<typeof gearTablesFrom>[0];

// ── Reading ─────────────────────────────────────────────────────────────────

/** A stored row as the maths sees it. */
export function pieceOf(row: GearInstanceRow): GearPiece {
  return {
    setKey: row.setKey,
    slot: row.slot as GearSlot,
    rank: row.rank,
    rarity: row.rarity as Rarity,
    level: row.level,
    main: row.mainStat,
    substats: row.substats,
  };
}

/** A stored row as the client sees it, with the derived numbers filled in. */
export function toDto(row: GearInstanceRow, context: GearContext): GearInstance {
  const piece = pieceOf(row);
  const nextLevel = Math.min(row.level + 1, GEAR_MAX_LEVEL);
  return {
    id: row.id,
    setKey: row.setKey,
    slot: row.slot as GearSlot,
    rank: row.rank,
    rarity: row.rarity as Rarity,
    level: row.level,
    main: row.mainStat,
    substats: row.substats,
    equippedChampionId: row.equippedChampionId,
    locked: row.locked,
    source: row.source,
    acquiredAt: row.acquiredAt.toISOString(),
    sellValue: sellValue(context.economy, piece),
    upgradeCost:
      row.level >= GEAR_MAX_LEVEL ? 0 : upgradeCost(context.economy, row.rank, nextLevel),
    upgradeChance: row.level >= GEAR_MAX_LEVEL ? 0 : upgradeChance(context.economy, nextLevel),
    dismantleValue: dismantleValue(context.economy, piece),
    reforges: row.reforges,
  };
}

export async function listGear(
  db: Executor,
  playerId: string,
  context: GearContext,
): Promise<GearInstance[]> {
  const rows = await db.select().from(gearInstances).where(eq(gearInstances.playerId, playerId));
  return rows.map((row) => toDto(row, context));
}

/** The relics worn by a set of champions, keyed by champion id. */
export async function gearByChampion(
  db: Executor,
  championIds: readonly string[],
): Promise<Map<string, GearInstanceRow[]>> {
  const grouped = new Map<string, GearInstanceRow[]>();
  if (championIds.length === 0) return grouped;

  const rows = await db
    .select()
    .from(gearInstances)
    .where(inArray(gearInstances.equippedChampionId, [...championIds]));

  for (const row of rows) {
    if (!row.equippedChampionId) continue;
    const list = grouped.get(row.equippedChampionId) ?? [];
    list.push(row);
    grouped.set(row.equippedChampionId, list);
  }
  return grouped;
}

/**
 * What a champion's relics are worth, and what that makes it.
 *
 * The one place gear turns into stats. The battle route, the roster list and the equip
 * preview all call this, which is what makes the number on the champion screen the same
 * number the engine fights with.
 */
export function assembleChampion(
  base: StatBlock,
  rows: readonly GearInstanceRow[],
  context: GearContext,
  /**
   * What masteries add, already resolved.
   *
   * Reported separately from relics in the returned block so the champion screen can show
   * three columns — what the champion is, what it is wearing, and what it has learned —
   * rather than one number a player has to take on trust.
   */
  masteries: MasteryContribution = EMPTY_MASTERIES,
): {
  gear: StatBlock;
  mastery: StatBlock;
  total: StatBlock;
  setBonuses: ReturnType<typeof assembleGearBonus>['setBonuses'];
  power: number;
} {
  const { bonus, setBonuses } = assembleGearBonus(
    base,
    rows.map(pieceOf),
    context.tables,
    masteries.setBonusAmplifyPct,
  );

  const mastery = emptyBlock();
  for (const [stat, value] of Object.entries(masteries.flat) as [keyof StatBlock, number][]) {
    mastery[stat] += value;
  }

  const total = { ...base };
  for (const stat of Object.keys(total) as (keyof StatBlock)[]) {
    total[stat] = Math.max(0, Math.round(base[stat] + bonus[stat] + mastery[stat]));
  }
  return { gear: bonus, mastery, total, setBonuses, power: powerScore(total, context.economy) };
}

/** What a champion's learned masteries are worth, before the fight starts. */
export interface MasteryContribution {
  flat: Partial<Record<keyof StatBlock, number>>;
  setBonusAmplifyPct: number;
}

const EMPTY_MASTERIES: MasteryContribution = Object.freeze({ flat: {}, setBonusAmplifyPct: 0 });

function emptyBlock(): StatBlock {
  return { hp: 0, atk: 0, def: 0, spd: 0, critRate: 0, critDmg: 0, res: 0, acc: 0 };
}

// ── Acquiring ───────────────────────────────────────────────────────────────

export interface GearRollRequest {
  setKey: string;
  slot: GearSlot;
  rank: number;
  rarity: Rarity;
  source: string;
}

// ── The vault, and what happens when it is full (Q5) ─────────────────────────

/**
 * How many loose relics this player is holding.
 *
 * Loose is the operative word: a relic on a champion is not in the vault, so equipping is
 * a way to make room and the cap presses on hoarding rather than on collecting.
 */
export async function vaultUsed(tx: Executor, playerId: string): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(gearInstances)
    .where(and(eq(gearInstances.playerId, playerId), isNull(gearInstances.equippedChampionId)));
  return row?.count ?? 0;
}

/** The vault as a player and the Bazaar both need to read it. */
export interface VaultState {
  used: number;
  capacity: number;
  /** Slots bought so far, over the content base. */
  bought: number;
  /** The ceiling purchases cannot pass. */
  max: number;
  /** What the next purchase adds and costs — 0 slots once the ceiling is reached. */
  nextSlots: number;
  nextCost: number;
}

export async function vaultState(
  tx: Executor,
  playerId: string,
  context: GearContext,
): Promise<VaultState> {
  const [player] = await tx
    .select({ bought: players.vaultSlots })
    .from(players)
    .where(eq(players.id, playerId));
  const bought = player?.bought ?? 0;
  const nextSlots = vaultUpgradeSlots(context.economy, bought);
  return {
    used: await vaultUsed(tx, playerId),
    capacity: vaultCapacity(context.economy, bought),
    bought,
    max: Math.max(context.economy.vaultBaseCapacity, context.economy.vaultMaxCapacity),
    nextSlots,
    nextCost: nextSlots > 0 ? vaultUpgradeCost(context.economy, bought) : 0,
  };
}

/**
 * What a batch of drops did when the vault could not hold all of it.
 *
 * Relics that do not fit are **not created, and their sell value is paid instead**. Losing
 * a drop outright is the obvious alternative and the wrong one: farming ten runs of a
 * stage is a single press, and a player who came back to nine relics and no explanation
 * has been punished for a cap they were never shown hitting. Silver keeps the cap a
 * question of convenience — you wanted the relic, not the money — which is the pressure it
 * is there to create.
 */
export interface VaultOverflow {
  /** Relics the vault had no room for. */
  count: number;
  /** Silver paid in their place. */
  silver: number;
}

export const NO_OVERFLOW: VaultOverflow = Object.freeze({ count: 0, silver: 0 });

/**
 * Rolls a relic and writes it.
 *
 * Rolling and persisting are one step on purpose: a relic that exists only in memory has
 * no id, and every caller — a drop, a shop purchase, a starter grant — needs the row.
 */
export async function createGear(
  tx: Executor,
  playerId: string,
  request: GearRollRequest,
  rng: Rng,
  context: GearContext,
): Promise<GearInstanceRow> {
  // The one door a relic enters the vault by, so the cap does not have to be remembered at
  // six call sites. A purchase is refused rather than converted: buying a relic and being
  // handed silver back is nonsense, and the Bazaar can say why before the player pays.
  const room = await vaultRoom(tx, playerId, context);
  if (room <= 0) {
    throw new AppError(
      'VALIDATION',
      'Your vault is full. Sell or equip something, or buy more room.',
    );
  }
  const rolled = rollGear(rng, context.tables, context.economy, request);
  const [row] = await tx
    .insert(gearInstances)
    .values({
      playerId,
      setKey: request.setKey,
      slot: request.slot,
      rank: request.rank,
      rarity: request.rarity,
      level: 0,
      mainStat: rolled.main,
      substats: [...rolled.substats],
      source: request.source,
    })
    .returning();
  if (!row) throw new AppError('INTERNAL', 'The relic could not be created.');
  return row;
}

/** A relic to roll, with the two things only a synthesised set needs to say. */
export interface GearGrant extends GearRollRequest {
  /** Equip it to this champion as it is created, instead of leaving it in the vault. */
  equippedChampionId?: string | undefined;
  /** Create it already upgraded. A drop always arrives at zero; a bot's kit does not. */
  level?: number | undefined;
}

/**
 * Rolls and writes several relics in one statement.
 *
 * The batched twin of `createGear`, for the one caller that needs a whole kit at once:
 * synthesising a bot's nine slots piece by piece would be eighteen round trips per
 * champion, and the arena builds sixty of them a night on a single-core box.
 */
export async function createGearBatch(
  tx: Executor,
  playerId: string,
  requests: readonly GearGrant[],
  rng: Rng,
  context: GearContext,
): Promise<GearInstanceRow[]> {
  return (await createGearBatchCapped(tx, playerId, requests, rng, context)).created;
}

/**
 * `createGearBatch`, with the vault enforced and the overflow reported.
 *
 * Requests that arrive already equipped are never counted or refused — they go onto a
 * champion rather than into the vault, which is what lets the Arena synthesise a bot's
 * nine slots without a cap it has no business having.
 */
export async function createGearBatchCapped(
  tx: Executor,
  playerId: string,
  requests: readonly GearGrant[],
  rng: Rng,
  context: GearContext,
): Promise<{ created: GearInstanceRow[]; overflow: VaultOverflow }> {
  if (requests.length === 0) return { created: [], overflow: NO_OVERFLOW };

  const equipped = requests.filter((request) => request.equippedChampionId);
  const loose = requests.filter((request) => !request.equippedChampionId);

  const room = loose.length > 0 ? await vaultRoom(tx, playerId, context) : 0;
  const kept = loose.slice(0, Math.max(0, room));
  const spilled = loose.slice(kept.length);

  // Paid at the value the relic would have sold for the moment it dropped: nothing is
  // rolled for a piece nobody will own, so this is the rank and rarity alone.
  const overflow: VaultOverflow = spilled.length
    ? {
        count: spilled.length,
        silver: spilled.reduce(
          (sum, request) =>
            sum +
            sellValue(context.economy, {
              setKey: request.setKey,
              slot: request.slot,
              rank: request.rank,
              rarity: request.rarity,
              level: 0,
              main: { stat: 'atk', value: 0, percent: false },
              substats: [],
            }),
          0,
        ),
      }
    : NO_OVERFLOW;

  const accepted = [...equipped, ...kept];
  if (accepted.length === 0) return { created: [], overflow };

  const values = accepted.map((request) => {
    const rolled = rollGear(rng, context.tables, context.economy, request);
    return {
      playerId,
      setKey: request.setKey,
      slot: request.slot,
      rank: request.rank,
      rarity: request.rarity,
      level: Math.min(Math.max(request.level ?? 0, 0), GEAR_MAX_LEVEL),
      mainStat: rolled.main,
      substats: [...rolled.substats],
      source: request.source,
      equippedChampionId: request.equippedChampionId ?? null,
    };
  });

  return { created: await tx.insert(gearInstances).values(values).returning(), overflow };
}

/** Free vault slots right now, floored at zero. */
async function vaultRoom(tx: Executor, playerId: string, context: GearContext): Promise<number> {
  const state = await vaultState(tx, playerId, context);
  return Math.max(0, state.capacity - state.used);
}

/** The band a stage or shop offer rolls a relic from. */
export interface GearDropBand {
  setKeys: readonly string[];
  slots: readonly GearSlot[];
  rankMin: number;
  rankMax: number;
  rarityWeights: Partial<Record<Rarity, number>>;
}

/** Picks the concrete set, slot, rank and rarity a band describes. */
export function rollBand(
  rng: Rng,
  band: GearDropBand,
  context: GearContext,
): GearRollRequest | null {
  const sets = band.setKeys.length > 0 ? band.setKeys : [...context.tables.sets.keys()];
  if (sets.length === 0) return null;

  const slots = band.slots.length > 0 ? band.slots : GEAR_SLOTS;
  const rankMin = Math.min(band.rankMin, band.rankMax);
  const rankMax = Math.max(band.rankMin, band.rankMax);

  return {
    setKey: rng.pick(sets),
    slot: rng.pick(slots),
    rank: rng.int(rankMin, rankMax),
    rarity: pickRarity(rng, band.rarityWeights, context.economy),
    source: '',
  };
}

// ── Wearing ─────────────────────────────────────────────────────────────────

/**
 * Moves a relic onto a champion, displacing whatever was in the slot.
 *
 * Accessories are gated by ascension (Ring at 2, Amulet at 4, Banner at 6), and the gate
 * is checked against the *slot definition* rather than the constant, so an operator can
 * retune it without a deploy. The constant is the fallback for a slot content forgot.
 */
export async function equip(
  db: Database,
  playerId: string,
  gearId: string,
  championId: string,
  context: GearContext,
  content: ContentCache,
): Promise<{ equipped: GearInstanceRow; displaced: GearInstanceRow | null }> {
  return db.transaction(async (tx) => {
    const row = await ownedGear(tx, playerId, gearId);
    const [champion] = await tx
      .select()
      .from(playerChampions)
      .where(and(eq(playerChampions.id, championId), eq(playerChampions.playerId, playerId)))
      .for('update');
    if (!champion) throw AppError.notFound('No such champion.');

    const slotDef = context.tables.slots.get(row.slot);
    const required =
      slotDef?.ascensionRequired ?? ACCESSORY_ASCENSION_REQUIREMENT[row.slot as GearSlot] ?? 0;
    if (champion.ascension < required) {
      throw new AppError(
        'VALIDATION',
        `${slotDef?.name ?? row.slot} needs ascension ${required}; this champion is at ${champion.ascension}.`,
      );
    }

    // Clear the slot first so the partial unique index never sees two occupants, even
    // for the instant between the two statements.
    const [displaced] = await tx
      .update(gearInstances)
      .set({ equippedChampionId: null, updatedAt: new Date() })
      .where(
        and(eq(gearInstances.equippedChampionId, championId), eq(gearInstances.slot, row.slot)),
      )
      .returning();

    const [equipped] = await tx
      .update(gearInstances)
      .set({ equippedChampionId: championId, updatedAt: new Date() })
      .where(eq(gearInstances.id, gearId))
      .returning();
    if (!equipped) throw AppError.notFound('No such relic.');

    // The slot travels with the report so "put boots on somebody" is authorable; nothing
    // asks for it yet beyond the tutorial, which asks for any slot at all.
    await track(tx, { content }, playerId, [{ type: 'gearEquip', facts: { slot: equipped.slot } }]);

    return { equipped, displaced: displaced ?? null };
  });
}

/** Takes a relic off. Always free — GAME_DESIGN §8. */
export async function unequip(
  db: Database,
  playerId: string,
  gearId: string,
  context: GearContext,
): Promise<GearInstanceRow> {
  return db.transaction(async (tx) => {
    await ownedGear(tx, playerId, gearId);
    // Taking a relic off puts it back in the vault, and the vault can be full — the cap
    // counts loose relics precisely so that equipping is a way to make room. Refused with
    // the sentence that says what to do rather than silently leaving it equipped.
    if ((await vaultRoom(tx, playerId, context)) <= 0) {
      throw new AppError(
        'VALIDATION',
        'Your vault is full — there is nowhere to put it. Sell something, or buy more room.',
      );
    }
    const [row] = await tx
      .update(gearInstances)
      .set({ equippedChampionId: null, updatedAt: new Date() })
      .where(eq(gearInstances.id, gearId))
      .returning();
    if (!row) throw AppError.notFound('No such relic.');
    return row;
  });
}

/**
 * Buys the next slab of vault slots (Q5).
 *
 * The cost curve is geometric and the ceiling is content, so the operator decides both in
 * Admin. Idempotent through `actionId` like every other spend: a double-tapped button on a
 * slow connection must not buy two.
 */
export async function buyVaultSlots(
  db: Database,
  playerId: string,
  actionId: string,
  context: GearContext,
): Promise<VaultState> {
  return db.transaction(async (tx) => {
    const [player] = await tx
      .select({
        bought: players.vaultSlots,
        silver: players.silver,
        lastActionId: players.lastVaultActionId,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');

    // A retry gets the vault as the original purchase left it, not a second slab.
    if (player.lastActionId === actionId) return vaultState(tx, playerId, context);

    const slots = vaultUpgradeSlots(context.economy, player.bought);
    if (slots <= 0) {
      throw new AppError('VALIDATION', 'Your vault is already as large as it goes.');
    }

    const cost = vaultUpgradeCost(context.economy, player.bought);
    if (player.silver < cost) {
      throw new AppError('INSUFFICIENT_FUNDS', 'Not enough silver for more vault room.');
    }

    await grant(tx, playerId, { silver: -cost }, 'gear:vaultSlots');
    await tx
      .update(players)
      .set({
        vaultSlots: player.bought + slots,
        lastVaultActionId: actionId,
        updatedAt: new Date(),
      })
      .where(eq(players.id, playerId));

    return vaultState(tx, playerId, context);
  });
}

export async function setLocked(
  db: Database,
  playerId: string,
  gearId: string,
  locked: boolean,
): Promise<GearInstanceRow> {
  await ownedGear(db, playerId, gearId);
  const [row] = await db
    .update(gearInstances)
    .set({ locked, updatedAt: new Date() })
    .where(eq(gearInstances.id, gearId))
    .returning();
  if (!row) throw AppError.notFound('No such relic.');
  return row;
}

// ── Upgrading ───────────────────────────────────────────────────────────────

export interface UpgradeOutcome {
  gear: GearInstanceRow;
  attempts: GearUpgradeAttempt[];
  silverSpent: number;
  silver: number;
}

/**
 * Runs upgrade attempts.
 *
 * The gamble is the sink, so a failure still charges (ECONOMY_BALANCE §4) — but a run
 * stops the moment it cannot pay, rather than half-charging for an attempt it did not
 * make. Every attempt is reported so the client can animate them one by one; it is never
 * told a result before the server has decided it.
 */
export async function upgrade(
  db: Database,
  playerId: string,
  gearId: string,
  times: number,
  context: GearContext,
  seed: number,
  content: ContentCache,
): Promise<UpgradeOutcome> {
  return db.transaction(async (tx) => {
    const row = await ownedGear(tx, playerId, gearId, { lock: true });
    if (row.level >= GEAR_MAX_LEVEL) {
      throw new AppError('VALIDATION', 'This relic is already fully upgraded.');
    }

    const rng = createRng(seed);
    const attempts: GearUpgradeAttempt[] = [];
    let piece = pieceOf(row);
    let spent = 0;

    const [wallet] = await tx
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!wallet) throw AppError.notFound('No such player.');
    let silver = wallet.silver;

    for (let attempt = 0; attempt < times && piece.level < GEAR_MAX_LEVEL; attempt += 1) {
      const target = piece.level + 1;
      const cost = upgradeCost(context.economy, piece.rank, target);
      if (silver < cost) break;

      const chance = upgradeChance(context.economy, target);
      silver -= cost;
      spent += cost;
      const success = rng.chance(chance);

      if (!success) {
        attempts.push({
          fromLevel: piece.level,
          toLevel: piece.level,
          success: false,
          cost,
          chance,
          rolled: null,
        });
        continue;
      }

      const result = applyUpgrade(rng, context.tables, piece);
      piece = { ...piece, level: target, main: result.main, substats: result.substats };
      attempts.push({
        fromLevel: target - 1,
        toLevel: target,
        success: true,
        cost,
        chance,
        rolled: result.rolled,
      });
    }

    if (attempts.length === 0) {
      throw new AppError('INSUFFICIENT_FUNDS', 'Not enough silver for an attempt.');
    }

    // One economy row for the run rather than one per attempt: the run is the action a
    // player took, and a twenty-row audit trail for one tap helps nobody.
    await grant(tx, playerId, { silver: -spent }, `gear:upgrade:${gearId}`);

    const [updated] = await tx
      .update(gearInstances)
      .set({
        level: piece.level,
        mainStat: piece.main,
        substats: [...piece.substats],
        updatedAt: new Date(),
      })
      .where(eq(gearInstances.id, gearId))
      .returning();
    if (!updated) throw AppError.notFound('No such relic.');

    // The *attempt* is the activity, successful or not — a daily that punished bad luck
    // would be a daily some days cannot be finished. The level reached is separate, and a
    // high-water mark, so "+12 a relic" cannot be satisfied by twelve relics at +1.
    await track(tx, { content }, playerId, [
      { type: 'gearUpgrade', amount: attempts.length },
      { type: 'gearLevel', amount: piece.level },
    ]);

    return { gear: updated, attempts, silverSpent: spent, silver };
  });
}

// ── Selling ─────────────────────────────────────────────────────────────────

/**
 * Sells relics for silver.
 *
 * Equipped and locked pieces are refused rather than skipped: a mass sell that quietly
 * spared some of what you selected is worse than one that tells you why it stopped.
 */
export async function sell(
  db: Database,
  playerId: string,
  ids: readonly string[],
  context: GearContext,
): Promise<{ silver: number; sold: string[]; paid: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(gearInstances)
      .where(and(eq(gearInstances.playerId, playerId), inArray(gearInstances.id, [...ids])))
      .for('update');

    if (rows.length !== ids.length) {
      throw AppError.notFound('One of those relics is not yours.');
    }
    const blocked = rows.find((row) => row.locked || row.equippedChampionId !== null);
    if (blocked) {
      throw new AppError(
        'VALIDATION',
        blocked.locked
          ? 'A locked relic is in the selection. Unlock it first.'
          : 'An equipped relic is in the selection. Take it off first.',
      );
    }

    const paid = rows.reduce((sum, row) => sum + sellValue(context.economy, pieceOf(row)), 0);
    await grant(tx, playerId, { silver: paid }, `gear:sell:${rows.length}`);
    await tx.delete(gearInstances).where(inArray(gearInstances.id, [...ids]));

    return { silver: await currentSilver(tx, playerId), sold: rows.map((row) => row.id), paid };
  });
}

// ── Dismantling and reforging (C10a) ────────────────────────────────────────

/**
 * Grinds relics down to Reliquary Dust instead of selling them for silver.
 *
 * The vault has a ceiling (Q5), so a player is *already* obliged to get rid of relics;
 * this makes what they get rid of into the currency that fixes the ones they kept. That
 * is what keeps reforging self-limiting without a drop table of its own: you may only
 * reroll as much as you are willing to feed the mill.
 *
 * The refusals are a sell's, deliberately — a run that quietly spared the locked piece in
 * a hundred-relic selection is a run whose result nobody can check.
 */
export async function dismantle(
  db: Database,
  playerId: string,
  ids: readonly string[],
  context: GearContext,
): Promise<DismantleResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(gearInstances)
      .where(and(eq(gearInstances.playerId, playerId), inArray(gearInstances.id, [...ids])))
      .for('update');

    if (rows.length !== ids.length) {
      throw AppError.notFound('One of those relics is not yours.');
    }
    const blocked = rows.find((row) => row.locked || row.equippedChampionId !== null);
    if (blocked) {
      throw new AppError(
        'VALIDATION',
        blocked.locked
          ? 'A locked relic is in the selection. Unlock it first.'
          : 'An equipped relic is in the selection. Take it off first.',
      );
    }

    const dust = rows.reduce((sum, row) => sum + dismantleValue(context.economy, pieceOf(row)), 0);
    await grantItems(tx, playerId, { [REFORGE_DUST_ITEM]: dust }, `gear:dismantle:${rows.length}`);
    await tx.delete(gearInstances).where(inArray(gearInstances.id, [...ids]));

    const held = await itemQuantities(tx, playerId);
    return {
      removed: rows.map((row) => row.id),
      dust,
      dustHeld: held.get(REFORGE_DUST_ITEM) ?? 0,
    };
  });
}

/**
 * What reforging this relic would cost, and what each line could become.
 *
 * A read, and a deliberately generous one: the panel shows the price *and* the pool every
 * line is gambling against before anything is spent. That is the Mistgate's published-odds
 * rule applied to relics — a gamble whose shape a player cannot see is a slot machine, and
 * this game does not have one.
 */
export async function reforgeQuote(
  db: Database,
  playerId: string,
  gearId: string,
  context: GearContext,
): Promise<ReforgeQuote> {
  const row = await ownedGear(db, playerId, gearId);
  const piece = pieceOf(row);
  const price = reforgePrice(context.economy, row.rank, row.reforges);
  const held = await itemQuantities(db, playerId);
  const dustHeld = held.get(REFORGE_DUST_ITEM) ?? 0;
  const silverHeld = await currentSilver(db, playerId);

  const lines = piece.substats.map((line, index) => ({
    index,
    line,
    candidates: reforgeCandidates(context.tables, piece, index).map((def) => ({
      stat: def.stat as Stat,
      percent: def.percent,
      ...substatRange(def, piece.rank),
    })),
  }));

  return {
    gearId: row.id,
    reforges: row.reforges,
    dust: price.dust,
    silver: price.silver,
    dustHeld,
    silverHeld,
    lines,
    blockedReason: reforgeBlockedReason(context.economy, row, lines),
  };
}

/**
 * Why this relic cannot be reforged, in the sentence the button will show.
 *
 * Shared by the quote and the mutation so the screen and the server can never disagree
 * about whether the button should have been pressable — the same shape `planLoadout` gave
 * loadouts in C9.
 */
function reforgeBlockedReason(
  economy: GearEconomyConfig,
  row: GearInstanceRow,
  lines: readonly { candidates: readonly unknown[] }[],
): string | null {
  if (lines.length === 0) {
    return 'This relic has no substats to reforge. Upgrade it first.';
  }
  const ceiling = Math.floor(economy.reforgeMaxPerRelic);
  if (ceiling > 0 && row.reforges >= ceiling) {
    return `This relic has been reforged ${ceiling} times. That is as far as it goes.`;
  }
  if (lines.every((line) => line.candidates.length === 0)) {
    return 'There is no other stat this relic could take.';
  }
  return null;
}

/**
 * Rerolls one substat into a different stat.
 *
 * **The line is chosen and the stat is not** — that is the whole gamble, and the reason
 * this drains a currency rather than selling an outcome. What is *not* gambled is the work
 * already in the line: a substat deepened four times comes back as four fresh rolls of the
 * new stat, so reforging is never a punishment for having invested (`applyReforge`).
 *
 * `expectStat`/`expectPercent` guard a stale screen. Substats only ever gain, so the index
 * is stable in practice — but "in practice" is not a thing to spend a player's dust on,
 * and a second tab that reforged the same relic a moment ago would otherwise reroll a line
 * the player never looked at.
 */
export async function reforge(
  db: Database,
  playerId: string,
  gearId: string,
  request: { substatIndex: number; expectStat: Stat; expectPercent: boolean },
  context: GearContext,
  seed: number,
  content: ContentCache,
): Promise<ReforgeResult> {
  return db.transaction(async (tx) => {
    const row = await ownedGear(tx, playerId, gearId, { lock: true });
    const piece = pieceOf(row);

    const lines = piece.substats.map((_, index) => ({
      candidates: reforgeCandidates(context.tables, piece, index),
    }));
    const blocked = reforgeBlockedReason(context.economy, row, lines);
    if (blocked) throw new AppError('VALIDATION', blocked);

    const target = piece.substats[request.substatIndex];
    if (!target) {
      throw new AppError('VALIDATION', 'That relic has no such substat.');
    }
    if (target.stat !== request.expectStat || target.percent !== request.expectPercent) {
      // `VALIDATION` rather than a conflict code, because the vocabulary has none and the
      // request genuinely no longer describes the relic. What matters is the sentence: a
      // player whose second tab reforged this relic a moment ago must be told to look
      // again rather than charged for a line they never chose.
      throw new AppError(
        'VALIDATION',
        'That line has changed since the screen read it. Open the relic again.',
      );
    }

    const price = reforgePrice(context.economy, row.rank, row.reforges);
    // Dust first: it is the scarcer half and the one with a per-item floor, so failing on
    // it before any silver moves keeps a refusal from being a partial charge.
    await grantItems(tx, playerId, { [REFORGE_DUST_ITEM]: -price.dust }, `gear:reforge:${gearId}`);
    if (price.silver > 0) {
      await grant(tx, playerId, { silver: -price.silver }, `gear:reforge:${gearId}`);
    }

    const result = applyReforge(createRng(seed), context.tables, piece, request.substatIndex);
    if (!result) {
      // Unreachable given the block above, and a throw rather than a silent no-op because
      // the charge has already happened — rolling the transaction back is the only honest
      // answer to "we took your dust and changed nothing".
      throw new AppError('VALIDATION', 'There is no other stat this line could take.');
    }

    const [updated] = await tx
      .update(gearInstances)
      .set({
        substats: result.substats,
        reforges: row.reforges + 1,
        updatedAt: new Date(),
      })
      .where(eq(gearInstances.id, gearId))
      .returning();
    if (!updated) throw AppError.notFound('No such relic.');

    await track(tx, { content }, playerId, [{ type: 'gearReforge', amount: 1 }]);

    const held = await itemQuantities(tx, playerId);
    return {
      gear: toDto(updated, context),
      before: result.before,
      after: result.after,
      dustSpent: price.dust,
      silverSpent: price.silver,
      dustHeld: held.get(REFORGE_DUST_ITEM) ?? 0,
      silver: await currentSilver(tx, playerId),
    };
  });
}

/** How many relics one bulk forge may touch. Operator-editable, like every other cap. */
export function maxBulkForge(config: Readonly<Record<string, unknown>>): number {
  const value = config['gear.maxBulkForge'];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 20;
}

/**
 * Forges several relics toward a level, in one transaction.
 *
 * The vault's whole second job is picking the piece worth upgrading out of a hundred, and
 * "take everything I have selected to +8" is the action that job ends in. Nothing here is
 * a shortcut past the forge's own rules: the same cost curve, the same chance per level,
 * the same substat roll every four levels — it is the loop `upgrade` runs, run per relic.
 *
 * Three things make it a different shape from calling `upgrade` twenty times:
 *
 *  - **It stops when the silver runs out**, cleanly, and says so. Twenty separate calls
 *    would each fail on their own and leave the player to work out which ones went through.
 *  - **One wallet read for the run.** Silver is spent across relics, so a per-call balance
 *    would let a double-tap outspend it.
 *  - **Equipped relics are allowed.** A worn piece is exactly the piece worth forging, and
 *    the vault's default filter hiding them is why the Forge button had to move onto the
 *    champion sheet in C1. This is not a sell.
 */
export async function upgradeMany(
  db: Database,
  playerId: string,
  ids: readonly string[],
  toLevel: number,
  context: GearContext,
  seed: number,
  content: ContentCache,
): Promise<BulkUpgradeResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(gearInstances)
      .where(and(eq(gearInstances.playerId, playerId), inArray(gearInstances.id, [...ids])))
      .for('update');
    if (rows.length !== ids.length) {
      throw AppError.notFound('One of those relics is not yours.');
    }

    const [wallet] = await tx
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!wallet) throw AppError.notFound('No such player.');

    const rng = createRng(seed);
    const entries: BulkUpgradeEntry[] = [];
    let silver = wallet.silver;
    let spent = 0;
    let attemptsMade = 0;
    let highest = 0;
    let stoppedBecause: string | null = null;

    // Ordered by how far each has to go, so a run that runs out of silver has finished the
    // cheap ones rather than half-finished the expensive ones. The player asked for a
    // level, not for a particular relic to get there first.
    const ordered = [...rows].sort((a, b) => b.level - a.level);

    for (const row of ordered) {
      let piece = pieceOf(row);
      const from = piece.level;
      let attempts = 0;
      let cost = 0;

      while (piece.level < Math.min(toLevel, GEAR_MAX_LEVEL)) {
        const target = piece.level + 1;
        const price = upgradeCost(context.economy, piece.rank, target);
        if (silver < price) {
          stoppedBecause = 'Out of silver.';
          break;
        }
        silver -= price;
        spent += price;
        cost += price;
        attempts += 1;
        attemptsMade += 1;

        if (rng.chance(upgradeChance(context.economy, target))) {
          const result = applyUpgrade(rng, context.tables, piece);
          piece = { ...piece, level: target, main: result.main, substats: result.substats };
        }
      }

      if (attempts > 0) {
        await tx
          .update(gearInstances)
          .set({
            level: piece.level,
            mainStat: piece.main,
            substats: [...piece.substats],
            updatedAt: new Date(),
          })
          .where(eq(gearInstances.id, row.id));
      }
      highest = Math.max(highest, piece.level);
      entries.push({
        gearId: row.id,
        fromLevel: from,
        toLevel: piece.level,
        attempts,
        silverSpent: cost,
      });
      if (stoppedBecause) break;
    }

    if (attemptsMade === 0) {
      throw new AppError(
        'INSUFFICIENT_FUNDS',
        silver < 1 ? 'Not enough silver for an attempt.' : 'Nothing there needs forging.',
      );
    }

    // One economy row for the run, the same rule a single bulk-continue forge follows: the
    // run is the action a player took.
    await grant(tx, playerId, { silver: -spent }, `gear:upgrade:bulk:${entries.length}`);
    await track(tx, { content }, playerId, [
      { type: 'gearUpgrade', amount: attemptsMade },
      { type: 'gearLevel', amount: highest },
    ]);

    return { entries, silverSpent: spent, silver, stoppedBecause };
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function currentSilver(tx: Executor, playerId: string): Promise<number> {
  const [row] = await tx
    .select({ silver: players.silver })
    .from(players)
    .where(eq(players.id, playerId));
  return row?.silver ?? 0;
}

/** Fetches a relic, refusing one that belongs to somebody else. */
async function ownedGear(
  tx: Executor,
  playerId: string,
  gearId: string,
  options: { lock?: boolean } = {},
): Promise<GearInstanceRow> {
  const query = tx
    .select()
    .from(gearInstances)
    .where(and(eq(gearInstances.id, gearId), eq(gearInstances.playerId, playerId)));
  const [row] = options.lock ? await query.for('update') : await query;
  if (!row) throw AppError.notFound('No such relic.');
  return row;
}

/** Unequipped relics, for the inventory's default filter. */
export async function listUnequipped(
  db: Executor,
  playerId: string,
  context: GearContext,
): Promise<GearInstance[]> {
  const rows = await db
    .select()
    .from(gearInstances)
    .where(and(eq(gearInstances.playerId, playerId), isNull(gearInstances.equippedChampionId)));
  return rows.map((row) => toDto(row, context));
}

/** What a relic's main stat would read at a given level — for the forge's preview. */
export function projectedMain(
  row: GearInstanceRow,
  level: number,
  context: GearContext,
): GearStatLine {
  const def = context.tables.byStat.get(statFormKey(row.mainStat.stat, row.mainStat.percent));
  if (!def) return row.mainStat;
  return { ...row.mainStat, value: mainStatValue(def, row.rank, level) };
}
