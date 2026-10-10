// Runs the compiled tests with node:test. Lists files explicitly because `node --test <dir>`
// and glob arguments behave differently across Node 18, 20 and 22.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = "build-test/test";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => join(dir, f));
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
