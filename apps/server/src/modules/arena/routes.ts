import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  ROUTES,
  apiSuccess,
  arenaAttackRequestSchema,
  arenaDefenceRequestSchema,
  hallUpgradeRequestSchema,
} from '@mistvale/shared';
import { players } from '../../db/schema/index';
import { AppError } from '../../lib/errors';
import { arenaConfigFrom } from './rating';
import * as arena from './service';
import * as hall from './hall';

/**
 * The Arena and the Hall of Valor.
 *
 * Everything a hub needs arrives in one read of `GET /arena` — rating, tier, the token
 * meter, the defence team, the offer list and the chest — because five requests to draw
 * one screen is five chances to render a contradiction.
 *
 * An attack returns an ordinary battle view. The fight is then played through
 * `/battles/:id/action` like any other, which is the whole point: the Arena adds a cost
 * and a payout, not a second way to fight.
 */
export const arenaRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  const requirePlayer = (request: { player?: { id: string } | null }): string => {
    const id = request.player?.id;
    if (!id) throw AppError.authRequired();
    return id;
  };

  const ctx = (): arena.ArenaContext => ({ db: app.db, content: app.content });

  app.get(ROUTES.arena.state, async (request, reply) => {
    const state = await arena.overview(ctx(), requirePlayer(request));
    return reply.send(apiSuccess({ arena: state }, app.content.rev));
  });

  app.post(ROUTES.arena.refreshOffers, async (request, reply) => {
    const state = await arena.refreshOffers(ctx(), requirePlayer(request));
    return reply.send(apiSuccess({ arena: state }, app.content.rev));
  });

  app.post(ROUTES.arena.defence, async (request, reply) => {
    const body = arenaDefenceRequestSchema.parse(request.body);
    const state = await arena.setDefence(ctx(), requirePlayer(request), body.team);
    return reply.send(apiSuccess({ arena: state }, app.content.rev));
  });

  app.post(ROUTES.arena.attack, async (request, reply) => {
    const body = arenaAttackRequestSchema.parse(request.body);
    const battle = await arena.attack(ctx(), {
      playerId: requirePlayer(request),
      offerId: body.offerId,
      team: body.team,
      actionId: body.actionId,
    });
    return reply.status(201).send(apiSuccess({ battle }, app.content.rev));
  });

  app.get(ROUTES.arena.leaderboard, async (request, reply) => {
    const board = await arena.leaderboard(ctx(), requirePlayer(request));
    return reply.send(apiSuccess({ leaderboard: board }, app.content.rev));
  });

  app.post(ROUTES.arena.claimWeekly, async (request, reply) => {
    const playerId = requirePlayer(request);
    const claimed = await arena.claimWeekly(ctx(), playerId);
    // The whole state comes back with it, so the hub's chest panel and the wallet in the
    // header cannot disagree about what just happened.
    const state = await arena.overview(ctx(), playerId);
    return reply.send(apiSuccess({ chest: claimed, arena: state }, app.content.rev));
  });

  // ── The Hall of Valor ─────────────────────────────────────────────────────

  app.get(ROUTES.hallOfValor.state, async (request, reply) => {
    const playerId = requirePlayer(request);
    const [player] = await app.db
      .select({ level: players.level, valorMedals: players.valorMedals })
      .from(players)
      .where(eq(players.id, playerId));
    if (!player) throw AppError.notFound('No such player.');

    const settings = arenaConfigFrom(app.content.current().bundle.config);
    // Gated with the Arena rather than separately: the Hall spends what the Arena pays,
    // and a screen full of tracks nobody can buy is worse than a locked door.
    arena.assertUnlocked(player.level, ctx());

    const state = await hall.state(app.db, playerId, player.valorMedals, settings);
    return reply.send(apiSuccess({ hall: state }, app.content.rev));
  });

  app.post(ROUTES.hallOfValor.upgrade, async (request, reply) => {
    const playerId = requirePlayer(request);
    const body = hallUpgradeRequestSchema.parse(request.body);

    const [player] = await app.db
      .select({ level: players.level })
      .from(players)
      .where(eq(players.id, playerId));
    if (!player) throw AppError.notFound('No such player.');
    arena.assertUnlocked(player.level, ctx());

    const settings = arenaConfigFrom(app.content.current().bundle.config);
    const result = await hall.upgrade(
      app.db,
      playerId,
      { element: body.element, stat: body.stat },
      settings,
    );
    return reply.send(apiSuccess(result, app.content.rev));
  });
};
