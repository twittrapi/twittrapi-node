# Changelog

All notable changes to this package are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Until 1.0.0, minor versions may contain breaking changes.

## [Unreleased]

### Fixed

- `paginate()` now stops on slice-based pages (community search, job search) that return a
  `slice_info.next_cursor` but an empty `items_results`, instead of following the cursor.

### Added

- Tests against trimmed real API responses (`test/fixtures/live`): cursor extraction for every
  paginated shape (timelines, followers with Bottom before Top, tweet detail, search wrapper,
  slice `next_cursor`) and clean stops on empty likes/favorites timelines.

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

[Unreleased]: https://github.com/twittrapi/twittrapi-node/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/twittrapi/twittrapi-node/releases/tag/v0.1.0
