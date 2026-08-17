import { and, eq, inArray } from 'drizzle-orm';
import {
  LEVEL_CAP_BY_RANK,
  MAX_RANK,
  type ChampionDef,
  type Element,
  type Rarity,
} from '@mistvale/shared';
import { gearInstances, playerChampions, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import type { PlayerChampionRow } from '../../db/schema/game';
import { AppError } from '../../lib/errors';
import { championXpToNextLevel, grant, grantItems, itemQuantities } from '../rewards/service';
import { levelCapForRank } from './service';
import { track } from '../meta/progress';

/**
 * The four ladders a champion climbs: level, rank, ascension and skills.
 *
 * Each is irreversible and each eats something a player worked for, so every one of them
 * runs in a transaction that locks both the champion and the food it consumes, and every
 * refusal happens *before* anything is spent. The costs are read from `game_config`, so
 * an operator can retune the whole treadmill without a deploy.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** Everything the progression rules read out of published config. */
export interface ProgressionConfig {
  rankUpSilver: readonly number[];
  releaseSilver: Readonly<Record<Rarity, number>>;
  ascensionCosts: Readonly<Record<string, Readonly<Record<string, number>>>>;
  ascensionRarityMultiplier: Readonly<Record<Rarity, number>>;
  maxAscensionByRank: readonly number[];
  skillUpgradeMaxLevel: number;
  tomeByRarity: Readonly<Record<Rarity, string>>;
}

export const DEFAULT_PROGRESSION: ProgressionConfig = Object.freeze({
  rankUpSilver: Object.freeze([2_000, 8_000, 30_000, 100_000, 300_000]),
  releaseSilver: Object.freeze({
    common: 250,
    uncommon: 500,
    rare: 1_500,
    epic: 6_000,
    legendary: 25_000,
  }),
  ascensionCosts: Object.freeze({
    1: { element_lesser: 8 },
    2: { element_lesser: 15, essence_pure: 5 },
    3: { element_greater: 12, essence_pure: 8 },
    4: { element_greater: 20, essence_pure: 12 },
    5: { element_prime: 15, essence_pure: 20 },
    6: { element_prime: 25, essence_pure: 30 },
  }),
  ascensionRarityMultiplier: Object.freeze({
    common: 0.4,
    uncommon: 0.5,
    rare: 0.6,
    epic: 1,
    legendary: 1.6,
  }),
  maxAscensionByRank: Object.freeze([0, 1, 2, 3, 4, 6]),
  skillUpgradeMaxLevel: 5,
  tomeByRarity: Object.freeze({
    common: 'tome_rare',
    uncommon: 'tome_rare',
    rare: 'tome_rare',
    epic: 'tome_epic',
    legendary: 'tome_legendary',
  }),
});

export function progressionConfigFrom(
  config: Readonly<Record<string, unknown>>,
): ProgressionConfig {
  const pick = <T>(key: string, fallback: T, guard: (value: unknown) => boolean): T => {
    const value = config[key];
    return guard(value) ? (value as T) : fallback;
  };
  const isNumberArray = (value: unknown): boolean =>
    Array.isArray(value) && value.every((entry) => typeof entry === 'number');
  const isObject = (value: unknown): boolean =>
    !!value && typeof value === 'object' && !Array.isArray(value);

  return Object.freeze({
    rankUpSilver: pick('economy.rankUpSilver', DEFAULT_PROGRESSION.rankUpSilver, isNumberArray),
    releaseSilver: pick(
      'economy.championReleaseSilver',
      DEFAULT_PROGRESSION.releaseSilver,
      isObject,
    ),
    ascensionCosts: pick('economy.ascensionCosts', DEFAULT_PROGRESSION.ascensionCosts, isObject),
    ascensionRarityMultiplier: pick(
      'economy.ascensionRarityMultiplier',
      DEFAULT_PROGRESSION.ascensionRarityMultiplier,
      isObject,
    ),
    maxAscensionByRank: pick(
      'economy.maxAscensionByRank',
      DEFAULT_PROGRESSION.maxAscensionByRank,
      isNumberArray,
    ),
    skillUpgradeMaxLevel: pick(
      'economy.skillUpgradeMaxLevel',
      DEFAULT_PROGRESSION.skillUpgradeMaxLevel,
      (value) => typeof value === 'number',
    ),
    tomeByRarity: pick('economy.tomeByRarity', DEFAULT_PROGRESSION.tomeByRarity, isObject),
  });
}

// ── Costs, as the client is told them ───────────────────────────────────────

/** How high this rank may ascend. ★1 cannot ascend at all; ★6 reaches 6. */
export function ascensionCapForRank(rank: number, config: ProgressionConfig): number {
  return config.maxAscensionByRank[Math.min(Math.max(rank, 1), MAX_RANK) - 1] ?? 0;
}

/**
 * What the next ascension level costs this champion.
 *
 * The table is authored for an Epic and scaled by rarity, and `element_*` resolves
 * against the champion's own breath — so one table covers every champion rather than one
 * per element per rarity (docs/ECONOMY_BALANCE.md §6).
 */
export function ascensionCost(
  def: Pick<ChampionDef, 'element' | 'rarity'>,
  nextLevel: number,
  config: ProgressionConfig,
): Record<string, number> {
  const template = config.ascensionCosts[String(nextLevel)];
  if (!template) return {};
  const multiplier = config.ascensionRarityMultiplier[def.rarity] ?? 1;

  const resolved: Record<string, number> = {};
  for (const [token, amount] of Object.entries(template)) {
    const itemKey = resolveEssenceKey(token, def.element);
    resolved[itemKey] = Math.max(1, Math.round(amount * multiplier));
  }
  return resolved;
}

/** `element_greater` on a Tide champion is `essence_tide_greater`. */
function resolveEssenceKey(token: string, element: Element): string {
  const match = /^element_(lesser|greater|prime)$/.exec(token);
  return match ? `essence_${element}_${match[1]}` : token;
}

/** What ranking up from here needs: R food champions of exactly R stars, plus silver. */
export function rankUpCost(
  rank: number,
  config: ProgressionConfig,
): { foodRank: number; foodCount: number; silver: number } | null {
  if (rank >= MAX_RANK) return null;
  return {
    foodRank: rank,
    foodCount: rank,
    silver: config.rankUpSilver[rank - 1] ?? 0,
  };
}

// ── Levelling ───────────────────────────────────────────────────────────────

/**
 * Feeds champions to another champion for experience.
 *
 * The XP a food champion is worth is what was spent getting it there: its own level's
 * accumulated cost, plus a flat base for the body itself. That keeps "level the food
 * first" a real strategy rather than a trap, which is the loop the source game is built
 * on (docs/ECONOMY_BALANCE.md §3).
 */
export function foodXpValue(food: Pick<PlayerChampionRow, 'level' | 'rank'>): number {
  let total = 120 * food.rank;
  for (let level = 1; level < food.level; level += 1) total += championXpToNextLevel(level);
  return Math.round(total);
}

export interface LevelUpOutcome {
  champion: PlayerChampionRow;
  consumed: string[];
  xpGained: number;
  levelsGained: number;
}

export async function levelUpWithFood(
  db: Database,
  playerId: string,
  championId: string,
  foodIds: readonly string[],
  content: ContentCache,
): Promise<LevelUpOutcome> {
  return db.transaction(async (tx) => {
    const champion = await lockChampion(tx, playerId, championId);
    const food = await lockFood(tx, playerId, foodIds, championId);

    const cap = levelCapForRank(champion.rank);
    if (champion.level >= cap) {
      throw new AppError(
        'VALIDATION',
        `This champion is at the level cap for ★${champion.rank}. Rank it up first.`,
      );
    }

    const xpGained = food.reduce((sum, row) => sum + foodXpValue(row), 0);
    let level = champion.level;
    let xp = champion.xp + xpGained;
    while (level < cap) {
      const needed = championXpToNextLevel(level);
      if (xp < needed) break;
      xp -= needed;
      level += 1;
    }
    // XP past the cap is held rather than burned, so a rank-up releases it.
    const [updated] = await tx
      .update(playerChampions)
      .set({ level, xp, updatedAt: new Date() })
      .where(eq(playerChampions.id, championId))
      .returning();
    if (!updated) throw AppError.notFound('No such champion.');

    await consume(tx, food);

    // Levels gained, not feeds performed: a daily asking for three level-ups means three
    // levels, and one generous feed can be all three.
    await track(tx, { content }, playerId, [
      { type: 'championLevelUp', amount: level - champion.level },
    ]);

    return {
      champion: updated,
      consumed: food.map((row) => row.id),
      xpGained,
      levelsGained: level - champion.level,
    };
  });
}

// ── Rank-up ─────────────────────────────────────────────────────────────────

export async function rankUp(
  db: Database,
  playerId: string,
  championId: string,
  foodIds: readonly string[],
  config: ProgressionConfig,
  content: ContentCache,
): Promise<{ champion: PlayerChampionRow; consumed: string[] }> {
  return db.transaction(async (tx) => {
    const champion = await lockChampion(tx, playerId, championId);
    const cost = rankUpCost(champion.rank, config);
    if (!cost) throw new AppError('VALIDATION', 'This champion is already ★6.');

    if (champion.level < levelCapForRank(champion.rank)) {
      throw new AppError('VALIDATION', 'A champion must be at its level cap to rank up.');
    }
    if (foodIds.length !== cost.foodCount) {
      throw new AppError(
        'VALIDATION',
        `Ranking up from ★${champion.rank} needs exactly ${cost.foodCount} ★${cost.foodRank} champions.`,
      );
    }

    const food = await lockFood(tx, playerId, foodIds, championId);
    const wrongRank = food.find((row) => row.rank !== cost.foodRank);
    if (wrongRank) {
      throw new AppError(
        'VALIDATION',
        `Every champion fed must be exactly ★${cost.foodRank}; one is ★${wrongRank.rank}.`,
      );
    }

    await grant(tx, playerId, { silver: -cost.silver }, `champion:rankup:${championId}`);

    // Rank-up resets the champion to level 1 — the source game's rule, and the reason
    // levelling food is a considered purchase rather than a chore.
    const [updated] = await tx
      .update(playerChampions)
      .set({ rank: champion.rank + 1, level: 1, xp: 0, updatedAt: new Date() })
      .where(eq(playerChampions.id, championId))
      .returning();
    if (!updated) throw AppError.notFound('No such champion.');

    await consume(tx, food);

    // The rank *reached* rides along, so a mission can ask for a ★5 rather than for five
    // rank-ups of anything.
    await track(tx, { content }, playerId, [
      { type: 'championRankUp', facts: { rank: updated.rank } },
    ]);

    return { champion: updated, consumed: food.map((row) => row.id) };
  });
}

// ── Ascension ───────────────────────────────────────────────────────────────

export async function ascend(
  db: Database,
  playerId: string,
  championId: string,
  def: Pick<ChampionDef, 'element' | 'rarity'>,
  config: ProgressionConfig,
  content: ContentCache,
): Promise<PlayerChampionRow> {
  return db.transaction(async (tx) => {
    const champion = await lockChampion(tx, playerId, championId);
    const next = champion.ascension + 1;

    const cap = ascensionCapForRank(champion.rank, config);
    if (next > cap) {
      throw new AppError(
        'VALIDATION',
        cap === 0
          ? 'A ★1 champion cannot ascend. Rank it up first.'
          : `★${champion.rank} champions ascend to ${cap}. Rank it up to go further.`,
      );
    }

    const cost = ascensionCost(def, next, config);
    if (Object.keys(cost).length === 0) {
      throw new AppError('VALIDATION', 'No ascension cost is published for that level.');
    }

    const held = await itemQuantities(tx, playerId);
    const missing = Object.entries(cost).find(
      ([itemKey, amount]) => (held.get(itemKey) ?? 0) < amount,
    );
    if (missing) {
      throw new AppError(
        'INSUFFICIENT_FUNDS',
        `Not enough ${missing[0]} — ${held.get(missing[0]) ?? 0} of ${missing[1]}.`,
      );
    }

    const spend: Record<string, number> = {};
    for (const [itemKey, amount] of Object.entries(cost)) spend[itemKey] = -amount;
    await grantItems(tx, playerId, spend, `champion:ascend:${championId}`);

    const [updated] = await tx
      .update(playerChampions)
      .set({ ascension: next, updatedAt: new Date() })
      .where(eq(playerChampions.id, championId))
      .returning();
    if (!updated) throw AppError.notFound('No such champion.');

    await track(tx, { content }, playerId, [{ type: 'championAscend' }]);
    return updated;
  });
}

// ── Skill upgrades ──────────────────────────────────────────────────────────

export type SkillUpgradeSource = { kind: 'tome' } | { kind: 'duplicate'; championId: string };

export async function upgradeSkill(
  db: Database,
  playerId: string,
  championId: string,
  skillKey: string,
  source: SkillUpgradeSource,
  def: Pick<ChampionDef, 'key' | 'rarity' | 'skills'>,
  config: ProgressionConfig,
): Promise<{ champion: PlayerChampionRow; consumed: string[] }> {
  if (!def.skills.includes(skillKey)) {
    throw new AppError('VALIDATION', 'That champion does not have that skill.');
  }

  return db.transaction(async (tx) => {
    const champion = await lockChampion(tx, playerId, championId);
    const upgrades = { ...(champion.skillUpgrades ?? {}) };
    const current = upgrades[skillKey] ?? 0;
    if (current >= config.skillUpgradeMaxLevel) {
      throw new AppError('VALIDATION', 'That skill is fully upgraded.');
    }

    const consumed: string[] = [];
    if (source.kind === 'tome') {
      const tomeKey = config.tomeByRarity[def.rarity];
      if (!tomeKey) throw new AppError('VALIDATION', 'No tome is published for that rarity.');
      await grantItems(tx, playerId, { [tomeKey]: -1 }, `champion:skill:${championId}`);
    } else {
      // A duplicate is the other currency for this: the reason a second copy of a
      // seven-champion pool is worth pulling at all (GAME_DESIGN §7).
      const [duplicate] = await tx
        .select()
        .from(playerChampions)
        .where(
          and(eq(playerChampions.id, source.championId), eq(playerChampions.playerId, playerId)),
        )
        .for('update');
      if (!duplicate) throw AppError.notFound('No such champion to feed.');
      if (duplicate.id === championId) {
        throw new AppError('VALIDATION', 'A champion cannot be fed to itself.');
      }
      if (duplicate.championKey !== def.key) {
        throw new AppError('VALIDATION', 'Only a duplicate of the same champion teaches a skill.');
      }
      if (duplicate.locked) throw new AppError('VALIDATION', 'That champion is locked.');
      await consume(tx, [duplicate]);
      consumed.push(duplicate.id);
    }

    upgrades[skillKey] = current + 1;
    const [updated] = await tx
      .update(playerChampions)
      .set({ skillUpgrades: upgrades, updatedAt: new Date() })
      .where(eq(playerChampions.id, championId))
      .returning();
    if (!updated) throw AppError.notFound('No such champion.');
    return { champion: updated, consumed };
  });
}

// ── Flags and release ───────────────────────────────────────────────────────

export async function setFlags(
  db: Database,
  playerId: string,
  championId: string,
  flags: { locked?: boolean; favourite?: boolean },
): Promise<PlayerChampionRow> {
  const [row] = await db
    .update(playerChampions)
    .set({ ...flags, updatedAt: new Date() })
    .where(and(eq(playerChampions.id, championId), eq(playerChampions.playerId, playerId)))
    .returning();
  if (!row) throw AppError.notFound('No such champion.');
  return row;
}

/**
 * Releases champions for silver.
 *
 * Refuses the whole selection if any of it is protected, for the same reason the relic
 * sell does: a partial release that quietly spared some of what you picked is worse than
 * one that stops and says why.
 */
export async function release(
  db: Database,
  playerId: string,
  ids: readonly string[],
  rarityOf: (championKey: string) => Rarity | undefined,
  config: ProgressionConfig,
): Promise<{ released: string[]; silver: number; paid: number }> {
  return db.transaction(async (tx) => {
    const rows = await lockFood(tx, playerId, ids, null);

    const paid = rows.reduce((sum, row) => {
      const rarity = rarityOf(row.championKey) ?? 'common';
      return sum + Math.round((config.releaseSilver[rarity] ?? 0) * row.rank);
    }, 0);

    await grant(tx, playerId, { silver: paid }, `champion:release:${rows.length}`);
    await consume(tx, rows);

    const [wallet] = await tx
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));

    return { released: rows.map((row) => row.id), silver: wallet?.silver ?? 0, paid };
  });
}

