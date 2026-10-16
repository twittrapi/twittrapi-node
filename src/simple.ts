/**
 * Types of the opt-in simple response format (`format=simple`, see https://twittrapi.com/docs/simple-format).
 *
 * The API converts X's raw JSON into small camelCase objects. Every field is always present: a value
 * X did not send is `null`, a list is `[]`, a count is `0`. New fields may be added; existing fields
 * are not renamed or removed.
 */

/** Envelope of lists and timelines. `nextCursor` is null and `hasNextPage` false on the last page. */
export interface SimplePage<T> {
  data: T[];
  /** Pass as `cursor` to get the next page. */
  nextCursor: string | null;
  /** X's top cursor: use it to poll for newer items. */
  previousCursor: string | null;
  hasNextPage: boolean;
}

/** Envelope of single objects. `data` is null when X returns nothing for the ID or handle. */
export interface SimpleSingle<T> {
  data: T;
}

/** Short reference to an account. */
export interface SimpleUserRef {
  id: string;
  username: string;
}

export interface SimpleUserCounts {
  followers: number;
  following: number;
  tweets: number;
  likes: number;
  media: number;
  listed: number;
}

/** An account. */
export interface SimpleUser {
  id: string;
  /** Handle without @. */
  username: string;
  name: string;
  /** Bio, t.co links expanded. */
  description: string;
  location: string;
  /** Website, expanded. */
  url: string | null;
  /** ISO 8601. */
  createdAt: string | null;
  /** Full size avatar. */
  avatarUrl: string | null;
  bannerUrl: string | null;
  /** Blue check. */
  verified: boolean;
  /** e.g. "Business" or "Government". */
  verifiedType: string | null;
  protected: boolean;
  counts: SimpleUserCounts;
  pinnedTweetIds: string[];
  isAutomated: boolean;
}

/** Public metrics. `views` is null when X hides the count. */
export interface SimpleTweetCounts {
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  bookmarks: number;
  views: number | null;
}

/** A photo, video or GIF. For videos and GIFs `url` is the highest-bitrate MP4. */
export interface SimpleMedia {
  type: "photo" | "video" | "gif";
  url: string;
  /** The image (poster frame for videos). */
  previewUrl: string;
  width: number;
  height: number;
  altText: string | null;
  /** Videos only. */
  durationMs: number | null;
}

export interface SimpleReplyTo {
  tweetId: string | null;
  userId: string | null;
  username: string | null;
}

/** A long-form X Article attached to a tweet. */
export interface SimpleArticle {
  id: string;
  title: string;
  previewText: string;
  coverImageUrl: string | null;
  publishedAt: string | null;
  text: string | null;
}

/** Placeholder for a tweet X did not return (deleted, withheld, protected) when its ID is known. */
export interface SimpleUnavailableTweet {
  id: string;
  unavailable: true;
}

/** A post. */
export interface SimpleTweet {
  id: string;
  /** https://x.com/<username>/status/<id> */
  url: string;
  /** Full text, t.co links replaced by their targets, HTML entities decoded. */
  text: string;
  /** ISO 8601. */
  createdAt: string | null;
  lang: string | null;
  author: SimpleUser | null;
  counts: SimpleTweetCounts;
  media: SimpleMedia[];
  urls: string[];
  /** Without #. */
  hashtags: string[];
  mentions: SimpleUserRef[];
  replyTo: SimpleReplyTo | null;
  /** One level deep: the quoted tweet's own `quoted` is null. */
  quoted: SimpleTweet | SimpleUnavailableTweet | null;
  retweetOf: SimpleTweet | SimpleUnavailableTweet | null;
  conversationId: string | null;
  isPinned: boolean;
  source: string | null;
  article: SimpleArticle | null;
}

/** An X List. */
export interface SimpleList {
  id: string;
  name: string;
  description: string;
  createdAt: string | null;
  memberCount: number;
  followerCount: number;
  private: boolean;
  bannerUrl: string | null;
  owner: SimpleUserRef | null;
}

export interface SimpleCommunityRule {
  id: string;
  name: string;
  description: string;
}

/** An X Community. */
export interface SimpleCommunity {
  id: string;
  name: string;
  /** Empty in search results. */
  description: string;
  createdAt: string | null;
  memberCount: number;
  moderatorCount: number;
  joinPolicy: string | null;
  nsfw: boolean;
  topic: string | null;
  bannerUrl: string | null;
  creator: SimpleUserRef | null;
  rules: SimpleCommunityRule[];
}

/** A trending topic. */
export interface SimpleTrend {
  name: string;
  /** URL-decoded, e.g. "#GoLang". */
  query: string;
  url: string;
  tweetVolume: number | null;
}

/** A place with trends. */
export interface SimpleTrendLocation {
  woeid: number;
  name: string;
  country: string;
  countryCode: string | null;
  placeType: string;
  parentId: number;
}

/** Item of a tweet timeline. */
export type SimpleTimelineTweet = SimpleTweet | SimpleUnavailableTweet;

/** Answer of the account actions (like, bookmark, delete, ...) in the simple format. */
export interface SimpleActionResult {
  success: boolean;
  /** Only on retweet: the ID of the new retweet. */
  retweetId?: string | null;
  /** Only on a scheduled createTweet: the ID of the scheduled tweet. */
  scheduledTweetId?: string | null;
}

/** An uploaded file (account.uploadImage / uploadVideo). Pass `mediaId` in `mediaIds`. */
export interface SimpleMediaUpload {
  mediaId: string;
  mediaKey: string | null;
  expiresAfterSecs: number | null;
}

/** A tweet waiting to be posted (account.scheduledTweets). */
export interface SimpleScheduledTweet {
  id: string;
  text: string;
  /** ISO 8601. */
  executeAt: string | null;
  state: string | null;
  mediaIds: string[];
}

/**
 * True when `data` is a simple-format page (`{ data: [], nextCursor, previousCursor, hasNextPage }`).
 * Raw X JSON never has these keys at the top level.
 */
export function isSimplePage(data: unknown): data is SimplePage<unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const o = data as Record<string, unknown>;
  return typeof o.hasNextPage === "boolean" && "nextCursor" in o && Array.isArray(o.data);
}

/** True for the `{ id, unavailable: true }` placeholder of a tweet X did not return. */
export function isUnavailableTweet(item: unknown): item is SimpleUnavailableTweet {
  return !!item && typeof item === "object" && (item as Record<string, unknown>).unavailable === true;
}
