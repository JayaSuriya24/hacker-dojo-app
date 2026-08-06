/**
 * The API's error vocabulary.
 *
 * Every failure the client can see is one of these. The `code` is a stable
 * machine-readable string the mobile app switches on; `message` is written to
 * be shown to a human as-is, which is why none of them mention SQL, Stripe or
 * a stack frame.
 */

export type ErrorCode =
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
  | 'internal_error';

export interface FieldIssue {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly issues: FieldIssue[] | undefined;
  /** Detail for the log only — never serialised into a response. */
  readonly context: Record<string, unknown> | undefined;
  /** True when the client can sensibly retry the identical request. */
  readonly retryable: boolean;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options: {
      issues?: FieldIssue[];
      context?: Record<string, unknown>;
      retryable?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.issues = options.issues;
    this.context = options.context;
    this.retryable = options.retryable ?? status >= 500;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message: string, issues?: FieldIssue[]): AppError {
    return new AppError(400, 'bad_request', message, issues ? { issues } : {});
  }

  static validation(message: string, issues: FieldIssue[]): AppError {
    return new AppError(422, 'validation_failed', message, { issues });
  }

  static unauthorized(message = 'Sign in to continue.'): AppError {
    return new AppError(401, 'unauthorized', message);
  }

  static sessionExpired(message = 'Your session expired. Sign in again.'): AppError {
    return new AppError(401, 'session_expired', message);
  }

  static forbidden(message = "You don't have access to that."): AppError {
    return new AppError(403, 'forbidden', message);
  }

  static membershipRequired(
    message = 'This is a member benefit. Start with a tour, then pick a plan.',
  ): AppError {
    return new AppError(403, 'membership_required', message);
  }

  static certificationRequired(
    message = 'This machine needs a certification before you can book it.',
  ): AppError {
    return new AppError(403, 'certification_required', message);
  }

  static notFound(message = "We couldn't find that."): AppError {
    return new AppError(404, 'not_found', message);
  }

  static conflict(code: ErrorCode, message: string): AppError {
    return new AppError(409, code, message);
  }

  static slotTaken(message = 'Someone just took that slot. Pick another time.'): AppError {
    return new AppError(409, 'slot_taken', message);
  }

  static atCapacity(message = 'This event is at capacity.'): AppError {
    return new AppError(409, 'at_capacity', message);
  }

  static paymentFailed(message: string, context?: Record<string, unknown>): AppError {
    return new AppError(402, 'payment_failed', message, context ? { context } : {});
  }

  static upstream(
    message = 'A service we depend on is unavailable. Try again shortly.',
    cause?: unknown,
  ): AppError {
    return new AppError(503, 'upstream_unavailable', message, { retryable: true, cause });
  }

  static internal(message = 'Something went wrong on our end.', cause?: unknown): AppError {
    return new AppError(500, 'internal_error', message, { retryable: true, cause });
  }
}

/** The wire shape of every error response. The mobile client parses exactly this. */
export interface ErrorResponseBody {
  error: {
    code: ErrorCode;
    message: string;
    issues?: FieldIssue[];
    requestId: string;
    retryable: boolean;
  };
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
