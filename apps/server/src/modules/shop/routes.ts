import type { FastifyPluginAsync } from 'fastify';
import {
  ROUTES,
  apiSuccess,
  routePattern,
  buyShopSlotRequestSchema,
  shopActionRequestSchema,
} from '@mistvale/shared';
import { AppError } from '../../lib/errors';
import { gearContextFrom } from '../gear/service';
import * as shop from './service';

/**
 * Shop endpoints.
 *
 * One shop at EA — the Bazaar — but the key is a path parameter from the start, because
 * the Arena and event shops arrive in later phases and reusing this is cheaper than
 * generalising it later (CLAUDE.md — "add more stuff" stays the cheap operation).
 */

export const shopRoutes: FastifyPluginAsync = async (app) => {
  const requirePlayer = (request: { player?: { id: string } | null }): string => {
    const id = request.player?.id;
    if (!id) throw AppError.authRequired();
    return id;
  };

  /** Resolves the shop definition, or 404s if content no longer publishes it. */
  const context = (shopKey: string): shop.ShopContext => {
    const bundle = app.content.current().bundle;
    const def = bundle.shops.find((entry) => entry.key === shopKey);
    if (!def) throw AppError.notFound('No such shop.');
    return {
      def,
      gear: gearContextFrom(bundle),
      champions: new Map(bundle.champions.map((champion) => [champion.key, champion])),
      itemNames: new Map(bundle.items.map((item) => [item.key, item.name])),
    };
  };

  app.addHook('preHandler', app.requireAuth);

  app.get(routePattern(ROUTES.shop.stock, 'key'), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { key } = request.params as { key: string };
    const stock = await shop.stockFor(app.db, playerId, context(key), app.content.rev);
    return reply.send(apiSuccess({ stock }, app.content.rev));
  });

  app.post(routePattern(ROUTES.shop.buy, 'key'), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { key } = request.params as { key: string };
    const body = buyShopSlotRequestSchema.parse(request.body);

    const result = await shop.buy(app.db, playerId, body.slotIndex, context(key), app.content);
    request.log.info({ playerId, shopKey: key, slot: body.slotIndex }, 'shop purchase');
    return reply.send(apiSuccess(result, app.content.rev));
  });

  app.post(routePattern(ROUTES.shop.refresh, 'key'), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { key } = request.params as { key: string };
    shopActionRequestSchema.parse(request.body);

    const stock = await shop.refresh(app.db, playerId, context(key), app.content.rev);
    return reply.send(apiSuccess({ stock }, app.content.rev));
  });

  app.post(routePattern(ROUTES.shop.unlockSlot, 'key'), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { key } = request.params as { key: string };
    shopActionRequestSchema.parse(request.body);

    const stock = await shop.unlockSlot(app.db, playerId, context(key));
    return reply.send(apiSuccess({ stock }, app.content.rev));
  });
};
