// The opt-in simple response format (format=simple). Fixtures in test/fixtures/simple are real API
// responses converted by the API's own normalize code (copied from its testdata).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TwittrAPI,
  ValidationError,
  isSimplePage,
  isUnavailableTweet,
  paginate,
  type Page,
  type SimpleCommunity,
  type SimpleList,
  type SimpleMedia,
  type SimplePage,
  type SimpleTrend,
  type SimpleTrendLocation,
  type SimpleTweet,
  type SimpleTweetCounts,
  type SimpleUser,
  type SimpleUserCounts,
  type SimpleUserResponse,
  type SimpleUsersPage,
  type SimpleTweetsPage,
  type TimelineResponse,
  type UserResponse,
} from "../src/index.js";
import { json, makeClient, mockFetch, simpleFixture, timeline } from "./helpers.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assertType<T extends true>(_: T): void {}

// Key lists checked against the TS types at compile time (satisfies rejects missing and extra keys)
// and against the fixtures at run time, so the types cannot drift from what the API sends.
const TWEET_KEYS = {
  id: 1, url: 1, text: 1, createdAt: 1, lang: 1, author: 1, counts: 1, media: 1, urls: 1, hashtags: 1, mentions: 1,
  replyTo: 1, quoted: 1, retweetOf: 1, conversationId: 1, isPinned: 1, source: 1, article: 1,
} satisfies Record<keyof SimpleTweet, 1>;
const TWEET_COUNT_KEYS = { likes: 1, retweets: 1, replies: 1, quotes: 1, bookmarks: 1, views: 1 } satisfies Record<
  keyof SimpleTweetCounts,
  1
>;
const MEDIA_KEYS = { type: 1, url: 1, previewUrl: 1, width: 1, height: 1, altText: 1, durationMs: 1 } satisfies Record<
  keyof SimpleMedia,
  1
>;
const USER_KEYS = {
  id: 1, username: 1, name: 1, description: 1, location: 1, url: 1, createdAt: 1, avatarUrl: 1, bannerUrl: 1,
  verified: 1, verifiedType: 1, protected: 1, counts: 1, pinnedTweetIds: 1, isAutomated: 1,
} satisfies Record<keyof SimpleUser, 1>;
const USER_COUNT_KEYS = { followers: 1, following: 1, tweets: 1, likes: 1, media: 1, listed: 1 } satisfies Record<
  keyof SimpleUserCounts,
  1
>;
const LIST_KEYS = {
  id: 1, name: 1, description: 1, createdAt: 1, memberCount: 1, followerCount: 1, private: 1, bannerUrl: 1, owner: 1,
} satisfies Record<keyof SimpleList, 1>;
const COMMUNITY_KEYS = {
  id: 1, name: 1, description: 1, createdAt: 1, memberCount: 1, moderatorCount: 1, joinPolicy: 1, nsfw: 1, topic: 1,
  bannerUrl: 1, creator: 1, rules: 1,
} satisfies Record<keyof SimpleCommunity, 1>;
const TREND_KEYS = { name: 1, query: 1, url: 1, tweetVolume: 1 } satisfies Record<keyof SimpleTrend, 1>;
const TREND_LOCATION_KEYS = { woeid: 1, name: 1, country: 1, countryCode: 1, placeType: 1, parentId: 1 } satisfies Record<
  keyof SimpleTrendLocation,
  1
>;
const PAGE_KEYS = { data: 1, nextCursor: 1, previousCursor: 1, hasNextPage: 1 } satisfies Record<
  keyof SimplePage<unknown>,
  1
>;

function keys(o: object): string[] {
  return Object.keys(o).sort();
}

function checkUser(u: SimpleUser): void {
  assert.deepEqual(keys(u), keys(USER_KEYS));
  assert.deepEqual(keys(u.counts), keys(USER_COUNT_KEYS));
  assert.equal(typeof u.id, "string");
  assert.ok(Array.isArray(u.pinnedTweetIds));
}

function checkTweet(t: SimpleTweet): void {
  assert.deepEqual(keys(t), keys(TWEET_KEYS));
  assert.deepEqual(keys(t.counts), keys(TWEET_COUNT_KEYS));
  for (const m of t.media) assert.deepEqual(keys(m), keys(MEDIA_KEYS));
  if (t.author) checkUser(t.author);
  for (const nested of [t.quoted, t.retweetOf]) {
    if (nested && !isUnavailableTweet(nested)) checkTweet(nested);
  }
}

