import fp from 'fastify-plugin';
import { ContentCache } from '../content/cache';

declare module 'fastify' {
  interface FastifyInstance {
    content: ContentCache;
  }
}

/**
 * Loads live content at boot and keeps the cache on the app instance.
 *
 * The response envelope's `rev` is read from here, so the cache must be in place before
 * any route can answer.
 */
export const contentPlugin = fp(
  async (app) => {
    const cache = new ContentCache(app.db);
    const snapshot = await cache.load();

    app.decorate('content', cache);
    app.setContentRevision(snapshot.rev);

    app.log.info(
      {
        rev: snapshot.rev,
        champions: snapshot.bundle.champions.length,
        skills: snapshot.bundle.skills.length,
        stages: snapshot.bundle.stages.length,
      },
      'content loaded',
    );
  },
  { name: 'content', dependencies: ['database'] },
);
