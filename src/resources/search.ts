import type { PageParams, ResponseFormat, SearchResponse, SimpleSearchResponse } from "../types.js";
import { APIResource, formatMethod, nonEmpty, oneOf, pageQuery } from "./shared.js";

export type SearchCategory = "Top" | "Latest" | "People" | "Photos" | "Videos";
const CATEGORIES: readonly SearchCategory[] = ["Top", "Latest", "People", "Photos", "Videos"];

export interface SearchTweetsParams extends PageParams {
  /** Search query. Supports X search operators such as from:, lang:, since:, min_faves:, -filter:replies. */
  query: string;
  /** Result tab. Default Top. Latest is newest first; People returns accounts. */
  category?: SearchCategory;
}

/** Search, like the X search box. */
export class Search<F extends ResponseFormat = "raw"> extends APIResource<F> {
  /** Searches tweets (or people, with category "People"). Paginated. */
  tweets = formatMethod<F, SearchTweetsParams, SearchResponse, SimpleSearchResponse>(async (params, options) =>
    this.client.get(
      {
        path: "/search",
        query: {
          searchItem: nonEmpty("query", params?.query),
          category: oneOf("category", params.category, CATEGORIES),
          ...pageQuery(params),
        },
      },
      options,
    ),
  );
}
