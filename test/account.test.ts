import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspect } from "node:util";
import {
  Account,
  ServerError,
  TimeoutError,
  TwittrAPI,
  ValidationError,
  extractBottomCursor,
  parseAccountResponse,
  type AccountRawResponse,
  type SimpleActionResponse,
  type XSession,
} from "../src/index.js";
import { json, makeClient, type RecordedCall } from "./helpers.js";

const COOKIE = "auth_token=secret-auth; ct0=secret-ct0; twid=u%3D4242";
const PROXY = "http://puser:ppass@10.0.0.1:8080";
const SESSION: XSession = { cookie: COOKIE, proxy: PROXY, passcode: "0420" };
const S = { cookie: COOKIE, proxy: PROXY };
const RAW_OK = { status_code: 200, response: "{}" };

type Case = {
  name: string;
  call: (a: Account) => Promise<unknown>;
  path: string;
  /** Expected body without cookie and proxy. */
  body: Record<string, unknown>;
  /** Writes are sent with maxRetries 0 by default. */
  write: boolean;
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const PNG_B64 = "iVBORw==";

const cases: Case[] = [
  // tweets
  { name: "createTweet", call: (a) => a.createTweet({ text: "hi" }), path: "/client/create", body: { text: "hi" }, write: true },
  {
    name: "createTweet with options",
    call: (a) =>
      a.createTweet({
        text: "hi",
        mediaIds: ["11", "12"],
        possiblySensitive: true,
        conversationControlMode: "only_follows",
        quoteUrl: "https://x.com/jack/status/20",
        isNoteTweet: false,
      }),
    path: "/client/create",
    body: {
      text: "hi",
      media_ids: ["11", "12"],
      possibly_sensitive: true,
      conversation_control_mode: "only_follows",
      quote_url: "https://x.com/jack/status/20",
      is_note_tweet: false,
    },
    write: true,
  },
  {
    name: "createTweet scheduled (Date)",
    call: (a) => a.createTweet({ text: "later", scheduleTime: new Date(1_900_000_000_500) }),
    path: "/client/create",
    body: { text: "later", schedule_time: 1_900_000_000 },
    write: true,
  },
  {
    name: "createTweet scheduled (seconds)",
    call: (a) => a.createTweet({ text: "later", scheduleTime: 1_900_000_000 }),
    path: "/client/create",
    body: { text: "later", schedule_time: 1_900_000_000 },
    write: true,
  },
  {
    name: "createTweet in community",
    call: (a) => a.createTweet({ text: "hi", communityId: "77" }),
    path: "/client/create",
    body: { text: "hi", community_id: "77" },
    write: true,
  },
  {
    name: "createTweet poll",
    call: (a) => a.createTweet({ text: "Pick", poll: { choices: ["A", "B"], durationMinutes: 60 } }),
    path: "/client/create",
    body: { text: "Pick", poll: { choices: ["A", "B"], duration_minutes: 60 } },
    write: true,
  },
  {
    name: "createTweet poll default duration",
    call: (a) => a.createTweet({ text: "Pick", poll: { choices: ["A", "B", "C"] } }),
    path: "/client/create",
    body: { text: "Pick", poll: { choices: ["A", "B", "C"] } },
    write: true,
  },
  {
    name: "reply",
    call: (a) =>
      a.reply({ tweetId: "20", text: "yes", mediaIds: ["5"], attachmentUrl: "https://x.com/a/status/1", possiblySensitive: false }),
    path: "/client/reply",
    body: { id: "20", text: "yes", media_ids: ["5"], attachment_url: "https://x.com/a/status/1", possibly_sensitive: false },
    write: true,
  },
  { name: "deleteTweet", call: (a) => a.deleteTweet("20"), path: "/client/deleteTweet", body: { tweet_id: "20" }, write: true },
  { name: "like", call: (a) => a.like("20"), path: "/client/like", body: { tweet_id: "20" }, write: true },
  { name: "unlike", call: (a) => a.unlike("20"), path: "/client/unlike", body: { tweet_id: "20" }, write: true },
  { name: "retweet", call: (a) => a.retweet("20"), path: "/client/retweet", body: { tweet_id: "20" }, write: true },
  { name: "unretweet", call: (a) => a.unretweet("20"), path: "/client/unretweet", body: { tweet_id: "20" }, write: true },
  { name: "pin", call: (a) => a.pin("20"), path: "/client/pin", body: { tweet_id: "20" }, write: true },
  { name: "unpin", call: (a) => a.unpin("20"), path: "/client/unpin", body: { tweet_id: "20" }, write: true },
  { name: "bookmark", call: (a) => a.bookmark("20"), path: "/client/bookmark", body: { tweet_id: "20" }, write: true },
  { name: "unbookmark", call: (a) => a.unbookmark("20"), path: "/client/unbookmark", body: { tweet_id: "20" }, write: true },
  { name: "bookmarks", call: (a) => a.bookmarks(), path: "/client/bookmarks", body: {}, write: false },
  {
    name: "bookmarks paged",
    call: (a) => a.bookmarks({ count: 50, cursor: "c1" }),
    path: "/client/bookmarks",
    body: { count: 50, cursor: "c1" },
    write: false,
  },
  { name: "bookmarkFolders", call: (a) => a.bookmarkFolders(), path: "/client/bookmarks/folders", body: {}, write: false },
  {
    name: "bookmarkFolders paged",
    call: (a) => a.bookmarkFolders({ cursor: "f2" }),
    path: "/client/bookmarks/folders",
    body: { cursor: "f2" },
    write: false,
  },
  {
    name: "bookmarkFolder",
    call: (a) => a.bookmarkFolder({ folderId: "1650000000000000000", cursor: "c" }),
    path: "/client/bookmarks/folder",
    body: { folder_id: "1650000000000000000", cursor: "c" },
    write: false,
  },
  {
    name: "searchBookmarks",
    call: (a) => a.searchBookmarks({ query: " typescript ", count: 100, cursor: "s" }),
    path: "/client/bookmarks/search",
    body: { query: "typescript", count: 100, cursor: "s" },
    write: false,
  },
  {
    name: "report",
    call: (a) => a.report({ tweetId: "20", userId: "12", reason: "SpamSimpleOption" }),
    path: "/client/report",
    body: { tweet_id: "20", user_id: "12", reason: "SpamSimpleOption" },
    write: true,
  },
  { name: "homeTimeline", call: (a) => a.homeTimeline(), path: "/client/home-timeline", body: {}, write: false },
  {
    name: "homeTimeline with options",
    call: (a) => a.homeTimeline({ count: 40, includePromotedContent: false }),
    path: "/client/home-timeline",
    body: { count: 40, include_promoted_content: false },
    write: false,
  },
  {
    name: "scheduledTweets",
    call: (a) => a.scheduledTweets({ ascending: false }),
    path: "/client/schedule-overview",
    body: { ascending: false },
    write: false,
  },
  {
    name: "deleteScheduledTweet",
    call: (a) => a.deleteScheduledTweet("99"),
    path: "/client/schedule-delete",
    body: { scheduled_tweet_id: "99" },
    write: true,
  },
  // media
  {
    name: "uploadImage (base64)",
    call: (a) => a.uploadImage({ media: "aGVsbG8=", mediaType: "image/png" }),
    path: "/client/media",
    body: { media: "aGVsbG8=", media_type: "image/png" },
    write: true,
  },
  {
    name: "uploadImage (bytes)",
    call: (a) => a.uploadImage({ media: PNG }),
    path: "/client/media",
    body: { media: PNG_B64 },
    write: true,
  },
  {
    name: "uploadVideo",
    call: (a) => a.uploadVideo({ media: Buffer.from("vid"), videoDurationMs: 12_000 }),
    path: "/client/media/video",
    body: { media: Buffer.from("vid").toString("base64"), video_duration_ms: 12_000 },
    write: true,
  },
  { name: "mediaStatus", call: (a) => a.mediaStatus("555"), path: "/client/media/status", body: { media_id: "555" }, write: false },
  // profile
  {
    name: "updateProfile",
    call: (a) =>
      a.updateProfile({
        name: "Ben",
        description: "bio",
        location: "Berlin",
        url: "https://example.com",
        birthdate: { day: 1, month: 2, year: 1990, visibility: "self", yearVisibility: "followers" },
      }),
    path: "/client/profile",
    body: {
      name: "Ben",
      description: "bio",
      location: "Berlin",
      url: "https://example.com",
      birthdate: { day: 1, month: 2, year: 1990, visibility: "self", year_visibility: "followers" },
    },
    write: true,
  },
  {
    name: "updateProfile remove birthdate",
    call: (a) => a.updateProfile({ birthdate: null }),
    path: "/client/profile",
    body: { birthdate: null },
    write: true,
  },
  {
    name: "updateProfileImage",
    call: (a) => a.updateProfileImage({ media: PNG }),
    path: "/client/profile/image",
    body: { media: PNG_B64 },
    write: true,
  },
  {
    name: "updateProfileBanner",
    call: (a) => a.updateProfileBanner({ media: "YmFubmVy", mediaType: "image/jpeg" }),
    path: "/client/profile/banner",
    body: { media: "YmFubmVy", media_type: "image/jpeg" },
    write: true,
  },
  // users
  { name: "follow by id", call: (a) => a.follow({ userId: "12" }), path: "/client/follow", body: { user_id: "12" }, write: true },
  {
    name: "follow by username",
    call: (a) => a.follow({ username: "@jack" }),
    path: "/client/follow",
    body: { username: "jack" },
    write: true,
  },
  { name: "unfollow", call: (a) => a.unfollow({ username: "jack" }), path: "/client/unfollow", body: { username: "jack" }, write: true },
  { name: "mute", call: (a) => a.mute({ userId: "12" }), path: "/client/mute", body: { user_id: "12" }, write: true },
  { name: "unmute", call: (a) => a.unmute({ username: "jack" }), path: "/client/unmute", body: { username: "jack" }, write: true },
  { name: "block", call: (a) => a.block({ userId: "12" }), path: "/client/block", body: { user_id: "12" }, write: true },
  { name: "unblock", call: (a) => a.unblock({ username: "jack" }), path: "/client/unblock", body: { username: "jack" }, write: true },
  // account-only reads
  { name: "likes", call: (a) => a.likes(), path: "/client/likes", body: {}, write: false },
  {
    name: "likes with userId",
    call: (a) => a.likes({ userId: "4242", count: 100, cursor: "l" }),
    path: "/client/likes",
    body: { user_id: "4242", count: 100, cursor: "l" },
    write: false,
  },
  { name: "blocked", call: (a) => a.blocked({ cursor: "b" }), path: "/client/blocked", body: { cursor: "b" }, write: false },
  { name: "muted", call: (a) => a.muted({ count: 10 }), path: "/client/muted", body: { count: 10 }, write: false },
  {
    name: "followersYouKnow",
    call: (a) => a.followersYouKnow({ username: "jack", count: 20 }),
    path: "/client/followers-you-know",
    body: { username: "jack", count: 20 },
    write: false,
  },
  // lists
  {
    name: "lists.create",
    call: (a) => a.lists.create({ name: "Friends", description: "d", private: true }),
    path: "/client/lists/create",
    body: { name: "Friends", description: "d", private: true },
    write: true,
  },
  {
    name: "lists.update",
    call: (a) => a.lists.update({ listId: "9", private: false }),
    path: "/client/lists/update",
    body: { list_id: "9", private: false },
    write: true,
  },
  { name: "lists.delete", call: (a) => a.lists.delete("9"), path: "/client/lists/delete", body: { list_id: "9" }, write: true },
  {
    name: "lists.addMember",
    call: (a) => a.lists.addMember({ listId: "9", username: "jack" }),
    path: "/client/lists/members/add",
    body: { list_id: "9", username: "jack" },
    write: true,
  },
  {
    name: "lists.removeMember",
    call: (a) => a.lists.removeMember({ listId: "9", userId: "12" }),
    path: "/client/lists/members/remove",
    body: { list_id: "9", user_id: "12" },
    write: true,
  },
  // communities
  {
    name: "communities.create",
    call: (a) =>
      a.communities.create({ name: "Testers", description: "d", joinPolicy: "Open", invitesPolicy: "MemberInvitesAllowed", question: "?" }),
    path: "/client/communities/create",
    body: { name: "Testers", description: "d", joinPolicy: "Open", invitesPolicy: "MemberInvitesAllowed", question: "?" },
    write: true,
  },
  {
    name: "communities.delete",
    call: (a) => a.communities.delete({ communityId: "77", name: "Testers" }),
    path: "/client/communities/remove",
    body: { community_id: "77", name: "Testers" },
    write: true,
  },
  { name: "communities.join", call: (a) => a.communities.join("77"), path: "/client/communities/join", body: { community_id: "77" }, write: true },
  {
    name: "communities.leave",
    call: (a) => a.communities.leave("77"),
    path: "/client/communities/leave",
    body: { community_id: "77" },
    write: true,
  },
  { name: "communities.memberships", call: (a) => a.communities.memberships(), path: "/client/communities/memberships", body: {}, write: false },
  {
    name: "communities.memberships paged",
    call: (a) => a.communities.memberships({ cursor: "m2" }),
    path: "/client/communities/memberships",
    body: { cursor: "m2" },
    write: false,
  },
  // drafts
  { name: "drafts.list", call: (a) => a.drafts.list(), path: "/client/drafts", body: {}, write: false },
  {
    name: "drafts.list ascending",
    call: (a) => a.drafts.list({ ascending: true }),
    path: "/client/drafts",
    body: { ascending: true },
    write: false,
  },
  {
    name: "drafts.create",
    call: (a) => a.drafts.create({ text: "draft", mediaIds: ["3"] }),
    path: "/client/drafts/create",
    body: { text: "draft", media_ids: ["3"] },
    write: true,
  },
  {
    name: "drafts.edit",
    call: (a) => a.drafts.edit({ draftTweetId: "8", text: "new" }),
    path: "/client/drafts/edit",
    body: { draft_tweet_id: "8", text: "new" },
    write: true,
  },
  { name: "drafts.delete", call: (a) => a.drafts.delete("8"), path: "/client/drafts/delete", body: { draft_tweet_id: "8" }, write: true },
  // articles
  { name: "articles.list", call: (a) => a.articles.list(), path: "/client/articles", body: {}, write: false },
  {
    name: "articles.list with options",
    call: (a) => a.articles.list({ lifecycle: "published", count: 50, cursor: "p", userId: "4242" }),
    path: "/client/articles",
    body: { lifecycle: "published", user_id: "4242", count: 50, cursor: "p" },
    write: false,
  },
  { name: "articles.get", call: (a) => a.articles.get("1800"), path: "/client/articles/get", body: { article_id: "1800" }, write: false },
  { name: "articles.create empty", call: (a) => a.articles.create(), path: "/client/articles/create", body: {}, write: true },
  {
    name: "articles.create text",
    call: (a) => a.articles.create({ title: "Notes", text: "One\nTwo" }),
    path: "/client/articles/create",
    body: { title: "Notes", text: "One\nTwo" },
    write: true,
  },
  {
    name: "articles.create contentState",
    call: (a) => a.articles.create({ contentState: { blocks: [{ key: "a1b2c", text: "Hi" }], entity_map: [] } }),
    path: "/client/articles/create",
    body: { content_state: { blocks: [{ key: "a1b2c", text: "Hi" }], entity_map: [] } },
    write: true,
  },
  {
    name: "articles.update",
    call: (a) => a.articles.update({ articleId: "1800", title: "New", coverMediaId: "555", coverMediaCategory: "DraftTweetGif" }),
    path: "/client/articles/update",
    body: { article_id: "1800", title: "New", cover_media_id: "555", cover_media_category: "DraftTweetGif" },
    write: true,
  },
  {
    name: "articles.update remove cover",
    call: (a) => a.articles.update({ articleId: "1800", removeCover: true }),
    path: "/client/articles/update",
    body: { article_id: "1800", remove_cover: true },
    write: true,
  },
  {
    name: "articles.publish",
    call: (a) => a.articles.publish("1800"),
    path: "/client/articles/publish",
    body: { article_id: "1800" },
    write: true,
  },
  {
    name: "articles.publish with options",
    call: (a) => a.articles.publish({ articleId: "1800", visibility: "public", replyControl: "verified", tweetText: "New article" }),
    path: "/client/articles/publish",
    body: { article_id: "1800", visibility: "public", reply_control: "verified", tweet_text: "New article" },
    write: true,
  },
  {
    name: "articles.unpublish",
    call: (a) => a.articles.unpublish("1800"),
    path: "/client/articles/unpublish",
    body: { article_id: "1800" },
    write: true,
  },
  { name: "articles.delete", call: (a) => a.articles.delete("1800"), path: "/client/articles/delete", body: { article_id: "1800" }, write: true },
  // DMs (the session's passcode is "0420")
  { name: "dm.inbox", call: (a) => a.dm.inbox(), path: "/client/dm/inbox", body: { passcode: "0420" }, write: false },
  {
    name: "dm.inbox with count and passcode",
    call: (a) => a.dm.inbox({ count: 50, passcode: "9999" }),
    path: "/client/dm/inbox",
    body: { passcode: "9999", count: 50 },
    write: false,
  },
  {
    name: "dm.conversation",
    call: (a) => a.dm.conversation({ conversationId: "12:4242", cursor: "123" }),
    path: "/client/dm/conversation",
    body: { conversation_id: "12:4242", passcode: "0420", cursor: "123" },
    write: false,
  },
  {
    name: "dm.conversationInfo",
    call: (a) => a.dm.conversationInfo({ userId: "12" }),
    path: "/client/dm/conversation/info",
    body: { user_id: "12" },
    write: false,
  },
  {
    name: "dm.setDisappearing",
    call: (a) => a.dm.setDisappearing({ userId: "12", ttlSeconds: 86_400 }),
    path: "/client/dm/conversation/disappearing",
    body: { user_id: "12", passcode: "0420", ttl_seconds: 86_400 },
    write: true,
  },
  {
    name: "dm.send",
    call: (a) => a.dm.send({ userId: "12", text: "hello" }),
    path: "/client/dm/send",
    body: { user_id: "12", passcode: "0420", text: "hello" },
    write: true,
  },
  { name: "dm.settings", call: (a) => a.dm.settings(), path: "/client/dm/settings", body: {}, write: false },
  {
    name: "dm.updateSettings",
    call: (a) => a.dm.updateSettings({ allowDmsFrom: "verified", avCallsEnabled: false, acceptCallsFromAddressbook: true }),
    path: "/client/dm/settings/update",
    body: { allow_dms_from: "verified", av_calls_enabled: false, accept_calls_from_addressbook: true },
    write: true,
  },
];

describe("account methods build the right request", () => {
  for (const tc of cases) {
    it(tc.name, async () => {
      const { client, calls } = makeClient([json(RAW_OK)]);
      const result = await tc.call(client.account(SESSION));
      assert.deepEqual(result, RAW_OK);
      assert.equal(calls.length, 1);
      const call = calls[0]!;
      assert.equal(call.method, "POST");
      assert.equal(call.url.pathname, tc.path);
      assert.deepEqual(Object.fromEntries(call.url.searchParams), {});
      assert.equal(call.headers["content-type"], "application/json");
      assert.equal(call.headers["x-api-key"], "test-key");
      assert.deepEqual(JSON.parse(call.body!), { cookie: COOKIE, proxy: PROXY, ...tc.body });
    });
  }

  it("covers every account route", () => {
    const paths = new Set(cases.map((c) => c.path));
    assert.equal(paths.size, 63);
  });
});

describe("account retries", () => {
  for (const tc of cases) {
    it(`${tc.name}: ${tc.write ? "not retried" : "retried"} on 5xx by default`, async () => {
      const { client, calls } = makeClient([json({ error: "boom" }, 500), json(RAW_OK)]);
      const p = tc.call(client.account(SESSION));
      if (tc.write) {
        await assert.rejects(p, ServerError);
        assert.equal(calls.length, 1);
      } else {
        assert.deepEqual(await p, RAW_OK);
        assert.equal(calls.length, 2);
      }
    });
  }

  it("a write is retried when maxRetries is passed", async () => {
    const { client, calls } = makeClient([json({ error: "boom" }, 503), json(RAW_OK)]);
    assert.deepEqual(await client.account(S).like("1", { maxRetries: 1 }), RAW_OK);
    assert.equal(calls.length, 2);
  });
});

describe("account options", () => {
  it("adds format=simple on a simple client", async () => {
    const { client, calls } = makeClient([json({ data: { success: true } })], { format: "simple" });
    const res: SimpleActionResponse = await client.account(S).like("1");
    assert.deepEqual(res, { data: { success: true } });
    // the raw format on a simple client is typed as the wrapper
    const raw: AccountRawResponse = await client.account(S).like("1", { format: "raw" });
    assert.ok(raw);
    assert.equal(calls[0]!.url.searchParams.get("format"), "simple");
  });

  it("adds format=simple per call", async () => {
    const { client, calls } = makeClient([json({ data: { success: true } })]);
    await client.account(S).bookmark("1", { format: "simple" });
    assert.equal(calls[0]!.url.searchParams.get("format"), "simple");
  });

  it("uploadVideo waits longer by default and honours timeoutMs", async () => {
    let seen = 0;
    const slow = (ms: number) => (call: RecordedCall) =>
      new Promise<Response>((resolve, reject) => {
        seen++;
        const timer = setTimeout(() => resolve(json(RAW_OK)), ms);
        call.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        });
      });
    const { client } = makeClient([slow(80)], { timeoutMs: 20 });
    const me = client.account(S);
    assert.deepEqual(await me.uploadVideo({ media: "dmlk", videoDurationMs: 1000 }), RAW_OK);
    await assert.rejects(me.uploadVideo({ media: "dmlk", videoDurationMs: 1000 }, { timeoutMs: 20 }), TimeoutError);
    await assert.rejects(me.uploadImage({ media: "aW1n" }), TimeoutError);
    assert.equal(seen, 3);
  });

  it("methods work when detached from the account", async () => {
    const { client, calls } = makeClient([json(RAW_OK)]);
    const { like } = client.account(S);
    await like("7");
    assert.equal(calls[0]!.url.pathname, "/client/like");
  });

  it("exposes the account ID from twid", () => {
    const { client } = makeClient();
    assert.equal(client.account(S).userId, "4242");
    assert.equal(client.account(S).lists.userId, "4242");
    assert.equal(client.account({ cookie: "auth_token=a; ct0=b; twid=\"u=77\"", proxy: PROXY }).userId, "77");
    assert.equal(client.account({ cookie: "auth_token=a; ct0=b", proxy: PROXY }).userId, undefined);
  });
});

