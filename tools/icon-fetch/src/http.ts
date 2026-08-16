/**
 * Tiny HTTP layer: Node 22 built-in `fetch`, explicit timeouts, bounded retries with
 * exponential backoff + jitter, and a concurrency limiter. No dependencies.
 */

export interface HttpOptions {
  /** Per-attempt timeout in ms. */
  readonly timeoutMs?: number;
  /** Total attempts including the first. */
  readonly attempts?: number;
  /** Extra request headers (e.g. GitHub API auth). */
  readonly headers?: Readonly<Record<string, string>>;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 300;
const USER_AGENT = 'mistvale-icon-fetch (+https://github.com/game-icons/icons)';

/** A non-2xx response that we decided not to retry, or a request that exhausted its retries. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status: number | undefined,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function backoffMs(attempt: number): number {
  const exponential = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  return exponential + Math.floor(Math.random() * BASE_BACKOFF_MS);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function request(
  url: string,
  method: 'GET' | 'HEAD',
  options: HttpOptions,
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  let lastProblem = 'unknown error';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': USER_AGENT, ...options.headers },
      });

      if (response.ok || !RETRYABLE_STATUS.has(response.status)) return response;

      // Drain the body so the socket can be reused before we back off.
      await response.arrayBuffer().catch(() => undefined);
      lastProblem = `HTTP ${String(response.status)}`;
    } catch (error: unknown) {
      lastProblem = describe(error);
    }

    if (attempt < attempts) await sleep(backoffMs(attempt));
  }

  throw new HttpError(
    `${method} ${url} failed after ${String(attempts)} attempts: ${lastProblem}`,
    url,
    undefined,
  );
}

/** GET a URL, returning its body text. Throws `HttpError` on a non-2xx response. */
export async function getText(url: string, options: HttpOptions = {}): Promise<string> {
  const response = await request(url, 'GET', options);
  if (!response.ok) {
    throw new HttpError(
      `GET ${url} returned HTTP ${String(response.status)}`,
      url,
      response.status,
    );
  }
  return await response.text();
}

/** `true` when the URL exists (2xx). Any other definitive answer resolves to `false`. */
export async function exists(url: string, options: HttpOptions = {}): Promise<boolean> {
  const response = await request(url, 'HEAD', { attempts: 2, ...options });
  return response.ok;
}

/**
 * Runs `worker` over `items` with at most `limit` in flight, preserving input order in the
 * result. The first rejection propagates once the in-flight tasks settle.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      const item = items[index];
      if (index >= items.length || item === undefined) return;
      results[index] = await worker(item, index);
    }
  });

  await Promise.all(runners);
  return results;
}