describe("simple format: request", () => {
  it("defaults to raw and sends no format parameter", async () => {
    const { client, calls } = makeClient([json({})]);
    assert.equal(client.format, "raw");
    await client.users.tweets({ userId: "12", count: 20 });
    assert.equal(calls[0]!.url.searchParams.has("format"), false);
    assert.equal(calls[0]!.url.search, "?count=20");
  });

  it("sends format=simple on every method when the client default is simple", async () => {
    const { client, calls } = makeClient([json({ data: null })], { format: "simple" });
    assert.equal(client.format, "simple");
    await client.users.getByUsername("jack");
    await client.users.getById("12");
    await client.users.usernameToId("jack");
    await client.users.getMany(["12"]);
    await client.users.tweets({ userId: "12" });
    await client.users.tweetsAndReplies({ userId: "12" });
    await client.users.media({ userId: "12" });
    await client.users.followers({ username: "jack" });
    await client.users.following({ userId: "12" });
    await client.users.verifiedFollowers({ userId: "12" });
    await client.tweets.get("1");
    await client.tweets.retweeters({ tweetId: "1" });
    await client.tweets.likers({ tweetId: "1" });
    await client.tweets.quotes({ tweetId: "1" });
    await client.search.tweets({ query: "x", category: "People" });
    await client.lists.details("5");
    await client.lists.tweets({ listId: "5" });
    await client.lists.members({ listId: "5" });
    await client.communities.get("7");
    await client.communities.tweets({ communityId: "7" });
    await client.communities.search({ query: "go" });
    await client.trends.get();
    await client.trends.locations();
    await client.get({ path: "/user/about/jack" });
    assert.equal(calls.length, 24);
    for (const c of calls) assert.equal(c.url.searchParams.get("format"), "simple", c.url.toString());
  });

  it("keeps the other query parameters", async () => {
    const { client, calls } = makeClient([json({})], { format: "simple" });
    await client.users.followers({ username: "@jack", count: 50, cursor: "c1" });
    assert.equal(calls[0]!.url.pathname, "/user/-1/followers");
    assert.deepEqual(Object.fromEntries(calls[0]!.url.searchParams), {
      username: "jack",
      count: "50",
      cursor: "c1",
      format: "simple",
    });
  });

  it("per-call format overrides the client default in both directions", async () => {
    const raw = makeClient([json({})]);
    await raw.client.users.tweets({ userId: "1" }, { format: "simple" });
    await raw.client.users.tweets({ userId: "1" }, { format: "raw" });
    await raw.client.users.tweets({ userId: "1" });
    assert.deepEqual(
      raw.calls.map((c) => c.url.searchParams.get("format")),
      ["simple", null, null],
    );

    const simple = makeClient([json({})], { format: "simple" });
    await simple.client.users.tweets({ userId: "1" }, { format: "raw" });
    await simple.client.users.tweets({ userId: "1" }, {});
    await simple.client.trends.get(1, { format: "raw" });
    await simple.client.trends.locations({ format: "raw" });
    assert.deepEqual(
      simple.calls.map((c) => c.url.searchParams.get("format")),
      [null, "simple", null, null],
    );
  });

  it("rejects an unknown format", async () => {
    assert.throws(
      () => new TwittrAPI({ apiKey: "k", fetch: mockFetch().fetch, format: "json" as "raw" }),
      (e: unknown) => e instanceof ValidationError && /format must be one of raw, simple/.test(e.message),
    );
    const { client, calls } = makeClient([json({})]);
    await assert.rejects(client.users.getById("1", { format: "xml" as "raw" }), ValidationError);
    assert.equal(calls.length, 0);
  });
});

