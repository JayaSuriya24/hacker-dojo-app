/**
 * The client-side mirror of the API's error vocabulary.
 *
 * Every failure — network, HTTP, or application — arrives at a screen as one
 * `ApiError`. Screens branch on `code`, never on a status number or a message
 * string, so copy changes on the server do not silently break error handling
 * on the device.
 */

export type ApiErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'unauthorized'
  | 'session_expired'
  | 'forbidden'
  | 'membership_required'
  | 'certification_required'
  | 'not_found'
  | 'conflict'
  | 'slot_taken'
  | 'at_capacity'
  | 'rate_limited'
  | 'payment_failed'
  | 'upstream_unavailable'
  | 'internal_error'
  | 'network_error'
  | 'timeout';

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly issues: FieldIssue[];
  readonly requestId: string | undefined;
  readonly retryable: boolean;

  constructor(init: {
    code: ApiErrorCode;
    message: string;
    status?: number;
    issues?: FieldIssue[];
    requestId?: string | undefined;
    retryable?: boolean;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status ?? 0;
    this.issues = init.issues ?? [];
    this.requestId = init.requestId;
    this.retryable = init.retryable ?? false;
  }

  /** True when the member should be sent back to the sign-in screen. */
  get isAuthFailure(): boolean {
    return this.code === 'unauthorized' || this.code === 'session_expired';
  }

  /** True when the copy should nudge toward joining rather than report a fault. */
  get isMembershipGate(): boolean {
    return this.code === 'membership_required' || this.code === 'certification_required';
  }

  static network(message = 'No connection. Check your network and try again.'): ApiError {
    return new ApiError({ code: 'network_error', message, retryable: true });
  }

  static timeout(message = 'That took too long. Try again.'): ApiError {
    return new ApiError({ code: 'timeout', message, retryable: true });
  }

  static unknown(message = 'Something went wrong. Try again.'): ApiError {
    return new ApiError({ code: 'internal_error', message, status: 500, retryable: true });
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/**
 * The sentence a screen shows.
 *
 * Kept here rather than in each screen so the same failure reads identically
 * everywhere, and so the wording can be reviewed in one place.
 */
export function userMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Try again.';
}
