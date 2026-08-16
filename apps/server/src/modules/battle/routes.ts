import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ROUTES, apiSuccess, routePattern } from '@mistvale/shared';
import { AppError } from '../../lib/errors';
import * as roster from '../roster/service';
import * as battle from './service';

/**
 * Roster and battle endpoints.
 *
 * Thin by design: every rule lives in the services, so the Arena and the Depths can reuse
 * them later without re-deriving what a turn costs or what a win pays.
 */

const unitRefSchema = z.object({
  side: z.enum(['ally', 'enemy']),
  slot: z.number().int().min(0).max(3),
});

const startSchema = z.object({
  mode: z.enum(['campaign', 'tutorial', 'practice']),
  stageKey: z.string().min(2).max(64),
  /** Formation order; the first slot is the leader whose aura applies. */
  team: z.array(z.string().uuid()).min(1).max(4),
});

const actionSchema = z.object({
  /** Client-generated. Replaying one returns the recorded state instead of acting twice. */
  actionId: z.string().min(8).max(64),
  skill: z.string().min(2).max(64).optional(),
  target: unitRefSchema.optional(),
  /** Run the rest of the fight without stopping for input. */
  auto: z.boolean().default(false),
});

const starterSchema = z.object({ championKey: z.string().min(2).max(64) });

export const gameRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): battle.BattleContext => ({ db: app.db, content: app.content });

  /** The player behind the request, or a 401. */
  const requirePlayer = (request: { player?: { id: string } | null }): string => {
    const id = request.player?.id;
    if (!id) throw AppError.authRequired();
    return id;
  };

  app.addHook('preHandler', app.requireAuth);

  // ── Roster ───────────────────────────────────────────────────────────────
  app.get(ROUTES.roster.list, async (request, reply) => {
    const playerId = requirePlayer(request);
    const champions = await roster.listRoster(app.db, playerId);
    return reply.send(apiSuccess({ champions }, app.content.rev));
  });

  app.get(ROUTES.roster.starters, async (_request, reply) => {
    const starters = roster.starterChoices(app.content).map((champion) => ({
      key: champion.key,
      name: champion.name,
      title: champion.title,
      element: champion.element,
      rarity: champion.rarity,
      role: champion.role,
      factionKey: champion.factionKey,
      assetKey: champion.assetKey,
    }));
    return reply.send(apiSuccess({ starters }, app.content.rev));
  });

  app.post(ROUTES.roster.chooseStarter, async (request, reply) => {
    const playerId = requirePlayer(request);
    const { championKey } = starterSchema.parse(request.body);

    const champions = await app.db.transaction((tx) =>
      roster.grantStarterPack(tx, playerId, app.content, championKey),
    );
    request.log.info({ playerId, championKey }, 'starter chosen');
    return reply.send(apiSuccess({ champions }, app.content.rev));
  });

  // ── Battle ───────────────────────────────────────────────────────────────
  app.post(ROUTES.battle.start, async (request, reply) => {
    const playerId = requirePlayer(request);
    const input = startSchema.parse(request.body);

    const view = await battle.start(ctx(), { playerId, ...input });
    request.log.info({ playerId, stageKey: input.stageKey, battleId: view.id }, 'battle started');
    return reply.send(apiSuccess(view, app.content.rev));
  });

  app.get(ROUTES.battle.active, async (request, reply) => {
    const playerId = requirePlayer(request);
    const view = await battle.active(ctx(), playerId);
    return reply.send(apiSuccess({ battle: view }, app.content.rev));
  });

  app.get(routePattern(ROUTES.battle.byId), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    return reply.send(apiSuccess(await battle.findById(ctx(), playerId, id), app.content.rev));
  });

  app.post(routePattern(ROUTES.battle.action), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    const input = actionSchema.parse(request.body ?? {});

    const view = await battle.step(ctx(), {
      playerId,
      battleId: id,
      actionId: input.actionId,
      auto: input.auto,
      ...(input.skill
        ? { action: { skill: input.skill, ...(input.target ? { target: input.target } : {}) } }
        : {}),
    });
    return reply.send(apiSuccess(view, app.content.rev));
  });

  app.post(routePattern(ROUTES.battle.retreat), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { id } = request.params as { id: string };
    const view = await battle.retreat(ctx(), playerId, id);
    request.log.info({ playerId, battleId: id }, 'battle retreat');
    return reply.send(apiSuccess(view, app.content.rev));
  });
};
