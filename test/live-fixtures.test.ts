// Tests against trimmed real TwittrAPI responses (test/fixtures/live/*.json, captured 2026-10-10).
// Each fixture is { request, capturedAt, response }; only `response` is the API body.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { countTimelineEntries, extractBottomCursor, extractCursors } from "../src/index.js";
import { json, makeClient } from "./helpers.js";

function live(name: string): Record<string, unknown> {
  const url = new URL(`../../test/fixtures/live/${name}.json`, import.meta.url);
  return (JSON.parse(readFileSync(url, "utf8")) as { response: Record<string, unknown> }).response;
}

/** Bottom cursor values in the fixtures, checked independently with a plain walk. */
const TIMELINES: Record<string, { bottomPrefix: string; topPrefix?: string }> = {
  "user-userid-tweets": { bottomPrefix: "DAAHCgABHUS5pXT__-wL", topPrefix: "DAAHCgABHUS5pXUAJxEL" },
  "user-userid-tweetsandreplies": { bottomPrefix: "DAAHCgABHUS5pvk__-sL" },
  "user-userid-media": { bottomPrefix: "DAABCgABHUS5qIC___0K" },
  "user-userid-articles": { bottomPrefix: "DAABCgABHUS5rv1___sK" },
  "user-userid-followers": { bottomPrefix: "1000000000000000000|2109014666", topPrefix: "-1|" },
  "user-userid-followings": { bottomPrefix: "1000000000000000000|2109014676", topPrefix: "-1|" },
  "user-userid-verifiedfollowers": { bottomPrefix: "1000000000000000000|2109014682", topPrefix: "-1|" },
  "lists-tweets": { bottomPrefix: "DAABCgABHUS7Mid__58K" },
  "lists-members": { bottomPrefix: "1000000000000000000|2109016359", topPrefix: "-1|" },
  "lists-followers": { bottomPrefix: "1000000000000000000|2109016363", topPrefix: "-1|" },
  "communities-communityid-tweets": { bottomPrefix: "DAAFCgABHUS5xm5__-oL" },
  "tweet-tweetid-retweets": { bottomPrefix: "HBaAgIC+kLf1iDQAAA==" },
  "tweet-tweetid-quotes": { bottomPrefix: "DAACCgACHUS5wrfAJxAK" },
  "tweet-tweetid": { bottomPrefix: "DAAKCgABHUS5u-s__qkL" },
  "tweet-tweetid-article": { bottomPrefix: "DAAKCgABHUS5vqW__qkL" },
  search: { bottomPrefix: "DAADDAABCgABHUS5rRGX0YcKAAIdRL" },
};

