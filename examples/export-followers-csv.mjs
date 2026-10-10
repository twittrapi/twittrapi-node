// Exports a user's followers to a CSV file.
//
//   TWITTRAPI_API_KEY=... node examples/export-followers-csv.mjs jack 5
//
// Arguments: username, max pages (default 5). Each page is one billed request of up to 100 users.
import { writeFileSync } from "node:fs";
import { TwittrAPI } from "twittrapi";
import { extractUsers } from "./_extract.mjs";

const [username = "jack", maxPages = "5"] = process.argv.slice(2);
const client = new TwittrAPI();

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const rows = [["id", "username", "name", "followers", "following", "verified", "bio"]];
const seen = new Set();

for await (const page of client.paginate(
  client.users.followers,
  { username, count: 100 },
  { maxPages: Number(maxPages) },
)) {
  for (const u of extractUsers(page.data)) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    rows.push([u.id, u.username, u.name, u.followers, u.following, u.verified, u.bio]);
  }
  console.error(`page ${page.pageNumber}: ${seen.size} followers so far`);
}

const file = `${username}-followers.csv`;
writeFileSync(file, rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n");
console.log(`Wrote ${rows.length - 1} followers to ${file}`);
