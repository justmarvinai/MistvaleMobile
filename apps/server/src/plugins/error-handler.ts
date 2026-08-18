import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { apiFailure, ERROR_MESSAGES } from '@mistvale/shared';
import { AppError, isAppError } from '../lib/errors';

/**
 * Translates every thrown error into the `{ ok: false, error, rev }` envelope.
 *
 * Four cases:
 *  - `AppError` — an outcome we modelled; reported with its code and message.
 *  - `ZodError` — request validation; reported as VALIDATION with field-level details.
 *  - a PostgreSQL **22P02** — malformed input that reached a typed column; reported as
 *    NOT_FOUND, because it is the caller's typo rather than our fault.
 *  - anything else — logged with its stack and reported as INTERNAL plus the request id,
 *    so a player can quote the id without us leaking implementation details.
 */
/** PostgreSQL's "invalid input syntax for type …" — 22P02, wherever in the cause chain. */
function isInvalidTextRepresentation(error: unknown): boolean {
  for (let cause: unknown = error, hops = 0; cause && hops < 5; hops += 1) {
    if ((cause as { code?: unknown }).code === '22P02') return true;
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
}

export const errorHandlerPlugin = fp(
  async (app) => {
    app.setErrorHandler((error, request, reply) => {
      const requestId = request.id;
      const rev = app.contentRevision;

      if (isAppError(error)) {
        const logLevel = error.expected ? 'debug' : 'error';
        request.log[logLevel](
          { err: error, code: error.code, requestId },
          'request failed: %s',
          error.code,
        );
        return reply
          .code(error.statusCode)
          .send(apiFailure(error.code, error.message, rev, { details: error.details, requestId }));
      }

      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        request.log.debug({ details, requestId }, 'request validation failed');
        return reply
          .code(400)
          .send(apiFailure('VALIDATION', ERROR_MESSAGES.VALIDATION, rev, { details, requestId }));
      }

      // A malformed id that reached a `uuid` column. `lib/params.ts` is meant to stop these
      // at the edge and does, for every route that exists today — this is the backstop, so
      // that a route added next month without the helper answers "we could not find that"
      // rather than claiming the server broke. It is a narrow catch on purpose: 22P02 is
      // *invalid text representation*, always about the value the caller sent.
      if (isInvalidTextRepresentation(error)) {
        request.log.debug({ requestId }, 'malformed identifier');
        return reply
          .code(404)
          .send(apiFailure('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND, rev, { requestId }));
      }

      // Fastify's own body-parse and schema errors carry a statusCode.
      const fastifyError = error as { statusCode?: unknown; message?: unknown };
      const statusCode =
        typeof fastifyError.statusCode === 'number' ? fastifyError.statusCode : 500;
      if (statusCode === 429) {
        return reply
          .code(429)
          .send(apiFailure('RATE_LIMITED', ERROR_MESSAGES.RATE_LIMITED, rev, { requestId }));
      }
      if (statusCode >= 400 && statusCode < 500) {
        request.log.debug({ err: error, requestId }, 'client error');
        const message =
          typeof fastifyError.message === 'string'
            ? fastifyError.message
            : ERROR_MESSAGES.VALIDATION;
        return reply.code(statusCode).send(apiFailure('VALIDATION', message, rev, { requestId }));
      }

      request.log.error({ err: error, requestId }, 'unhandled error');
      return reply
        .code(500)
        .send(apiFailure('INTERNAL', ERROR_MESSAGES.INTERNAL, rev, { requestId }));
    });

    app.setNotFoundHandler((request, reply) => {
      return reply.code(404).send(
        apiFailure(
          'NOT_FOUND',
          `No route for ${request.method} ${request.url}`,
          app.contentRevision,
          {
            requestId: request.id,
          },
        ),
      );
    });

    // A 404 from the not-found handler is not an error; only real throws reach above.
    app.addHook('onReady', async () => {
      app.log.debug('error handler installed');
    });
  },
  { name: 'error-handler' },
);

export { AppError };