describe("account session is never exposed", () => {
  const secrets = ["secret-auth", "secret-ct0", "puser", "ppass", "10.0.0.1", "0420"];
  const check = (text: string) => {
    for (const s of secrets) assert.ok(!text.includes(s), `leaked ${s} in ${text}`);
  };

  it("masks the session in inspect, toString, JSON and template strings", () => {
    const { client } = makeClient();
    const me = client.account(SESSION);
    for (const obj of [me, me.lists, me.communities, me.drafts, me.articles, me.dm]) {
      check(inspect(obj, { depth: 10, showHidden: true }));
      check(String(obj));
      check(`${obj}`);
      check(JSON.stringify(obj));
      check(JSON.stringify({ nested: obj }));
    }
    assert.match(String(me), /\[redacted\]/);
    assert.match(String(me), /4242/);
    check(inspect(client, { depth: 10 }));
    assert.deepEqual(Object.keys(me).filter((k) => /cookie|proxy|passcode|session/i.test(k)), []);
  });

  it("does not put the session in validation errors", async () => {
    const { client } = makeClient();
    const me = client.account(SESSION);
    const errs: unknown[] = [];
    for (const call of [() => me.like("x"), () => me.follow({} as never), () => me.dm.send({ userId: "1", text: "" })]) {
      try {
        await call();
      } catch (e) {
        errs.push(e);
      }
    }
    try {
      client.account({ cookie: "auth_token=secret-auth", proxy: PROXY });
    } catch (e) {
      errs.push(e);
    }
    assert.equal(errs.length, 4);
    for (const e of errs) {
      assert.ok(e instanceof ValidationError);
      check(String(e) + inspect(e));
    }
  });
});