describe("simple format: types", () => {
  it("selects simple or raw types from the client default and the per-call option", async () => {
    const simple = makeClient([json(simpleFixture("user-by-username-username"))], { format: "simple" }).client;
    const raw = makeClient([json(simpleFixture("user-by-username-username"))]).client;

    const a = await simple.users.getByUsername("XDevelopers");
    assertType<Equal<typeof a, SimpleUserResponse>>(true);
    const b = await raw.users.getByUsername("XDevelopers");
    assertType<Equal<typeof b, UserResponse>>(true);
    const c = await raw.users.getByUsername("XDevelopers", { format: "simple" });
    assertType<Equal<typeof c, SimpleUserResponse>>(true);
    const d = await simple.users.tweets({ userId: "1" }, { format: "raw" });
    assertType<Equal<typeof d, TimelineResponse>>(true);
    const e = await simple.users.followers({ userId: "1" }, { timeoutMs: 1000 });
    assertType<Equal<typeof e, SimpleUsersPage>>(true);

    // `new TwittrAPI({ format: "simple" })` infers the format; no option keeps raw.
    const inferred = new TwittrAPI({ apiKey: "k", fetch: mockFetch().fetch, format: "simple" });
    assertType<Equal<typeof inferred, TwittrAPI<"simple">>>(true);
    const plain = new TwittrAPI({ apiKey: "k", fetch: mockFetch().fetch });
    assertType<Equal<typeof plain, TwittrAPI<"raw">>>(true);

    assert.equal(a.data?.username, "XDevelopers");
    assert.equal(c.data?.counts.followers, 698074);
  });

  it("paginate infers the page type from the client format", async () => {
    const simple = makeClient([json(simpleFixture("user-userid-tweets"))], { format: "simple" }).client;
    for await (const page of simple.paginate(simple.users.tweets, { userId: "1" }, { maxPages: 1 })) {
      assertType<Equal<typeof page, Page<SimpleTweetsPage>>>(true);
      const first = page.data.data[0]!;
      assert.ok(!isUnavailableTweet(first));
      assert.equal(first.author?.username, "XDevelopers");
    }
    const raw = makeClient([json(timeline(["1"]))]).client;
    for await (const page of raw.paginate(raw.users.followers, { userId: "1" })) {
      assertType<Equal<typeof page, Page<TimelineResponse>>>(true);
    }
  });
});

describe("simple format: fixtures", () => {
  it("returns the simple body unchanged", async () => {
    const body = simpleFixture("user-userid-tweets");
    const { client } = makeClient([json(body)], { format: "simple" });
    assert.deepEqual(await client.users.tweets({ userId: "2244994945" }), body);
  });

  it("tweet timelines match SimpleTweet, including media and unavailable placeholders", () => {
    let unavailable = 0;
    let media = 0;
    for (const name of ["user-userid-tweets", "user-userid-media", "tweet-tweetid", "search", "capture-user_tweets"]) {
      const page = simpleFixture<SimpleTweetsPage>(name);
      assert.deepEqual(keys(page), keys(PAGE_KEYS), name);
      assert.ok(isSimplePage(page), name);
      assert.ok(page.data.length > 0, name);
      for (const item of page.data) {
        if (isUnavailableTweet(item)) {
          unavailable++;
          assert.deepEqual(keys(item), ["id", "unavailable"]);
          continue;
        }
        checkTweet(item);
        media += item.media.length;
      }
    }
    assert.ok(media > 0, "fixtures contain media");
    assert.ok(unavailable > 0 || hasNestedUnavailable(), "fixtures contain an unavailable placeholder");
  });

  it("user lists and single users match SimpleUser", () => {
    for (const name of ["user-userid-followers", "user-users-by-ids"]) {
      const page = simpleFixture<SimpleUsersPage>(name);
      assert.ok(isSimplePage(page));
      assert.ok(page.data.length > 0);
      page.data.forEach(checkUser);
    }
    const single = simpleFixture<SimpleUserResponse>("user-by-username-username");
    assert.equal(isSimplePage(single), false);
    checkUser(single.data!);
    assert.equal(single.data!.id, "2244994945");
  });

  it("lists, communities, trends and trend locations match their types", () => {
    const list = simpleFixture<{ data: SimpleList }>("lists-details").data;
    assert.deepEqual(keys(list), keys(LIST_KEYS));
    const community = simpleFixture<{ data: SimpleCommunity }>("communities-communityid").data;
    assert.deepEqual(keys(community), keys(COMMUNITY_KEYS));
    for (const c of simpleFixture<SimplePage<SimpleCommunity>>("communities-search-searchterm").data) {
      assert.deepEqual(keys(c), keys(COMMUNITY_KEYS));
    }
    const trends = simpleFixture<SimplePage<SimpleTrend>>("trends-locationid");
    assert.equal(trends.hasNextPage, false);
    assert.equal(trends.nextCursor, null);
    for (const t of trends.data) assert.deepEqual(keys(t), keys(TREND_KEYS));
    assert.equal(trends.data[0]!.query, "#GoLang");
    for (const l of simpleFixture<SimplePage<SimpleTrendLocation>>("misc-locations").data) {
      assert.deepEqual(keys(l), keys(TREND_LOCATION_KEYS));
    }
  });

  it("isSimplePage tells simple pages from raw JSON and single objects", () => {
    assert.equal(isSimplePage(simpleFixture("user-userid-followers")), true);
    assert.equal(isSimplePage(simpleFixture("tweet-tweetid-favorites")), true);
    assert.equal(isSimplePage(simpleFixture("username-to-id-username")), false);
    assert.equal(isSimplePage(timeline(["1"], "c")), false);
    assert.equal(isSimplePage(null), false);
    assert.equal(isSimplePage([]), false);
  });
});

