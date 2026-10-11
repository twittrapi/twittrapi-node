/**
 * Shared types.
 *
 * By default responses are X's raw GraphQL JSON, passed through unchanged. They are typed loosely on
 * purpose: X changes these shapes without notice. With `format: "simple"` the API returns small,
 * stable objects instead; those are typed in simple.ts and selected per method below.
 */
import type {
  SimpleCommunity,
  SimpleList,
  SimplePage,
  SimpleSingle,
  SimpleTimelineTweet,
  SimpleTrend,
  SimpleTrendLocation,
  SimpleUser,
} from "./simple.js";

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

/**
 * Response format. "raw" (the default) is X's JSON unchanged; "simple" is the compact format
 * documented at https://twittrapi.com/docs/simple-format (sent as `format=simple`).
 */
export type ResponseFormat = "raw" | "simple";

/** Simple-format return types per method family. */
export type SimpleUserResponse = SimpleSingle<SimpleUser | null>;
export type SimpleUsersResponse = SimplePage<SimpleUser>;
/** Already small, so the API returns it unchanged inside `{ data }`. */
export type SimpleUsernameToIdResponse = SimpleSingle<UsernameToIdResponse>;
export type SimpleTweetsPage = SimplePage<SimpleTimelineTweet>;
export type SimpleUsersPage = SimplePage<SimpleUser>;
/** Search returns users with category "People" and tweets otherwise. */
export type SimpleSearchResponse = SimpleTweetsPage | SimpleUsersPage;
export type SimpleListResponse = SimpleSingle<SimpleList | null>;
export type SimpleCommunityResponse = SimpleSingle<SimpleCommunity | null>;
export type SimpleCommunitiesPage = SimplePage<SimpleCommunity>;
export type SimpleTrendsResponse = SimplePage<SimpleTrend>;
export type SimpleTrendLocationsResponse = SimplePage<SimpleTrendLocation>;

/** Per-request options accepted by every method as the last argument. */
export interface RequestOptions {
  /** Cancels the request (including retries and backoff waits). */
  signal?: AbortSignal;
  /** Overrides the client's timeout for this request, per attempt. */
  timeoutMs?: number;
  /** Overrides the client's retry count for this request. */
  maxRetries?: number;
  /** Overrides the client's response format for this request. */
  format?: ResponseFormat;
}

/** Picks the raw or simple return type for a format (a union of formats gives a union of types). */
export type Formatted<Fmt extends ResponseFormat, Raw, Simple> = Fmt extends "simple" ? Simple : Raw;

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