// ── Shared guards ───────────────────────────────────────────────────────────

async function lockChampion(
  tx: Executor,
  playerId: string,
  championId: string,
): Promise<PlayerChampionRow> {
  const [row] = await tx
    .select()
    .from(playerChampions)
    .where(and(eq(playerChampions.id, championId), eq(playerChampions.playerId, playerId)))
    .for('update');
  if (!row) throw AppError.notFound('No such champion.');
  return row;
}

/**
 * Locks the champions about to be consumed and refuses anything protected.
 *
 * Four guards, and each exists because losing a champion is not undoable: it has to be
 * yours, it cannot be locked or favourited, it cannot be the champion being fed, and it
 * cannot still be wearing relics — that last one has saved more accounts than the others
 * put together.
 */
async function lockFood(
  tx: Executor,
  playerId: string,
  ids: readonly string[],
  targetId: string | null,
): Promise<PlayerChampionRow[]> {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) {
    throw new AppError('VALIDATION', 'The same champion appears twice in the selection.');
  }
  if (targetId && unique.includes(targetId)) {
    throw new AppError('VALIDATION', 'A champion cannot be fed to itself.');
  }

  const rows = await tx
    .select()
    .from(playerChampions)
    .where(and(eq(playerChampions.playerId, playerId), inArray(playerChampions.id, unique)))
    .for('update');

  if (rows.length !== unique.length) {
    throw AppError.notFound('One of those champions is not yours.');
  }

  const protectedRow = rows.find((row) => row.locked || row.favourite);
  if (protectedRow) {
    throw new AppError(
      'VALIDATION',
      protectedRow.locked
        ? 'A locked champion is in the selection.'
        : 'A favourited champion is in the selection.',
    );
  }

  const equipped = await tx
    .select({ id: gearInstances.id, championId: gearInstances.equippedChampionId })
    .from(gearInstances)
    .where(inArray(gearInstances.equippedChampionId, unique));
  if (equipped.length > 0) {
    throw new AppError(
      'VALIDATION',
      'A champion in the selection is still wearing relics. Strip it first.',
    );
  }

  return rows;
}

/** Removes consumed champions. Their relics were already proven to be off. */
async function consume(tx: Executor, rows: readonly PlayerChampionRow[]): Promise<void> {
  if (rows.length === 0) return;
  await tx.delete(playerChampions).where(
    inArray(
      playerChampions.id,
      rows.map((row) => row.id),
    ),
  );
}

/** The cap for a rank, re-exported so callers need only this module. */
export { levelCapForRank, LEVEL_CAP_BY_RANK };
