import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countTimelineEntries, extractBottomCursor, extractCursors, paginate } from "../src/index.js";
import { json, makeClient, timeline } from "./helpers.js";

describe("cursor extraction", () => {
  it("finds Bottom and Top cursors in timeline entries", () => {
    assert.deepEqual(extractCursors(timeline(["1", "2"], "next-1", "prev-1")), { next: "next-1", previous: "prev-1" });
  });

  it("returns undefined when there is no bottom cursor", () => {
    assert.equal(extractBottomCursor(timeline(["1"])), undefined);
    assert.equal(extractBottomCursor({}), undefined);
    assert.equal(extractBottomCursor(null), undefined);
    assert.equal(extractBottomCursor("text"), undefined);
  });

  it("finds cursors in TimelineReplaceEntry instructions", () => {
    const data = {
      data: {
        timeline: {
          instructions: [
            { type: "TimelineAddEntries", entries: [{ entryId: "tweet-1", content: {} }] },
            {
              type: "TimelineReplaceEntry",
              entry_id_to_replace: "cursor-bottom-0",
              entry: { entryId: "cursor-bottom-0", content: { cursorType: "Bottom", value: "replaced" } },
            },
          ],
        },
      },
    };
    assert.equal(extractBottomCursor(data), "replaced");
  });

  it("finds a cursor-bottom- entry without cursorType (itemContent.value)", () => {
    const data = { entries: [{ entryId: "cursor-bottom-123", content: { itemContent: { value: "deep" } } }] };
    assert.equal(extractBottomCursor(data), "deep");
  });

  it("finds cursorType Bottom nested under itemContent", () => {
    const data = {
      entries: [{ entryId: "x-1", content: { itemContent: { itemType: "TimelineTimelineCursor", cursorType: "Bottom", value: "ic" } } }],
    };
    assert.equal(extractBottomCursor(data), "ic");
  });

  it("falls back to next_cursor fields", () => {
    assert.equal(extractBottomCursor({ next_cursor: "nc" }), "nc");
    assert.equal(extractBottomCursor({ meta: { nextCursor: "nc2" } }), "nc2");
    assert.equal(extractBottomCursor({ next_cursor: "0" }), undefined);
  });

  it("prefers a real Bottom cursor over next_cursor", () => {
    assert.equal(extractBottomCursor({ next_cursor: "nc", ...timeline(["1"], "bottom") }), "bottom");
  });

  it("returns the first Bottom cursor in document order", () => {
    const data = { a: { cursorType: "Bottom", value: "first" }, b: { cursorType: "Bottom", value: "second" } };
    assert.equal(extractBottomCursor(data), "first");
  });

  it("counts result and cursor entries", () => {
    assert.deepEqual(countTimelineEntries(timeline(["1", "2", "3"], "b")), { items: 3, cursors: 2 });
    assert.deepEqual(countTimelineEntries({}), { items: 0, cursors: 0 });
  });
});

describe("pagination", () => {
  it("follows bottom cursors until none is left", async () => {
    const { client, calls } = makeClient([
      json(timeline(["1", "2"], "c1")),
      json(timeline(["3", "4"], "c2")),
      json(timeline(["5"])),
    ]);
    const pages = [];
    for await (const page of client.paginate(client.users.followers, { username: "jack", count: 2 })) pages.push(page);
    assert.equal(pages.length, 3);
    assert.deepEqual(
      pages.map((p) => [p.pageNumber, p.cursor, p.nextCursor]),
      [
        [1, undefined, "c1"],
        [2, "c1", "c2"],
        [3, "c2", undefined],
      ],
    );
    assert.deepEqual(
      calls.map((c) => c.url.searchParams.get("cursor")),
      [null, "c1", "c2"],
    );
    assert.ok(calls.every((c) => c.url.pathname === "/user/-1/followers" && c.url.searchParams.get("count") === "2"));
  });

  it("stops at maxPages", async () => {
    let n = 0;
    const { client, calls } = makeClient([() => json(timeline([String(++n)], `c${n}`))]);
    const pages = [];
    for await (const page of client.paginate(client.search.tweets, { query: "x" }, { maxPages: 3 })) pages.push(page);
    assert.equal(pages.length, 3);
    assert.equal(calls.length, 3);
  });

  it("defaults to 10 pages", async () => {
    let n = 0;
    const { client, calls } = makeClient([() => json(timeline([String(++n)], `c${n}`))]);
    for await (const _ of client.paginate(client.lists.tweets, { listId: "1" })) void _;
    assert.equal(calls.length, 10);
  });

  it("stops when the cursor repeats", async () => {
    const { client, calls } = makeClient([json(timeline(["1"], "same"))]);
    const pages = [];
    for await (const page of client.paginate(client.tweets.quotes, { tweetId: "9" }, { maxPages: 50 })) pages.push(page);
    assert.equal(pages.length, 2);
    assert.equal(calls.length, 2);
  });

  it("stops on a page that only contains cursors", async () => {
    const { client, calls } = makeClient([json(timeline(["1"], "c1")), json(timeline([], "c2")), json(timeline(["2"], "c3"))]);
    const pages = [];
    for await (const page of client.paginate(client.users.tweets, { userId: "1" })) pages.push(page);
    assert.equal(pages.length, 2);
    assert.equal(calls.length, 2);
  });

  it("starts from a given cursor", async () => {
    const { client, calls } = makeClient([json(timeline(["1"]))]);
    for await (const _ of client.paginate(client.communities.tweets, { communityId: "5", cursor: "start" })) void _;
    assert.equal(calls[0]!.url.searchParams.get("cursor"), "start");
  });

  it("can be stopped early with break", async () => {
    let n = 0;
    const { client, calls } = makeClient([() => json(timeline([String(++n)], `c${n}`))]);
    for await (const page of client.paginate(client.users.followers, { userId: "1" }, { maxPages: 100 })) {
      if (page.pageNumber === 2) break;
    }
    assert.equal(calls.length, 2);
  });

  it("passes request options (signal) to every page", async () => {
    const { client, calls } = makeClient([json(timeline(["1"], "c1")), json(timeline(["2"]))]);
    const ac = new AbortController();
    for await (const _ of client.paginate(client.users.followers, { userId: "1" }, { signal: ac.signal })) void _;
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => c.signal instanceof AbortSignal));
  });

  it("works as a standalone function and propagates errors", async () => {
    const { client } = makeClient([json(timeline(["1"], "c1")), json({ error: "gone" }, 404)]);
    const seen: number[] = [];
    await assert.rejects(async () => {
      for await (const page of paginate(client.users.followers, { userId: "1" })) seen.push(page.pageNumber);
    }, /404 gone/);
    assert.deepEqual(seen, [1]);
  });

  it("maxPages 0 fetches nothing", async () => {
    const { client, calls } = makeClient();
    for await (const _ of client.paginate(client.users.followers, { userId: "1" }, { maxPages: 0 })) void _;
    assert.equal(calls.length, 0);
  });
});
