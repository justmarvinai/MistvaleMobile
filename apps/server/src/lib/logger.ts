import type { FastifyServerOptions } from 'fastify';
import type { AppConfig } from './config';

/**
 * Structured logging.
 *
 * We hand Fastify the pino *options* rather than a constructed instance, so the server
 * and its request logger share one configuration and Fastify's own types stay intact.
 *
 * Production writes JSON to stdout, which systemd captures into the journal. Successful
 * requests are sampled by the request-logging hook to keep disk IO low on the small VPS;
 * errors are always logged in full (docs/ARCHITECTURE.md §10).
 */
export function createLoggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  if (config.LOG_LEVEL === 'silent') return false;

  const options = {
    level: config.LOG_LEVEL,
    // Never let a credential reach the log, whatever the call site does.
    redact: {
      paths: [
        'password',
        'newPassword',
        'currentPassword',
        'req.body.password',
        'req.body.newPassword',
        'req.body.currentPassword',
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        'tokenHash',
        'passwordHash',
      ],
      censor: '[redacted]',
    },
    base: { service: 'mistvale-server' },
  };

  if (config.LOG_PRETTY && !config.isProduction) {
    return {
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
      },
    };
  }

  return options;
}
