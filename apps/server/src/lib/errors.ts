import { ERROR_HTTP_STATUS, ERROR_MESSAGES, type ErrorCode } from '@mistvale/shared';

/**
 * The one error type the application throws.
 *
 * Handlers throw `AppError`; the global error handler turns it into the `{ok:false}`
 * envelope. Anything else that escapes is logged with its stack and reported as
 * INTERNAL with a request id the player can quote — we never leak internals.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: unknown;
  /** Expected failures (bad password, not enough silver) are logged at debug level. */
  readonly expected: boolean;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: { details?: unknown; statusCode?: number; expected?: boolean; cause?: unknown },
  ) {
    super(message ?? ERROR_MESSAGES[code], options?.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = options?.statusCode ?? ERROR_HTTP_STATUS[code];
    this.details = options?.details;
    this.expected = options?.expected ?? code !== 'INTERNAL';
  }

  static authRequired(message?: string): AppError {
    return new AppError('AUTH_REQUIRED', message);
  }

  static forbidden(message?: string): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static notFound(message?: string): AppError {
    return new AppError('NOT_FOUND', message);
  }

  static validation(details?: unknown, message?: string): AppError {
    return new AppError('VALIDATION', message, { details });
  }

  static invalidCredentials(): AppError {
    return new AppError('INVALID_CREDENTIALS');
  }

  static alreadyExists(message?: string, details?: unknown): AppError {
    return new AppError('ALREADY_EXISTS', message, { details });
  }

  static internal(message?: string, cause?: unknown): AppError {
    return new AppError('INTERNAL', message, { cause, expected: false });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
