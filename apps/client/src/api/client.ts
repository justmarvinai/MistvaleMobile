import { API_PREFIX, REQUEST_ID_HEADER, type ApiResponse, type ErrorCode } from '@mistvale/shared';

/**
 * The typed API client.
 *
 * Every call returns the server's envelope; failures throw `ApiRequestError` so callers
 * can `try/catch` and inspect a structured code rather than parsing messages.
 */

export class ApiRequestError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(options: {
    code: ErrorCode;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
  }) {
    super(options.message);
    this.name = 'ApiRequestError';
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.requestId = options.requestId;
  }

  /** Field-level validation problems, when the server supplied them. */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const result: Record<string, string> = {};
    for (const issue of this.details) {
      if (
        typeof issue === 'object' &&
        issue !== null &&
        'path' in issue &&
        'message' in issue &&
        typeof issue.path === 'string' &&
        typeof issue.message === 'string'
      ) {
        result[issue.path] = issue.message;
      }
      // Some errors report a single offending field instead of a list.
      if (typeof issue === 'string') result._ = issue;
    }
    return result;
  }
}

/** Latest content revision seen from any response; screens re-fetch when it moves. */
let contentRevision = 0;
export function getContentRevision(): number {
  return contentRevision;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method,
      // Same-origin cookies carry the session; nothing else is needed.
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (cause) {
    // Network-level failure: no response at all.
    throw new ApiRequestError({
      code: 'INTERNAL',
      message: 'Could not reach the server. Check your connection and try again.',
      status: 0,
      details: cause,
    });
  }

  const requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiRequestError({
      code: 'INTERNAL',
      message: 'The server sent a response we could not read.',
      status: response.status,
      requestId,
    });
  }

  const envelope = payload as ApiResponse<T> & { status?: string };

  if (typeof envelope?.rev === 'number') {
    contentRevision = envelope.rev;
  }

  if (!response.ok || envelope?.ok === false) {
    const error = envelope?.ok === false ? envelope.error : undefined;
    throw new ApiRequestError({
      code: error?.code ?? 'INTERNAL',
      message: error?.message ?? 'Something went wrong.',
      status: response.status,
      details: error?.details,
      requestId: error?.requestId ?? requestId,
    });
  }

  return (envelope as { data: T }).data;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', body, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'PATCH', body, signal }),
};

/** Health probe used by the boot screen; bypasses the envelope. */
export async function probeServer(): Promise<boolean> {
  try {
    const response = await fetch(`${API_PREFIX}/health-lite`, { credentials: 'same-origin' });
    return response.ok;
  } catch {
    return false;
  }
}
