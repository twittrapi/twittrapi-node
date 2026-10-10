import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AuthenticationError,
  ConnectionError,
  InsufficientBalanceError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TimeoutError,
  TwittrAPI,
  TwittrAPIError,
  ValidationError,
  errorFromResponse,
  parseRetryAfter,
} from "../src/index.js";
import { json, makeClient } from "./helpers.js";

describe("error mapping", () => {
  const table: [number, new (...a: never[]) => TwittrAPIError][] = [
    [400, ValidationError],
    [401, AuthenticationError],
    [402, InsufficientBalanceError],
    [403, AuthenticationError],
    [404, NotFoundError],
    [409, TwittrAPIError],
    [422, ValidationError],
    [429, RateLimitError],
    [500, ServerError],
    [502, ServerError],
    [503, ServerError],
  ];
  for (const [status, cls] of table) {
    it(`${status} -> ${cls.name}`, async () => {
      const { client } = makeClient([json({ error: `boom ${status}` }, status)], { maxRetries: 0 });
      const err = await client.users.getById("1").then(
        () => assert.fail("expected an error"),
        (e: unknown) => e,
      );
      assert.ok(err instanceof cls, `got ${(err as Error).name}`);
      assert.ok(err instanceof TwittrAPIError);
      assert.ok(err instanceof Error);
      assert.equal(err.status, status);
      assert.equal(err.detail, `boom ${status}`);
      assert.equal(err.message, `${status} boom ${status}`);
      assert.deepEqual(err.body, { error: `boom ${status}` });
      assert.equal(err.name, cls.name);
    });
  }

  it("uses a default message when the body has no error field", () => {
    const err = errorFromResponse(402, null);
    assert.ok(err instanceof InsufficientBalanceError);
    assert.match(err.message, /^402 No balance/);
  });

  it("uses a plain-text body as detail", () => {
    const err = errorFromResponse(502, "<html>Bad Gateway</html>");
    assert.equal(err.detail, "<html>Bad Gateway</html>");
  });

  it("parses Retry-After into RateLimitError.retryAfter", () => {
    const err = errorFromResponse(429, { error: "slow down" }, new Headers({ "retry-after": "7" }));
    assert.ok(err instanceof RateLimitError);
    assert.equal(err.retryAfter, 7);
  });

  it("parseRetryAfter handles seconds, dates and garbage", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    assert.equal(parseRetryAfter("3", now), 3);
    assert.equal(parseRetryAfter("Thu, 01 Jan 2026 00:00:10 GMT", now), 10);
    assert.equal(parseRetryAfter("Wed, 31 Dec 2025 00:00:00 GMT", now), 0);
    assert.equal(parseRetryAfter("soon", now), undefined);
    assert.equal(parseRetryAfter(null, now), undefined);
  });

  it("throws TwittrAPIError on a non-JSON 200 body", async () => {
    const { client } = makeClient([new Response("not json", { status: 200 })]);
    await assert.rejects(client.users.getById("1"), (e: unknown) => {
      assert.ok(e instanceof TwittrAPIError);
      assert.equal(e.body, "not json");
      return true;
    });
  });

  it("does not put the API key in error messages", async () => {
    const { client } = makeClient([json({ error: "bad" }, 401)], { apiKey: "super-secret" });
    await assert.rejects(client.users.getById("1"), (e: unknown) => {
      assert.ok(!String((e as Error).message).includes("super-secret"));
      return true;
    });
  });
});

