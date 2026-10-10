import { ValidationError } from "../errors.js";
import type {
  PageParams,
  RequestOptions,
  TimelineResponse,
  UserResponse,
  UsernameToIdResponse,
  UsersResponse,
  UserTarget,
} from "../types.js";
import { APIResource, cleanUsername, enc, numericId, pageQuery, resolveUserTarget } from "./shared.js";

/** Params for user timelines and follower lists: a user (by ID or handle) plus paging. */
export type UserPageParams = UserTarget & PageParams;

export const MAX_USERS_PER_REQUEST = 100;

/** User profiles, timelines and follower graphs. */
export class Users extends APIResource {
  /** Gets a profile by handle (a leading @ is fine). Includes the numeric user ID (rest_id). */
  getByUsername = async (username: string, options?: RequestOptions): Promise<UserResponse> =>
    this.client.get({ path: `/user/by/username/${enc(cleanUsername(username))}` }, options);

  /** Gets a profile by numeric user ID. */
  getById = async (userId: string, options?: RequestOptions): Promise<UserResponse> =>
    this.client.get({ path: `/user/${numericId("userId", userId)}` }, options);

  /** Resolves a handle to its numeric user ID. Smaller and cheaper than getByUsername. */
  usernameToId = async (username: string, options?: RequestOptions): Promise<UsernameToIdResponse> =>
    this.client.get({ path: `/username/to/id/${enc(cleanUsername(username))}` }, options);

  /** Gets up to 100 profiles in one call by numeric user ID. */
  getMany = async (userIds: readonly string[], options?: RequestOptions): Promise<UsersResponse> => {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new ValidationError("userIds must be a non-empty array");
    }
    if (userIds.length > MAX_USERS_PER_REQUEST) {
      throw new ValidationError(`userIds accepts at most ${MAX_USERS_PER_REQUEST} IDs per call, got ${userIds.length}`);
    }
    const ids = userIds.map((id, i) => numericId(`userIds[${i}]`, id));
    return this.client.get({ path: "/user/users/by/ids", query: { ids: ids.join(",") } }, options);
  };

  /** A user's tweets (profile timeline without replies), newest first. Paginated. */
  tweets = async (params: UserPageParams, options?: RequestOptions): Promise<TimelineResponse> =>
    this.#timeline("tweets", params, options);

  /** A user's tweets including replies, newest first. Paginated. */
  tweetsAndReplies = async (params: UserPageParams, options?: RequestOptions): Promise<TimelineResponse> =>
    this.#timeline("tweetsAndReplies", params, options);

  /** A user's tweets that contain photos or videos. Paginated. */
  media = async (params: UserPageParams, options?: RequestOptions): Promise<TimelineResponse> =>
    this.#timeline("media", params, options);

  /** Accounts following a user, newest first. Paginated. */
  followers = async (params: UserPageParams, options?: RequestOptions): Promise<TimelineResponse> =>
    this.#timeline("followers", params, options);

  /** Accounts a user follows. Paginated. */
  following = async (params: UserPageParams, options?: RequestOptions): Promise<TimelineResponse> =>
    this.#timeline("followings", params, options);

  /** A user's followers with a verified badge. Paginated. */
  verifiedFollowers = async (params: UserPageParams, options?: RequestOptions): Promise<TimelineResponse> =>
    this.#timeline("verifiedFollowers", params, options);

  #timeline(suffix: string, params: UserPageParams, options?: RequestOptions): Promise<TimelineResponse> {
    const { id, query } = resolveUserTarget(params);
    return this.client.get({ path: `/user/${id}/${suffix}`, query: { ...query, ...pageQuery(params) } }, options);
  }
}
