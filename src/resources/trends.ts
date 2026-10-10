import { ValidationError } from "../errors.js";
import type { RequestOptions, TrendLocationsResponse, TrendsResponse } from "../types.js";
import { APIResource } from "./shared.js";

/** Common WOEIDs for trends.get(). Use trends.locations() for the full list. */
export const WOEID = {
  WORLDWIDE: 1,
  UNITED_STATES: 23424977,
  UNITED_KINGDOM: 23424975,
} as const;

/** Trending topics. */
export class Trends extends APIResource {
  /** Trending topics for a location by WOEID (1 = worldwide). */
  get = async (locationId: string | number = WOEID.WORLDWIDE, options?: RequestOptions): Promise<TrendsResponse> => {
    const id = String(locationId).trim();
    if (!/^\d{1,12}$/.test(id)) throw new ValidationError("locationId must be a numeric WOEID");
    return this.client.get({ path: `/trends/${id}` }, options);
  };

  /** Locations (countries and cities) that have trends, with their WOEIDs. */
  locations = async (options?: RequestOptions): Promise<TrendLocationsResponse> =>
    this.client.get({ path: "/misc/locations" }, options);
}
