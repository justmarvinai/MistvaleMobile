import type { FastifyPluginAsync } from 'fastify';
import { ADMIN_ROUTES, apiSuccess, mailSendRequestSchema } from '@mistvale/shared';
import { AppError } from '../lib/errors';
import * as mail from './mail';
import { recordAudit } from './audit';

/**
 * The mail composer.
 *
 * Two endpoints: send, and read back what was sent. Both audited — a message that hands
 * over crystals is a grant, and grants are the thing the audit log exists for.
 *
 * `sentBy` is the operator's own account name rather than a generic "admin", because the
 * player-facing point of mail is that somebody can be asked about it afterwards.
 */
export const adminMailRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): mail.AdminMailContext => ({ db: app.db, content: app.content });

  app.post(ADMIN_ROUTES.mail.send, async (request, reply) => {
    const input = mailSendRequestSchema.parse(request.body);
    const account = request.account;
    if (!account) throw AppError.authRequired();

    const result = await mail.send(ctx(), input, `admin:${account.accountName}`);

    await recordAudit(app.db, request, {
      action: 'mail.send',
      entity: 'mail',
      entityId: result.batchId,
      after: {
        target: input.target,
        playerId: input.playerId ?? null,
        title: input.title,
        attachments: input.attachments,
        expiresInDays: input.expiresInDays,
        recipients: result.recipients,
      },
    });
    request.log.info(
      { batchId: result.batchId, recipients: result.recipients, by: account.accountName },
      'mail sent',
    );

    return reply.send(apiSuccess(result, app.content.rev));
  });

  app.get(ADMIN_ROUTES.mail.log, async (_request, reply) => {
    return reply.send(apiSuccess({ batches: await mail.batches(ctx()) }, app.content.rev));
  });
};
