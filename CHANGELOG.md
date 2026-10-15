# Changelog

All notable changes to this package are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Until 1.0.0, minor versions may contain breaking changes.

## [Unreleased]

## [0.4.0] - 2026-10-15

### Added

- `rapidApiHost` client option (or the `RAPIDAPI_HOST` environment variable) for customers subscribed
  to another TwittrAPI listing on RapidAPI. It sets the `x-rapidapi-host` header and the base URL
  (`https://<host>`); an explicit `baseUrl` still wins. `https://` and a trailing slash are accepted;
  a value with a path or spaces throws a `ValidationError`. The default stays
  `twitter-aio.p.rapidapi.com`, and direct mode ignores it.
- `client.rapidApiHost`: the host in use (undefined in direct mode).

## [0.3.0] - 2026-10-14

### Changed

- **Breaking:** `tweets.likers` now sends POST with a JSON body and requires `cookie` (the Cookie
  header of the account that posted the tweet, with `auth_token` and `ct0`) and `proxy`
  (`http://user:pass@host:port`). `count` and `cursor` go in the body; `paginate()` works as
  before. X shows likers only to the tweet's author, so this works only for your own tweets. The
  API now answers a GET, or a body without cookie or proxy, with 400.

### Added

- `client.post()` for POST endpoints, with the same retries and error handling as `client.get()`.
- `TweetLikersParams` and `APIPostRequest` types.

## [0.2.1] - 2026-10-14

### Changed

- `users.getMany` accepts up to 500 IDs per call (was 100), matching the API.

## [0.2.0] - 2026-10-11

Non-breaking: the default stays the raw format, and existing calls send the same requests.

### Added

- Opt-in simple response format (`format=simple`, see https://twittrapi.com/docs/simple-format).
  `new TwittrAPI({ format: "simple" })` sets it for the client; `{ format: "simple" | "raw" }` in
  any method's request options overrides it per call. The default is `"raw"`.
- Types for the simple format: `SimpleTweet`, `SimpleUser`, `SimpleList`, `SimpleCommunity`,
  `SimpleTrend`, `SimpleTrendLocation`, `SimpleMedia`, `SimpleUnavailableTweet` and the
  `SimplePage<T>` / `SimpleSingle<T>` envelopes. Method return types follow the client default and
  the per-call option.
- `paginate()` follows `nextCursor` until `hasNextPage` is false on simple-format pages, and still
  uses the raw cursor detection when the API answers raw.
- `isSimplePage()`, `isUnavailableTweet()`, `RESPONSE_FORMATS` and `client.format`.
- Tests against simple-format fixtures copied from the API's normalize testdata
  (`test/fixtures/simple`), checking every field of the types against real converted responses.
- Tests against trimmed real API responses (`test/fixtures/live`): cursor extraction for every
  paginated shape (timelines, followers with Bottom before Top, tweet detail, search wrapper,
  slice `next_cursor`) and clean stops on empty likes/favorites timelines.

### Fixed

- `paginate()` now stops on slice-based pages (community search, job search) that return a
  `slice_info.next_cursor` but an empty `items_results`, instead of following the cursor.

## [0.1.0] - 2026-10-10

### Added

- `TwittrAPI` client with direct API (`X-API-KEY`) and RapidAPI auth, keys from options or
  `TWITTRAPI_API_KEY` / `RAPIDAPI_KEY`.
- Resource methods for all 23 read endpoints: `users`, `tweets`, `search`, `lists`,
  `communities`, `trends`.
- Typed errors: `AuthenticationError`, `InsufficientBalanceError`, `NotFoundError`,
  `ValidationError`, `RateLimitError` (with `retryAfter`), `ServerError`, `ConnectionError`,
  `TimeoutError`.
- Retries with exponential backoff for 429, 5xx, timeouts and network errors. `AbortSignal` support.
- `client.paginate()` async iterator that follows X's bottom cursor, plus `extractCursors()`.
- ESM and CommonJS builds with type declarations. No runtime dependencies.

[Unreleased]: https://github.com/twittrapi/twittrapi-node/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/twittrapi/twittrapi-node/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/twittrapi/twittrapi-node/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/twittrapi/twittrapi-node/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/twittrapi/twittrapi-node/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/twittrapi/twittrapi-node/releases/tag/v0.1.0
