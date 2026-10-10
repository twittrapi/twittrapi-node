import type { PageParams, RequestOptions, TimelineResponse, TweetResponse } from "../types.js";
import { APIResource, numericId, oneOf, pageQuery } from "./shared.js";

export type RankingMode = "Relevance" | "Recency" | "Likes";
const RANKING_MODES: readonly RankingMode[] = ["Relevance", "Recency", "Likes"];

export interface TweetGetParams {
  tweetId: string;
  /** Sort order of the replies. Default Relevance. */
  rankingMode?: RankingMode;
  /** Cursor for loading more replies. */
  cursor?: string;
}

export interface TweetPageParams extends PageParams {
  tweetId: string;
}

/** Single tweets and their engagement. */
export class Tweets extends APIResource {
  /**
   * Gets a tweet with author, media, counts and the reply thread. Accepts the tweet ID or params.
   * Paginated (the cursor loads more replies).
   */
  get = async (params: string | TweetGetParams, options?: RequestOptions): Promise<TweetResponse> => {
    const p: TweetGetParams = typeof params === "string" ? { tweetId: params } : params;
    return this.client.get(
      {
        path: `/tweet/${numericId("tweetId", p.tweetId)}`,
        query: { rankingMode: oneOf("rankingMode", p.rankingMode, RANKING_MODES), cursor: p.cursor },
      },
      options,
    );
  };

  /** Users who retweeted a tweet. Paginated. */
  retweeters = async (params: TweetPageParams, options?: RequestOptions): Promise<TimelineResponse> =>
    this.#list("retweets", params, options);

  /** Users who liked a tweet. X hides likers for many tweets, so this can be empty. Paginated. */
  likers = async (params: TweetPageParams, options?: RequestOptions): Promise<TimelineResponse> =>
    this.#list("favorites", params, options);

  /** Tweets quoting a tweet. Paginated. */
  quotes = async (params: TweetPageParams, options?: RequestOptions): Promise<TimelineResponse> =>
    this.#list("quotes", params, options);

  #list(suffix: string, params: TweetPageParams, options?: RequestOptions): Promise<TimelineResponse> {
    return this.client.get(
      { path: `/tweet/${numericId("tweetId", params?.tweetId)}/${suffix}`, query: pageQuery(params) },
      options,
    );
  }
}
