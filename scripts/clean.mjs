// Removes build output folders. Usage: node scripts/clean.mjs [dir ...] (default: dist build-test)
import { rmSync } from "node:fs";

const dirs = process.argv.slice(2);
for (const dir of dirs.length ? dirs : ["dist", "build-test"]) {
  rmSync(dir, { recursive: true, force: true });
}
