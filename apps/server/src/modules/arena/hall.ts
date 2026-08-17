import { and, eq } from 'drizzle-orm';
import {
  ELEMENTS,
  HALL_MAX_LEVEL,
  HALL_STATS,
  type Element,
  type HallOfValor,
  type HallStat,
  type HallTrack,
  type StatBlock,
} from '@mistvale/shared';
import { hallOfValor, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import { AppError } from '../../lib/errors';
import * as rewards from '../rewards/service';
import { hallCost, hallValue, type ArenaConfig } from './rating';

/**
 * The Hall of Valor.
 *
 * Twenty-four tracks — four elements by six stats — each ten levels deep, bought with the
 * Valor Medals the Arena pays out. It is the ladder's only sink and deliberately a
 * year-scale one: 2,500 medals finishes a single track and 60,000 finishes the Hall
 * (ECONOMY_BALANCE §8).
 *
 * What it grants is account-wide and unconditional, which puts it on the *stats* side of
 * the split every other bonus in Mistvale obeys: it is folded into a champion's numbers
 * before the fight, alongside relics and unconditional masteries, rather than riding into
 * the engine as an effect. A player who reads their champion screen sees it.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** Levels held, keyed `element:stat`. Absent means zero. */
export type HallLevels = ReadonlyMap<string, number>;

const trackKey = (element: Element, stat: HallStat): string => `${element}:${stat}`;

export async function levelsFor(db: Executor, playerId: string): Promise<HallLevels> {
  const rows = await db
    .select({ element: hallOfValor.element, stat: hallOfValor.stat, level: hallOfValor.level })
    .from(hallOfValor)
    .where(eq(hallOfValor.playerId, playerId));
  return new Map(rows.map((row) => [trackKey(row.element, row.stat), row.level]));
}

/**
 * What the Hall adds to one champion, given its element and its base stats.
 *
 * HP, ATK and DEF are percentages of the champion's own base — so the Hall helps a
 * levelled champion more than a fresh one, which is right for a sink that takes a year to
 * fill. C.DMG, ACC and RES are flat points, because those stats are already expressed in
 * points and a percentage of them would be meaningless.
 */
export function bonusFor(
  levels: HallLevels,
  element: Element,
  base: StatBlock,
  config: ArenaConfig,
): Partial<StatBlock> {
  const bonus: Partial<StatBlock> = {};
  for (const stat of HALL_STATS) {
    const level = levels.get(trackKey(element, stat)) ?? 0;
    if (level <= 0) continue;
    const value = hallValue(stat, level, config);

    if (stat === 'hp' || stat === 'atk' || stat === 'def') {
      bonus[stat] = Math.round((base[stat] * value) / 100);
    } else {
      bonus[stat] = (bonus[stat] ?? 0) + value;
    }
  }
  return bonus;
}

/** Every track, at its current level, with what the next one costs and gives. */
export async function state(
  db: Executor,
  playerId: string,
  medals: number,
  config: ArenaConfig,
): Promise<HallOfValor> {
  const levels = await levelsFor(db, playerId);

  const tracks: HallTrack[] = [];
  for (const element of ELEMENTS) {
    for (const stat of HALL_STATS) {
      const level = levels.get(trackKey(element, stat)) ?? 0;
      tracks.push({
        element,
        stat,
        level,
        nextCost: hallCost(level, config),
        value: hallValue(stat, level, config),
        nextValue: hallValue(stat, Math.min(HALL_MAX_LEVEL, level + 1), config),
      });
    }
  }

  return { medals, tracks, maxLevel: HALL_MAX_LEVEL };
}

/**
 * Buys one level of one track.
 *
 * The whole thing is a single transaction under the player-row lock, and the medals go
 * through `RewardService` like every other spend — so a Hall upgrade appears in
 * `economy_log` next to the arena wins that paid for it, and the ledger balances.
 */
export async function upgrade(
  db: Database,
  playerId: string,
  input: { element: Element; stat: HallStat },
  config: ArenaConfig,
): Promise<{ track: HallTrack; medalsSpent: number; medalsLeft: number }> {
  return db.transaction(async (tx) => {
    const [player] = await tx
      .select({ id: players.id, valorMedals: players.valorMedals })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');

    const [existing] = await tx
      .select({ level: hallOfValor.level })
      .from(hallOfValor)
      .where(
        and(
          eq(hallOfValor.playerId, playerId),
          eq(hallOfValor.element, input.element),
          eq(hallOfValor.stat, input.stat),
        ),
      );
    const level = existing?.level ?? 0;

    const cost = hallCost(level, config);
    if (cost === null) {
      throw new AppError('VALIDATION', 'That track is already at its highest level.');
    }
    if (player.valorMedals < cost) {
      throw new AppError('INSUFFICIENT_FUNDS', `That level costs ${cost} Valor Medals.`);
    }

    await rewards.spend(tx, playerId, { valorMedals: cost }, `hall:${input.element}:${input.stat}`);

    const next = level + 1;
    if (existing) {
      await tx
        .update(hallOfValor)
        .set({ level: next, updatedAt: new Date() })
        .where(
          and(
            eq(hallOfValor.playerId, playerId),
            eq(hallOfValor.element, input.element),
            eq(hallOfValor.stat, input.stat),
          ),
        );
    } else {
      await tx
        .insert(hallOfValor)
        .values({ playerId, element: input.element, stat: input.stat, level: next });
    }

    return {
      track: {
        element: input.element,
        stat: input.stat,
        level: next,
        nextCost: hallCost(next, config),
        value: hallValue(input.stat, next, config),
        nextValue: hallValue(input.stat, Math.min(HALL_MAX_LEVEL, next + 1), config),
      },
      medalsSpent: cost,
      medalsLeft: player.valorMedals - cost,
    };
  });
}
