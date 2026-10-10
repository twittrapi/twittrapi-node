import type { ListResponse, PageParams, RequestOptions, TimelineResponse } from "../types.js";
import { APIResource, numericId, pageQuery } from "./shared.js";

export interface ListPageParams extends PageParams {
  listId: string;
}

/** X lists. */
export class Lists extends APIResource {
  /** Gets a list's name, description, owner and counts. */
  details = async (listId: string, options?: RequestOptions): Promise<ListResponse> =>
    this.client.get({ path: "/lists/details", query: { listId: numericId("listId", listId) } }, options);

  /** Tweets from a list's members, newest first. Paginated. */
  tweets = async (params: ListPageParams, options?: RequestOptions): Promise<TimelineResponse> =>
    this.client.get(
      { path: "/lists/tweets", query: { listId: numericId("listId", params?.listId), ...pageQuery(params) } },
      options,
    );

  /** Accounts that are members of a list. Paginated. */
  members = async (params: ListPageParams, options?: RequestOptions): Promise<TimelineResponse> =>
    this.client.get(
      { path: "/lists/members", query: { listId: numericId("listId", params?.listId), ...pageQuery(params) } },
      options,
    );
}
