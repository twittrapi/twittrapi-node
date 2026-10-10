/**
 * Shared types.
 *
 * Responses are X's raw GraphQL JSON, passed through unchanged. They are typed loosely on purpose:
 * X changes these shapes without notice, and typed models can be layered on top later without
 * changing method signatures (each method's return type is a named alias below).
 */

/** A parsed JSON object as returned by the API. */
export type RawResponse = Record<string, unknown>;

/** Return types per method family. All are raw JSON for now; narrow these when models are added. */
export type UserResponse = RawResponse;
export type UsersResponse = RawResponse;
export type UsernameToIdResponse = RawResponse;
export type TimelineResponse = RawResponse;
export type TweetResponse = RawResponse;
export type SearchResponse = RawResponse;
export type ListResponse = RawResponse;
export type CommunityResponse = RawResponse;
/** Trends endpoints may return arrays, so they stay `unknown` until a model exists. */
export type TrendsResponse = unknown;
export type TrendLocationsResponse = unknown;

/** Per-request options accepted by every method as the last argument. */
export interface RequestOptions {
  /** Cancels the request (including retries and backoff waits). */
  signal?: AbortSignal;
  /** Overrides the client's timeout for this request, per attempt. */
  timeoutMs?: number;
  /** Overrides the client's retry count for this request. */
  maxRetries?: number;
}

/** Query string values. `undefined` and empty strings are dropped. */
export type QueryValue = string | number | boolean | undefined;

/** Common parameters for endpoints that return a page of results. */
export interface PageParams {
  /** How many items to request per page (1-100, default 20). X may return slightly more or fewer. */
  count?: number;
  /** Cursor from a previous page. Leave empty for the first page. */
  cursor?: string;
}

/**
 * Identifies a user either by numeric ID (faster) or by handle.
 * When only a username is given, the API resolves it (the SDK calls /user/-1/...?username=).
 */
export type UserTarget =
  | { userId: string; username?: undefined }
  | { username: string; userId?: undefined };
