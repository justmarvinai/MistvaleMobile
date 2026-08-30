import type { FastifyPluginAsync } from 'fastify';
import { ADMIN_ROUTES, adminAuditQuerySchema, apiSuccess } from '@mistvale/shared';
import { listAudit } from './audit-query';

/**
 * Reading the audit log (gap G1).
 *
 * One route and no mutations, which is the whole design: the log is a record of what was
 * changed, so nothing here may change it — and **reading it is not itself audited**, for
 * the reason `simulate` writes no audit row either. "Somebody opened the audit log" would
 * bury the entries that matter under entries about looking at them.
 */
export const adminAuditRoutes: FastifyPluginAsync = async (app) => {
  app.get(ADMIN_ROUTES.audit.list, async (request, reply) => {
    const query = adminAuditQuerySchema.parse(request.query ?? {});
    return reply.send(apiSuccess(await listAudit(app.db, query), app.content.rev));
  });
};
