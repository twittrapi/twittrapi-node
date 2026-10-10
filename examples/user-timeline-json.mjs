// Saves a user's recent tweets to a JSON file.
//
//   TWITTRAPI_API_KEY=... node examples/user-timeline-json.mjs jack 3
//
// Arguments: username, max pages (default 3). Set RAW=1 to save the raw API pages instead.
import { writeFileSync } from "node:fs";
import { TwittrAPI } from "twittrapi";
import { extractTweets } from "./_extract.mjs";

const [username = "jack", maxPages = "3"] = process.argv.slice(2);
const client = new TwittrAPI();

const pages = [];
for await (const page of client.paginate(client.users.tweets, { username, count: 50 }, { maxPages: Number(maxPages) })) {
  pages.push(page.data);
}

const output = process.env.RAW ? pages : pages.flatMap(extractTweets);
const file = `${username}-tweets.json`;
writeFileSync(file, JSON.stringify(output, null, 2));
console.log(`Wrote ${process.env.RAW ? `${pages.length} raw pages` : `${output.length} tweets`} to ${file}`);
