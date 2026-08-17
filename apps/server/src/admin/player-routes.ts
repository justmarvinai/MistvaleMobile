import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ADMIN_ROUTES,
  adminBanRequestSchema,
  adminGrantRequestSchema,
  adminRenameRequestSchema,
  adminSetRankRequestSchema,
  apiSuccess,
  routePattern,
} from '@mistvale/shared';
import { AppError } from '../lib/errors';
import { recordAudit } from './audit';
import * as playerAdmin from './players';

/**
 * Player-management endpoints.
 *
 * Thin, like the content routes: every rule lives in `players.ts`, so the same guards
 * apply whether an action arrives from the suite, a script, or whatever P8's mail
 * composer ends up calling.
 *
 * Every mutation writes an audit entry naming the operator, and the entries carry
 * before/after rather than just an action name — "vale-warden was banned" is a fact you
 * can act on a year later; "ban" is not.
 */
const searchQuerySchema = z.object({
  q: z.string().max(64).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  /** Bots are players too, so they are searchable — just not by default. */
  bots: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const adminPlayerRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): playerAdmin.PlayerAdminContext => ({ db: app.db, content: app.content });

  /** The operator behind the request. The rank guard has already run. */
  const operator = (request: { account?: { id: string; accountName: string } | null }) => {
    const account = request.account;
    if (!account) throw AppError.authRequired();
    return account;
  };

  app.get(ADMIN_ROUTES.players.search, async (request, reply) => {
    const query = searchQuerySchema.parse(request.query ?? {});
    const found = await playerAdmin.search(app.db, {
      query: query.q,
      limit: query.limit,
      offset: query.offset,
      includeBots: query.bots,
    });
    return reply.send(apiSuccess(found, app.content.rev));
  });

  app.get(routePattern(ADMIN_ROUTES.players.detail), async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(apiSuccess(await playerAdmin.detail(ctx(), id), app.content.rev));
  });

  app.post(routePattern(ADMIN_ROUTES.players.resetPassword), async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = operator(request);

    const { subject, temporaryPassword, sessionsRevoked } = await playerAdmin.resetPassword(
      app.db,
      id,
    );
    await recordAudit(app.db, request, {
      action: 'player.resetPassword',
      entity: 'account',
      entityId: subject.accountId,
      // Never the password itself: an audit trail that records credentials is a second
      // place they can leak from.
      after: { accountName: subject.accountName, sessionsRevoked },
    });
    request.log.warn(
      { actor: actor.accountName, accountName: subject.accountName },
      'admin reset a password',
    );

    return reply.send(apiSuccess({ temporaryPassword, sessionsRevoked }, app.content.rev));
  });

  app.post(routePattern(ADMIN_ROUTES.players.reset), async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = operator(request);

    // The "before" is read first and recorded whole. This is the one action with nothing
    // to compare against afterwards — everything it destroys is gone — so the audit entry
    // is the only remaining answer to "what did that account have?".
    const before = await playerAdmin.detail(ctx(), id);
    const { subject, summary } = await playerAdmin.resetAccount(app.db, id);

    await recordAudit(app.db, request, {
      action: 'player.reset',
      entity: 'player',
      entityId: subject.playerId,
      before: {
        level: before.player.level,
        silver: before.player.silver,
        crystals: before.player.crystals,
        valorMedals: before.player.valorMedals,
        holdings: before.holdings,
        progress: before.progress,
      },
      after: { accountName: subject.accountName, ...summary },
    });
    request.log.warn(
      { actor: actor.accountName, accountName: subject.accountName, ...summary },
      'admin reset an account to a fresh start',
    );

    return reply.send(apiSuccess(summary, app.content.rev));
  });

  app.post(routePattern(ADMIN_ROUTES.players.rank), async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = operator(request);
    const input = adminSetRankRequestSchema.parse(request.body);

    const before = await playerAdmin.detail(ctx(), id);
    const subject = await playerAdmin.setRank(app.db, id, actor.id, input.rank);
    await recordAudit(app.db, request, {
      action: 'player.setRank',
      entity: 'account',
      entityId: subject.accountId,
      before: { rank: before.account.rank },
      after: { accountName: subject.accountName, rank: subject.rank },
    });

    return reply.send(apiSuccess(state(subject), app.content.rev));
  });

  app.post(routePattern(ADMIN_ROUTES.players.ban), async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = operator(request);
    const input = adminBanRequestSchema.parse(request.body);

    const subject = await playerAdmin.setBanned(app.db, id, actor.id, {
      banned: input.banned,
      reason: input.reason,
    });
    await recordAudit(app.db, request, {
      action: input.banned ? 'player.ban' : 'player.unban',
      entity: 'account',
      entityId: subject.accountId,
      after: {
        accountName: subject.accountName,
        status: subject.status,
        reason: subject.banReason,
      },
    });

    return reply.send(apiSuccess(state(subject), app.content.rev));
  });

  app.post(routePattern(ADMIN_ROUTES.players.profileName), async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = adminRenameRequestSchema.parse(request.body);

    const before = await playerAdmin.detail(ctx(), id);
    const subject = await playerAdmin.rename(app.db, id, input.profileName);
    await recordAudit(app.db, request, {
      action: 'player.rename',
      entity: 'player',
      entityId: subject.playerId,
      before: { profileName: before.player.profileName },
      after: { profileName: subject.profileName },
    });

    return reply.send(apiSuccess(state(subject), app.content.rev));
  });

  app.post(routePattern(ADMIN_ROUTES.players.grant), async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = operator(request);
    const input = adminGrantRequestSchema.parse(request.body);

    const { subject, result } = await playerAdmin.grant(app.db, id, actor.accountName, input);
    await recordAudit(app.db, request, {
      action: 'player.grant',
      entity: 'player',
      entityId: subject.playerId,
      after: {
        profileName: subject.profileName,
        applied: result.applied,
        items: input.items ?? {},
        note: input.note,
      },
    });

    return reply.send(
      apiSuccess(
        { applied: result.applied, levelsGained: result.levelsGained, newLevel: result.newLevel },
        app.content.rev,
      ),
    );
  });

  app.delete(routePattern(ADMIN_ROUTES.players.sessions), async (request, reply) => {
    const { id } = request.params as { id: string };

    const { subject, revoked } = await playerAdmin.revokeSessions(app.db, id);
    await recordAudit(app.db, request, {
      action: 'player.revokeSessions',
      entity: 'account',
      entityId: subject.accountId,
      after: { accountName: subject.accountName, revoked },
    });

    return reply.send(apiSuccess({ revoked }, app.content.rev));
  });
};

/** The small acknowledgement every state-changing action returns. */
function state(subject: {
  rank: 'player' | 'gamemaster' | 'admin';
  status: 'active' | 'banned';
  banReason: string | null;
  profileName: string;
}) {
  return {
    rank: subject.rank,
    status: subject.status,
    banReason: subject.banReason,
    profileName: subject.profileName,
  };
}
