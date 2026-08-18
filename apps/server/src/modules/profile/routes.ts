import type { FastifyPluginAsync } from 'fastify';
import { ROUTES, apiSuccess, routePattern, setShowcaseRequestSchema } from '@mistvale/shared';
import { AppError } from '../../lib/errors';
import * as profile from './service';
import { idParam } from '../../lib/params';

/**
 * The public profile card.
 *
 * Reading a card requires a session but not any particular one: a card is public *to
 * players*, which is the whole point of it being reachable from the ladder. It is not
 * public to the internet, because nothing in Mistvale is — there is no page to show it on
 * before sign-in.
 */
export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  const requirePlayer = (request: { player?: { id: string } | null }): string => {
    const id = request.player?.id;
    if (!id) throw AppError.authRequired();
    return id;
  };

  const ctx = (): profile.ProfileContext => ({ db: app.db, content: app.content });

  app.get(routePattern(ROUTES.profile.card), async (request, reply) => {
    const id = idParam(request);
    return reply.send(apiSuccess({ profile: await profile.card(ctx(), id) }, app.content.rev));
  });

  app.put(ROUTES.profile.showcase, async (request, reply) => {
    const body = setShowcaseRequestSchema.parse(request.body);
    const updated = await profile.setShowcase(ctx(), requirePlayer(request), body.championIds);
    return reply.send(apiSuccess({ profile: updated }, app.content.rev));
  });
};
