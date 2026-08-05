import { appConfig } from '~/constants/config';
import { logger } from '~/services/logger';
import { supabase } from '~/services/supabase';
import { ApiError, type ApiErrorCode, type FieldIssue } from './errors';

/**
 * The one HTTP client.
 *
 * Everything the app sends to the API goes through `request`, which means the
 * cross-cutting concerns are implemented once: bearer token, refresh-on-401,
 * timeout, retry with backoff, and error normalisation. A feature's `api.ts`
 * file contains URLs and types, never fetch plumbing.
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined>;
  /** Send without a bearer token even if a session exists. */
  anonymous?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Off for non-idempotent writes that are not idempotency-keyed. */
  retry?: boolean;
}

interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

interface ApiErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    issues?: FieldIssue[];
    requestId: string;
    retryable: boolean;
  };
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = new URL(`${appConfig.apiBaseUrl}${path}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      // Repeated key for arrays — matches the `skills` handling in the
      // directory validator on the server.
      if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(key, entry));
      else url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function currentAccessToken(): Promise<string | null> {
  // `getSession` refreshes when the token is close to expiry, so the common
  // case never reaches the 401 path below.
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Turn a non-2xx response into an ApiError. Falls back gracefully when the
 * body is not the expected envelope — a proxy returning an HTML 502 should
 * still surface as a readable message rather than a JSON parse crash.
 */
async function toApiError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get('x-request-id') ?? undefined;

  try {
    const body = (await response.json()) as ApiErrorEnvelope;
    if (body?.error?.code) {
      return new ApiError({
        code: body.error.code,
        message: body.error.message,
        status: response.status,
        issues: body.error.issues ?? [],
        requestId: body.error.requestId ?? requestId,
        retryable: body.error.retryable,
      });
    }
  } catch {
    // Body was not JSON. Fall through to the status-based message.
  }

  const byStatus: Record<number, { code: ApiErrorCode; message: string }> = {
    401: { code: 'unauthorized', message: 'Sign in to continue.' },
    403: { code: 'forbidden', message: "You don't have access to that." },
    404: { code: 'not_found', message: "We couldn't find that." },
    429: { code: 'rate_limited', message: 'Too many requests. Give it a moment.' },
  };

  const mapped = byStatus[response.status];
  return new ApiError({
    code: mapped?.code ?? 'internal_error',
    message: mapped?.message ?? 'Something went wrong. Try again.',
    status: response.status,
    requestId,
    retryable: response.status >= 500 || response.status === 429,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function execute<T>(path: string, options: RequestOptions, attempt: number): Promise<T> {
  const { method = 'GET', body, query, anonymous, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Honour a caller-supplied signal alongside our timeout, so a screen that
  // unmounts mid-request cancels it rather than leaking the fetch.
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    if (!anonymous) {
      const token = await currentAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(buildUrl(path, query), {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      const payload = (await response.json()) as ApiEnvelope<T>;
      return payload.data;
    }

    const error = await toApiError(response);

    /**
     * One refresh attempt on a 401.
     *
     * A token can expire between `getSession` returning it and the server
     * checking it. Refreshing and replaying once turns that race into a
     * successful request instead of an unnecessary trip to the sign-in screen.
     * If the refresh itself fails, the session really is gone.
     */
    if (error.isAuthFailure && attempt === 0 && !anonymous) {
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && data.session) {
        return execute<T>(path, options, attempt + 1);
      }
      throw new ApiError({
        code: 'session_expired',
        message: 'Your session expired. Sign in again.',
        status: 401,
      });
    }

    throw error;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error instanceof Error && error.name === 'AbortError') {
      // A caller-driven abort is not a failure to report.
      if (options.signal?.aborted) throw error;
      throw ApiError.timeout();
    }

    logger.warn('Network request failed', { path, method, error });
    throw ApiError.network();
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Issue a request, retrying transient failures with exponential backoff.
 *
 * Only idempotent methods retry by default. A POST that creates a booking must
 * not be replayed automatically — the caller opts in explicitly where the
 * endpoint is idempotency-keyed (the payment intents).
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const isIdempotent = !options.method || options.method === 'GET';
  const allowRetry = options.retry ?? isIdempotent;

  let lastError: unknown;

  for (let attempt = 0; attempt <= (allowRetry ? MAX_RETRIES : 0); attempt += 1) {
    try {
      return await execute<T>(path, options, 0);
    } catch (error) {
      lastError = error;

      const retryable = error instanceof ApiError && error.retryable;
      if (!retryable || attempt === MAX_RETRIES) break;

      // 250ms, 500ms — short enough that a flaky connection recovers within a
      // spinner, long enough not to hammer a struggling server.
      await sleep(250 * 2 ** attempt);
    }
  }

  throw lastError;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
