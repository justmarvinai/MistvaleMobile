import type { FastifyPluginAsync } from 'fastify';
import { ROUTES, apiSuccess, mailClaimRequestSchema, routePattern } from '@mistvale/shared';
import { AppError } from '../../lib/errors';
import * as mail from './service';
import { idParam } from '../../lib/params';

/**
 * The mailbox and the news feed.
 *
 * Every mail call answers with the whole inbox again rather than with what it changed: the
 * unread count, the pip and the claim-all button all move together, and a client that had
 * to re-read after every claim would render one of them stale on the way.
 */
export const mailRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  const requirePlayer = (request: { player?: { id: string } | null }): string => {
    const id = request.player?.id;
    if (!id) throw AppError.authRequired();
    return id;
  };

  const ctx = (): mail.MailContext => ({ db: app.db, content: app.content });

  app.get(ROUTES.mail.state, async (request, reply) => {
    const view = await mail.overview(ctx(), requirePlayer(request));
    return reply.send(apiSuccess({ mail: view }, app.content.rev));
  });

  app.post(routePattern(ROUTES.mail.read), async (request, reply) => {
    const id = idParam(request);
    const view = await mail.markRead(ctx(), requirePlayer(request), id);
    return reply.send(apiSuccess({ mail: view }, app.content.rev));
  });

  app.post(routePattern(ROUTES.mail.claim), async (request, reply) => {
    const id = idParam(request);
    const body = mailClaimRequestSchema.parse(request.body);
    const result = await mail.claim(ctx(), requirePlayer(request), id, body.actionId);
    return reply.send(apiSuccess(result, app.content.rev));
  });

  app.post(ROUTES.mail.claimAll, async (request, reply) => {
    const body = mailClaimRequestSchema.parse(request.body);
    const result = await mail.claimAll(ctx(), requirePlayer(request), body.actionId);
    return reply.send(apiSuccess(result, app.content.rev));
  });

  app.post(routePattern(ROUTES.mail.discard), async (request, reply) => {
    const id = idParam(request);
    const view = await mail.discard(ctx(), requirePlayer(request), id);
    return reply.send(apiSuccess({ mail: view }, app.content.rev));
  });

  // News is read-only and comes straight from the content snapshot — no database read at
  // all, which is what lets the Haven poll it as cheaply as it renders anything else.
  app.get(ROUTES.news.state, async (_request, reply) => {
    return reply.send(apiSuccess({ news: mail.news(ctx()) }, app.content.rev));
  });
};
