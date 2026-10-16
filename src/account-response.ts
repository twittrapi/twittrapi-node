/**
 * Default answer of the account routes (`client.account(...)`): X's HTTP status and X's response
 * body as a JSON string. Parse `response` (or use {@link parseAccountResponse}) to get X's JSON.
 */
export interface AccountRawResponse {
  /** HTTP status X answered with. */
  status_code: number;
  /** X's response body as a string, usually JSON. */
  response: string;
}

/** True for the `{ status_code, response }` wrapper of the account routes. */
export function isAccountRawResponse(data: unknown): data is AccountRawResponse {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  return typeof d.status_code === "number" && typeof d.response === "string";
}

/**
 * Returns X's JSON from an account route's `{ status_code, response }` wrapper. Anything else
 * (a simple-format answer, a DM answer, a response that is not valid JSON) is returned unchanged.
 *
 * ```ts
 * const res = await me.bookmarks();
 * const x = parseAccountResponse(res); // X's GraphQL JSON
 * ```
 */
export function parseAccountResponse(data: unknown): unknown {
  if (!isAccountRawResponse(data)) return data;
  try {
    return JSON.parse(data.response);
  } catch {
    return data;
  }
}