describe("live fixtures: cursor extraction", () => {
  for (const [name, expected] of Object.entries(TIMELINES)) {
    it(`${name}: Bottom cursor is the next page`, () => {
      const data = live(name);
      const { next, previous } = extractCursors(data);
      assert.ok(next?.startsWith(expected.bottomPrefix), `next=${next}`);
      if (expected.topPrefix) assert.ok(previous?.startsWith(expected.topPrefix), `previous=${previous}`);
      assert.notEqual(next, previous);
      const counts = countTimelineEntries(data);
      assert.ok(counts.items > 0 && counts.cursors > 0, JSON.stringify(counts));
    });
  }

  it("followers: Bottom comes before Top and Top is never used as next", () => {
    const { next, previous } = extractCursors(live("user-userid-followers"));
    assert.ok(next?.startsWith("1000000000000000000|"));
    assert.ok(previous?.startsWith("-1|"));
  });

  it("search wrapper {category, entries}", () => {
    const data = live("search");
    assert.equal(data.category, "Latest");
    assert.ok(Array.isArray(data.entries));
    assert.ok(extractBottomCursor(data));
  });

  it("slice responses use slice_info.next_cursor", () => {
    assert.equal(
      extractBottomCursor(live("communities-search-searchterm")),
      "WzExMy41ODc5MSwxODk3OTI3NDQxNDQxNTEzNzE4XQ==",
    );
    assert.ok(extractBottomCursor(live("communities-communityid-members"))?.startsWith("CycRAAAAAAwABAwK"));
    assert.equal(extractBottomCursor(live("jobs-search-searchterm")), "WzMuNDcwMjg4OCwiMCIsIjE4MTMwMzEwNDExNTE3Mzc4NTgiXQ==");
    assert.ok(countTimelineEntries(live("jobs-search-searchterm")).items > 0);
  });

  it("moderators slice without next_cursor has no next page", () => {
    assert.equal(extractBottomCursor(live("communities-communityid-moderators")), undefined);
  });

  it("empty likes and favorites timelines have no cursor and no items", () => {
    for (const name of ["user-userid-likes", "tweet-tweetid-favorites"]) {
      assert.equal(extractBottomCursor(live(name)), undefined, name);
      assert.deepEqual(countTimelineEntries(live(name)), { items: 0, cursors: 0 }, name);
    }
  });

  it("articles with an empty tweet_results entry still yield the cursor", () => {
    const data = structuredClone(live("user-userid-articles"));
    const instr = (data as any).data.user.result.timeline.timeline.instructions[0];
    instr.entries.unshift({
      entryId: "tweet-1",
      content: { entryType: "TimelineTimelineItem", itemContent: { itemType: "TimelineTweet", tweet_results: {} } },
    });
    assert.ok(extractBottomCursor(data)?.startsWith("DAABCgABHUS5rv1___sK"));
  });
});

describe("live fixtures: paginate", () => {
  it("stops after one page on empty likes", async () => {
    const { client, calls } = makeClient([json(live("user-userid-likes"))]);
    const pages = [];
    for await (const p of client.paginate(client.users.followers, { userId: "2244994945" }, { maxPages: 5 })) pages.push(p);
    assert.equal(pages.length, 1);
    assert.equal(pages[0]!.nextCursor, undefined);
    assert.equal(calls.length, 1);
  });

  it("stops after one page on empty favorites", async () => {
    const { client, calls } = makeClient([json(live("tweet-tweetid-favorites"))]);
    const pages = [];
    for await (const p of client.paginate(client.tweets.likers, { tweetId: "2019881223666233717" }, { maxPages: 5 })) {
      pages.push(p);
    }
    assert.equal(pages.length, 1);
    assert.equal(calls.length, 1);
  });

  it("follows the followers Bottom cursor, then stops on a cursor-only page", async () => {
    const first = live("user-userid-followers");
    const next = extractBottomCursor(first)!;
    const cursorOnly = {
      data: {
        user: {
          result: {
            timeline: {
              timeline: {
                instructions: [
                  {
                    type: "TimelineAddEntries",
                    entries: [
                      { entryId: "cursor-bottom-9", content: { cursorType: "Bottom", value: "later" } },
                      { entryId: "cursor-top-9", content: { cursorType: "Top", value: "-1|9" } },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    };
    const { client, calls } = makeClient([json(first), json(cursorOnly)]);
    const pages = [];
    for await (const p of client.paginate(client.users.followers, { userId: "2244994945", count: 20 }, { maxPages: 5 })) {
      pages.push(p);
    }
    assert.equal(pages.length, 2);
    assert.equal(calls[1]!.url.searchParams.get("cursor"), next);
    assert.equal(calls[1]!.url.searchParams.get("count"), "20");
  });

  it("stops on a slice page with next_cursor but no items", async () => {
    const first = live("communities-search-searchterm");
    const empty = {
      data: { communities_search_slice: { items_results: [], slice_info: { next_cursor: "again" } } },
    };
    const { client, calls } = makeClient([json(first), json(empty), json(first)]);
    const pages = [];
    for await (const p of client.paginate(client.communities.search, { query: "openai" }, { maxPages: 5 })) pages.push(p);
    assert.equal(pages.length, 2);
    assert.equal(calls.length, 2);
  });
});
