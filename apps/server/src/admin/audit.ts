import type { FastifyRequest } from 'fastify';
import type { Database } from '../db/client';
import { auditLog } from '../db/schema/index';

/**
 * Every administrative mutation leaves a trail — no exceptions.
 *
 * Writes are best-effort in the sense that a logging failure must not roll back the
 * action the operator asked for, but they are never skipped deliberately.
 */
export async function recordAudit(
  db: Database,
  request: FastifyRequest,
  entry: {
    action: string;
    entity: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  const actor = request.account?.accountName ?? 'unknown';

  await db.insert(auditLog).values({
    accountId: request.account?.id ?? null,
    actor: `admin:${actor}`,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

/** The label recorded as the publisher of a content revision. */
export function actorName(request: FastifyRequest): string {
  return request.account?.accountName ?? 'unknown';
}
