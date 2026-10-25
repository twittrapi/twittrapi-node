<p align="center">
  <a href="https://twittrapi.com"><img src=".github/banner.png" alt="twittrapi-node: Node.js and TypeScript SDK for Twitter/X data, no runtime dependencies" width="100%"></a>
</p>

# twittrapi – Twitter/X API client for Node.js and TypeScript

[![npm](https://img.shields.io/npm/v/twittrapi.svg)](https://www.npmjs.com/package/twittrapi) [![CI](https://github.com/twittrapi/twittrapi-node/actions/workflows/ci.yml/badge.svg)](https://github.com/twittrapi/twittrapi-node/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Official Node.js and TypeScript SDK for [TwittrAPI](https://twittrapi.com), a REST API for public Twitter/X data:
tweets, profiles, followers, search, lists and communities. From $0.065 per 1,000 calls, no X developer account.
It can also post, like, follow and send DMs as your own account (see [Account actions](#account-actions)).

> **Get an API key:** [twittrapi.com/start](https://twittrapi.com/start?utm_source=github&utm_medium=readme&utm_campaign=twittrapi-node) · [Pricing](https://twittrapi.com/pricing?utm_source=github&utm_medium=readme&utm_campaign=twittrapi-node) · [Docs](https://twittrapi.com/docs?utm_source=github&utm_medium=readme&utm_campaign=twittrapi-node) · [Status](https://twittrapi.com/status) · also available on [RapidAPI](https://rapidapi.com/viperscores-viperscores-default/api/twitter-aio)

**SDKs and integrations:** [Python](https://github.com/twittrapi/twittrapi-python) · [Go](https://github.com/twittrapi/twittrapi-go) · [MCP server](https://github.com/twittrapi/twittrapi-mcp) · [n8n](https://github.com/twittrapi/n8n-nodes-twittrapi) · [Make](https://www.make.com/en/hq/app-invitation/bfe92727f14ab2c74d3c2e74281d84b1) · [Apify](https://github.com/twittrapi/twittrapi-apify) · [LangChain](https://github.com/twittrapi/langchain-twittrapi) · [LlamaIndex](https://github.com/twittrapi/llama-index-tools-twittrapi) · [Agent skill](https://github.com/twittrapi/twittrapi-skills) · [Examples](https://github.com/twittrapi/twittrapi-examples)

- No runtime dependencies. Uses the built-in `fetch` (Node 18+).
- ESM and CommonJS, with type declarations.
- Retries, timeouts, `AbortSignal` support and typed errors.

Responses are X's raw GraphQL JSON, returned unchanged. The SDK does not reshape them yet, so the
return types are loose (`Record<string, unknown>`). Typed models may be added in a later version.

Not affiliated with X Corp.

## Install

```sh
npm install twittrapi
```

## Quickstart

Get an API key at [twittrapi.com](https://twittrapi.com), or subscribe to TwittrAPI on RapidAPI.

### Direct API key

```ts
import { TwittrAPI } from "twittrapi";

const client = new TwittrAPI({ apiKey: process.env.TWITTRAPI_API_KEY });

const user = await client.users.getByUsername("jack");
console.log(JSON.stringify(user, null, 2));
```

Requests go to `https://api.twittrapi.com` with the `X-API-KEY` header.

### RapidAPI key

```ts
import { TwittrAPI } from "twittrapi";

const client = new TwittrAPI({ rapidApiKey: process.env.RAPIDAPI_KEY });
```

Requests go to `https://twitter-aio.p.rapidapi.com` with `x-rapidapi-key` and `x-rapidapi-host`.

Subscribed to another TwittrAPI listing on RapidAPI? Set its host with
`rapidApiHost: "twttr.p.rapidapi.com"` or the `RAPIDAPI_HOST` environment variable.

### Keys from the environment

With no key in the options, the client reads `TWITTRAPI_API_KEY`, then `RAPIDAPI_KEY`:

```ts
const client = new TwittrAPI(); // uses TWITTRAPI_API_KEY or RAPIDAPI_KEY
```

If both a direct key and a RapidAPI key are available, the direct key is used. The constructor
throws an `AuthenticationError` when no key is found.

### CommonJS

```js
const { TwittrAPI } = require("twittrapi");
```

## Options

```ts
new TwittrAPI({
  apiKey: "...",         // direct API key (or TWITTRAPI_API_KEY)
  rapidApiKey: "...",    // RapidAPI key (or RAPIDAPI_KEY)
  rapidApiHost: "...",   // RapidAPI listing host (or RAPIDAPI_HOST), default twitter-aio.p.rapidapi.com
  baseUrl: "...",        // override the API base URL (direct mode also reads TWITTRAPI_BASE_URL)
  timeoutMs: 60_000,     // per attempt
  maxRetries: 2,         // for 429, 5xx, timeouts and network errors
  fetch: customFetch,    // any fetch-compatible function
  format: "raw",         // "raw" (default) or "simple", see Response format
});
```

Every method also takes request options as its last argument:

```ts
const controller = new AbortController();
await client.users.getById("12", { signal: controller.signal, timeoutMs: 10_000, maxRetries: 0 });
```

## Response format

By default every method returns X's raw JSON, unchanged. The API can also return the
[simple format](https://twittrapi.com/docs/simple-format): flat camelCase tweets, users, lists,
communities and trends with a fixed schema, about 60 % smaller. Same price, same parameters.

Set it for the whole client, or per call with `{ format }` (the per-call option wins):

```ts
import { TwittrAPI, isUnavailableTweet } from "twittrapi";

const client = new TwittrAPI({ format: "simple" });

const { data: user } = await client.users.getByUsername("XDevelopers"); // SimpleUser | null
console.log(user?.username, user?.counts.followers);

const page = await client.users.tweets({ username: "XDevelopers" }); // SimplePage<SimpleTweet | ...>
for (const tweet of page.data) {
  if (isUnavailableTweet(tweet)) continue; // { id, unavailable: true } for deleted or withheld tweets
  console.log(tweet.createdAt, tweet.text, tweet.counts.likes);
}
if (page.hasNextPage) await client.users.tweets({ username: "XDevelopers", cursor: page.nextCursor! });

// Raw JSON for one call on a simple client, or simple for one call on a raw client:
await client.users.tweets({ userId: "12" }, { format: "raw" });
await new TwittrAPI().users.getById("12", { format: "simple" });
```

The return types follow the format: `SimpleTweet`, `SimpleUser`, `SimpleList`, `SimpleCommunity`,
`SimpleTrend` and `SimpleTrendLocation`, wrapped in `SimplePage<T>` (`data`, `nextCursor`,
`previousCursor`, `hasNextPage`) for lists or `SimpleSingle<T>` (`data`) for single objects.
`format=simple` is added to the query string only when the simple format is selected.

## Usage

Methods that take a user accept either `userId` (faster) or `username`. A leading `@` is fine.
Paginated methods take `count` (1 to 100, default 20) and `cursor`.

### Users

```ts
await client.users.getByUsername("jack");
await client.users.getById("12");
await client.users.usernameToId("jack");
await client.users.getMany(["12", "13", "783214"]); // up to 500 IDs

await client.users.tweets({ username: "jack", count: 50 });
await client.users.tweetsAndReplies({ userId: "12" });
await client.users.media({ userId: "12" });
await client.users.followers({ username: "jack", count: 100 });
await client.users.following({ userId: "12" });
await client.users.verifiedFollowers({ userId: "12" });
await client.users.affiliates({ username: "XDevelopers" }); // accounts affiliated with an organization

// Batch lookups (raw only), billed one call per handle; duplicates count once
await client.users.friendshipsBatch({ source: "jack", targets: ["biz", "ev"] }); // up to 50 targets
await client.users.aboutBatch(["jack", "XDevelopers"]); // "About this account", up to 20 handles
```

The batch lookups also take a comma-separated string (`"jack,biz"`). Handles that fail are listed
in `errors`; the others are still returned.

### Tweets

```ts
await client.tweets.get("20"); // tweet plus reply thread
await client.tweets.get({ tweetId: "20", rankingMode: "Recency" }); // Relevance | Recency | Likes
await client.tweets.getMany(["20", "1585841080431321088"]); // up to 100 IDs, one call
await client.tweets.replies({ tweetId: "20", rankingMode: "Likes" }); // only the replies, paginated
await client.tweets.thread("20"); // the author's own thread around the tweet, in reading order
await client.tweets.retweeters({ tweetId: "20" });
await client.tweets.quotes({ tweetId: "20" });
```

`likers` works only for your own tweets: X shows who liked a tweet only to its author. Pass the
cookie of the account that posted the tweet (with `auth_token` and `ct0`) and a proxy; the SDK
sends them as a POST body. For anyone else's tweet the list is empty.

```ts
await client.tweets.likers({
  tweetId: "20",
  cookie: process.env.X_COOKIE!, // "auth_token=...; ct0=..."
  proxy: "http://user:pass@host:port",
});
```

### Search

`query` supports X's search operators, such as `from:`, `to:`, `"exact phrase"`, `lang:`,
`since:`, `until:`, `min_faves:` and `-filter:replies`.

```ts
await client.search.tweets({
  query: "from:jack lang:en -filter:replies",
  category: "Latest", // Top (default) | Latest | People | Photos | Videos
  count: 20,
});
```

### Lists

```ts
await client.lists.details("1234567890");
await client.lists.tweets({ listId: "1234567890" });
await client.lists.members({ listId: "1234567890" });
```

### Communities

```ts
await client.communities.get("1234567890");
await client.communities.about("1234567890"); // rules, moderators, members preview (raw only)
await client.communities.tweets({ communityId: "1234567890" });
await client.communities.search({ query: "typescript" });
```

### Trends

```ts
import { WOEID } from "twittrapi";

await client.trends.get(WOEID.WORLDWIDE); // 1
await client.trends.get(23424977);        // United States
await client.trends.locations();          // all locations with their WOEIDs
```

### Spaces

```ts
await client.spaces.get("1YqKDqWqdPLsV"); // the ID from x.com/i/spaces/<id> (raw only)
```

### Endpoints not wrapped yet

`client.get()` sends an authenticated GET with the same retries and error handling, and
`client.post()` the same with a JSON body:

```ts
const data = await client.get({ path: "/some/endpoint", query: { foo: "bar" } });
```

## Account actions

Post, like, follow, upload media, edit your profile and send DMs as your own X account. Pass the
account's session once with `client.account()`; every call sends it in the POST body.

The session is the Cookie header of your logged-in X session (`auth_token`, `ct0` and `twid`) and
a proxy (`http://user:pass@host:port`). How to get the cookie:
[twittrapi.com/docs/x-session](https://twittrapi.com/docs/x-session). The SDK never logs the cookie
or proxy, and masks them when the account object is printed or serialized.

```ts
const me = client.account({
  cookie: process.env.X_COOKIE!, // "auth_token=...; ct0=...; twid=u%3D..."
  proxy: process.env.X_PROXY!,   // "http://user:pass@host:port"
});

// Tweets
await me.createTweet({ text: "Hello from the API" });
await me.createTweet({ text: "Later", scheduleTime: new Date("2026-12-01T09:00:00Z") });
await me.createTweet({ text: "Tabs or spaces?", poll: { choices: ["Tabs", "Spaces"], durationMinutes: 1440 } });
await me.createTweet({ text: "Nice", quoteUrl: "https://x.com/jack/status/20" });
await me.reply({ tweetId: "20", text: "Agreed" });
await me.like("20");          // also unlike, retweet, unretweet, bookmark, unbookmark, pin, unpin, deleteTweet
await me.report({ tweetId: "20", userId: "12", reason: "SpamSimpleOption" });

// Media: base64 or bytes. Pass the media ID (data.mediaId in the simple format) in mediaIds.
import { readFile } from "node:fs/promises";
await me.uploadImage({ media: await readFile("photo.jpg") });
await me.createTweet({ text: "Photo", mediaIds: ["1234567890"] });
await me.uploadVideo({ media: await readFile("clip.mp4"), videoDurationMs: 12_000 });

// Users: by ID or handle
await me.follow({ username: "XDevelopers" }); // also unfollow, mute, unmute, block, unblock

// Profile
await me.updateProfile({ description: "Building things", location: "Berlin" });
await me.updateProfileImage({ media: await readFile("avatar.png") }); // also updateProfileBanner

// Your timelines and lists
await me.homeTimeline();
await me.bookmarks();        // also likes, blocked, muted, followersYouKnow({ username })
await me.searchBookmarks({ query: "typescript" });
await me.bookmarkFolders();  // Needs X Premium; then bookmarkFolder({ folderId })
await me.scheduledTweets();  // deleteScheduledTweet(id)

// Lists, communities, drafts
await me.lists.create({ name: "Friends", private: true }); // update, delete, addMember, removeMember
await me.communities.join("1500000000000000000");          // create, delete, leave, memberships
await me.drafts.create({ text: "Not yet" });              // list, edit, delete

// Articles (long-form posts). Needs X Premium.
await me.articles.create({ title: "Release notes", text: "First paragraph\nSecond paragraph" });
await me.articles.update({ articleId: "1234567890", coverMediaId: "9876543210" });
await me.articles.publish({ articleId: "1234567890", tweetText: "New article" }); // or publish(id)
await me.articles.list({ lifecycle: "published" }); // also get, unpublish, delete

// DMs (encrypted X Chat): needs twid in the cookie and your X Chat passcode
await me.dm.send({ userId: "12", text: "Hi", passcode: "1234" });
await me.dm.inbox();        // also conversation, conversationInfo, setDisappearing, settings, updateSettings
```

The passcode can also go in the session (`client.account({ cookie, proxy, passcode })`).

Raw answers are `{ status_code, response }`: X's status and X's body as a string.
`parseAccountResponse(res)` returns X's JSON. With `format: "simple"` most routes return small
objects instead, such as `{ data: { success: true } }` or the new tweet. Bookmark folders, bookmark
search, community memberships and articles have no simple format and always return the wrapper.
The bookmarks, bookmark folder, bookmark search, likes, blocked, muted, followersYouKnow,
community memberships and article list pages work with `client.paginate()`.

Bookmark folders (`bookmarkFolders`, `bookmarkFolder`) and all `articles` methods need X Premium on
the account. Without it X refuses in its answer (for bookmark folders error code 37).

Account actions are not retried by default, because a retried write could run twice. Pass
`{ maxRetries }` to opt in. `uploadVideo` waits up to 5 minutes for X to process the video.

## Pagination

`client.paginate()` calls a paginated method repeatedly and follows the bottom cursor in each
response (or `nextCursor` until `hasNextPage` is false in the simple format). It yields one page at
a time:

```ts
for await (const page of client.paginate(
  client.users.followers,
  { username: "jack", count: 100 },
  { maxPages: 5 },
)) {
  console.log(page.pageNumber, page.nextCursor);
  // page.data is the JSON of this page (raw, or SimplePage on a simple client)
}
```

Pass `{ format: "simple" }` in the third argument to paginate in the simple format on a raw client.
The page type is inferred from the client's default format, so for typed simple pages create the
client with `format: "simple"`.

Every page is a billed request, so `maxPages` defaults to 10. Pass `Infinity` to fetch until the
cursor runs out. Iteration also stops when no bottom cursor is found, when the cursor repeats, or
when a page contains only cursor entries. Use `break` to stop early.

To page manually, pass the cursor yourself:

```ts
import { extractBottomCursor } from "twittrapi";

const first = await client.search.tweets({ query: "typescript" });
const cursor = extractBottomCursor(first);
if (cursor) await client.search.tweets({ query: "typescript", cursor });
```

Cursor detection is best-effort. It looks for timeline entries with `cursorType: "Bottom"` or an
`entryId` starting with `cursor-bottom-`, which is how X structures its timelines today. If X
changes that format, pagination may stop early until the SDK is updated.

## Errors

All errors extend `TwittrAPIError`, which has `status`, `detail` (the API's error message) and
`body`.

| Class                      | When                                                |
| -------------------------- | --------------------------------------------------- |
| `AuthenticationError`      | 401 or 403, or no API key configured                |
| `InsufficientBalanceError` | 402: no balance left, top up your account           |
| `NotFoundError`            | 404: user, tweet, list or community not found       |
| `ValidationError`          | 400 or 422, or invalid arguments caught client-side |
| `RateLimitError`           | 429. `retryAfter` holds the wait in seconds         |
| `ServerError`              | 5xx                                                 |
| `ConnectionError`          | Network failure, no response                        |
| `TimeoutError`             | Request took longer than `timeoutMs`                |

```ts
import { InsufficientBalanceError, NotFoundError, RateLimitError, TwittrAPIError } from "twittrapi";

try {
  await client.users.getByUsername("someone");
} catch (err) {
  if (err instanceof NotFoundError) console.log("No such user");
  else if (err instanceof RateLimitError) console.log(`Slow down, retry in ${err.retryAfter ?? "?"}s`);
  else if (err instanceof InsufficientBalanceError) console.log("Top up at https://twittrapi.com");
  else if (err instanceof TwittrAPIError) console.log(err.status, err.message);
  else throw err;
}
```

### Retries

429, 5xx, timeouts and network errors are retried up to `maxRetries` times (default 2) with
exponential backoff starting at 500 ms. On 429 the `Retry-After` header is honoured (capped at 60
seconds). Other 4xx errors are not retried. Aborting the signal stops the request and any pending
retry, and rejects with the signal's reason (an `AbortError` by default).

## Examples

The [`examples/`](examples) folder has short scripts:

- `export-followers-csv.mjs`: export a user's followers to CSV
- `keyword-monitor.mjs`: poll search and print new tweets
- `user-timeline-json.mjs`: save a user's tweets to JSON
- `trends-by-country.mjs`: print trends for a country code

```sh
npm install && npm run build
TWITTRAPI_API_KEY=... node examples/export-followers-csv.mjs jack 5
```

## Development

```sh
npm install
npm test        # compiles and runs the tests with node:test
npm run build   # writes dist/esm and dist/cjs
npm run smoke   # loads the built package through ESM and CommonJS
```

## Support

Questions, bugs or a higher rate limit: email support@twittrapi.com or open an issue in this repository. Service status: [twittrapi.com/status](https://twittrapi.com/status). News and changes: the TwittrAPI Telegram channel (link on the website).

## License

MIT. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.
