// Prints the current trends for a country.
//
//   TWITTRAPI_API_KEY=... node examples/trends-by-country.mjs DE
//
// Argument: two-letter country code (default US), or "world" for worldwide trends.
import { TwittrAPI, WOEID } from "twittrapi";

const code = (process.argv[2] ?? "US").toUpperCase();
const client = new TwittrAPI();

let woeid = WOEID.WORLDWIDE;
let label = "Worldwide";
if (code !== "WORLD") {
  // Expected shape: [{ name, woeid, countryCode, placeType: { name: "Country" } }, ...]
  const locations = await client.trends.locations();
  const list = Array.isArray(locations) ? locations : Object.values(locations ?? {}).find(Array.isArray) ?? [];
  const country = list.find((l) => l.countryCode === code && (l.placeType?.name ?? l.placeType) === "Country");
  if (!country) {
    console.error(`No trend location found for country code ${code}`);
    process.exit(1);
  }
  woeid = country.woeid;
  label = country.name;
}

const data = await client.trends.get(woeid);

// Collect every object that looks like a trend ({ name, ... }) inside a "trends" array.
const trends = [];
(function find(node) {
  if (Array.isArray(node)) return node.forEach(find);
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node.trends)) {
    for (const t of node.trends) if (t && typeof t.name === "string") trends.push(t);
  }
  Object.values(node).forEach(find);
})(data);

console.log(`Trends for ${label} (WOEID ${woeid}):`);
if (trends.length === 0) console.log(JSON.stringify(data, null, 2));
trends.forEach((t, i) => {
  const volume = t.tweet_volume ? ` (${t.tweet_volume.toLocaleString()} posts)` : "";
  console.log(`${String(i + 1).padStart(2)}. ${t.name}${volume}`);
});
