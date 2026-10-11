import { ValidationError } from "../errors.js";
import type {
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

export const MAX_USERS_PER_REQUEST = 100;

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

  /** Gets up to 100 profiles in one call by numeric user ID. */
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

  #timeline(suffix: string, params: UserPageParams, options?: RequestOptions): Promise<unknown> {
    const { id, query } = resolveUserTarget(params);
    return this.client.get({ path: `/user/${id}/${suffix}`, query: { ...query, ...pageQuery(params) } }, options);
  }
}
