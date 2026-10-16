// Checks that the built ESM entry loads through the package's own "exports" map.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TwittrAPI, TwittrAPIError, RateLimitError, VERSION } from "twittrapi";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(typeof TwittrAPI, "function");
assert.ok(new RateLimitError("x", { status: 429 }) instanceof TwittrAPIError);
assert.equal(VERSION, pkg.version);
const client = new TwittrAPI({ apiKey: "test" });
assert.equal(typeof client.users.getByUsername, "function");
assert.equal(typeof client.account({ cookie: "auth_token=a; ct0=b", proxy: "http://h:1" }).like, "function");
console.log("ESM smoke test passed");
