import {
  AuthenticationError,
  ConnectionError,
  TimeoutError,
  TwittrAPIError,
  ValidationError,
  errorFromResponse,
  type RateLimitError,
} from "./errors.js";
import { paginate, type Page, type PageMethod, type PaginateOptions } from "./pagination.js";
import { Communities } from "./resources/communities.js";
import { Lists } from "./resources/lists.js";
import { Search } from "./resources/search.js";
import { Trends } from "./resources/trends.js";
import { Tweets } from "./resources/tweets.js";
import { Users } from "./resources/users.js";
import type { PageParams, QueryValue, RawResponse, RequestOptions, ResponseFormat } from "./types.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://api.twittrapi.com";
export const RAPIDAPI_HOST = "twitter-aio.p.rapidapi.com";
export const RAPIDAPI_BASE_URL = `https://${RAPIDAPI_HOST}`;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8_000;
const MAX_RETRY_AFTER_MS = 60_000;

export type AuthMode = "direct" | "rapidapi";

export const RESPONSE_FORMATS: readonly ResponseFormat[] = ["raw", "simple"];

export interface ClientOptions<F extends ResponseFormat = "raw"> {
  /** TwittrAPI key, sent as X-API-KEY. Defaults to the TWITTRAPI_API_KEY environment variable. */
  apiKey?: string;
  /**
   * RapidAPI key, used when no TwittrAPI key is set. Sent as x-rapidapi-key.
   * Defaults to the RAPIDAPI_KEY environment variable.
   */
  rapidApiKey?: string;
  /**
   * Overrides the API base URL. Defaults to https://api.twittrapi.com (direct) or
   * https://twitter-aio.p.rapidapi.com (RapidAPI). TWITTRAPI_BASE_URL is read in direct mode.
   */
  baseUrl?: string;
  /** Timeout per attempt in milliseconds. Default 60000. */
  timeoutMs?: number;
  /** Retries for 429, 5xx, timeouts and network errors. Default 2. Other 4xx are never retried. */
  maxRetries?: number;
  /** Base delay for exponential backoff in milliseconds. Default 500. */
  retryDelayMs?: number;
  /** Custom fetch implementation. Defaults to the global fetch (Node 18+). */
  fetch?: typeof fetch;
  /**
   * Default response format. "raw" (default) returns X's JSON unchanged. "simple" adds
   * `format=simple` to every request and returns small, typed objects (see SimpleTweet, SimpleUser,
   * SimplePage). Override per call with `{ format }` in the request options.
   */
  format?: F;
}

