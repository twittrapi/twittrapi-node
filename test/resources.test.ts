import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TwittrAPI, ValidationError } from "../src/index.js";
import { json, makeClient } from "./helpers.js";

type Case = {
  name: string;
  call: (c: TwittrAPI) => Promise<unknown>;
  path: string;
  query?: Record<string, string>;
  /** Expected JSON body; the request must then be a POST. */
  body?: Record<string, unknown>;
};

const COOKIE = "auth_token=a; ct0=b";
const PROXY = "http://user:pass@1.2.3.4:8080";

const cases: Case[] = [
  // users
  { name: "users.getByUsername", call: (c) => c.users.getByUsername("@jack "), path: "/user/by/username/jack" },
  { name: "users.getById", call: (c) => c.users.getById("12"), path: "/user/12" },
  { name: "users.usernameToId", call: (c) => c.users.usernameToId("@jack"), path: "/username/to/id/jack" },
  {
    name: "users.getMany",
    call: (c) => c.users.getMany(["12", "13"]),
    path: "/user/users/by/ids",
    query: { ids: "12,13" },
  },
  {
    name: "users.tweets by id",
    call: (c) => c.users.tweets({ userId: "12", count: 50, cursor: "abc" }),
    path: "/user/12/tweets",
    query: { count: "50", cursor: "abc" },
  },
  {
    name: "users.tweets by username",
    call: (c) => c.users.tweets({ username: "@jack" }),
    path: "/user/-1/tweets",
    query: { username: "jack" },
  },
  {
    name: "users.tweetsAndReplies",
    call: (c) => c.users.tweetsAndReplies({ userId: "12" }),
    path: "/user/12/tweetsAndReplies",
  },
  { name: "users.media", call: (c) => c.users.media({ username: "jack" }), path: "/user/-1/media", query: { username: "jack" } },
  {
    name: "users.followers",
    call: (c) => c.users.followers({ userId: "12", count: 100 }),
    path: "/user/12/followers",
    query: { count: "100" },
  },
  { name: "users.following", call: (c) => c.users.following({ userId: "12" }), path: "/user/12/followings" },
  {
    name: "users.verifiedFollowers",
    call: (c) => c.users.verifiedFollowers({ username: "jack", cursor: "c1" }),
    path: "/user/-1/verifiedFollowers",
    query: { username: "jack", cursor: "c1" },
  },
  {
    name: "users.affiliates by id",
    call: (c) => c.users.affiliates({ userId: "12", count: 100, cursor: "a" }),
    path: "/user/12/affiliates",
    query: { count: "100", cursor: "a" },
  },
  {
    name: "users.affiliates by username",
    call: (c) => c.users.affiliates({ username: "@XDevelopers" }),
    path: "/user/-1/affiliates",
    query: { username: "XDevelopers" },
  },
  {
    name: "users.friendshipsBatch",
    call: (c) => c.users.friendshipsBatch({ source: "@jack", targets: ["@biz", "Ev", "biz", " ev "] }),
    path: "/user/friendships/batch",
    query: { source_screen_name: "jack", target_screen_names: "biz,Ev" },
  },
  {
    name: "users.friendshipsBatch (comma string)",
    call: (c) => c.users.friendshipsBatch({ source: "jack", targets: "biz, @ev,," }),
    path: "/user/friendships/batch",
    query: { source_screen_name: "jack", target_screen_names: "biz,ev" },
  },
  {
    name: "users.aboutBatch",
    call: (c) => c.users.aboutBatch(["@jack", "XDevelopers", "JACK"]),
    path: "/user/about/batch",
    query: { usernames: "jack,XDevelopers" },
  },
  {
    name: "users.aboutBatch (comma string)",
    call: (c) => c.users.aboutBatch("jack,@biz"),
    path: "/user/about/batch",
    query: { usernames: "jack,biz" },
  },
  // tweets
  { name: "tweets.get (string)", call: (c) => c.tweets.get("20"), path: "/tweet/20" },
  {
    name: "tweets.get (params)",
    call: (c) => c.tweets.get({ tweetId: "20", rankingMode: "Recency", cursor: "c" }),
    path: "/tweet/20",
    query: { rankingMode: "Recency", cursor: "c" },
  },
  { name: "tweets.replies", call: (c) => c.tweets.replies({ tweetId: "20" }), path: "/tweet/20/replies" },
  {
    name: "tweets.replies with options",
    call: (c) => c.tweets.replies({ tweetId: "20", rankingMode: "Likes", includePromotedContent: false, cursor: "r" }),
    path: "/tweet/20/replies",
    query: { rankingMode: "Likes", includePromotedContent: "false", cursor: "r" },
  },
  { name: "tweets.thread", call: (c) => c.tweets.thread("20"), path: "/tweet/20/thread" },
  {
    name: "tweets.retweeters",
    call: (c) => c.tweets.retweeters({ tweetId: "20", count: 40 }),
    path: "/tweet/20/retweets",
    query: { count: "40" },
  },
  {
    name: "tweets.likers",
    call: (c) => c.tweets.likers({ tweetId: "20", cookie: COOKIE, proxy: PROXY }),
    path: "/tweet/20/favorites",
    body: { cookie: COOKIE, proxy: PROXY },
  },
  {
    name: "tweets.likers with paging",
    call: (c) => c.tweets.likers({ tweetId: "20", cookie: COOKIE, proxy: PROXY, count: 100, cursor: "l" }),
    path: "/tweet/20/favorites",
    body: { cookie: COOKIE, proxy: PROXY, count: 100, cursor: "l" },
  },
  { name: "tweets.quotes", call: (c) => c.tweets.quotes({ tweetId: "20", cursor: "q" }), path: "/tweet/20/quotes", query: { cursor: "q" } },
  // search
  {
    name: "search.tweets",
    call: (c) => c.search.tweets({ query: "from:jack lang:en", category: "Latest", count: 20, cursor: "s" }),
    path: "/search",
    query: { searchItem: "from:jack lang:en", category: "Latest", count: "20", cursor: "s" },
  },
  // lists
  { name: "lists.details", call: (c) => c.lists.details("99"), path: "/lists/details", query: { listId: "99" } },
  {
    name: "lists.tweets",
    call: (c) => c.lists.tweets({ listId: "99", count: 10 }),
    path: "/lists/tweets",
    query: { listId: "99", count: "10" },
  },
  {
    name: "lists.members",
    call: (c) => c.lists.members({ listId: "99", cursor: "m" }),
    path: "/lists/members",
    query: { listId: "99", cursor: "m" },
  },
  // communities
  { name: "communities.get", call: (c) => c.communities.get("77"), path: "/communities/77" },
  { name: "communities.about", call: (c) => c.communities.about("77"), path: "/communities/77/about" },
  {
    name: "communities.tweets",
    call: (c) => c.communities.tweets({ communityId: "77", count: 5 }),
    path: "/communities/77/tweets",
    query: { count: "5" },
  },
  {
    name: "communities.search",
    call: (c) => c.communities.search({ query: "web dev/ai" }),
    path: "/communities/search/web%20dev%2Fai",
  },
  // trends
  { name: "trends.get", call: (c) => c.trends.get(23424977), path: "/trends/23424977" },
  { name: "trends.get default", call: (c) => c.trends.get(), path: "/trends/1" },
  { name: "trends.locations", call: (c) => c.trends.locations(), path: "/misc/locations" },
  // spaces
  { name: "spaces.get", call: (c) => c.spaces.get(" 1YqKDqWqdPLsV "), path: "/spaces/1YqKDqWqdPLsV" },
];

