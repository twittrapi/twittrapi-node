import type { TwittrAPI } from "../client.js";
import type { AccountRawResponse } from "../account-response.js";
import { ValidationError } from "../errors.js";
import type {
  SimpleActionResult,
  SimpleCommunity,
  SimpleMediaUpload,
  SimplePage,
  SimpleScheduledTweet,
  SimpleSingle,
  SimpleTweet,
  SimpleUser,
} from "../simple.js";
import type {
  PageParams,
  RawResponse,
  RequestOptions,
  ResponseFormat,
  SimpleTweetsPage,
  UserTarget,
} from "../types.js";
import {
  checkCount,
  cleanUsername,
  nonEmpty,
  numericId,
  oneOf,
  type FormatMethod,
  type FormatMethodNoParams,
  type FormatMethodOptionalParams,
} from "./shared.js";

/* ------------------------------------------------------------------------------------------------
 * Session
 * ---------------------------------------------------------------------------------------------- */

/**
 * The X account the actions run as. Get the cookie from your own logged-in X session; see
 * https://twittrapi.com/docs/x-session. The SDK never logs these values and masks them when the
 * Account object is printed or serialized.
 */
export interface XSession {
  /**
   * Cookie header of your logged-in X session: "auth_token=...; ct0=...; twid=u%3D...".
   * auth_token and ct0 are required. twid (your account ID) is needed for DMs and for likes().
   */
  cookie: string;
  /** Proxy the requests to X go out through, as http://user:pass@host:port. */
  proxy: string;
  /** Default X Chat passcode for the DM methods. A passcode passed to a DM call wins. */
  passcode?: string;
}

const REDACTED = "[redacted]";
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

function parseCookie(cookie: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of cookie.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return out;
}

/** The account ID from the twid cookie ("u%3D123", "u=123", optionally quoted), or undefined. */
function twidUserId(cookies: Map<string, string>): string | undefined {
  const raw = cookies.get("twid");
  if (!raw) return undefined;
  const m = /^"?u(?:%3D|=)(\d{1,30})"?$/i.exec(raw);
  return m ? m[1] : undefined;
}

/** Fields of a request body; undefined values are dropped when it is sent. */
type Fields = Record<string, unknown>;

/** Holds the session and sends the requests. Shared by Account and its sub-namespaces. */
class SessionTransport<F extends ResponseFormat> {
  readonly client: TwittrAPI<F>;
  /** Numeric account ID from the twid cookie, if present. */
  readonly userId: string | undefined;
  readonly #cookie: string;
  readonly #proxy: string;
  readonly #passcode: string | undefined;

  constructor(client: TwittrAPI<F>, session: XSession) {
    if (!session || typeof session !== "object") {
      throw new ValidationError("account() needs a session: { cookie, proxy }");
    }
    const cookie = nonEmpty("cookie", session.cookie);
    const proxy = nonEmpty("proxy", session.proxy);
    const cookies = parseCookie(cookie);
    if (!cookies.get("auth_token") || !cookies.get("ct0")) {
      throw new ValidationError("cookie must contain auth_token and ct0 (see https://twittrapi.com/docs/x-session)");
    }
    if (session.passcode !== undefined && typeof session.passcode !== "string") {
      throw new ValidationError("passcode must be a string");
    }
    this.client = client;
    this.userId = twidUserId(cookies);
    this.#cookie = cookie;
    this.#proxy = proxy;
    this.#passcode = session.passcode || undefined;
  }

