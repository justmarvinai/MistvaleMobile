import type { FastifyPluginAsync } from 'fastify';
import { ROUTES } from '@mistvale/shared';

/**
 * The content bundle endpoint.
 *
 * Returns everything the client needs to render names, kits, icons and stage layouts for
 * the live revision. Served straight from the in-memory snapshot as a pre-serialised
 * string — no database work and no per-request JSON encoding.
 *
 * The bundle is public: it is the game's rulebook, not a secret, and the login screen
 * has no session yet. It contains no player data and nothing that lets a client decide
 * an outcome.
 */
export const contentRoutes: FastifyPluginAsync = async (app) => {
  app.get(ROUTES.content.bundle, async (request, reply) => {
    const snapshot = app.content.current();

    // Content only changes on publish, so a matching ETag means nothing has moved.
    if (request.headers['if-none-match'] === snapshot.etag) {
      return reply.code(304).send();
    }

    return (
      reply
        .header('ETag', snapshot.etag)
        // Revalidate every time: a publish must reach players immediately, and the 304
        // path already makes that cheap.
        .header('Cache-Control', 'no-cache')
        .type('application/json; charset=utf-8')
        .send(`{"ok":true,"data":${snapshot.bundleJson},"rev":${snapshot.rev}}`)
    );
  });
};
