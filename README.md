# twittrapi – Twitter/X API client for Node.js and TypeScript

[![npm](https://img.shields.io/npm/v/twittrapi.svg)](https://www.npmjs.com/package/twittrapi) [![CI](https://github.com/twittrapi/twittrapi-node/actions/workflows/ci.yml/badge.svg)](https://github.com/twittrapi/twittrapi-node/actions)

Official Node.js and TypeScript SDK for [TwittrAPI](https://twittrapi.com), a Twitter/X data API.
Read profiles, tweets, followers, search results, lists, communities and trends.

> **Get an API key:** [twittrapi.com/start](https://twittrapi.com/start?utm_source=github&utm_medium=readme&utm_campaign=twittrapi-node) · [Pricing](https://twittrapi.com/pricing?utm_source=github&utm_medium=readme&utm_campaign=twittrapi-node) · [Docs](https://twittrapi.com/docs?utm_source=github&utm_medium=readme&utm_campaign=twittrapi-node) · also available on [RapidAPI](https://rapidapi.com/viperscores-viperscores-default/api/twitter-aio)

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
  baseUrl: "...",        // override the API base URL (direct mode also reads TWITTRAPI_BASE_URL)
  timeoutMs: 60_000,     // per attempt
  maxRetries: 2,         // for 429, 5xx, timeouts and network errors
  fetch: customFetch,    // any fetch-compatible function
});
```

Every method also takes request options as its last argument:

```ts
const controller = new AbortController();
await client.users.getById("12", { signal: controller.signal, timeoutMs: 10_000, maxRetries: 0 });
```

## Usage

Methods that take a user accept either `userId` (faster) or `username`. A leading `@` is fine.
Paginated methods take `count` (1 to 100, default 20) and `cursor`.

### Users

```ts
await client.users.getByUsername("jack");
await client.users.getById("12");
await client.users.usernameToId("jack");
await client.users.getMany(["12", "13", "783214"]); // up to 100 IDs

await client.users.tweets({ username: "jack", count: 50 });
await client.users.tweetsAndReplies({ userId: "12" });
await client.users.media({ userId: "12" });
await client.users.followers({ username: "jack", count: 100 });
await client.users.following({ userId: "12" });
await client.users.verifiedFollowers({ userId: "12" });
```

### Tweets

```ts
await client.tweets.get("20"); // tweet plus reply thread
await client.tweets.get({ tweetId: "20", rankingMode: "Recency" }); // Relevance | Recency | Likes
await client.tweets.retweeters({ tweetId: "20" });
await client.tweets.likers({ tweetId: "20" }); // X hides likers for many tweets; may be empty
await client.tweets.quotes({ tweetId: "20" });
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

### Endpoints not wrapped yet

`client.get()` sends an authenticated GET with the same retries and error handling:

```ts
const data = await client.get({ path: "/some/endpoint", query: { foo: "bar" } });
```

## Pagination

`client.paginate()` calls a paginated method repeatedly and follows the bottom cursor in each
response. It yields one page at a time:

```ts
for await (const page of client.paginate(
  client.users.followers,
  { username: "jack", count: 100 },
  { maxPages: 5 },
)) {
  console.log(page.pageNumber, page.nextCursor);
  // page.data is the raw JSON of this page
}
```

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
