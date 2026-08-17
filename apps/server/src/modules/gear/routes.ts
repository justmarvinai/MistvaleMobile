import { randomInt } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import {
  ROUTES,
  apiSuccess,
  routePattern,
  ascendRequestSchema,
  championFlagsRequestSchema,
  equipGearRequestSchema,
  levelUpRequestSchema,
  lockGearRequestSchema,
  rankUpRequestSchema,
  releaseChampionsRequestSchema,
  sellGearRequestSchema,
  skillUpgradeRequestSchema,
  upgradeGearRequestSchema,
  type Rarity,
} from '@mistvale/shared';
import { AppError } from '../../lib/errors';
import * as champions from '../roster/champions';
import * as progression from '../roster/progression';
import { itemQuantities } from '../rewards/service';
import * as gear from './service';

/**
 * Relics and champion progression.
 *
 * Thin, like the battle routes: the rules live in the services so the Depths and the
 * Arena can reuse them. Every mutating endpoint returns the champion or relic it changed,
 * fully assembled, because the client re-reads rather than patching its own copy — the
 * "server is truth" rule, applied to the management screens.
 */

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  const requirePlayer = (request: { player?: { id: string } | null }): string => {
    const id = request.player?.id;
    if (!id) throw AppError.authRequired();
    return id;
  };

  const context = (): champions.ChampionContext => champions.championContextFrom(app.content);

  /** A relic upgrade seed comes from the OS, never from a battle's replayable stream. */
  const upgradeSeed = (): number => randomInt(0, 2 ** 31 - 1);

  const rarityOf = (championKey: string): Rarity | undefined =>
    app.content.current().bundle.champions.find((entry) => entry.key === championKey)?.rarity;

  app.addHook('preHandler', app.requireAuth);

  // ── Inventory ────────────────────────────────────────────────────────────
  app.get(ROUTES.inventory.items, async (request, reply) => {
    const playerId = requirePlayer(request);
    const held = await itemQuantities(app.db, playerId);
    const items = [...held].map(([itemKey, quantity]) => ({ itemKey, quantity }));
    return reply.send(apiSuccess({ items }, app.content.rev));
  });

  app.get(ROUTES.gear.list, async (request, reply) => {
    const playerId = requirePlayer(request);
    const list = await gear.listGear(app.db, playerId, context().gear);
    return reply.send(apiSuccess({ gear: list }, app.content.rev));
  });

  // ── Champions ────────────────────────────────────────────────────────────
  app.get(routePattern(ROUTES.roster.detail), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    const detail = await champions.loadDetail(app.db, playerId, id, context());
    return reply.send(apiSuccess({ champion: detail }, app.content.rev));
  });

  app.post(routePattern(ROUTES.roster.levelUp), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    const body = levelUpRequestSchema.parse(request.body);

    const result = await progression.levelUpWithFood(
      app.db,
      playerId,
      id,
      body.foodIds,
      app.content,
    );
    const detail = await champions.loadDetail(app.db, playerId, id, context());
    request.log.info(
      { playerId, championId: id, fed: result.consumed.length, xp: result.xpGained },
      'champion levelled',
    );
    return reply.send(
      apiSuccess(
        {
          champion: detail,
          consumed: result.consumed,
          silver: await silverOf(playerId),
          levelsGained: result.levelsGained,
        },
        app.content.rev,
      ),
    );
  });

  app.post(routePattern(ROUTES.roster.rankUp), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    const body = rankUpRequestSchema.parse(request.body);

    const result = await progression.rankUp(
      app.db,
      playerId,
      id,
      body.foodIds,
      context().progression,
      app.content,
    );
    const detail = await champions.loadDetail(app.db, playerId, id, context());
    request.log.info(
      { playerId, championId: id, rank: result.champion.rank },
      'champion ranked up',
    );
    return reply.send(
      apiSuccess(
        {
          champion: detail,
          consumed: result.consumed,
          silver: await silverOf(playerId),
          levelsGained: 0,
        },
        app.content.rev,
      ),
    );
  });

  app.post(routePattern(ROUTES.roster.ascend), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    ascendRequestSchema.parse(request.body);

    const ctx = context();
    const owned = await champions.loadOwned(app.db, playerId, id);
    const def = app.content
      .current()
      .bundle.champions.find((entry) => entry.key === owned.championKey);
    if (!def) throw AppError.notFound('That champion is no longer published.');

    await progression.ascend(app.db, playerId, id, def, ctx.progression, app.content);
    const detail = await champions.loadDetail(app.db, playerId, id, context());
    request.log.info({ playerId, championId: id }, 'champion ascended');
    return reply.send(
      apiSuccess(
        { champion: detail, consumed: [], silver: await silverOf(playerId), levelsGained: 0 },
        app.content.rev,
      ),
    );
  });

  app.post(routePattern(ROUTES.roster.skillUpgrade), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    const body = skillUpgradeRequestSchema.parse(request.body);

    const owned = await champions.loadOwned(app.db, playerId, id);
    const def = app.content
      .current()
      .bundle.champions.find((entry) => entry.key === owned.championKey);
    if (!def) throw AppError.notFound('That champion is no longer published.');

    const result = await progression.upgradeSkill(
      app.db,
      playerId,
      id,
      body.skillKey,
      body.source,
      def,
      context().progression,
    );
    const detail = await champions.loadDetail(app.db, playerId, id, context());
    return reply.send(
      apiSuccess(
        {
          champion: detail,
          consumed: result.consumed,
          silver: await silverOf(playerId),
          levelsGained: 0,
        },
        app.content.rev,
      ),
    );
  });

  app.post(routePattern(ROUTES.roster.flags), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    const body = championFlagsRequestSchema.parse(request.body);

    await progression.setFlags(app.db, playerId, id, body);
    const detail = await champions.loadDetail(app.db, playerId, id, context());
    return reply.send(apiSuccess({ champion: detail }, app.content.rev));
  });

  app.post(ROUTES.roster.release, async (request, reply) => {
    const playerId = requirePlayer(request);
    const body = releaseChampionsRequestSchema.parse(request.body);

    const result = await progression.release(
      app.db,
      playerId,
      body.ids,
      rarityOf,
      context().progression,
    );
    request.log.info({ playerId, count: result.released.length }, 'champions released');
    return reply.send(apiSuccess(result, app.content.rev));
  });

  // ── Relics ───────────────────────────────────────────────────────────────
  app.post(routePattern(ROUTES.gear.equip), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    const body = equipGearRequestSchema.parse(request.body);

    const ctx = context();
    await gear.equip(app.db, playerId, id, body.championId, ctx.gear, app.content);
    const detail = await champions.loadDetail(app.db, playerId, body.championId, context());
    return reply.send(apiSuccess({ champion: detail }, app.content.rev));
  });

  app.post(routePattern(ROUTES.gear.unequip), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };

    const row = await gear.unequip(app.db, playerId, id);
    return reply.send(apiSuccess({ gear: gear.toDto(row, context().gear) }, app.content.rev));
  });

  app.post(routePattern(ROUTES.gear.lock), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    const body = lockGearRequestSchema.parse(request.body);

    const row = await gear.setLocked(app.db, playerId, id, body.locked);
    return reply.send(apiSuccess({ gear: gear.toDto(row, context().gear) }, app.content.rev));
  });

  app.post(routePattern(ROUTES.gear.upgrade), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    const body = upgradeGearRequestSchema.parse(request.body);

    const ctx = context();
    const result = await gear.upgrade(
      app.db,
      playerId,
      id,
      body.times,
      ctx.gear,
      upgradeSeed(),
      app.content,
    );
    return reply.send(
      apiSuccess(
        {
          gear: gear.toDto(result.gear, ctx.gear),
          attempts: result.attempts,
          silverSpent: result.silverSpent,
          silver: result.silver,
        },
        app.content.rev,
      ),
    );
  });

  app.post(ROUTES.gear.sell, async (request, reply) => {
    const playerId = requirePlayer(request);
    const body = sellGearRequestSchema.parse(request.body);

    const result = await gear.sell(app.db, playerId, body.ids, context().gear);
    request.log.info({ playerId, count: result.sold.length, paid: result.paid }, 'relics sold');
    return reply.send(apiSuccess(result, app.content.rev));
  });

  /**
   * What equipping this relic would do.
   *
   * Computed by assembling the champion twice — once as it stands and once with the swap
   * applied — rather than by adding the relic's lines up, because a set bonus can appear
   * or vanish and a percentage resolves against the champion's base. The client shows the
   * difference; it never derives it.
   */
  app.get(routePattern(ROUTES.gear.preview), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    const { championId } = request.query as { championId?: string };
    if (!championId) throw new AppError('VALIDATION', 'Which champion? Pass ?championId=.');

    const ctx = context();
    const [candidate] = await gear
      .listGear(app.db, playerId, ctx.gear)
      .then((all) => all.filter((piece) => piece.id === id));
    if (!candidate) throw AppError.notFound('No such relic.');

    const before = await champions.loadDetail(app.db, playerId, championId, ctx);
    const worn = before.gear.filter((piece) => piece.slot !== candidate.slot);
    const replaces = before.gear.find((piece) => piece.slot === candidate.slot) ?? null;

    const owned = await champions.loadOwned(app.db, playerId, championId);
    const base = champions.baseStatsFor(owned, ctx);
    // The same mastery contribution the champion screen uses, or the preview would
    // promise a stat line the detail view then contradicts.
    const assembled = gear.assembleChampion(
      base,
      [...worn, candidate].map(toRow),
      ctx.gear,
      champions.masteryContribution(owned, base, ctx),
    );

    return reply.send(
      apiSuccess(
        {
          preview: {
            championId,
            before: before.stats,
            after: {
              base,
              gear: assembled.gear,
              mastery: assembled.mastery,
              total: assembled.total,
              setBonuses: assembled.setBonuses,
              power: assembled.power,
            },
            replaces,
          },
        },
        app.content.rev,
      ),
    );
  });

  /** The wallet, read after a spend so the client never has to subtract. */
  async function silverOf(playerId: string): Promise<number> {
    const { players } = await import('../../db/schema/index');
    const { eq } = await import('drizzle-orm');
    const [row] = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));
    return row?.silver ?? 0;
  }
};

/**
 * A relic DTO back into the row shape the assembler reads.
 *
 * Only the fields the maths uses are needed, which is why this is a narrowing rather than
 * a round trip through the database.
 */
function toRow(piece: Awaited<ReturnType<typeof gear.listGear>>[number]) {
  return {
    id: piece.id,
    setKey: piece.setKey,
    slot: piece.slot,
    rank: piece.rank,
    rarity: piece.rarity,
    level: piece.level,
    mainStat: piece.main,
    substats: piece.substats,
  } as Parameters<typeof gear.assembleChampion>[1][number];
}
