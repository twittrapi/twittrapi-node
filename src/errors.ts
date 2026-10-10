/** Fields shared by all API errors. */
export interface TwittrAPIErrorOptions {
  /** HTTP status code. Undefined for errors raised before or without a response. */
  status?: number;
  /** The `error` (or `message`) string from the API's JSON body, if any. */
  detail?: string;
  /** Parsed response body (JSON) or raw text. */
  body?: unknown;
  /** Response headers. */
  headers?: Headers;
  /** Underlying error, e.g. the network error from fetch. */
  cause?: unknown;
}

/** Base class for every error thrown by this SDK. */
export class TwittrAPIError extends Error {
  readonly status: number | undefined;
  readonly detail: string | undefined;
  readonly body: unknown;
  readonly headers: Headers | undefined;

  constructor(message: string, options: TwittrAPIErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.status = options.status;
    this.detail = options.detail;
    this.body = options.body;
    this.headers = options.headers;
  }
}

/** 401 or 403: missing, invalid or unauthorized API key. Also thrown when no key is configured. */
export class AuthenticationError extends TwittrAPIError {}

/** 402: the account has no balance left. Top up before retrying. */
export class InsufficientBalanceError extends TwittrAPIError {}

/** 404: the user, tweet, list or community does not exist, is private, or is suspended. */
export class NotFoundError extends TwittrAPIError {}

/** 400 or 422: invalid parameters. Also thrown for invalid arguments caught before a request is sent. */
export class ValidationError extends TwittrAPIError {}

/** 429: too many requests. `retryAfter` is the wait in seconds when the API sent a Retry-After header. */
export class RateLimitError extends TwittrAPIError {
  readonly retryAfter: number | undefined;

  constructor(message: string, options: TwittrAPIErrorOptions & { retryAfter?: number } = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter;
  }
}

/** 5xx: an error on the TwittrAPI side or upstream at X. Usually temporary. */
export class ServerError extends TwittrAPIError {}

/** The request never got a response: DNS, connection reset, TLS, etc. */
export class ConnectionError extends TwittrAPIError {}

/** The request took longer than `timeoutMs`. */
export class TimeoutError extends ConnectionError {}

/**
 * Parses a Retry-After header (seconds or an HTTP date) into seconds.
 * Returns undefined when the header is missing or unparseable.
 */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

function extractDetail(body: unknown): string | undefined {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    for (const key of ["error", "message", "detail"]) {
      const v = obj[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return undefined;
  }
  if (typeof body === "string" && body.trim()) {
    const t = body.trim();
    return t.length > 500 ? `${t.slice(0, 500)}...` : t;
  }
  return undefined;
}

const DEFAULT_MESSAGES: Record<number, string> = {
  400: "Bad request",
  401: "Authentication failed: check your API key",
  402: "No balance left on this TwittrAPI account: top up to continue",
  403: "Access denied: the key may lack access to this endpoint",
  404: "Not found: the resource may not exist, be private, or be suspended",
  422: "Invalid parameters",
  429: "Rate limit exceeded",
};

/** Maps an HTTP error response to the matching error class. */
export function errorFromResponse(status: number, body: unknown, headers?: Headers): TwittrAPIError {
  const detail = extractDetail(body);
  const fallback = DEFAULT_MESSAGES[status] ?? (status >= 500 ? "Server error" : "Request failed");
  const message = `${status} ${detail ?? fallback}`;
  const options: TwittrAPIErrorOptions = { status, detail, body, headers };

  if (status === 401 || status === 403) return new AuthenticationError(message, options);
  if (status === 402) return new InsufficientBalanceError(message, options);
  if (status === 404) return new NotFoundError(message, options);
  if (status === 400 || status === 422) return new ValidationError(message, options);
  if (status === 429) {
    return new RateLimitError(message, { ...options, retryAfter: parseRetryAfter(headers?.get("retry-after")) });
  }
  if (status >= 500) return new ServerError(message, options);
  return new TwittrAPIError(message, options);
}
