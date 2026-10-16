// Checks that the built CommonJS entry loads through the package's own "exports" map.
const assert = require("node:assert/strict");
const { TwittrAPI, TwittrAPIError, RateLimitError, VERSION } = require("twittrapi");
const pkg = require("../package.json");

assert.equal(typeof TwittrAPI, "function");
assert.ok(new RateLimitError("x", { status: 429 }) instanceof TwittrAPIError);
assert.equal(VERSION, pkg.version);
const client = new TwittrAPI({ apiKey: "test" });
assert.equal(typeof client.users.getByUsername, "function");
assert.equal(typeof client.account({ cookie: "auth_token=a; ct0=b", proxy: "http://h:1" }).like, "function");
console.log("CJS smoke test passed");
