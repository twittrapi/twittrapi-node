import type {
  CommunityAboutResponse,
  CommunityResponse,
  PageParams,
  ResponseFormat,
  SimpleCommunitiesPage,
  SimpleCommunityResponse,
  SimpleTweetsPage,
  TimelineResponse,
} from "../types.js";
import { APIResource, enc, formatMethod, nonEmpty, numericId, pageQuery } from "./shared.js";

export interface CommunityPageParams extends PageParams {
  communityId: string;
}

export interface CommunitySearchParams extends PageParams {
  /** Keyword to search for. */
  query: string;
}

/** X Communities. */
export class Communities<F extends ResponseFormat = "raw"> extends APIResource<F> {
  /** Gets a community's name, description, rules, member count and admins. */
  get = formatMethod<F, string, CommunityResponse, SimpleCommunityResponse>(async (communityId, options) =>
    this.client.get({ path: `/communities/${numericId("communityId", communityId)}` }, options),
  );

  /**
   * A community's About page: description, rules, creation date, moderators and a preview of the
   * members. Raw only: the simple format returns the same JSON.
   */
  about = formatMethod<F, string, CommunityAboutResponse, CommunityAboutResponse>(async (communityId, options) =>
    this.client.get({ path: `/communities/${numericId("communityId", communityId)}/about` }, options),
  );

  /** Tweets posted in a community. Paginated. */
  tweets = formatMethod<F, CommunityPageParams, TimelineResponse, SimpleTweetsPage>(async (params, options) =>
    this.client.get(
      { path: `/communities/${numericId("communityId", params?.communityId)}/tweets`, query: pageQuery(params) },
      options,
    ),
  );

  /** Searches communities by keyword. Paginated. */
  search = formatMethod<F, CommunitySearchParams, TimelineResponse, SimpleCommunitiesPage>(async (params, options) =>
    this.client.get(
      { path: `/communities/search/${enc(nonEmpty("query", params?.query))}`, query: pageQuery(params) },
      options,
    ),
  );
}
