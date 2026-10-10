export {
  TwittrAPI,
  buildUrl,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  RAPIDAPI_BASE_URL,
  RAPIDAPI_HOST,
  type APIRequest,
  type AuthMode,
  type ClientOptions,
} from "./client.js";
export {
  AuthenticationError,
  ConnectionError,
  InsufficientBalanceError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TimeoutError,
  TwittrAPIError,
  ValidationError,
  errorFromResponse,
  parseRetryAfter,
  type TwittrAPIErrorOptions,
} from "./errors.js";
export {
  DEFAULT_MAX_PAGES,
  countTimelineEntries,
  extractBottomCursor,
  extractCursors,
  paginate,
  type Cursors,
  type Page,
  type PageMethod,
  type PaginateOptions,
} from "./pagination.js";
export { Communities, type CommunityPageParams, type CommunitySearchParams } from "./resources/communities.js";
export { Lists, type ListPageParams } from "./resources/lists.js";
export { Search, type SearchCategory, type SearchTweetsParams } from "./resources/search.js";
export { Trends, WOEID } from "./resources/trends.js";
export { Tweets, type RankingMode, type TweetGetParams, type TweetPageParams } from "./resources/tweets.js";
export { MAX_USERS_PER_REQUEST, Users, type UserPageParams } from "./resources/users.js";
export type * from "./types.js";
export { VERSION } from "./version.js";

import { TwittrAPI } from "./client.js";
export default TwittrAPI;
