import type { TwittrAPI } from "../client.js";
import { ValidationError } from "../errors.js";
import type { PageParams, QueryValue, UserTarget } from "../types.js";

/** Base class for resource namespaces (client.users, client.tweets, ...). */
export abstract class APIResource {
  protected readonly client: TwittrAPI;

  constructor(client: TwittrAPI) {
    this.client = client;
  }
}

const NUMERIC_ID = /^\d{1,30}$/;

/** Validates a numeric X ID (user, tweet, list, community) and returns it as a string. */
export function numericId(name: string, value: unknown): string {
  const s = typeof value === "number" || typeof value === "bigint" ? String(value) : value;
  if (typeof s !== "string" || !NUMERIC_ID.test(s.trim())) {
    throw new ValidationError(`${name} must be a numeric ID (digits only), got ${JSON.stringify(String(value))}`);
  }
  return s.trim();
}

/** Trims a handle and removes a leading @. */
export function cleanUsername(value: unknown, name = "username"): string {
  if (typeof value !== "string") throw new ValidationError(`${name} must be a string`);
  const s = value.trim().replace(/^@/, "");
  if (!s) throw new ValidationError(`${name} must not be empty`);
  return s;
}

export function nonEmpty(name: string, value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new ValidationError(`${name} must be a non-empty string`);
  return value.trim();
}

export function checkCount(count: number | undefined): number | undefined {
  if (count === undefined) return undefined;
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new ValidationError("count must be an integer from 1 to 100");
  }
  return count;
}

export function pageQuery(params: PageParams): Record<string, QueryValue> {
  return { count: checkCount(params.count), cursor: params.cursor };
}

export function enc(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Resolves the userId-or-username pattern. With a userId the path uses it directly; with only a
 * username the path uses -1 and the API resolves ?username=.
 */
export function resolveUserTarget(target: UserTarget | undefined): { id: string; query: Record<string, QueryValue> } {
  const t = (target ?? {}) as { userId?: unknown; username?: unknown };
  if (t.userId !== undefined && t.userId !== null && t.userId !== "") {
    return { id: numericId("userId", t.userId), query: {} };
  }
  if (t.username !== undefined && t.username !== null && t.username !== "") {
    return { id: "-1", query: { username: cleanUsername(t.username) } };
  }
  throw new ValidationError("Provide either userId or username");
}

export function oneOf<T extends string>(name: string, value: T | undefined, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) throw new ValidationError(`${name} must be one of ${allowed.join(", ")}`);
  return value;
}