  /**
   * POSTs `fields` plus cookie and proxy to `path`. Writes are not retried unless the caller
   * passes `maxRetries`: a retried write after a timeout or 5xx could run twice on X.
   */
  send(path: string, fields: Fields, options: RequestOptions | undefined, write: boolean): Promise<unknown> {
    const opts: RequestOptions = { ...options };
    if (write && opts.maxRetries === undefined) opts.maxRetries = 0;
    return this.client.post({ path, body: { cookie: this.#cookie, proxy: this.#proxy, ...fields } }, opts);
  }

  /** The passcode for a DM call: the call's, else the session's. */
  passcode(value: unknown, required: boolean): string | undefined {
    if (value !== undefined && value !== null && value !== "" && typeof value !== "string") {
      throw new ValidationError("passcode must be a string (a number loses leading zeros)");
    }
    const p = (value as string | undefined) || this.#passcode;
    if (p !== undefined && p.length > 64) throw new ValidationError("passcode must be at most 64 characters");
    if (required && !p) {
      throw new ValidationError("passcode is required (your X Chat passcode): pass it here or in the session");
    }
    return p;
  }

  requireTwid(what: string): void {
    if (!this.userId) {
      throw new ValidationError(`${what} needs twid (your account ID) in the cookie`);
    }
  }

  describe(): Record<string, unknown> {
    return { userId: this.userId, cookie: REDACTED, proxy: REDACTED, passcode: this.#passcode ? REDACTED : undefined };
  }

  toJSON(): Record<string, unknown> {
    return this.describe();
  }

  toString(): string {
    return `SessionTransport ${JSON.stringify(this.describe())}`;
  }

  [INSPECT](): string {
    return this.toString();
  }
}

/** Base of Account and its sub-namespaces: masks the session in toString, toJSON and inspect. */
abstract class AccountNamespace<F extends ResponseFormat> {
  readonly #t: SessionTransport<F>;

  constructor(transport: SessionTransport<F>) {
    this.#t = transport;
  }

  /** @internal */
  protected get transport(): SessionTransport<F> {
    return this.#t;
  }

  /** Numeric ID of the session's account, read from the twid cookie. Undefined without twid. */
  get userId(): string | undefined {
    return this.#t.userId;
  }

  toJSON(): Record<string, unknown> {
    return this.#t.describe();
  }

  toString(): string {
    return `${this.constructor.name} ${JSON.stringify(this.#t.describe())}`;
  }

  [INSPECT](): string {
    return this.toString();
  }
}

/* ------------------------------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------------------------------- */

/**
 * Simple-format answer of an account route. When X reports an error inside its answer (for example
 * a tweet that is already liked), the API returns the raw wrapper unchanged, hence the union.
 */
export type SimpleAccountResponse<T> = T | AccountRawResponse;

/** Simple-format answer of actions such as like, bookmark or delete: `{ data: { success: true } }`. */
export type SimpleActionResponse = SimpleAccountResponse<SimpleSingle<SimpleActionResult>>;
/** Simple-format answer of routes that return a user (follow, mute, block, profile changes). */
export type SimpleAccountUserResponse = SimpleAccountResponse<SimpleSingle<SimpleUser>>;
/** Simple-format answer of createTweet and reply: the new tweet, or for a scheduled tweet its ID. */
export type SimpleCreatedTweetResponse = SimpleAccountResponse<SimpleSingle<SimpleTweet | SimpleActionResult>>;
export type SimpleMediaUploadResponse = SimpleAccountResponse<SimpleSingle<SimpleMediaUpload>>;
export type SimpleScheduledTweetsResponse = SimpleAccountResponse<SimplePage<SimpleScheduledTweet>>;
export type SimpleCreatedCommunityResponse = SimpleAccountResponse<SimpleSingle<SimpleCommunity>>;
export type SimpleAccountTweetsPage = SimpleAccountResponse<SimpleTweetsPage>;

/** A method whose simple-format answer is Simple and raw answer is the `{ status_code, response }` wrapper. */
type AccountMethod<F extends ResponseFormat, P, Simple> = FormatMethod<F, P, AccountRawResponse, Simple>;
type AccountMethodOptional<F extends ResponseFormat, P, Simple> = FormatMethodOptionalParams<
  F,
  P,
  AccountRawResponse,
  Simple
>;
/** Routes without a simple format return the wrapper either way. */
type RawOnly = AccountRawResponse;

function method<M>(fn: (params: never, options?: RequestOptions) => Promise<unknown>): M {
  return fn as unknown as M;
}

/** Who can reply to a new tweet. */
export type ConversationControlMode = "only_follows" | "only_verified" | "only_mentioned";
const CONVERSATION_MODES: readonly ConversationControlMode[] = ["only_follows", "only_verified", "only_mentioned"];

/** A text poll attached to a new tweet. */
export interface PollParams {
  /** 2 to 4 choices, up to 25 characters each. */
  choices: string[];
  /** 5 to 10080 (7 days). Default 1440 (1 day). */
  durationMinutes?: number;
}

export interface CreateTweetParams {
  /** Tweet text. Over 280 characters it is posted as a long post (note tweet). */
  text: string;
  /** Up to 4 media IDs from uploadImage or uploadVideo. */
  mediaIds?: string[];
  /** Mark the media as sensitive. */
  possiblySensitive?: boolean;
  /** Who can reply. Not used for community tweets. */
  conversationControlMode?: ConversationControlMode;
  /** URL of a tweet to quote. */
  quoteUrl?: string;
  /** Post into this community. */
  communityId?: string;
  /** Force a long post even for short text. */
  isNoteTweet?: boolean;
  /**
   * Schedule the tweet instead of posting it: Unix time in seconds, or a Date. Only text and media
   * are used for a scheduled tweet.
   */
  scheduleTime?: number | Date;
  /** Attach a poll. Cannot be combined with media, a quote, a schedule or a community; text up to 280 characters. */
  poll?: PollParams;
}

export interface ReplyParams {
  /** ID of the tweet to reply to. */
  tweetId: string;
  text: string;
  /** Up to 4 media IDs from uploadImage or uploadVideo. */
  mediaIds?: string[];
  /** URL of a tweet to quote in the reply. */
  attachmentUrl?: string;
  possiblySensitive?: boolean;
}

/** Reasons accepted by report(). */
export type ReportReason =
  | "SpamSimpleOption"
  | "HateOrAbuseSimpleOption"
  | "ChildSafetySimpleOption"
  | "ViolentSpeechSimpleOption"
  | "ViolentMediaSimpleOption"
  | "IRBSimpleOption"
  | "ImpersonationSimpleOption"
  | "AdultContentSimpleOption"
  | "PrivateContentSimpleOption"
  | "SuicideSelfHarmSimpleOption"
  | "TerrorismSimpleOption"
  | "CivicIntegritySimpleOption";
export const REPORT_REASONS: readonly ReportReason[] = [
  "SpamSimpleOption",
  "HateOrAbuseSimpleOption",
  "ChildSafetySimpleOption",
  "ViolentSpeechSimpleOption",
  "ViolentMediaSimpleOption",
  "IRBSimpleOption",
  "ImpersonationSimpleOption",
  "AdultContentSimpleOption",
  "PrivateContentSimpleOption",
  "SuicideSelfHarmSimpleOption",
  "TerrorismSimpleOption",
  "CivicIntegritySimpleOption",
];

export interface ReportParams {
  tweetId: string;
  /** Numeric ID of the tweet's author. */
  userId: string;
  reason: ReportReason;
}

export interface HomeTimelineParams {
  /** Tweets to ask X for (1-100, default 20). */
  count?: number;
  /** Include promoted tweets. Default true. */
  includePromotedContent?: boolean;
}

export interface ScheduledTweetsParams {
  /** Oldest first when true (default). */
  ascending?: boolean;
}

/** File contents as base64 or raw bytes (a Buffer or Uint8Array is base64-encoded by the SDK). */
export type MediaInput = string | Uint8Array;

export interface UploadImageParams {
  /** The image: JPEG, PNG or WebP up to 5 MB, GIF up to 15 MB. */
  media: MediaInput;
  /** MIME type. Optional: the API detects it from the bytes. */
  mediaType?: string;
}

export interface UploadVideoParams {
  /** The video: MP4 or MOV. */
  media: MediaInput;
  /** Length of the video in milliseconds. */
  videoDurationMs: number;
  /** MIME type. Optional: the API detects it from the bytes. */
  mediaType?: string;
}

/** Who sees the birth date. */
export type BirthdateVisibility = "public" | "followers" | "following" | "mutualfollow" | "self";

export interface Birthdate {
  day: number;
  month: number;
  year: number;
  /** Left out, X keeps the current setting. */
  visibility?: BirthdateVisibility;
  /** Left out, X keeps the current setting. */
  yearVisibility?: BirthdateVisibility;
}

/** At least one field is required. */
export interface UpdateProfileParams {
  /** Display name, up to 50 characters. Cannot be empty. */
  name?: string;
  /** Bio, up to 160 characters. */
  description?: string;
  /** Up to 30 characters. */
  location?: string;
  /** Website, up to 100 characters. */
  url?: string;
  /** A new birth date, or null to remove it. */
  birthdate?: Birthdate | null;
}

export interface ProfileImageParams {
  /** The image: JPEG, PNG or GIF. Up to 2 MB for the avatar, 5 MB for the banner. */
  media: MediaInput;
  /** MIME type. Optional: the API detects it from the bytes. */
  mediaType?: string;
}

/** A page of an account-only list. */
export type AccountPageParams = PageParams;

export interface LikesParams extends PageParams {
  /** Your numeric user ID. Needed only when the cookie has no twid. */
  userId?: string;
}

/** A user plus paging. */
export type FollowersYouKnowParams = UserTarget & PageParams;

export interface CreateListParams {
  /** Up to 25 characters. */
  name: string;
  /** Up to 100 characters. */
  description?: string;
  /** Private list. Default false. */
  private?: boolean;
}

/** At least one of name, description or private is required. */
export interface UpdateListParams {
  listId: string;
  name?: string;
  description?: string;
  private?: boolean;
}

export type ListMemberParams = { listId: string } & UserTarget;

export interface CreateCommunityParams {
  name: string;
  description?: string;
  /** Passed to X as is. Default "Open". */
  joinPolicy?: string;
  /** Passed to X as is. Default "MemberInvitesAllowed". */
  invitesPolicy?: string;
  /** Question for people who ask to join. */
  question?: string;
}

export interface DeleteCommunityParams {
  communityId: string;
  /** The community's name. X needs it together with the ID. */
  name: string;
}

export interface DraftsParams {
  /** Oldest first when true. Default false. */
  ascending?: boolean;
}

/** text or mediaIds is required. */
export interface CreateDraftParams {
  /** Up to 25,000 characters. */
  text?: string;
  /** Up to 4 media IDs. */
  mediaIds?: string[];
}

export interface EditDraftParams extends CreateDraftParams {
  draftTweetId: string;
}

/** A conversation by ID, or the one-to-one chat with a user. */
export type DMTarget =
  | { conversationId: string; userId?: undefined }
  | { userId: string; conversationId?: undefined };

interface DMPasscode {
  /** Your X Chat passcode. Defaults to the session's passcode. */
  passcode?: string;
}

export interface DMInboxParams extends DMPasscode {
  /** Conversations to return, 1-50. Default 20. Without a passcode they are listed without messages. */
  count?: number;
}

export type DMConversationParams = DMTarget &
  DMPasscode & {
    /** cursor from the previous page (digits) to get older messages. */
    cursor?: string;
  };

export type DMConversationInfoParams = DMTarget;

export type DMDisappearingParams = DMTarget &
  DMPasscode & {
    /** 0 turns disappearing messages off; otherwise 60 to 31536000 (365 days). */
    ttlSeconds: number;
  };

export type DMSendParams = DMTarget &
  DMPasscode & {
    /** Up to 10,000 characters. */
    text: string;
  };

/** At least one setting is required. */
export interface DMSettingsUpdateParams {
  /** Who can message you, X's value such as "all" or "verified". */
  allowDmsFrom?: string;
  /** Read receipts, X's value. */
  dmReceiptSettings?: string;
  alwaysAllowDmsFromSubscribers?: boolean;
  avCallsEnabled?: boolean;
  acceptCallsFromEveryone?: boolean;
  acceptCallsFromFollowing?: boolean;
  acceptCallsFromVerified?: boolean;
  acceptCallsFromAddressbook?: boolean;
}

/* ------------------------------------------------------------------------------------------------
 * Validation helpers
 * ---------------------------------------------------------------------------------------------- */

function params<T>(value: T | undefined, name: string): T {
  if (!value || typeof value !== "object") throw new ValidationError(`${name} must be an object`);
  return value;
}

function optionalText(name: string, value: unknown, max?: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ValidationError(`${name} must be a string`);
  if (max !== undefined && [...value].length > max) {
    throw new ValidationError(`${name} must be at most ${max} characters`);
  }
  return value;
}

function optionalBool(name: string, value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new ValidationError(`${name} must be true or false`);
  return value;
}

function mediaIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ValidationError("mediaIds must be an array of media IDs");
  if (value.length > 4) throw new ValidationError("mediaIds allows at most 4 items");
  return value.map((id, i) => numericId(`mediaIds[${i}]`, id));
}

function base64(name: string, value: unknown): string {
  if (value instanceof Uint8Array) {
    if (value.length === 0) throw new ValidationError(`${name} is empty`);
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64");
  }
  return nonEmpty(name, value);
}

/** user_id or username for routes that accept either. */
function userFields(target: UserTarget | undefined): Fields {
  const t = (target ?? {}) as { userId?: unknown; username?: unknown };
  if (t.userId !== undefined && t.userId !== null && t.userId !== "") return { user_id: numericId("userId", t.userId) };
  if (t.username !== undefined && t.username !== null && t.username !== "") {
    return { username: cleanUsername(t.username) };
  }
  throw new ValidationError("Provide either userId or username");
}

function pageFields(p: PageParams | undefined): Fields {
  return { count: checkCount(p?.count), cursor: p?.cursor || undefined };
}

function intInRange(name: string, value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function scheduleTime(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const seconds = value instanceof Date ? Math.floor(value.getTime() / 1000) : value;
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds <= 0) {
    throw new ValidationError("scheduleTime must be a Unix time in seconds or a valid Date");
  }
  return seconds;
}

function poll(value: PollParams | undefined): Fields | undefined {
  if (value === undefined) return undefined;
  const p = params(value, "poll");
  if (!Array.isArray(p.choices) || p.choices.length < 2 || p.choices.length > 4) {
    throw new ValidationError("poll needs 2 to 4 choices");
  }
  const choices = p.choices.map((c, i) => {
    if (typeof c !== "string" || !c.trim()) throw new ValidationError(`poll choice ${i + 1} is empty`);
    if ([...c].length > 25) throw new ValidationError(`poll choice ${i + 1} must be at most 25 characters`);
    return c;
  });
  const duration =
    p.durationMinutes === undefined ? undefined : intInRange("poll.durationMinutes", p.durationMinutes, 5, 7 * 24 * 60);
  return { choices, duration_minutes: duration };
}

function dmTarget(target: DMTarget | undefined): Fields {
  const t = (target ?? {}) as { conversationId?: unknown; userId?: unknown };
  if (t.conversationId !== undefined && t.conversationId !== null && t.conversationId !== "") {
    const id = nonEmpty("conversationId", t.conversationId);
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(id)) throw new ValidationError("conversationId is not a valid conversation ID");
    return { conversation_id: id };
  }
  if (t.userId !== undefined && t.userId !== null && t.userId !== "") {
    const id = numericId("userId", t.userId);
    if (id.length > 20) throw new ValidationError("userId must be a numeric X user ID");
    return { user_id: id };
  }
  throw new ValidationError("Provide either conversationId or userId");
}

const BIRTHDATE_VISIBILITIES: readonly BirthdateVisibility[] = ["public", "followers", "following", "mutualfollow", "self"];

function birthdate(value: Birthdate | null | undefined): Fields | null | undefined {
  if (value === undefined || value === null) return value;
  const b = params(value, "birthdate");
  return {
    day: intInRange("birthdate.day", b.day, 1, 31),
    month: intInRange("birthdate.month", b.month, 1, 12),
    year: intInRange("birthdate.year", b.year, 1, 9999),
    visibility: oneOf("birthdate.visibility", b.visibility, BIRTHDATE_VISIBILITIES),
    year_visibility: oneOf("birthdate.yearVisibility", b.yearVisibility, BIRTHDATE_VISIBILITIES),
  };
}

function someDefined(fields: Fields): boolean {
  return Object.values(fields).some((v) => v !== undefined);
}

/* ------------------------------------------------------------------------------------------------
 * Namespaces
 * ---------------------------------------------------------------------------------------------- */

/** Your lists: create, update, delete and manage members. `account.lists`. */
export class AccountLists<F extends ResponseFormat = "raw"> extends AccountNamespace<F> {
  /** Creates a list. */
  create = method<AccountMethod<F, CreateListParams, RawOnly>>(async (p: CreateListParams, options) => {
    const v = params(p, "params");
    const name = optionalText("name", v.name, 25);
    if (!name?.trim()) throw new ValidationError("name must be a non-empty string");
    const body = {
      name,
      description: optionalText("description", v.description, 100),
      private: optionalBool("private", v.private),
    };
    return this.transport.send("/client/lists/create", body, options, true);
  });

  /** Changes a list's name, description or privacy. At least one is required. */
  update = method<AccountMethod<F, UpdateListParams, RawOnly>>(async (p: UpdateListParams, options) => {
    const v = params(p, "params");
    const listId = numericId("listId", v.listId);
    const fields = {
      name: optionalText("name", v.name, 25),
      description: optionalText("description", v.description, 100),
      private: optionalBool("private", v.private),
    };
    if (fields.name !== undefined && !fields.name.trim()) throw new ValidationError("name cannot be empty");
    if (!someDefined(fields)) throw new ValidationError("Provide at least one of name, description or private");
    return this.transport.send("/client/lists/update", { list_id: listId, ...fields }, options, true);
  });

  /** Deletes one of your lists. */
  delete = method<AccountMethod<F, string, SimpleActionResponse>>(async (listId: string, options) =>
    this.transport.send("/client/lists/delete", { list_id: numericId("listId", listId) }, options, true),
  );

  /** Adds a user (by ID or handle) to one of your lists. */
  addMember = method<AccountMethod<F, ListMemberParams, SimpleActionResponse>>(async (p: ListMemberParams, options) => {
    const v = params(p, "params");
    const body = { list_id: numericId("listId", v.listId), ...userFields(v) };
    return this.transport.send("/client/lists/members/add", body, options, true);
  });

  /** Removes a user (by ID or handle) from one of your lists. */
  removeMember = method<AccountMethod<F, ListMemberParams, SimpleActionResponse>>(
    async (p: ListMemberParams, options) => {
      const v = params(p, "params");
      const body = { list_id: numericId("listId", v.listId), ...userFields(v) };
      return this.transport.send("/client/lists/members/remove", body, options, true);
    },
  );
}

/** Communities: create, delete, join and leave. `account.communities`. */
export class AccountCommunities<F extends ResponseFormat = "raw"> extends AccountNamespace<F> {
  /** Creates a community. */
  create = method<AccountMethod<F, CreateCommunityParams, SimpleCreatedCommunityResponse>>(
    async (p: CreateCommunityParams, options) => {
      const v = params(p, "params");
      const body = {
        name: nonEmpty("name", v.name),
        description: optionalText("description", v.description),
        joinPolicy: optionalText("joinPolicy", v.joinPolicy),
        invitesPolicy: optionalText("invitesPolicy", v.invitesPolicy),
        question: optionalText("question", v.question),
      };
      return this.transport.send("/client/communities/create", body, options, true);
    },
  );

  /** Deletes a community you own. X needs its name together with the ID. */
  delete = method<AccountMethod<F, DeleteCommunityParams, SimpleActionResponse>>(
    async (p: DeleteCommunityParams, options) => {
      const v = params(p, "params");
      const body = { community_id: numericId("communityId", v.communityId), name: nonEmpty("name", v.name) };
      return this.transport.send("/client/communities/remove", body, options, true);
    },
  );

  /** Joins a community. */
  join = method<AccountMethod<F, string, SimpleActionResponse>>(async (communityId: string, options) =>
    this.transport.send(
      "/client/communities/join",
      { community_id: numericId("communityId", communityId) },
      options,
      true,
    ),
  );

  /** Leaves a community. */
  leave = method<AccountMethod<F, string, SimpleActionResponse>>(async (communityId: string, options) =>
    this.transport.send(
      "/client/communities/leave",
      { community_id: numericId("communityId", communityId) },
      options,
      true,
    ),
  );
}

/** Unsent drafts. `account.drafts`. */
export class AccountDrafts<F extends ResponseFormat = "raw"> extends AccountNamespace<F> {
  /** Lists your drafts. */
  list = method<AccountMethodOptional<F, DraftsParams, RawOnly>>(async (p: DraftsParams | undefined, options) =>
    this.transport.send("/client/drafts", { ascending: optionalBool("ascending", p?.ascending) }, options, false),
  );

  /** Saves a draft. text or mediaIds is required. */
  create = method<AccountMethod<F, CreateDraftParams, RawOnly>>(async (p: CreateDraftParams, options) =>
    this.transport.send("/client/drafts/create", draftFields(params(p, "params")), options, true),
  );

  /** Replaces a draft's text and media. */
  edit = method<AccountMethod<F, EditDraftParams, RawOnly>>(async (p: EditDraftParams, options) => {
    const v = params(p, "params");
    const body = { draft_tweet_id: numericId("draftTweetId", v.draftTweetId), ...draftFields(v) };
    return this.transport.send("/client/drafts/edit", body, options, true);
  });

  /** Deletes a draft. */
  delete = method<AccountMethod<F, string, SimpleActionResponse>>(async (draftTweetId: string, options) =>
    this.transport.send(
      "/client/drafts/delete",
      { draft_tweet_id: numericId("draftTweetId", draftTweetId) },
      options,
      true,
    ),
  );
}

function draftFields(p: CreateDraftParams): Fields {
  const text = optionalText("text", p.text, 25_000);
  const ids = mediaIds(p.mediaIds);
  if (!text?.trim() && !ids?.length) throw new ValidationError("Provide text or mediaIds");
  return { text, media_ids: ids };
}

/**
 * Encrypted direct messages (X Chat). `account.dm`. The cookie must contain twid. Reading and
 * sending need your X Chat passcode, from the call or the session; it unlocks your chat keys for the
 * request and is not stored by the API.
 */
export class AccountDMs<F extends ResponseFormat = "raw"> extends AccountNamespace<F> {
  /** Lists your conversations. With a passcode they include the latest messages. */
  inbox = method<FormatMethodOptionalParams<F, DMInboxParams, RawResponse, RawResponse>>(
    async (p: DMInboxParams | undefined, options) => {
      const t = this.transport;
      t.requireTwid("dm.inbox");
      const count = p?.count === undefined ? undefined : intInRange("count", p.count, 1, 50);
      return t.send("/client/dm/inbox", { passcode: t.passcode(p?.passcode, false), count }, options, false);
    },
  );

  /** Reads the messages of a conversation, newest first. Needs the passcode. */
  conversation = method<FormatMethod<F, DMConversationParams, RawResponse, RawResponse>>(
    async (p: DMConversationParams, options) => {
      const t = this.transport;
      const v = params(p, "params");
      t.requireTwid("dm.conversation");
      const target = dmTarget(v);
      if (v.cursor !== undefined && v.cursor !== "" && !/^\d{1,20}$/.test(String(v.cursor))) {
        throw new ValidationError("cursor must be digits only (up to 20)");
      }
      const body = { ...target, passcode: t.passcode(v.passcode, true), cursor: v.cursor || undefined };
      return t.send("/client/dm/conversation", body, options, false);
    },
  );

  /** Settings and participants of a conversation (no passcode needed). */
  conversationInfo = method<FormatMethod<F, DMConversationInfoParams, RawResponse, RawResponse>>(
    async (p: DMConversationInfoParams, options) => {
      this.transport.requireTwid("dm.conversationInfo");
      return this.transport.send("/client/dm/conversation/info", dmTarget(p), options, false);
    },
  );

  /** Turns disappearing messages on (ttlSeconds 60 to 31536000) or off (0). Needs the passcode. */
  setDisappearing = method<FormatMethod<F, DMDisappearingParams, RawResponse, RawResponse>>(
    async (p: DMDisappearingParams, options) => {
      const t = this.transport;
      const v = params(p, "params");
      t.requireTwid("dm.setDisappearing");
      const target = dmTarget(v);
      const ttl = v.ttlSeconds;
      if (ttl !== 0 && !(Number.isInteger(ttl) && ttl >= 60 && ttl <= 31_536_000)) {
        throw new ValidationError("ttlSeconds must be 0 (off) or an integer from 60 to 31536000");
      }
      const body = { ...target, passcode: t.passcode(v.passcode, true), ttl_seconds: ttl };
      return t.send("/client/dm/conversation/disappearing", body, options, true);
    },
  );

  /** Sends a message. Needs the passcode. */
  send = method<FormatMethod<F, DMSendParams, RawResponse, RawResponse>>(async (p: DMSendParams, options) => {
    const t = this.transport;
    const v = params(p, "params");
    t.requireTwid("dm.send");
    const target = dmTarget(v);
    const text = nonEmpty("text", v.text) && v.text;
    if ([...text].length > 10_000) throw new ValidationError("text must be at most 10000 characters");
    return t.send("/client/dm/send", { ...target, passcode: t.passcode(v.passcode, true), text }, options, true);
  });

  /** Your DM settings. */
  settings = method<FormatMethodNoParams<F, RawResponse, RawResponse>>(async (options?: RequestOptions) => {
    this.transport.requireTwid("dm.settings");
    return this.transport.send("/client/dm/settings", {}, options, false);
  });

  /** Changes DM settings. At least one setting is required. */
  updateSettings = method<FormatMethod<F, DMSettingsUpdateParams, RawResponse, RawResponse>>(
    async (p: DMSettingsUpdateParams, options) => {
      const v = params(p, "params");
      this.transport.requireTwid("dm.updateSettings");
      const setting = (name: string, value: unknown) => {
        const s = optionalText(name, value);
        if (s !== undefined && !/^[a-z_]{1,64}$/.test(s)) {
          throw new ValidationError(`${name} must be a value like "all" or "verified"`);
        }
        return s;
      };
      const body = {
        allow_dms_from: setting("allowDmsFrom", v.allowDmsFrom),
        dm_receipt_settings: setting("dmReceiptSettings", v.dmReceiptSettings),
        always_allow_dms_from_subscribers: optionalBool("alwaysAllowDmsFromSubscribers", v.alwaysAllowDmsFromSubscribers),
        av_calls_enabled: optionalBool("avCallsEnabled", v.avCallsEnabled),
        accept_calls_from_everyone: optionalBool("acceptCallsFromEveryone", v.acceptCallsFromEveryone),
        accept_calls_from_following: optionalBool("acceptCallsFromFollowing", v.acceptCallsFromFollowing),
        accept_calls_from_verified: optionalBool("acceptCallsFromVerified", v.acceptCallsFromVerified),
        accept_calls_from_addressbook: optionalBool("acceptCallsFromAddressbook", v.acceptCallsFromAddressbook),
      };
      if (!someDefined(body)) throw new ValidationError("Provide at least one DM setting");
      return this.transport.send("/client/dm/settings/update", body, options, true);
    },
  );
}

/* ------------------------------------------------------------------------------------------------
 * Account
 * ---------------------------------------------------------------------------------------------- */

/** Default timeout of uploadVideo: the API waits for X to process the video. */
export const VIDEO_UPLOAD_TIMEOUT_MS = 300_000;

/**
 * Actions run as your own X account: post, reply, like, follow, upload media, update the profile,
 * manage lists and communities, drafts and DMs. Create it with `client.account({ cookie, proxy })`.
 *
 * ```ts
 * const me = client.account({ cookie: process.env.X_COOKIE!, proxy: process.env.X_PROXY! });
 * await me.createTweet({ text: "Hello from the API" });
 * await me.like("1234567890");
 * await me.follow({ username: "XDevelopers" });
 * ```
 *
 * Every method is a POST with the session in the JSON body. Raw answers are
 * `{ status_code, response }` (X's status and body as a string, see parseAccountResponse); with the
 * simple format most routes return small objects instead. Writes are not retried unless you pass
 * `{ maxRetries }`, since a retried write could run twice.
 */
export class Account<F extends ResponseFormat = "raw"> extends AccountNamespace<F> {
  /** Create, update and delete lists, and manage their members. */
  readonly lists: AccountLists<F>;
  /** Create, delete, join and leave communities. */
  readonly communities: AccountCommunities<F>;
  /** Unsent drafts. */
  readonly drafts: AccountDrafts<F>;
  /** Encrypted direct messages. */
  readonly dm: AccountDMs<F>;

  constructor(client: TwittrAPI<F>, session: XSession) {
    const transport = new SessionTransport(client, session);
    super(transport);
    this.lists = new AccountLists(transport);
    this.communities = new AccountCommunities(transport);
    this.drafts = new AccountDrafts(transport);
    this.dm = new AccountDMs(transport);
  }

  // ── Tweets ────────────────────────────────────────────────────────────────

  /**
   * Posts a tweet. Over 280 characters it becomes a long post. Set `scheduleTime` to schedule it,
   * `communityId` to post into a community, `quoteUrl` to quote, or `poll` for a text poll.
   */
  createTweet = method<AccountMethod<F, CreateTweetParams, SimpleCreatedTweetResponse>>(
    async (p: CreateTweetParams, options) => {
      const v = params(p, "params");
      if (typeof v.text !== "string") throw new ValidationError("text must be a string");
      const body = {
        text: v.text,
        media_ids: mediaIds(v.mediaIds),
        possibly_sensitive: optionalBool("possiblySensitive", v.possiblySensitive),
        conversation_control_mode: oneOf("conversationControlMode", v.conversationControlMode, CONVERSATION_MODES),
        quote_url: optionalText("quoteUrl", v.quoteUrl) || undefined,
        community_id: v.communityId === undefined ? undefined : numericId("communityId", v.communityId),
        is_note_tweet: optionalBool("isNoteTweet", v.isNoteTweet),
        schedule_time: scheduleTime(v.scheduleTime),
        poll: poll(v.poll),
      };
      if (body.poll) {
        const clash = (["media_ids", "quote_url", "schedule_time", "community_id"] as const).find((k) =>
          k === "media_ids" ? (body.media_ids?.length ?? 0) > 0 : body[k] !== undefined,
        );
        if (clash) throw new ValidationError(`poll cannot be combined with ${clash}`);
        if ([...v.text].length > 280 || body.is_note_tweet) {
          throw new ValidationError("poll tweets are limited to 280 characters");
        }
      } else if (!v.text.trim() && !body.media_ids?.length) {
        throw new ValidationError("text must be a non-empty string");
      }
      return this.transport.send("/client/create", body, options, true);
    },
  );

  /** Replies to a tweet. */
  reply = method<AccountMethod<F, ReplyParams, SimpleCreatedTweetResponse>>(async (p: ReplyParams, options) => {
    const v = params(p, "params");
    const body = {
      id: numericId("tweetId", v.tweetId),
      text: nonEmpty("text", v.text) && v.text,
      media_ids: mediaIds(v.mediaIds),
      attachment_url: optionalText("attachmentUrl", v.attachmentUrl) || undefined,
      possibly_sensitive: optionalBool("possiblySensitive", v.possiblySensitive),
    };
    return this.transport.send("/client/reply", body, options, true);
  });

  /** Deletes one of your tweets. */
  deleteTweet = method<AccountMethod<F, string, SimpleActionResponse>>(async (tweetId: string, options) =>
    this.#tweetAction("/client/deleteTweet", tweetId, options),
  );

  /** Likes a tweet. */
  like = method<AccountMethod<F, string, SimpleActionResponse>>(async (tweetId: string, options) =>
    this.#tweetAction("/client/like", tweetId, options),
  );

  /** Removes your like from a tweet. */
  unlike = method<AccountMethod<F, string, SimpleActionResponse>>(async (tweetId: string, options) =>
    this.#tweetAction("/client/unlike", tweetId, options),
  );

  /** Retweets a tweet. The simple format returns the new retweet's ID as `retweetId`. */
  retweet = method<AccountMethod<F, string, SimpleActionResponse>>(async (tweetId: string, options) =>
    this.#tweetAction("/client/retweet", tweetId, options),
  );

  /** Undoes a retweet. Pass the ID of the original tweet. */
  unretweet = method<AccountMethod<F, string, SimpleActionResponse>>(async (tweetId: string, options) =>
    this.#tweetAction("/client/unretweet", tweetId, options),
  );

  /** Pins one of your tweets to your profile. */
  pin = method<AccountMethod<F, string, SimpleActionResponse>>(async (tweetId: string, options) =>
    this.#tweetAction("/client/pin", tweetId, options),
  );

  /** Unpins a tweet from your profile. */
  unpin = method<AccountMethod<F, string, SimpleActionResponse>>(async (tweetId: string, options) =>
    this.#tweetAction("/client/unpin", tweetId, options),
  );

  /** Bookmarks a tweet. */
  bookmark = method<AccountMethod<F, string, SimpleActionResponse>>(async (tweetId: string, options) =>
    this.#tweetAction("/client/bookmark", tweetId, options),
  );

  /** Removes a bookmark. */
  unbookmark = method<AccountMethod<F, string, SimpleActionResponse>>(async (tweetId: string, options) =>
    this.#tweetAction("/client/unbookmark", tweetId, options),
  );

  /** Your bookmarks, newest first. Paginated (works with client.paginate). */
  bookmarks = method<AccountMethodOptional<F, AccountPageParams, SimpleAccountTweetsPage>>(
    async (p: AccountPageParams | undefined, options) =>
      this.transport.send("/client/bookmarks", pageFields(p), options, false),
  );

  /** Reports a tweet. */
  report = method<AccountMethod<F, ReportParams, SimpleActionResponse>>(async (p: ReportParams, options) => {
    const v = params(p, "params");
    const reason = oneOf("reason", v.reason, REPORT_REASONS);
    if (!reason) throw new ValidationError(`reason must be one of ${REPORT_REASONS.join(", ")}`);
    const body = { tweet_id: numericId("tweetId", v.tweetId), user_id: numericId("userId", v.userId), reason };
    return this.transport.send("/client/report", body, options, true);
  });

  /** Your home timeline ("For you"). Not paginated: X returns one batch. */
  homeTimeline = method<AccountMethodOptional<F, HomeTimelineParams, SimpleAccountTweetsPage>>(
    async (p: HomeTimelineParams | undefined, options) => {
      const body = {
        count: checkCount(p?.count),
        include_promoted_content: optionalBool("includePromotedContent", p?.includePromotedContent),
      };
      return this.transport.send("/client/home-timeline", body, options, false);
    },
  );

  /** Your scheduled tweets (route /client/schedule-overview). */
  scheduledTweets = method<AccountMethodOptional<F, ScheduledTweetsParams, SimpleScheduledTweetsResponse>>(
    async (p: ScheduledTweetsParams | undefined, options) =>
      this.transport.send(
        "/client/schedule-overview",
        { ascending: optionalBool("ascending", p?.ascending) },
        options,
        false,
      ),
  );

  /** Deletes a scheduled tweet by the ID from scheduledTweets (route /client/schedule-delete). */
  deleteScheduledTweet = method<AccountMethod<F, string, SimpleActionResponse>>(
    async (scheduledTweetId: string, options) =>
      this.transport.send(
        "/client/schedule-delete",
        { scheduled_tweet_id: numericId("scheduledTweetId", scheduledTweetId) },
        options,
        true,
      ),
  );

  // ── Media ────────────────────────────────────────────────────────────────

  /**
   * Uploads an image or GIF for a tweet. Pass base64 or the bytes (Buffer, Uint8Array). Use the
   * returned media ID in `mediaIds` of createTweet or reply.
   */
  uploadImage = method<AccountMethod<F, UploadImageParams, SimpleMediaUploadResponse>>(
    async (p: UploadImageParams, options) => {
      const v = params(p, "params");
      const body = { media: base64("media", v.media), media_type: optionalText("mediaType", v.mediaType) || undefined };
      return this.transport.send("/client/media", body, options, true);
    },
  );

  /**
   * Uploads an MP4 or MOV video and waits until X has processed it. The timeout defaults to
   * {@link VIDEO_UPLOAD_TIMEOUT_MS} (5 minutes); pass `{ timeoutMs }` to change it.
   */
  uploadVideo = method<AccountMethod<F, UploadVideoParams, SimpleMediaUploadResponse>>(
    async (p: UploadVideoParams, options) => {
      const v = params(p, "params");
      const d = v.videoDurationMs;
      if (typeof d !== "number" || !Number.isInteger(d) || d <= 0) {
        throw new ValidationError("videoDurationMs must be a positive integer (milliseconds)");
      }
      const body = {
        media: base64("media", v.media),
        video_duration_ms: d,
        media_type: optionalText("mediaType", v.mediaType) || undefined,
      };
      const opts = { ...options, timeoutMs: options?.timeoutMs ?? VIDEO_UPLOAD_TIMEOUT_MS };
      return this.transport.send("/client/media/video", body, opts, true);
    },
  );

  /** Processing status of an uploaded video. */
  mediaStatus = method<AccountMethod<F, string, RawOnly>>(async (mediaId: string, options) =>
    this.transport.send("/client/media/status", { media_id: numericId("mediaId", mediaId) }, options, false),
  );

  // ── Profile ──────────────────────────────────────────────────────────────

  /** Updates your name, bio, location, website or birth date. At least one field is required. */
  updateProfile = method<AccountMethod<F, UpdateProfileParams, SimpleAccountUserResponse>>(
    async (p: UpdateProfileParams, options) => {
      const v = params(p, "params");
      const body = {
        name: optionalText("name", v.name, 50),
        description: optionalText("description", v.description, 160),
        location: optionalText("location", v.location, 30),
        url: optionalText("url", v.url, 100),
        birthdate: birthdate(v.birthdate),
      };
      if (body.name !== undefined && !body.name.trim()) throw new ValidationError("name cannot be empty");
      if (!someDefined(body)) {
        throw new ValidationError("Provide at least one of name, description, location, url or birthdate");
      }
      return this.transport.send("/client/profile", body, options, true);
    },
  );

  /** Changes your profile picture. JPEG, PNG or GIF up to 2 MB (400 x 400 recommended). */
  updateProfileImage = method<AccountMethod<F, ProfileImageParams, SimpleAccountUserResponse>>(
    async (p: ProfileImageParams, options) => this.#profileMedia("/client/profile/image", p, options),
  );

  /** Changes your header image. JPEG, PNG or GIF up to 5 MB (1500 x 500 recommended). */
  updateProfileBanner = method<AccountMethod<F, ProfileImageParams, SimpleAccountUserResponse>>(
    async (p: ProfileImageParams, options) => this.#profileMedia("/client/profile/banner", p, options),
  );

  // ── Users ────────────────────────────────────────────────────────────────

  /** Follows a user, by ID or handle. */
  follow = method<AccountMethod<F, UserTarget, SimpleAccountUserResponse>>(async (target: UserTarget, options) =>
    this.#userAction("/client/follow", target, options),
  );

  /** Unfollows a user, by ID or handle. */
  unfollow = method<AccountMethod<F, UserTarget, SimpleAccountUserResponse>>(async (target: UserTarget, options) =>
    this.#userAction("/client/unfollow", target, options),
  );

  /** Mutes a user, by ID or handle. */
  mute = method<AccountMethod<F, UserTarget, SimpleAccountUserResponse>>(async (target: UserTarget, options) =>
    this.#userAction("/client/mute", target, options),
  );

  /** Unmutes a user, by ID or handle. */
  unmute = method<AccountMethod<F, UserTarget, SimpleAccountUserResponse>>(async (target: UserTarget, options) =>
    this.#userAction("/client/unmute", target, options),
  );

  /** Blocks a user, by ID or handle. */
  block = method<AccountMethod<F, UserTarget, SimpleAccountUserResponse>>(async (target: UserTarget, options) =>
    this.#userAction("/client/block", target, options),
  );

  /** Unblocks a user, by ID or handle. */
  unblock = method<AccountMethod<F, UserTarget, SimpleAccountUserResponse>>(async (target: UserTarget, options) =>
    this.#userAction("/client/unblock", target, options),
  );

  // ── Account-only reads ───────────────────────────────────────────────────

  /**
   * Tweets you liked. X shows likes only to the account itself, so this uses the twid cookie (or
   * `userId` when the cookie has none). Paginated.
   */
  likes = method<AccountMethodOptional<F, LikesParams, RawOnly>>(async (p: LikesParams | undefined, options) => {
    const userId = p?.userId === undefined || p.userId === "" ? undefined : numericId("userId", p.userId);
    if (!userId) this.transport.requireTwid("likes() without userId");
    return this.transport.send("/client/likes", { user_id: userId, ...pageFields(p) }, options, false);
  });

  /** Accounts you blocked. Paginated. */
  blocked = method<AccountMethodOptional<F, AccountPageParams, RawOnly>>(
    async (p: AccountPageParams | undefined, options) =>
      this.transport.send("/client/blocked", pageFields(p), options, false),
  );

  /** Accounts you muted. Paginated. */
  muted = method<AccountMethodOptional<F, AccountPageParams, RawOnly>>(
    async (p: AccountPageParams | undefined, options) =>
      this.transport.send("/client/muted", pageFields(p), options, false),
  );

  /** Followers of a user (by ID or handle) that you follow. Paginated. */
  followersYouKnow = method<AccountMethod<F, FollowersYouKnowParams, RawOnly>>(
    async (p: FollowersYouKnowParams, options) =>
      this.transport.send(
        "/client/followers-you-know",
        { ...userFields(params(p, "params")), ...pageFields(p) },
        options,
        false,
      ),
  );

  #tweetAction(path: string, tweetId: string, options?: RequestOptions): Promise<unknown> {
    return this.transport.send(path, { tweet_id: numericId("tweetId", tweetId) }, options, true);
  }

  #userAction(path: string, target: UserTarget, options?: RequestOptions): Promise<unknown> {
    return this.transport.send(path, userFields(target), options, true);
  }

  #profileMedia(path: string, p: ProfileImageParams, options?: RequestOptions): Promise<unknown> {
    const v = params(p, "params");
    const body = { media: base64("media", v.media), media_type: optionalText("mediaType", v.mediaType) || undefined };
    return this.transport.send(path, body, options, true);
  }
}
