import { and, count, desc, eq, gte, ilike, lte } from 'drizzle-orm';
import type { AdminAuditPage, AdminAuditQuery } from '@mistvale/shared';
import type { Database } from '../db/client';
import { auditLog } from '../db/schema/index';

/**
 * Reading the audit log (gap G1).
 *
 * The writing half has been here since P1 — every administrative mutation records who,
 * what, and both sides of the change. What was missing was any way to *read* it beyond the
 * ten most recent entries on the dashboard, which is enough to notice that something
 * happened and useless for the question the log exists to answer: what happened to this
 * thing, and who did it.
 *
 * Every filter is optional and they combine, because an operator arrives here from one of
 * two directions — a name they are suspicious of, or an entity that has gone wrong — and
 * the second one usually narrows to a handful of rows out of thousands.
 *
 * The table already carried the three indexes this needs (`created_at`, `(entity,
 * entity_id)`, `account_id`), so nothing here is a new cost on the write path.
 */

/** The filters as SQL, shared by the page query and its count so the two cannot disagree. */
function conditions(query: AdminAuditQuery) {
  const clauses = [];
  // Substring on the actor because the recorded label is `admin:<name>` — an operator
  // types the name, not the prefix.
  if (query.actor) clauses.push(ilike(auditLog.actor, `%${query.actor}%`));
  if (query.action) clauses.push(eq(auditLog.action, query.action));
  if (query.entity) clauses.push(eq(auditLog.entity, query.entity));
  if (query.entityId) clauses.push(eq(auditLog.entityId, query.entityId));
  if (query.from) clauses.push(gte(auditLog.createdAt, new Date(query.from)));
  if (query.to) clauses.push(lte(auditLog.createdAt, new Date(query.to)));
  return clauses.length > 0 ? and(...clauses) : undefined;
}

export async function listAudit(db: Database, query: AdminAuditQuery): Promise<AdminAuditPage> {
  const where = conditions(query);

  const rows = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(query.limit)
    .offset(query.offset);

  const [totals] = await db.select({ total: count() }).from(auditLog).where(where);

  // The vocabularies, deliberately **unfiltered**: a filter's own options must not narrow
  // as it is used, or picking one action makes every other action unreachable without
  // clearing the form first.
  const actions = await db
    .selectDistinct({ value: auditLog.action })
    .from(auditLog)
    .orderBy(auditLog.action);
  const entities = await db
    .selectDistinct({ value: auditLog.entity })
    .from(auditLog)
    .orderBy(auditLog.entity);

  return {
    entries: rows.map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      before: row.before,
      after: row.after,
      createdAt: row.createdAt.toISOString(),
    })),
    total: totals?.total ?? 0,
    actions: actions.map((row) => row.value),
    entities: entities.map((row) => row.value),
  };
}