function hasNestedUnavailable(): boolean {
  const page = simpleFixture<SimpleTweetsPage>("capture-user_tweets");
  return page.data.some(
    (t) => !isUnavailableTweet(t) && (isUnavailableTweet(t.quoted) || isUnavailableTweet(t.retweetOf)),
  );
}

describe("simple format: pagination", () => {
  const lastPage = { data: [], nextCursor: null, previousCursor: null, hasNextPage: false };

  it("follows nextCursor while hasNextPage is true", async () => {
    const first = simpleFixture<SimpleUsersPage>("user-userid-followers");
    const second = { ...first, nextCursor: "c2", previousCursor: null };
    const { client, calls } = makeClient([json(first), json(second), json(lastPage)], { format: "simple" });
    const pages = [];
    for await (const page of client.paginate(client.users.followers, { userId: "12" })) pages.push(page);
    assert.deepEqual(
      pages.map((p) => [p.pageNumber, p.cursor, p.nextCursor]),
      [
        [1, undefined, first.nextCursor],
        [2, first.nextCursor, "c2"],
        [3, "c2", undefined],
      ],
    );
    assert.deepEqual(
      calls.map((c) => [c.url.searchParams.get("cursor"), c.url.searchParams.get("format")]),
      [
        [null, "simple"],
        [first.nextCursor, "simple"],
        ["c2", "simple"],
      ],
    );
  });

  it("stops when hasNextPage is false, even if a cursor is present", async () => {
    const page = { ...simpleFixture<SimpleUsersPage>("user-userid-followers"), hasNextPage: false };
    const { client, calls } = makeClient([json(page)], { format: "simple" });
    const pages = [];
    for await (const p of client.paginate(client.users.followers, { userId: "12" }, { maxPages: 5 })) pages.push(p);
    assert.equal(pages.length, 1);
    assert.equal(pages[0]!.nextCursor, undefined);
    assert.equal(calls.length, 1);
  });

  it("stops on the API's empty last page (likes / favorites)", async () => {
    const { client, calls } = makeClient([json(simpleFixture("tweet-tweetid-favorites"))], { format: "simple" });
    for await (const _ of client.paginate(client.tweets.likers, { tweetId: "1" }, { maxPages: 5 })) void _;
    assert.equal(calls.length, 1);
  });

  it("follows simple pages without the timeline-entry check (pages have no entryIds)", async () => {
    // A raw page with items but only cursor entries would stop; a simple page is trusted as is.
    const p1 = { data: [{ id: "1" }], nextCursor: "a", previousCursor: null, hasNextPage: true };
    const { client, calls } = makeClient([json(p1), json(lastPage)], { format: "simple" });
    for await (const _ of client.paginate(client.users.tweets, { userId: "1" })) void _;
    assert.equal(calls.length, 2);
  });

  it("stops when the API repeats a cursor", async () => {
    const p = { data: [{ id: "1" }], nextCursor: "same", previousCursor: null, hasNextPage: true };
    const { client, calls } = makeClient([json(p)], { format: "simple" });
    for await (const _ of client.paginate(client.users.tweets, { userId: "1" }, { maxPages: 10 })) void _;
    assert.equal(calls.length, 2);
  });

  it("per-call format in paginate options applies to every page", async () => {
    const first = { data: [{ id: "1" }], nextCursor: "n1", previousCursor: null, hasNextPage: true };
    const { client, calls } = makeClient([json(first), json(lastPage)]);
    for await (const _ of paginate(client.users.followers, { userId: "1" }, { format: "simple" })) void _;
    assert.deepEqual(
      calls.map((c) => c.url.searchParams.get("format")),
      ["simple", "simple"],
    );
  });

  it("falls back to raw cursor detection when the API answers raw", async () => {
    // The API returns the raw body when it cannot convert a response; pagination still works.
    const { client, calls } = makeClient([json(timeline(["1"], "c1")), json(timeline(["2"]))], { format: "simple" });
    const pages = [];
    for await (const p of client.paginate(client.users.followers, { userId: "1" })) pages.push(p.nextCursor);
    assert.deepEqual(pages, ["c1", undefined]);
    assert.equal(calls.length, 2);
  });
});