describe("account argument validation (no request is sent)", () => {
  const badSessions: [string, unknown][] = [
    ["no session", undefined],
    ["empty cookie", { cookie: " ", proxy: PROXY }],
    ["empty proxy", { cookie: COOKIE, proxy: "" }],
    ["cookie without ct0", { cookie: "auth_token=a", proxy: PROXY }],
    ["cookie without auth_token", { cookie: "ct0=b", proxy: PROXY }],
    ["passcode not a string", { cookie: COOKIE, proxy: PROXY, passcode: 420 }],
  ];
  for (const [name, session] of badSessions) {
    it(name, () => {
      const { client } = makeClient();
      assert.throws(() => client.account(session as XSession), ValidationError);
    });
  }

  const noTwid = { cookie: "auth_token=a; ct0=b", proxy: PROXY, passcode: "1" };
  const bad: [string, (a: Account) => Promise<unknown>, XSession?][] = [
    ["createTweet empty text", (a) => a.createTweet({ text: " " })],
    ["createTweet without text", (a) => a.createTweet({} as never)],
    ["createTweet 5 media", (a) => a.createTweet({ text: "x", mediaIds: ["1", "2", "3", "4", "5"] })],
    ["createTweet bad media id", (a) => a.createTweet({ text: "x", mediaIds: ["abc"] })],
    ["createTweet bad mode", (a) => a.createTweet({ text: "x", conversationControlMode: "everyone" as never })],
    ["createTweet bad communityId", (a) => a.createTweet({ text: "x", communityId: "c" })],
    ["createTweet bad scheduleTime", (a) => a.createTweet({ text: "x", scheduleTime: -1 })],
    ["createTweet invalid Date", (a) => a.createTweet({ text: "x", scheduleTime: new Date("nope") })],
    ["poll 1 choice", (a) => a.createTweet({ text: "x", poll: { choices: ["A"] } })],
    ["poll 5 choices", (a) => a.createTweet({ text: "x", poll: { choices: ["A", "B", "C", "D", "E"] } })],
    ["poll empty choice", (a) => a.createTweet({ text: "x", poll: { choices: ["A", " "] } })],
    ["poll long choice", (a) => a.createTweet({ text: "x", poll: { choices: ["A", "B".repeat(26)] } })],
    ["poll short duration", (a) => a.createTweet({ text: "x", poll: { choices: ["A", "B"], durationMinutes: 4 } })],
    ["poll with media", (a) => a.createTweet({ text: "x", mediaIds: ["1"], poll: { choices: ["A", "B"] } })],
    ["poll with schedule", (a) => a.createTweet({ text: "x", scheduleTime: 2e9, poll: { choices: ["A", "B"] } })],
    ["poll long text", (a) => a.createTweet({ text: "x".repeat(281), poll: { choices: ["A", "B"] } })],
    ["reply bad tweetId", (a) => a.reply({ tweetId: "x", text: "y" })],
    ["reply empty text", (a) => a.reply({ tweetId: "1", text: "" })],
    ["like bad id", (a) => a.like("12a")],
    ["bookmarks count 101", (a) => a.bookmarks({ count: 101 })],
    ["report bad reason", (a) => a.report({ tweetId: "1", userId: "2", reason: "Rude" as never })],
    ["report username as userId", (a) => a.report({ tweetId: "1", userId: "jack", reason: "SpamSimpleOption" })],
    ["uploadImage empty", (a) => a.uploadImage({ media: "" })],
    ["uploadImage empty bytes", (a) => a.uploadImage({ media: new Uint8Array() })],
    ["uploadVideo no duration", (a) => a.uploadVideo({ media: "dmlk" } as never)],
    ["updateProfile nothing", (a) => a.updateProfile({})],
    ["updateProfile empty name", (a) => a.updateProfile({ name: " " })],
    ["updateProfile long bio", (a) => a.updateProfile({ description: "x".repeat(161) })],
    ["updateProfile bad birthdate", (a) => a.updateProfile({ birthdate: { day: 32, month: 1, year: 1990 } })],
    ["updateProfile bad visibility", (a) => a.updateProfile({ birthdate: { day: 1, month: 1, year: 1990, visibility: "all" as never } })],
    ["follow without user", (a) => a.follow({} as never)],
    ["follow bad userId", (a) => a.follow({ userId: "jack" })],
    ["likes without twid or userId", (a) => a.likes(), noTwid],
    ["followersYouKnow without user", (a) => a.followersYouKnow({} as never)],
    ["lists.create empty name", (a) => a.lists.create({ name: "" })],
    ["lists.create long name", (a) => a.lists.create({ name: "x".repeat(26) })],
    ["lists.update nothing", (a) => a.lists.update({ listId: "1" })],
    ["lists.update bad id", (a) => a.lists.update({ listId: "x", name: "n" })],
    ["lists.addMember without user", (a) => a.lists.addMember({ listId: "1" } as never)],
    ["communities.create no name", (a) => a.communities.create({} as never)],
    ["communities.delete no name", (a) => a.communities.delete({ communityId: "1" } as never)],
    ["communities.join bad id", (a) => a.communities.join("c")],
    ["drafts.create empty", (a) => a.drafts.create({})],
    ["drafts.edit bad id", (a) => a.drafts.edit({ draftTweetId: "x", text: "t" })],
    ["bookmarkFolder no folderId", (a) => a.bookmarkFolder({} as never)],
    ["bookmarkFolder bad folderId", (a) => a.bookmarkFolder({ folderId: "abc" })],
    ["searchBookmarks empty query", (a) => a.searchBookmarks({ query: " " })],
    ["searchBookmarks long query", (a) => a.searchBookmarks({ query: "é".repeat(501) })],
    ["searchBookmarks count 0", (a) => a.searchBookmarks({ query: "x", count: 0 })],
    ["searchBookmarks count 101", (a) => a.searchBookmarks({ query: "x", count: 101 })],
    ["articles.list without twid or userId", (a) => a.articles.list(), noTwid],
    ["articles.list bad lifecycle", (a) => a.articles.list({ lifecycle: "archived" as never })],
    ["articles.list bad userId", (a) => a.articles.list({ userId: "jack" })],
    ["articles.list count 101", (a) => a.articles.list({ count: 101 })],
    ["articles.get bad id", (a) => a.articles.get("x")],
    ["articles.create text and contentState", (a) => a.articles.create({ text: "a", contentState: { blocks: [], entity_map: [] } })],
    ["articles.create bad contentState", (a) => a.articles.create({ contentState: { blocks: "x" } as never })],
    ["articles.create contentState without entity_map", (a) => a.articles.create({ contentState: { blocks: [] } as never })],
    ["articles.create title not a string", (a) => a.articles.create({ title: 1 as never })],
    ["articles.update nothing", (a) => a.articles.update({ articleId: "1" })],
    ["articles.update only removeCover false", (a) => a.articles.update({ articleId: "1", removeCover: false })],
    ["articles.update bad id", (a) => a.articles.update({ articleId: "x", title: "t" })],
    ["articles.update text and contentState", (a) => a.articles.update({ articleId: "1", text: "a", contentState: { blocks: [], entity_map: [] } })],
    ["articles.update bad coverMediaId", (a) => a.articles.update({ articleId: "1", coverMediaId: "img" })],
    ["articles.update bad category", (a) => a.articles.update({ articleId: "1", coverMediaId: "5", coverMediaCategory: "Image" as never })],
    ["articles.update cover and removeCover", (a) => a.articles.update({ articleId: "1", coverMediaId: "5", removeCover: true })],
    ["articles.publish bad id", (a) => a.articles.publish({ articleId: "x" })],
    ["articles.publish bad visibility", (a) => a.articles.publish({ articleId: "1", visibility: "private" as never })],
    ["articles.publish bad replyControl", (a) => a.articles.publish({ articleId: "1", replyControl: "everyone" as never })],
    ["articles.publish long tweetText", (a) => a.articles.publish({ articleId: "1", tweetText: "x".repeat(257) })],
    ["articles.unpublish bad id", (a) => a.articles.unpublish("")],
    ["articles.delete bad id", (a) => a.articles.delete("1.5")],
    ["dm without twid", (a) => a.dm.settings(), noTwid],
    ["dm.inbox count 51", (a) => a.dm.inbox({ count: 51 })],
    ["dm.conversation no target", (a) => a.dm.conversation({} as never)],
    ["dm.conversation bad cursor", (a) => a.dm.conversation({ userId: "1", cursor: "abc" })],
    ["dm.conversation bad id", (a) => a.dm.conversation({ conversationId: "a b" })],
    ["dm.send no passcode", (a) => a.dm.send({ userId: "1", text: "hi" }), S],
    ["dm.send numeric passcode", (a) => a.dm.send({ userId: "1", text: "hi", passcode: 420 as never }), S],
    ["dm.send empty text", (a) => a.dm.send({ userId: "1", text: " " })],
    ["dm.send long text", (a) => a.dm.send({ userId: "1", text: "x".repeat(10_001) })],
    ["dm.setDisappearing ttl 30", (a) => a.dm.setDisappearing({ userId: "1", ttlSeconds: 30 })],
    ["dm.updateSettings nothing", (a) => a.dm.updateSettings({})],
    ["dm.updateSettings bad value", (a) => a.dm.updateSettings({ allowDmsFrom: "All Users" })],
  ];
  for (const [name, call, session] of bad) {
    it(name, async () => {
      const { client, calls } = makeClient();
      await assert.rejects(call(client.account(session ?? SESSION)), ValidationError);
      assert.equal(calls.length, 0);
    });
  }

  it("dm.setDisappearing accepts 0 (off)", async () => {
    const { client, calls } = makeClient([json({})]);
    await client.account(SESSION).dm.setDisappearing({ conversationId: "1:2", ttlSeconds: 0 });
    assert.equal(JSON.parse(calls[0]!.body!).ttl_seconds, 0);
  });
});

