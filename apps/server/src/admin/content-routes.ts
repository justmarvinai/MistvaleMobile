import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ADMIN_ROUTES,
  CONTENT_REGISTRY,
  CONTENT_TYPES,
  apiSuccess,
  contentTypeByPath,
  type ContentType,
} from '@mistvale/shared';
import { AppError } from '../lib/errors';
import * as repo from '../content/repo';
import { actorName, recordAudit } from './audit';
import { keyParam } from '../lib/params';

/**
 * Content management for the Admin Suite.
 *
 * Writes always land in the **draft** state; nothing an editor does touches live content
 * until they publish. That is what makes the suite safe to use against a running game
 * (docs/ADMIN_SUITE_DESIGN.md §2.17).
 *
 * The routes are generic over the content registry, so a new content family becomes
 * editable by adding a registry entry rather than another set of endpoints.
 */
export const adminContentRoutes: FastifyPluginAsync = async (app) => {
  /** Resolves the `:type` URL segment to a known content type. */
  const resolveType = (params: unknown): ContentType => {
    const path = (params as { type?: string }).type ?? '';
    const contentType = contentTypeByPath(path);
    if (!contentType) throw AppError.notFound(`Unknown content type "${path}".`);
    return contentType;
  };

  // ── Listing ──────────────────────────────────────────────────────────────
  app.get('/content', async (_request, reply) => {
    const [live, drafts] = await Promise.all([
      repo.listByState(app.db, 'live'),
      repo.listByState(app.db, 'draft'),
    ]);

    const counts = CONTENT_TYPES.map((contentType) => ({
      contentType,
      label: CONTENT_REGISTRY[contentType].label,
      path: CONTENT_REGISTRY[contentType].path,
      live: live.filter((row) => row.contentType === contentType).length,
      drafts: drafts.filter((row) => row.contentType === contentType).length,
    }));

    return reply.send(
      apiSuccess(
        { types: counts, draftCount: drafts.length, rev: app.content.rev },
        app.content.rev,
      ),
    );
  });

  app.get('/content/:type', async (request, reply) => {
    const contentType = resolveType(request.params);
    const [live, drafts] = await Promise.all([
      repo.listByState(app.db, 'live', contentType),
      repo.listByState(app.db, 'draft', contentType),
    ]);

    const draftByKey = new Map(drafts.map((row) => [row.key, row]));
    const keys = new Set([...live.map((row) => row.key), ...drafts.map((row) => row.key)]);

    const items = [...keys].sort().map((key) => {
      const liveRow = live.find((row) => row.key === key);
      const draftRow = draftByKey.get(key);
      return {
        key,
        // The draft is what an editor should see and keep working on.
        data: draftRow?.deleted ? liveRow?.data : (draftRow?.data ?? liveRow?.data),
        state: draftRow ? (draftRow.deleted ? 'deleting' : 'draft') : 'live',
        updatedAt: (draftRow ?? liveRow)?.updatedAt ?? null,
        updatedBy: (draftRow ?? liveRow)?.updatedBy ?? null,
      };
    });

    return reply.send(apiSuccess({ contentType, items }, app.content.rev));
  });

  app.get('/content/:type/:key', async (request, reply) => {
    const contentType = resolveType(request.params);
    const key = keyParam(request);

    const [live, draft] = await Promise.all([
      repo.findEntry(app.db, contentType, key, 'live'),
      repo.findEntry(app.db, contentType, key, 'draft'),
    ]);
    if (!live && !draft) throw AppError.notFound(`No ${contentType} named "${key}".`);

    return reply.send(
      apiSuccess(
        {
          key,
          contentType,
          data: draft?.deleted ? live?.data : (draft?.data ?? live?.data),
          live: live?.data ?? null,
          hasDraft: Boolean(draft),
          pendingDelete: draft?.deleted ?? false,
        },
        app.content.rev,
      ),
    );
  });

  // ── Writing (drafts only) ────────────────────────────────────────────────
  const writeBody = z.object({ data: z.record(z.string(), z.unknown()) });

  app.put('/content/:type/:key', async (request, reply) => {
    const contentType = resolveType(request.params);
    const key = keyParam(request);
    const { data } = writeBody.parse(request.body);

    // Validate against the type's own schema so an editor gets field-level errors
    // immediately, rather than discovering them at publish time.
    const parsed = CONTENT_REGISTRY[contentType].schema.safeParse({ ...data, key });
    if (!parsed.success) {
      throw AppError.validation(
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
        'That content is not valid.',
      );
    }

    const before = await repo.findEntry(app.db, contentType, key, 'live');

    await app.db.transaction(async (tx) => {
      await repo.upsertEntry(tx, {
        contentType,
        key,
        state: 'draft',
        data: parsed.data,
        updatedBy: actorName(request),
      });
      await recordAudit(tx, request, {
        action: before ? 'content_update' : 'content_create',
        entity: contentType,
        entityId: key,
        before: before?.data ?? null,
        after: parsed.data,
      });
    });

    return reply.send(apiSuccess({ key, contentType, saved: true }, app.content.rev));
  });

  app.delete('/content/:type/:key', async (request, reply) => {
    const contentType = resolveType(request.params);
    const key = keyParam(request);

    const live = await repo.findEntry(app.db, contentType, key, 'live');

    await app.db.transaction(async (tx) => {
      if (live) {
        // Live content is only tombstoned; the removal happens at publish, so the
        // diff can show it and validation can catch anything still referencing it.
        await repo.upsertEntry(tx, {
          contentType,
          key,
          state: 'draft',
          data: live.data,
          deleted: true,
          updatedBy: actorName(request),
        });
      } else {
        await repo.deleteEntry(tx, contentType, key, 'draft');
      }
      await recordAudit(tx, request, {
        action: 'content_delete',
        entity: contentType,
        entityId: key,
        before: live?.data ?? null,
      });
    });

    return reply.send(
      apiSuccess({ key, contentType, pendingDelete: Boolean(live) }, app.content.rev),
    );
  });

  /** Drops a single pending draft, restoring the live version in the editor. */
  app.post('/content/:type/:key/revert-draft', async (request, reply) => {
    const contentType = resolveType(request.params);
    const key = keyParam(request);

    await app.db.transaction(async (tx) => {
      await repo.deleteEntry(tx, contentType, key, 'draft');
      await recordAudit(tx, request, {
        action: 'content_draft_discard',
        entity: contentType,
        entityId: key,
      });
    });

    return reply.send(apiSuccess({ key, contentType, discarded: true }, app.content.rev));
  });

  // ── Validate / diff / publish / revert ───────────────────────────────────
  app.post(ADMIN_ROUTES.content.validate, async (_request, reply) => {
    const result = await app.content.validateDrafts();
    return reply.send(apiSuccess(result, app.content.rev));
  });

  app.get(ADMIN_ROUTES.content.diff, async (_request, reply) => {
    const diff = await app.content.diff();
    return reply.send(apiSuccess(diff, app.content.rev));
  });

  const publishBody = z.object({ note: z.string().max(400).default('') });

  app.post(ADMIN_ROUTES.content.publish, async (request, reply) => {
    const { note } = publishBody.parse(request.body ?? {});

    const result = await app.content.publish({
      publishedBy: actorName(request),
      accountId: request.account?.id ?? null,
      note,
    });

    // The envelope's rev must move in step with the cache.
    app.setContentRevision(result.rev);

    await recordAudit(app.db, request, {
      action: 'content_publish',
      entity: 'content',
      entityId: String(result.rev),
      after: { rev: result.rev, summary: result.summary, note },
    });

    request.log.info({ rev: result.rev, summary: result.summary }, 'content published');
    return reply.send(apiSuccess(result, result.rev));
  });

  const revertBody = z.object({ rev: z.number().int().min(1) });

  app.post(ADMIN_ROUTES.content.revert, async (request, reply) => {
    const { rev } = revertBody.parse(request.body);

    const result = await app.content.revert({
      targetRev: rev,
      publishedBy: actorName(request),
      accountId: request.account?.id ?? null,
    });
    app.setContentRevision(result.rev);

    await recordAudit(app.db, request, {
      action: 'content_revert',
      entity: 'content',
      entityId: String(rev),
      after: { restoredFrom: rev, newRev: result.rev },
    });

    request.log.warn({ restoredFrom: rev, rev: result.rev }, 'content reverted');
    return reply.send(apiSuccess(result, result.rev));
  });

  app.get(ADMIN_ROUTES.content.revisions, async (_request, reply) => {
    const revisions = await repo.listRevisions(app.db);
    return reply.send(
      apiSuccess(
        {
          current: app.content.rev,
          revisions: revisions.map((revision) => ({
            rev: revision.rev,
            publishedAt: revision.publishedAt.toISOString(),
            publishedBy: revision.publishedBy,
            note: revision.note,
            summary: revision.summary,
          })),
        },
        app.content.rev,
      ),
    );
  });

  app.post(ADMIN_ROUTES.content.discard, async (request, reply) => {
    const removed = await app.db.transaction(async (tx) => {
      const count = await repo.deleteAllDrafts(tx);
      await recordAudit(tx, request, {
        action: 'content_discard_all',
        entity: 'content',
        after: { discarded: count },
      });
      return count;
    });

    return reply.send(apiSuccess({ discarded: removed }, app.content.rev));
  });
};