/** A GET request against the API. */
export interface APIRequest {
  /** Path with parameters already filled in, e.g. /user/by/username/jack */
  path: string;
  query?: Record<string, QueryValue>;
}

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function nonNegativeInt(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${name} must be a non-negative integer`);
  }
  return value;
}

function responseFormat(value: unknown, fallback: ResponseFormat): ResponseFormat {
  if (value === undefined) return fallback;
  if (!RESPONSE_FORMATS.includes(value as ResponseFormat)) {
    throw new ValidationError(`format must be one of ${RESPONSE_FORMATS.join(", ")}`);
  }
  return value as ResponseFormat;
}

function positiveNumber(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!(typeof value === "number" && value > 0)) throw new ValidationError(`${name} must be a positive number`);
  return value;
}

/** Joins a base URL, a path and query parameters. Undefined and empty values are dropped. */
export function buildUrl(baseUrl: string, req: APIRequest): string {
  const base = baseUrl.replace(/\/+$/, "");
  const path = req.path.startsWith("/") ? req.path : `/${req.path}`;
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Client for the TwittrAPI Twitter/X data API.
 *
 * ```ts
 * const client = new TwittrAPI({ apiKey: process.env.TWITTRAPI_API_KEY });
 * const user = await client.users.getByUsername("jack");
 *
 * // Compact, typed responses:
 * const simple = new TwittrAPI({ format: "simple" });
 * const { data } = await simple.users.getByUsername("jack"); // SimpleUser | null
 * ```
 */
export class TwittrAPI<F extends ResponseFormat = "raw"> {
  readonly authMode: AuthMode;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  /** Default response format of this client. */
  readonly format: F;

  readonly users: Users<F>;
  readonly tweets: Tweets<F>;
  readonly search: Search<F>;
  readonly lists: Lists<F>;
  readonly communities: Communities<F>;
  readonly trends: Trends<F>;

  readonly #apiKey: string;
  readonly #fetch: typeof fetch;

  constructor(options: ClientOptions<F> = {}) {
    const explicitDirect = options.apiKey?.trim();
    const explicitRapid = options.rapidApiKey?.trim();
    let mode: AuthMode;
    let key: string | undefined;
    if (explicitDirect) [mode, key] = ["direct", explicitDirect];
    else if (explicitRapid) [mode, key] = ["rapidapi", explicitRapid];
    else if (readEnv("TWITTRAPI_API_KEY")) [mode, key] = ["direct", readEnv("TWITTRAPI_API_KEY")];
    else [mode, key] = ["rapidapi", readEnv("RAPIDAPI_KEY")];
    if (!key) {
      throw new AuthenticationError(
        "No API key found. Pass { apiKey } or { rapidApiKey }, or set TWITTRAPI_API_KEY or RAPIDAPI_KEY. Get a key at https://twittrapi.com",
      );
    }

    this.authMode = mode;
    this.#apiKey = key;
    this.baseUrl = (
      options.baseUrl?.trim() ||
      (mode === "direct" ? readEnv("TWITTRAPI_BASE_URL") ?? DEFAULT_BASE_URL : RAPIDAPI_BASE_URL)
    ).replace(/\/+$/, "");
    this.timeoutMs = positiveNumber("timeoutMs", options.timeoutMs, DEFAULT_TIMEOUT_MS);
    this.maxRetries = nonNegativeInt("maxRetries", options.maxRetries, DEFAULT_MAX_RETRIES);
    this.retryDelayMs = nonNegativeInt("retryDelayMs", options.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
    this.format = responseFormat(options.format, "raw") as F;

    const f = options.fetch ?? (globalThis.fetch as typeof fetch | undefined);
    if (typeof f !== "function") {
      throw new TwittrAPIError("No fetch implementation found. Use Node 18+ or pass { fetch }.");
    }
    this.#fetch = f;

    this.users = new Users(this);
    this.tweets = new Tweets(this);
    this.search = new Search(this);
    this.lists = new Lists(this);
    this.communities = new Communities(this);
    this.trends = new Trends(this);
  }

  /** Headers sent with every request. */
  buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": `twittrapi-node/${VERSION}`,
    };
    if (this.authMode === "rapidapi") {
      headers["x-rapidapi-key"] = this.#apiKey;
      headers["x-rapidapi-host"] = RAPIDAPI_HOST;
    } else {
      headers["X-API-KEY"] = this.#apiKey;
    }
    return headers;
  }

  /**
   * Iterates over pages of a paginated method by following the bottom cursor (raw format) or
   * `nextCursor` / `hasNextPage` (simple format).
   *
   * ```ts
   * for await (const page of client.paginate(client.users.followers, { username: "jack" }, { maxPages: 5 })) {
   *   console.log(page.pageNumber, page.nextCursor);
   * }
   * ```
   *
   * Best-effort: see {@link paginate} for the stop conditions.
   */
  paginate<P extends PageParams, T>(
    method: PageMethod<P, T>,
    params: P,
    options?: PaginateOptions,
  ): AsyncGenerator<Page<T>, void, undefined> {
    return paginate(method, params, options);
  }

  /**
   * Sends a GET request and returns the parsed JSON. Retries 429, 5xx, timeouts and network errors
   * with exponential backoff (honouring Retry-After on 429). Used by all resource methods; also
   * usable directly for endpoints this SDK does not wrap yet.
   *
   * Adds `format=simple` to the query when the call's (or else the client's) format is "simple".
   */
  async get<T = RawResponse>(req: APIRequest, options: RequestOptions = {}): Promise<T> {
    const format = responseFormat(options.format, this.format);
    const query = format === "simple" ? { ...req.query, format: "simple" } : req.query;
    const url = buildUrl(this.baseUrl, { ...req, query });
    const maxRetries = nonNegativeInt("maxRetries", options.maxRetries, this.maxRetries);
    const timeoutMs = positiveNumber("timeoutMs", options.timeoutMs, this.timeoutMs);
    const signal = options.signal;

    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw signal.reason;
      let error: TwittrAPIError;
      try {
        return await this.#attempt<T>(url, timeoutMs, signal);
      } catch (err) {
        if (!(err instanceof TwittrAPIError)) throw err; // user abort or unexpected error
        error = err;
      }
      const retryable =
        error instanceof ConnectionError || (error.status !== undefined && isRetryableStatus(error.status));
      if (!retryable || attempt >= maxRetries) throw error;
      await sleep(this.#retryDelay(attempt, error), signal);
    }
  }

  #retryDelay(attempt: number, error: TwittrAPIError): number {
    const retryAfter = (error as RateLimitError).retryAfter;
    if (error.status === 429 && typeof retryAfter === "number") {
      return Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS);
    }
    const base = Math.min(this.retryDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS);
    return base * (0.75 + Math.random() * 0.25);
  }

  async #attempt<T>(url: string, timeoutMs: number, signal: AbortSignal | undefined): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort(signal!.reason);
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      let res: Response;
      try {
        res = await this.#fetch(url, { method: "GET", headers: this.buildHeaders(), signal: controller.signal });
      } catch (err) {
        if (signal?.aborted) throw signal.reason;
        if (timedOut) throw new TimeoutError(`Request timed out after ${timeoutMs} ms`, { cause: err });
        const msg = err instanceof Error ? err.message : String(err);
        throw new ConnectionError(`Could not reach TwittrAPI: ${msg}`, { cause: err });
      }

      let text: string;
      try {
        text = await res.text();
      } catch (err) {
        if (signal?.aborted) throw signal.reason;
        if (timedOut) throw new TimeoutError(`Request timed out after ${timeoutMs} ms`, { cause: err });
        throw new ConnectionError("Connection lost while reading the response", { cause: err });
      }

      let body: unknown = text;
      let parsed = false;
      if (text) {
        try {
          body = JSON.parse(text);
          parsed = true;
        } catch {
          // keep the raw text
        }
      } else {
        body = null;
        parsed = true;
      }

      if (!res.ok) throw errorFromResponse(res.status, body, res.headers);
      if (!parsed) {
        throw new TwittrAPIError(`${res.status} Response was not valid JSON`, {
          status: res.status,
          body,
          headers: res.headers,
        });
      }
      return body as T;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
