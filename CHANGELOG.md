# Changelog

All notable changes to this package are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Until 1.0.0, minor versions may contain breaking changes.

## [Unreleased]

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
