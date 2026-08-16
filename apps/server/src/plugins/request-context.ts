import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';
import { REQUEST_ID_HEADER } from '@mistvale/shared';

declare module 'fastify' {
  interface FastifyInstance {
    /** Current content revision; stamped onto every response envelope. Bumped in P1. */
    contentRevision: number;
    setContentRevision(revision: number): void;
    /** Process start time, for uptime reporting. */
    readonly startedAt: number;
  }
}

/**
 * Request identity and response-log sampling.
 *
 * Every request gets a short id that is echoed in the response header and in any error
 * envelope, so a bug report ("code X7F2K") maps straight to a log line. Successful
 * requests are sampled at 10% to keep log volume sane on the small box; anything slow or
 * failing is always logged (docs/ARCHITECTURE.md §10).
 */
export const requestContextPlugin = fp(
  async (app) => {
    let revision = 0;

    app.decorate('contentRevision', {
      getter: () => revision,
    });
    app.decorate('setContentRevision', (next: number) => {
      revision = next;
    });
    app.decorate('startedAt', Date.now());

    app.addHook('onRequest', async (request, reply) => {
      reply.header(REQUEST_ID_HEADER, request.id);
    });

    app.addHook('onResponse', async (request, reply) => {
      const durationMs = Math.round(reply.elapsedTime);
      const status = reply.statusCode;
      const slow = durationMs > 500;

      if (status >= 500 || slow) {
        request.log.warn(
          { status, durationMs, method: request.method, url: request.url },
          status >= 500 ? 'request failed' : 'slow request',
        );
        return;
      }
      if (status >= 400) {
        request.log.debug(
          { status, durationMs, method: request.method, url: request.url },
          'request rejected',
        );
        return;
      }
      // Sample successful requests so steady-state traffic does not fill the disk.
      if (Math.random() < 0.1) {
        request.log.info(
          { status, durationMs, method: request.method, url: request.url },
          'request',
        );
      }
    });
  },
  { name: 'request-context' },
);

/** Short, readable request ids — friendlier to quote than a full UUID. */
export function generateRequestId(): string {
  return randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
}
