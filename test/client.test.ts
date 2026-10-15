import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import {
  AuthenticationError,
  RAPIDAPI_HOST,
  TwittrAPI,
  ValidationError,
  VERSION,
  buildUrl,
} from "../src/index.js";
import { json, makeClient, mockFetch } from "./helpers.js";

const ENV_KEYS = ["TWITTRAPI_API_KEY", "RAPIDAPI_KEY", "RAPIDAPI_HOST", "TWITTRAPI_BASE_URL"] as const;

describe("TwittrAPI client configuration", () => {
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("uses the direct API with X-API-KEY", async () => {
    const { client, calls } = makeClient([json({ ok: 1 })], { apiKey: "abc" });
    assert.equal(client.authMode, "direct");
    assert.deepEqual(await client.users.getByUsername("jack"), { ok: 1 });
    assert.equal(calls[0]!.url.origin, "https://api.twittrapi.com");
    assert.equal(calls[0]!.method, "GET");
    assert.equal(calls[0]!.headers["x-api-key"], "abc");
    assert.equal(calls[0]!.headers["x-rapidapi-key"], undefined);
    assert.equal(calls[0]!.headers["accept"], "application/json");
    assert.equal(calls[0]!.headers["user-agent"], `twittrapi-node/${VERSION}`);
  });

  it("uses RapidAPI with x-rapidapi-key and x-rapidapi-host", async () => {
    const { client, calls } = makeClient([json({})], { apiKey: undefined, rapidApiKey: "rk" });
    assert.equal(client.authMode, "rapidapi");
    await client.users.getByUsername("jack");
    assert.equal(calls[0]!.url.toString(), "https://twitter-aio.p.rapidapi.com/user/by/username/jack");
    assert.equal(calls[0]!.headers["x-rapidapi-key"], "rk");
    assert.equal(calls[0]!.headers["x-rapidapi-host"], RAPIDAPI_HOST);
    assert.equal(calls[0]!.headers["x-api-key"], undefined);
  });

  it("uses the rapidApiHost option for the header and the base URL", async () => {
    const { client, calls } = makeClient([json({})], {
      apiKey: undefined,
      rapidApiKey: "rk",
      rapidApiHost: "twttr.p.rapidapi.com",
    });
    assert.equal(client.rapidApiHost, "twttr.p.rapidapi.com");
    assert.equal(client.baseUrl, "https://twttr.p.rapidapi.com");
    await client.users.getByUsername("jack");
    assert.equal(calls[0]!.url.toString(), "https://twttr.p.rapidapi.com/user/by/username/jack");
    assert.equal(calls[0]!.headers["x-rapidapi-host"], "twttr.p.rapidapi.com");
  });

  it("reads RAPIDAPI_HOST from the environment; the option wins", async () => {
    process.env.RAPIDAPI_KEY = "env-rapid";
    process.env.RAPIDAPI_HOST = "env-host.p.rapidapi.com";
    const mock = mockFetch(json({}));
    const client = new TwittrAPI({ fetch: mock.fetch });
    await client.trends.locations();
    assert.equal(mock.calls[0]!.url.origin, "https://env-host.p.rapidapi.com");
    assert.equal(mock.calls[0]!.headers["x-rapidapi-host"], "env-host.p.rapidapi.com");

    const c2 = new TwittrAPI({ rapidApiHost: "opt.p.rapidapi.com", fetch: mockFetch().fetch });
    assert.equal(c2.rapidApiHost, "opt.p.rapidapi.com");
  });

  it("normalizes rapidApiHost", () => {
    const f = mockFetch().fetch;
    for (const value of [
      "twttr.p.rapidapi.com",
      "https://twttr.p.rapidapi.com",
      "https://twttr.p.rapidapi.com/",
      " HTTP://Twttr.p.rapidapi.com// ",
    ]) {
      const client = new TwittrAPI({ rapidApiKey: "r", rapidApiHost: value, fetch: f });
      assert.equal(client.rapidApiHost, "twttr.p.rapidapi.com", value);
      assert.equal(client.baseUrl, "https://twttr.p.rapidapi.com", value);
    }
  });

  it("rejects a rapidApiHost with a path or spaces", () => {
    const f = mockFetch().fetch;
    const invalid = ["https://twttr.p.rapidapi.com/v1", "twttr.p.rapidapi.com/user", "twttr p.rapidapi.com", "https://"];
    for (const value of invalid) {
      assert.throws(
        () => new TwittrAPI({ rapidApiKey: "r", rapidApiHost: value, fetch: f }),
        (err: unknown) => err instanceof ValidationError && /rapidApiHost/.test(err.message),
        value,
      );
    }
    process.env.RAPIDAPI_HOST = "host.test/path";
    assert.throws(() => new TwittrAPI({ rapidApiKey: "r", fetch: f }), ValidationError);
  });

  it("an explicit baseUrl wins over rapidApiHost; the header still uses the host", async () => {
    const { client, calls } = makeClient([json({})], {
      apiKey: undefined,
      rapidApiKey: "rk",
      rapidApiHost: "twttr.p.rapidapi.com",
      baseUrl: "http://proxy.test",
    });
    await client.users.getById("12");
    assert.equal(calls[0]!.url.toString(), "http://proxy.test/user/12");
    assert.equal(calls[0]!.headers["x-rapidapi-host"], "twttr.p.rapidapi.com");
  });

  it("direct mode ignores rapidApiHost and RAPIDAPI_HOST", async () => {
    process.env.RAPIDAPI_HOST = "env-host.p.rapidapi.com";
    const { client, calls } = makeClient([json({})], { rapidApiHost: "not a host/" });
    assert.equal(client.authMode, "direct");
    assert.equal(client.rapidApiHost, undefined);
    await client.users.getById("12");
    assert.equal(calls[0]!.url.origin, "https://api.twittrapi.com");
    assert.equal(calls[0]!.headers["x-rapidapi-host"], undefined);
  });

  it("prefers apiKey over rapidApiKey", () => {
    const client = new TwittrAPI({ apiKey: "a", rapidApiKey: "r", fetch: mockFetch().fetch });
    assert.equal(client.authMode, "direct");
  });

  it("reads TWITTRAPI_API_KEY from the environment", async () => {
    process.env.TWITTRAPI_API_KEY = "env-direct";
    process.env.RAPIDAPI_KEY = "env-rapid";
    const mock = mockFetch(json({}));
    const client = new TwittrAPI({ fetch: mock.fetch });
    assert.equal(client.authMode, "direct");
    await client.trends.locations();
    assert.equal(mock.calls[0]!.headers["x-api-key"], "env-direct");
  });

  it("reads RAPIDAPI_KEY from the environment", async () => {
    process.env.RAPIDAPI_KEY = "env-rapid";
    const mock = mockFetch(json({}));
    const client = new TwittrAPI({ fetch: mock.fetch });
    assert.equal(client.authMode, "rapidapi");
    await client.trends.locations();
    assert.equal(mock.calls[0]!.headers["x-rapidapi-key"], "env-rapid");
  });

  it("explicit rapidApiKey wins over TWITTRAPI_API_KEY in the environment", () => {
    process.env.TWITTRAPI_API_KEY = "env-direct";
    const client = new TwittrAPI({ rapidApiKey: "r", fetch: mockFetch().fetch });
    assert.equal(client.authMode, "rapidapi");
  });

  it("throws AuthenticationError without any key", () => {
    assert.throws(() => new TwittrAPI({ fetch: mockFetch().fetch }), AuthenticationError);
  });

  it("supports a custom baseUrl and TWITTRAPI_BASE_URL", async () => {
    const { client, calls } = makeClient([json({})], { baseUrl: "http://localhost:8080/v1/" });
    assert.equal(client.baseUrl, "http://localhost:8080/v1");
    await client.users.getById("12");
    assert.equal(calls[0]!.url.toString(), "http://localhost:8080/v1/user/12");

    process.env.TWITTRAPI_BASE_URL = "http://env.test";
    const c2 = new TwittrAPI({ apiKey: "k", fetch: mockFetch().fetch });
    assert.equal(c2.baseUrl, "http://env.test");
  });

  it("validates numeric options", () => {
    const f = mockFetch().fetch;
    assert.throws(() => new TwittrAPI({ apiKey: "k", fetch: f, maxRetries: -1 }), ValidationError);
    assert.throws(() => new TwittrAPI({ apiKey: "k", fetch: f, timeoutMs: 0 }), ValidationError);
  });

  it("does not expose the API key in properties or console output", () => {
    const client = new TwittrAPI({ apiKey: "secret-key", fetch: mockFetch().fetch });
    assert.ok(!inspect(client, { depth: 5 }).includes("secret-key"));
    assert.ok(!Object.values(client).some((v) => v === "secret-key"));
  });

  it("VERSION matches package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    assert.equal(VERSION, pkg.version);
  });
});

describe("buildUrl", () => {
  it("joins base, path and query and drops empty values", () => {
    assert.equal(
      buildUrl("https://x.test/", { path: "search", query: { a: "1 2", b: undefined, c: "", d: 3, e: false } }),
      "https://x.test/search?a=1+2&d=3&e=false",
    );
  });
});

describe("client.get", () => {
  it("can call unwrapped endpoints directly", async () => {
    const { client, calls } = makeClient([json({ x: 1 })]);
    assert.deepEqual(await client.get({ path: "/some/new/endpoint", query: { a: "b" } }), { x: 1 });
    assert.equal(calls[0]!.url.pathname, "/some/new/endpoint");
    assert.equal(calls[0]!.url.searchParams.get("a"), "b");
  });

  it("returns null for an empty 200 body", async () => {
    const { client } = makeClient([new Response("", { status: 200 })]);
    assert.equal(await client.get({ path: "/x" }), null);
  });
});
