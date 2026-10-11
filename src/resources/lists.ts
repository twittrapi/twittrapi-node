import type {
  ListResponse,
  PageParams,
  ResponseFormat,
  SimpleListResponse,
  SimpleTweetsPage,
  SimpleUsersPage,
  TimelineResponse,
} from "../types.js";
import { APIResource, formatMethod, numericId, pageQuery } from "./shared.js";

export interface ListPageParams extends PageParams {
  listId: string;
}

/** X lists. */
export class Lists<F extends ResponseFormat = "raw"> extends APIResource<F> {
  /** Gets a list's name, description, owner and counts. */
  details = formatMethod<F, string, ListResponse, SimpleListResponse>(async (listId, options) =>
    this.client.get({ path: "/lists/details", query: { listId: numericId("listId", listId) } }, options),
  );

  /** Tweets from a list's members, newest first. Paginated. */
  tweets = formatMethod<F, ListPageParams, TimelineResponse, SimpleTweetsPage>(async (params, options) =>
    this.client.get(
      { path: "/lists/tweets", query: { listId: numericId("listId", params?.listId), ...pageQuery(params) } },
      options,
    ),
  );

  /** Accounts that are members of a list. Paginated. */
  members = formatMethod<F, ListPageParams, TimelineResponse, SimpleUsersPage>(async (params, options) =>
    this.client.get(
      { path: "/lists/members", query: { listId: numericId("listId", params?.listId), ...pageQuery(params) } },
      options,
    ),
  );
}
