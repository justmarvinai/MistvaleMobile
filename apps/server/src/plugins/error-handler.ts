import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { apiFailure, ERROR_MESSAGES } from '@mistvale/shared';
import { AppError, isAppError } from '../lib/errors';

/**
 * Translates every thrown error into the `{ ok: false, error, rev }` envelope.
 *
 * Three cases:
 *  - `AppError` — an outcome we modelled; reported with its code and message.
 *  - `ZodError` — request validation; reported as VALIDATION with field-level details.
 *  - anything else — logged with its stack and reported as INTERNAL plus the request id,
 *    so a player can quote the id without us leaking implementation details.
 */
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
