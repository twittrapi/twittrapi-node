import type {
  PageParams,
  RequestOptions,
  ResponseFormat,
  SimpleTweetsPage,
  SimpleUsersPage,
  TimelineResponse,
  TweetResponse,
} from "../types.js";
import { ValidationError } from "../errors.js";
import { APIResource, checkCount, formatMethod, nonEmpty, numericId, oneOf, pageQuery } from "./shared.js";

export type RankingMode = "Relevance" | "Recency" | "Likes";
const RANKING_MODES: readonly RankingMode[] = ["Relevance", "Recency", "Likes"];

export interface TweetGetParams {
  tweetId: string;
  /** Sort order of the replies. Default Relevance. */
  rankingMode?: RankingMode;
  /** Cursor for loading more replies. */
  cursor?: string;
}

export interface TweetRepliesParams {
  tweetId: string;
  /** Sort order of the replies. Default Relevance. */
  rankingMode?: RankingMode;
  /** Include promoted replies. Default false. */
  includePromotedContent?: boolean;
  /** Cursor from the previous page to load more replies. */
  cursor?: string;
}

export interface TweetPageParams extends PageParams {
  tweetId: string;
}

export interface TweetLikersParams extends TweetPageParams {
  /** Cookie header of the X account that posted the tweet. Must contain auth_token and ct0. */
  cookie: string;
  /** Proxy the request to X goes out through, as http://user:pass@host:port. */
  proxy: string;
}

/** Single tweets and their engagement. */
export class Tweets<F extends ResponseFormat = "raw"> extends APIResource<F> {
  /**
   * Gets a tweet with author, media, counts and the reply thread. Accepts the tweet ID or params.
   * Paginated (the cursor loads more replies). In the simple format `data` lists the tweet and its
   * replies in display order.
   */
  get = formatMethod<F, string | TweetGetParams, TweetResponse, SimpleTweetsPage>(async (params, options) => {
    const p: TweetGetParams = typeof params === "string" ? { tweetId: params } : params;
    return this.client.get(
      {
        path: `/tweet/${numericId("tweetId", p.tweetId)}`,
        query: { rankingMode: oneOf("rankingMode", p.rankingMode, RANKING_MODES), cursor: p.cursor },
      },
      options,
    );
  });

  /**
   * Only the replies to a tweet, without the tweet itself or the tweets above it. Paginated. In the
   * simple format `data` lists the replies in display order.
   */
  replies = formatMethod<F, TweetRepliesParams, TweetResponse, SimpleTweetsPage>(async (params, options) => {
    const tweetId = numericId("tweetId", params?.tweetId);
    if (params.includePromotedContent !== undefined && typeof params.includePromotedContent !== "boolean") {
      throw new ValidationError("includePromotedContent must be true or false");
    }
    return this.client.get(
      {
        path: `/tweet/${tweetId}/replies`,
        query: {
          rankingMode: oneOf("rankingMode", params.rankingMode, RANKING_MODES),
          includePromotedContent: params.includePromotedContent,
          cursor: params.cursor,
        },
      },
      options,
    );
  });

  /**
   * The author's own thread around a tweet: their tweets above it and their replies to themselves
   * below it, in reading order. Ends at the first reply by someone else. Not paginated: long
   * threads are loaded in the same request (one billed call).
   */
  thread = formatMethod<F, string, TweetResponse, SimpleTweetsPage>(async (tweetId, options) =>
    this.client.get({ path: `/tweet/${numericId("tweetId", tweetId)}/thread` }, options),
  );

  /** Users who retweeted a tweet. Paginated. */
  retweeters = formatMethod<F, TweetPageParams, TimelineResponse, SimpleUsersPage>(async (params, options) =>
    this.#list("retweets", params, options),
  );

  /**
   * Users who liked a tweet. Works only for your own tweets: X shows likers only to the author, so
   * pass the cookie of the account that posted it and a proxy. Sent as POST with these in the JSON
   * body. For anyone else's tweet the list is empty. Paginated.
   */
  likers = formatMethod<F, TweetLikersParams, TimelineResponse, SimpleUsersPage>(async (params, options) => {
    const tweetId = numericId("tweetId", params?.tweetId);
    const body = {
      cookie: nonEmpty("cookie", params.cookie),
      proxy: nonEmpty("proxy", params.proxy),
      count: checkCount(params.count),
      cursor: params.cursor || undefined,
    };
    return this.client.post({ path: `/tweet/${tweetId}/favorites`, body }, options);
  });

  /** Tweets quoting a tweet. Paginated. */
  quotes = formatMethod<F, TweetPageParams, TimelineResponse, SimpleTweetsPage>(async (params, options) =>
    this.#list("quotes", params, options),
  );

  #list(suffix: string, params: TweetPageParams, options?: RequestOptions): Promise<unknown> {
    return this.client.get(
      { path: `/tweet/${numericId("tweetId", params?.tweetId)}/${suffix}`, query: pageQuery(params) },
      options,
    );
  }
}