describe("retries", () => {
  it("retries 5xx and then succeeds", async () => {
    const { client, calls } = makeClient([json({ error: "x" }, 503), json({ error: "x" }, 500), json({ ok: 1 })]);
    assert.deepEqual(await client.users.getById("1"), { ok: 1 });
    assert.equal(calls.length, 3);
  });

  it("gives up after maxRetries (default 2) and throws the last error", async () => {
    const { client, calls } = makeClient([json({ error: "down" }, 500)]);
    await assert.rejects(client.users.getById("1"), ServerError);
    assert.equal(calls.length, 3);
  });

  it("retries 429 and honours Retry-After", async () => {
    const { client, calls } = makeClient([json({ error: "slow" }, 429, { "retry-after": "0" }), json({ ok: 1 })]);
    assert.deepEqual(await client.users.getById("1"), { ok: 1 });
    assert.equal(calls.length, 2);
  });

  it("throws RateLimitError with retryAfter when retries run out", async () => {
    const { client, calls } = makeClient([json({ error: "slow" }, 429, { "retry-after": "0" })], { maxRetries: 1 });
    await assert.rejects(client.users.getById("1"), (e: unknown) => {
      assert.ok(e instanceof RateLimitError);
      assert.equal(e.retryAfter, 0);
      return true;
    });
    assert.equal(calls.length, 2);
  });

  for (const status of [400, 401, 402, 403, 404, 422]) {
    it(`does not retry ${status}`, async () => {
      const { client, calls } = makeClient([json({ error: "no" }, status), json({ ok: 1 })]);
      await assert.rejects(client.users.getById("1"), TwittrAPIError);
      assert.equal(calls.length, 1);
    });
  }

  it("retries network errors and wraps them in ConnectionError", async () => {
    const { client, calls } = makeClient([new TypeError("fetch failed"), json({ ok: 1 })]);
    assert.deepEqual(await client.users.getById("1"), { ok: 1 });
    assert.equal(calls.length, 2);

    const c2 = makeClient([new TypeError("fetch failed")], { maxRetries: 1 });
    await assert.rejects(c2.client.users.getById("1"), (e: unknown) => {
      assert.ok(e instanceof ConnectionError);
      assert.ok(e.cause instanceof TypeError);
      return true;
    });
    assert.equal(c2.calls.length, 2);
  });

  it("per-request maxRetries overrides the client setting", async () => {
    const { client, calls } = makeClient([json({ error: "x" }, 500)]);
    await assert.rejects(client.users.getById("1", { maxRetries: 0 }), ServerError);
    assert.equal(calls.length, 1);
  });

  it("uses exponential backoff between retries", async () => {
    const stamps: number[] = [];
    const client = new TwittrAPI({
      apiKey: "k",
      retryDelayMs: 40,
      maxRetries: 2,
      fetch: async () => {
        stamps.push(Date.now());
        return json({ error: "x" }, 500);
      },
    });
    await assert.rejects(client.users.getById("1"), ServerError);
    assert.equal(stamps.length, 3);
    assert.ok(stamps[1]! - stamps[0]! >= 25, "first wait ~40ms");
    assert.ok(stamps[2]! - stamps[1]! >= 55, "second wait ~80ms");
  });
});

describe("timeouts and cancellation", () => {
  const hanging = (call: { signal: AbortSignal | undefined }) =>
    new Promise<Response>((_, reject) => {
      call.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });

  it("throws TimeoutError after timeoutMs and retries it", async () => {
    const { client, calls } = makeClient([hanging], { timeoutMs: 20, maxRetries: 1 });
    await assert.rejects(client.users.getById("1"), TimeoutError);
    assert.equal(calls.length, 2);
  });

  it("aborts with the caller's signal and does not retry", async () => {
    const { client, calls } = makeClient([hanging]);
    const ac = new AbortController();
    const p = client.users.getById("1", { signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    await assert.rejects(p, (e: unknown) => {
      assert.equal((e as Error).name, "AbortError");
      assert.ok(!(e instanceof TwittrAPIError));
      return true;
    });
    assert.equal(calls.length, 1);
  });

  it("does not send a request when the signal is already aborted", async () => {
    const { client, calls } = makeClient();
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(client.users.getById("1", { signal: ac.signal }));
    assert.equal(calls.length, 0);
  });

  it("aborting during backoff stops further retries", async () => {
    const { client, calls } = makeClient([json({ error: "x" }, 500)], { retryDelayMs: 5_000 });
    const ac = new AbortController();
    const p = client.users.getById("1", { signal: ac.signal });
    setTimeout(() => ac.abort(), 20);
    await assert.rejects(p, (e: unknown) => (e as Error).name === "AbortError");
    assert.equal(calls.length, 1);
  });
});