describe("account responses", () => {
  const page = (ids: string[], bottom?: string) => ({
    data: {
      bookmark_timeline_v2: {
        timeline: {
          instructions: [
            {
              type: "TimelineAddEntries",
              entries: [
                ...ids.map((id) => ({ entryId: `tweet-${id}`, content: {} })),
                ...(bottom ? [{ entryId: "cursor-bottom-1", content: { cursorType: "Bottom", value: bottom } }] : []),
              ],
            },
          ],
        },
      },
    },
  });
  const wrap = (body: unknown) => ({ status_code: 200, response: JSON.stringify(body) });

  it("parseAccountResponse unwraps the response string", () => {
    assert.deepEqual(parseAccountResponse(wrap({ a: 1 })), { a: 1 });
    assert.deepEqual(parseAccountResponse({ status_code: 200, response: "not json" }), {
      status_code: 200,
      response: "not json",
    });
    assert.deepEqual(parseAccountResponse({ data: 1 }), { data: 1 });
    assert.equal(extractBottomCursor(wrap(page(["1"], "next"))), "next");
  });

  it("paginate follows cursors inside the wrapper", async () => {
    const { client, calls } = makeClient([json(wrap(page(["1"], "c2"))), json(wrap(page(["2"])))]);
    const me = client.account(S);
    const pages = [];
    for await (const p of client.paginate(me.bookmarks, {}, { maxPages: 5 })) pages.push(p);
    assert.equal(pages.length, 2);
    assert.equal(pages[0]!.nextCursor, "c2");
    assert.equal(JSON.parse(calls[1]!.body!).cursor, "c2");
  });

  it("paginate works with the new paginated account reads", async () => {
    const { client, calls } = makeClient([json(wrap(page(["1"], "c2"))), json(wrap(page(["2"])))]);
    const me = client.account(S);
    const pages = [];
    for await (const p of client.paginate(me.searchBookmarks, { query: "ts" }, { maxPages: 5 })) pages.push(p);
    assert.equal(pages.length, 2);
    assert.deepEqual(JSON.parse(calls[1]!.body!), { cookie: COOKIE, proxy: PROXY, query: "ts", cursor: "c2" });
    // type-level: the cursor-only and folder reads are accepted by paginate
    void client.paginate(me.bookmarkFolders, {});
    void client.paginate(me.bookmarkFolder, { folderId: "1" });
    void client.paginate(me.communities.memberships, {});
    void client.paginate(me.articles.list, {});
  });

  it("Account can be constructed directly", async () => {
    const { client, calls } = makeClient([json(RAW_OK)]);
    await new Account(client as TwittrAPI, S).like("1");
    assert.equal(calls.length, 1);
  });
});
