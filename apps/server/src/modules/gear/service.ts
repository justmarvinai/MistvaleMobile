import { and, eq, inArray, isNull } from 'drizzle-orm';
import { createRng, type Rng } from '@mistvale/engine';
import {
  ACCESSORY_ASCENSION_REQUIREMENT,
  GEAR_MAX_LEVEL,
  GEAR_SLOTS,
  type GearInstance,
  type GearSlot,
  type GearStatLine,
  type GearUpgradeAttempt,
  type Rarity,
  type StatBlock,
} from '@mistvale/shared';
import { gearInstances, playerChampions, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { GearInstanceRow } from '../../db/schema/inventory';
import { AppError } from '../../lib/errors';
import { grant } from '../rewards/service';
import {
  applyUpgrade,
  assembleGearBonus,
  gearEconomyFrom,
  gearTablesFrom,
  mainStatValue,
  pickRarity,
  powerScore,
  rollGear,
  sellValue,
  statFormKey,
  upgradeChance,
  upgradeCost,
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
  if (requests.length === 0) return [];

  const values = requests.map((request) => {
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

  return tx.insert(gearInstances).values(values).returning();
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

    return { equipped, displaced: displaced ?? null };
  });
}

/** Takes a relic off. Always free — GAME_DESIGN §8. */
export async function unequip(
  db: Database,
  playerId: string,
  gearId: string,
): Promise<GearInstanceRow> {
  return db.transaction(async (tx) => {
    await ownedGear(tx, playerId, gearId);
    const [row] = await tx
      .update(gearInstances)
      .set({ equippedChampionId: null, updatedAt: new Date() })
      .where(eq(gearInstances.id, gearId))
      .returning();
    if (!row) throw AppError.notFound('No such relic.');
    return row;
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
