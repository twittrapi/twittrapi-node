// Polls X search for a keyword and prints new tweets as they appear.
//
//   TWITTRAPI_API_KEY=... node examples/keyword-monitor.mjs "typescript lang:en -filter:replies" 60
//
// Arguments: query (X search operators work), poll interval in seconds (default 60). Ctrl+C to stop.
import { RateLimitError, TwittrAPI } from "twittrapi";
import { extractTweets } from "./_extract.mjs";

const [query = "twittrapi", intervalSec = "60"] = process.argv.slice(2);
const client = new TwittrAPI();
const seen = new Set();
let first = true;

while (true) {
  try {
    const data = await client.search.tweets({ query, category: "Latest", count: 20 });
    const tweets = extractTweets(data).filter((t) => !seen.has(t.id)).reverse();
    for (const t of tweets) {
      seen.add(t.id);
      if (!first) console.log(`[${t.createdAt}] @${t.author}: ${t.text.replace(/\s+/g, " ")}\n  https://x.com/i/status/${t.id}`);
    }
    if (first) console.log(`Watching "${query}" (skipped ${tweets.length} existing tweets)`);
    first = false;
  } catch (err) {
    if (err instanceof RateLimitError) console.error(`Rate limited, waiting. ${err.message}`);
    else throw err;
  }
  await new Promise((r) => setTimeout(r, Number(intervalSec) * 1000));
}
