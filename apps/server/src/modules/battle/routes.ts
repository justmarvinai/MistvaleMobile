import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  BATTLE_MODES,
  ROUTES,
  apiSuccess,
  multiBattleRequestSchema,
  routePattern,
  type BattleMode,
} from '@mistvale/shared';
import { MAX_SIDE_SLOTS } from '@mistvale/engine';
import { AppError } from '../../lib/errors';
import * as championView from '../roster/champions';
import * as roster from '../roster/service';
import * as battle from './service';
import { idParam } from '../../lib/params';

/**
 * Roster and battle endpoints.
 *
 * Thin by design: every rule lives in the services, so the Arena and the Depths can reuse
 * them later without re-deriving what a turn costs or what a win pays.
 */

const unitRefSchema = z.object({
  side: z.enum(['ally', 'enemy']),
  // A summoning boss can widen its side past the four a wave is authored with, so a
  // manual target has as much room as the engine allows a formation.
  slot: z.number().int().min(0).max(MAX_SIDE_SLOTS),
});

/**
 * The modes a player may start from a map.
 *
 * `arena` is absent deliberately: an arena fight is entered through the Arena's own
 * endpoint against a snapshot defence, not by naming a stage key (docs/API_DESIGN.md §1).
 */
const PLAYABLE_MODES = BATTLE_MODES.filter((mode) => mode !== 'arena') as [BattleMode, BattleMode];

const startSchema = z.object({
  mode: z.enum(PLAYABLE_MODES),
  stageKey: z.string().min(2).max(64),
  /**
   * Formation order; the first slot is the leader whose aura applies.
   *
   * Empty is allowed at this layer, and only because of the cold open: a `tutorial` stage
   * carries its own team, so the client has nobody to name. Every other mode is held to
   * one-to-four by `assertTeamShape` in the service, where the mode is known — refusing an
   * empty team here would have meant either a second endpoint or a schema that lies about
   * which modes it serves.
   */
  team: z.array(z.string().uuid()).max(4).default([]),
  /** Client-generated. Replaying it returns the fight that was already opened. */
  actionId: z.string().min(8).max(64),
});

const actionSchema = z.object({
  /** Client-generated. Replaying one returns the recorded state instead of acting twice. */
  actionId: z.string().min(8).max(64),
  skill: z.string().min(2).max(64).optional(),
  target: unitRefSchema.optional(),
  /** Run the fight without stopping for input. */
  auto: z.boolean().default(false),
  /**
   * How many of the player's turns auto may take before handing control back.
   *
   * Omitted is the old meaning — the rest of the fight — which is what multi-battle and the
   * Arena ask for. The Auto *button* asks for a few at a time, so switching it off returns
   * control at the next decision rather than after an already-decided battle finishes
   * playing out. Capped, because the client naming a huge number would be asking the box
   * to resolve a whole fight it could have asked for with `auto` alone.
   */
  autoTurns: z.number().int().min(1).max(20).optional(),
  /** The enemy auto-battle should concentrate on, where the skill leaves a choice. */
  focus: unitRefSchema.optional(),
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
    // The assembled shape, not the bare row: the roster grid shows power and worn relics,
    // and having two representations of "a champion the player owns" is exactly how the
    // two drift apart.
    const champions = await championView.loadRoster(
      app.db,
      playerId,
      championView.championContextFrom(app.content),
    );
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

    await app.db.transaction((tx) =>
      roster.grantStarterPack(tx, playerId, app.content, championKey),
    );
    // Answer with the same assembled shape the list endpoint returns, so the client's
    // roster store holds one kind of champion regardless of how it arrived.
    const champions = await championView.loadRoster(
      app.db,
      playerId,
      championView.championContextFrom(app.content),
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

  app.post(ROUTES.battle.multi, async (request, reply) => {
    const playerId = requirePlayer(request);
    const input = multiBattleRequestSchema.parse(request.body);

    const result = await battle.runMany(ctx(), { playerId, ...input });
    request.log.info(
      { playerId, stageKey: input.stageKey, runs: result.runs.length, wins: result.wins },
      'multi-battle',
    );
    return reply.send(apiSuccess(result, app.content.rev));
  });

  app.get(ROUTES.battle.active, async (request, reply) => {
    const playerId = requirePlayer(request);
    const view = await battle.active(ctx(), playerId);
    return reply.send(apiSuccess({ battle: view }, app.content.rev));
  });

  app.get(routePattern(ROUTES.battle.byId), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    return reply.send(apiSuccess(await battle.findById(ctx(), playerId, id), app.content.rev));
  });

  app.post(routePattern(ROUTES.battle.action), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    const input = actionSchema.parse(request.body ?? {});

    const view = await battle.step(ctx(), {
      playerId,
      battleId: id,
      actionId: input.actionId,
      auto: input.auto,
      ...(input.autoTurns === undefined ? {} : { autoTurns: input.autoTurns }),
      ...(input.focus ? { focus: input.focus } : {}),
      ...(input.skill
        ? { action: { skill: input.skill, ...(input.target ? { target: input.target } : {}) } }
        : {}),
    });
    return reply.send(apiSuccess(view, app.content.rev));
  });

  app.post(routePattern(ROUTES.battle.retreat), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    const view = await battle.retreat(ctx(), playerId, id);
    request.log.info({ playerId, battleId: id }, 'battle retreat');
    return reply.send(apiSuccess(view, app.content.rev));
  });
};