describe("resource methods build the right request", () => {
  for (const tc of cases) {
    it(tc.name, async () => {
      const { client, calls } = makeClient([json({ ok: true })]);
      assert.deepEqual(await tc.call(client), { ok: true });
      assert.equal(calls.length, 1);
      const url = calls[0]!.url;
      // compare the raw (still-encoded) path
      assert.equal(url.pathname, tc.path);
      assert.deepEqual(Object.fromEntries(url.searchParams), tc.query ?? {});
      if (tc.body) {
        assert.equal(calls[0]!.method, "POST");
        assert.equal(calls[0]!.headers["content-type"], "application/json");
        assert.deepEqual(JSON.parse(calls[0]!.body!), tc.body);
      } else {
        assert.equal(calls[0]!.method, "GET");
        assert.equal(calls[0]!.body, undefined);
      }
    });
  }

  it("covers all 30 endpoints", () => {
    const methods = new Set(cases.map((c) => c.name.split(" ")[0]));
    assert.equal(methods.size, 30);
  });
});

describe("argument validation (no request is sent)", () => {
  const bad: [string, (c: TwittrAPI) => Promise<unknown>][] = [
    ["non-numeric userId", (c) => c.users.getById("jack")],
    ["empty username", (c) => c.users.getByUsername("  @ ")],
    ["getMany empty", (c) => c.users.getMany([])],
    ["getMany > 500", (c) => c.users.getMany(Array.from({ length: 501 }, (_, i) => String(i + 1)))],
    ["getMany bad id", (c) => c.users.getMany(["1", "x"])],
    ["timeline without user", (c) => c.users.tweets({} as never)],
    ["count 0", (c) => c.users.followers({ userId: "1", count: 0 })],
    ["count 101", (c) => c.users.followers({ userId: "1", count: 101 })],
    ["count 1.5", (c) => c.users.followers({ userId: "1", count: 1.5 })],
    ["bad tweetId", (c) => c.tweets.get("12a")],
    ["likers bad tweetId", (c) => c.tweets.likers({ tweetId: "12a", cookie: COOKIE, proxy: PROXY })],
    ["likers empty cookie", (c) => c.tweets.likers({ tweetId: "1", cookie: " ", proxy: PROXY })],
    ["likers empty proxy", (c) => c.tweets.likers({ tweetId: "1", cookie: COOKIE, proxy: "" })],
    ["likers without cookie", (c) => c.tweets.likers({ tweetId: "1", proxy: PROXY } as never)],
    ["likers count 101", (c) => c.tweets.likers({ tweetId: "1", cookie: COOKIE, proxy: PROXY, count: 101 })],
    ["bad rankingMode", (c) => c.tweets.get({ tweetId: "1", rankingMode: "Hot" as never })],
    ["empty search", (c) => c.search.tweets({ query: " " })],
    ["bad category", (c) => c.search.tweets({ query: "x", category: "Media" as never })],
    ["bad listId", (c) => c.lists.details("abc")],
    ["bad communityId", (c) => c.communities.get("")],
    ["empty community search", (c) => c.communities.search({ query: "" })],
    ["bad woeid", (c) => c.trends.get("us")],
    ["affiliates without user", (c) => c.users.affiliates({} as never)],
    ["affiliates count 101", (c) => c.users.affiliates({ userId: "1", count: 101 })],
    ["friendshipsBatch no params", (c) => c.users.friendshipsBatch(undefined as never)],
    ["friendshipsBatch no source", (c) => c.users.friendshipsBatch({ source: " ", targets: ["a"] })],
    ["friendshipsBatch bad source", (c) => c.users.friendshipsBatch({ source: "not a handle", targets: ["a"] })],
    ["friendshipsBatch no targets", (c) => c.users.friendshipsBatch({ source: "jack", targets: [] })],
    ["friendshipsBatch empty string", (c) => c.users.friendshipsBatch({ source: "jack", targets: " , " })],
    ["friendshipsBatch bad target", (c) => c.users.friendshipsBatch({ source: "jack", targets: ["ok", "a-b"] })],
    ["friendshipsBatch long target", (c) => c.users.friendshipsBatch({ source: "jack", targets: ["x".repeat(16)] })],
    [
      "friendshipsBatch 51 targets",
      (c) => c.users.friendshipsBatch({ source: "jack", targets: Array.from({ length: 51 }, (_, i) => `u${i}`) }),
    ],
    ["aboutBatch empty", (c) => c.users.aboutBatch([])],
    ["aboutBatch not a list", (c) => c.users.aboutBatch(42 as never)],
    ["aboutBatch empty item", (c) => c.users.aboutBatch(["jack", ""])],
    ["aboutBatch bad handle", (c) => c.users.aboutBatch(["jack", "@@jack"])],
    ["aboutBatch 21", (c) => c.users.aboutBatch(Array.from({ length: 21 }, (_, i) => `u${i}`))],
    ["replies bad tweetId", (c) => c.tweets.replies({ tweetId: "x" })],
    ["replies bad rankingMode", (c) => c.tweets.replies({ tweetId: "1", rankingMode: "Top" as never })],
    ["replies bad includePromotedContent", (c) => c.tweets.replies({ tweetId: "1", includePromotedContent: "no" as never })],
    ["thread bad tweetId", (c) => c.tweets.thread("12a")],
    ["about bad communityId", (c) => c.communities.about("abc")],
    ["space empty id", (c) => c.spaces.get("")],
    ["space bad id", (c) => c.spaces.get("1Yq-KD")],
    ["space long id", (c) => c.spaces.get("a".repeat(33))],
  ];
  for (const [name, call] of bad) {
    it(name, async () => {
      const { client, calls } = makeClient();
      await assert.rejects(call(client), ValidationError);
      assert.equal(calls.length, 0);
    });
  }

  it("batch lookups accept the maximum after dropping duplicates", async () => {
    const { client, calls } = makeClient();
    const targets = Array.from({ length: 50 }, (_, i) => `u${i}`);
    await client.users.friendshipsBatch({ source: "jack", targets: [...targets, "U0", "@u1"] });
    assert.equal(calls[0]!.url.searchParams.get("target_screen_names"), targets.join(","));
    const names = Array.from({ length: 20 }, (_, i) => `n${i}`);
    await client.users.aboutBatch([...names, "N19"]);
    assert.equal(calls[1]!.url.searchParams.get("usernames"), names.join(","));
  });

  it("userId wins when both userId and username are passed", async () => {
    const { client, calls } = makeClient();
    await client.users.tweets({ userId: "5", username: "jack" } as never);
    assert.equal(calls[0]!.url.pathname, "/user/5/tweets");
    assert.equal(calls[0]!.url.searchParams.get("username"), null);
  });

  it("methods work when detached from their namespace", async () => {
    const { client, calls } = makeClient();
    const { followers } = client.users;
    await followers({ userId: "1" });
    assert.equal(calls[0]!.url.pathname, "/user/1/followers");
  });
});
