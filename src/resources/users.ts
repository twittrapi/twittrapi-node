import { ValidationError } from "../errors.js";
import type {
  AboutBatchResponse,
  FriendshipsBatchResponse,
  PageParams,
  RequestOptions,
  ResponseFormat,
  SimpleTweetsPage,
  SimpleUserResponse,
  SimpleUsernameToIdResponse,
  SimpleUsersPage,
  SimpleUsersResponse,
  TimelineResponse,
  UserResponse,
  UsernameToIdResponse,
  UsersResponse,
  UserTarget,
} from "../types.js";
import { APIResource, cleanUsername, formatMethod, enc, numericId, pageQuery, resolveUserTarget } from "./shared.js";

/** Params for user timelines and follower lists: a user (by ID or handle) plus paging. */
export type UserPageParams = UserTarget & PageParams;

export const MAX_USERS_PER_REQUEST = 500;
/** Most target handles users.friendshipsBatch accepts per call (after duplicates are dropped). */
export const MAX_FRIENDSHIP_TARGETS = 50;
/** Most handles users.aboutBatch accepts per call (after duplicates are dropped). */
export const MAX_ABOUT_USERNAMES = 20;

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/** A handle without @, checked like the API does (1 to 15 letters, digits or underscores). */
function handle(name: string, value: unknown): string {
  const s = cleanUsername(value, name);
  if (!HANDLE.test(s)) {
    throw new ValidationError(`${name} must be an X handle (1 to 15 letters, digits or _), got ${JSON.stringify(s)}`);
  }
  return s;
}

/**
 * Handles from an array or a comma-separated string: @ and spaces removed, each checked,
 * duplicates dropped (case-insensitive, first spelling kept), at most `max`.
 */
function handleList(name: string, value: unknown, max: number): string[] {
  const items = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(items)) {
    throw new ValidationError(`${name} must be an array of handles or a comma-separated string`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  items.forEach((item, i) => {
    if (typeof item === "string" && !item.trim() && typeof value === "string") return; // "a,,b"
    const h = handle(`${name}[${i}]`, item);
    const key = h.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(h);
    }
  });
  if (out.length === 0) throw new ValidationError(`${name} must contain at least one handle`);
  if (out.length > max) {
    throw new ValidationError(
      `${name} accepts at most ${max} handles per call (duplicates count once), got ${out.length}`,
    );
  }
  return out;
}

export interface FriendshipsBatchParams {
  /** The account whose relationships are looked up (a leading @ is fine). */
  source: string;
  /** Up to 50 handles, as an array or a comma-separated string. Duplicates count once. */
  targets: readonly string[] | string;
}

/** User profiles, timelines and follower graphs. */
export class Users<F extends ResponseFormat = "raw"> extends APIResource<F> {
  /** Gets a profile by handle (a leading @ is fine). Includes the numeric user ID (rest_id). */
  getByUsername = formatMethod<F, string, UserResponse, SimpleUserResponse>(async (username, options) =>
    this.client.get({ path: `/user/by/username/${enc(cleanUsername(username))}` }, options),
  );

  /** Gets a profile by numeric user ID. */
  getById = formatMethod<F, string, UserResponse, SimpleUserResponse>(async (userId, options) =>
    this.client.get({ path: `/user/${numericId("userId", userId)}` }, options),
  );

  /** Resolves a handle to its numeric user ID. Smaller and cheaper than getByUsername. */
  usernameToId = formatMethod<F, string, UsernameToIdResponse, SimpleUsernameToIdResponse>(async (username, options) =>
    this.client.get({ path: `/username/to/id/${enc(cleanUsername(username))}` }, options),
  );

  /** Gets up to 500 profiles in one call by numeric user ID. */
  getMany = formatMethod<F, readonly string[], UsersResponse, SimpleUsersResponse>(async (userIds, options) => {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new ValidationError("userIds must be a non-empty array");
    }
    if (userIds.length > MAX_USERS_PER_REQUEST) {
      throw new ValidationError(`userIds accepts at most ${MAX_USERS_PER_REQUEST} IDs per call, got ${userIds.length}`);
    }
    const ids = userIds.map((id, i) => numericId(`userIds[${i}]`, id));
    return this.client.get({ path: "/user/users/by/ids", query: { ids: ids.join(",") } }, options);
  });

  /** A user's tweets (profile timeline without replies), newest first. Paginated. */
  tweets = formatMethod<F, UserPageParams, TimelineResponse, SimpleTweetsPage>(async (params, options) =>
    this.#timeline("tweets", params, options),
  );

  /** A user's tweets including replies, newest first. Paginated. */
  tweetsAndReplies = formatMethod<F, UserPageParams, TimelineResponse, SimpleTweetsPage>(async (params, options) =>
    this.#timeline("tweetsAndReplies", params, options),
  );

  /** A user's tweets that contain photos or videos. Paginated. */
  media = formatMethod<F, UserPageParams, TimelineResponse, SimpleTweetsPage>(async (params, options) =>
    this.#timeline("media", params, options),
  );

  /** Accounts following a user, newest first. Paginated. */
  followers = formatMethod<F, UserPageParams, TimelineResponse, SimpleUsersPage>(async (params, options) =>
    this.#timeline("followers", params, options),
  );

  /** Accounts a user follows. Paginated. */
  following = formatMethod<F, UserPageParams, TimelineResponse, SimpleUsersPage>(async (params, options) =>
    this.#timeline("followings", params, options),
  );

  /** A user's followers with a verified badge. Paginated. */
  verifiedFollowers = formatMethod<F, UserPageParams, TimelineResponse, SimpleUsersPage>(async (params, options) =>
    this.#timeline("verifiedFollowers", params, options),
  );

  /**
   * Accounts affiliated with an organization (the Affiliates tab of a verified organization's
   * profile). Paginated. In the simple format a page of users, like followers.
   */
  affiliates = formatMethod<F, UserPageParams, TimelineResponse, SimpleUsersPage>(async (params, options) =>
    this.#timeline("affiliates", params, options),
  );

  /**
   * Relationships of one account with up to 50 others (following, followed by, blocking, muting,
   * ...), each as /user/friendships/show returns it. Billed one call per target handle
   * (duplicates count once). Raw only: the simple format returns the same JSON.
   */
  friendshipsBatch = formatMethod<F, FriendshipsBatchParams, FriendshipsBatchResponse, FriendshipsBatchResponse>(
    async (params, options) => {
      if (!params || typeof params !== "object") throw new ValidationError("params must be an object");
      const source = handle("source", params.source);
      const targets = handleList("targets", params.targets, MAX_FRIENDSHIP_TARGETS);
      return this.client.get(
        {
          path: "/user/friendships/batch",
          query: { source_screen_name: source, target_screen_names: targets.join(",") },
        },
        options,
      );
    },
  );

  /**
   * "About this account" for up to 20 handles, as an array or a comma-separated string. Each item
   * is what /user/about/{username} returns. Billed one call per handle (duplicates count once).
   * Raw only: the simple format returns the same JSON.
   */
  aboutBatch = formatMethod<F, readonly string[] | string, AboutBatchResponse, AboutBatchResponse>(
    async (usernames, options) => {
      const list = handleList("usernames", usernames, MAX_ABOUT_USERNAMES);
      return this.client.get({ path: "/user/about/batch", query: { usernames: list.join(",") } }, options);
    },
  );

  #timeline(suffix: string, params: UserPageParams, options?: RequestOptions): Promise<unknown> {
    const { id, query } = resolveUserTarget(params);
    return this.client.get({ path: `/user/${id}/${suffix}`, query: { ...query, ...pageQuery(params) } }, options);
  }
}
