import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

/**
 * Environment configuration.
 *
 * Parsed and validated once at boot: a missing or malformed variable stops the process
 * immediately with a readable message, rather than failing deep inside a request.
 */

// Local dev reads a .env; on the VPS systemd supplies the environment directly.
loadEnv({ path: ['.env', '../../.env'], quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('127.0.0.1'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

  /**
   * Server-side secret mixed into session-token hashing. Rotating it invalidates every
   * session, which is the intended "log everyone out" lever.
   */
  SESSION_PEPPER: z.string().min(16, 'SESSION_PEPPER must be at least 16 characters'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  /** Public origin; used for cookie security decisions and CORS-free same-origin checks. */
  PUBLIC_ORIGIN: z.string().default('http://localhost:5173'),

  // `silent` is a real pino level and is what the test harness uses.
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),

  /** Where admin-uploaded art lives (nginx serves it directly in production). */
  UPLOADS_DIR: z.string().default('/var/lib/mistvale/uploads'),

  /** Timezone used for the daily reset boundary. */
  RESET_TIMEZONE: z.string().default('Europe/Berlin'),
  RESET_HOUR: z.coerce.number().int().min(0).max(23).default(4),

  /** Disable rate limiting in tests so suites are not throttled. */
  RATE_LIMIT_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value !== 'false' && value !== '0'),
});

export type AppConfig = Readonly<
  z.infer<typeof envSchema> & {
    isProduction: boolean;
    isTest: boolean;
    isDevelopment: boolean;
    /** Cookies get the Secure flag only when the site is actually served over HTTPS. */
    secureCookies: boolean;
  }
>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;
  cached = Object.freeze({
    ...env,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    isDevelopment: env.NODE_ENV === 'development',
    secureCookies: env.PUBLIC_ORIGIN.startsWith('https://'),
  });
  return cached;
}

/** Test helper: forget the memoised config so a new environment can be loaded. */
export function resetConfigCache(): void {
  cached = null;
}
