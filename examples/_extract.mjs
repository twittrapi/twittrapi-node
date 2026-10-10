// Small helpers for pulling users and tweets out of X's raw GraphQL JSON.
// They walk the whole response, so they keep working when X moves things around a little.
// These are for the examples only; the SDK itself returns the raw JSON unchanged.

function* walk(node) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if (Array.isArray(n)) {
      for (let i = n.length - 1; i >= 0; i--) stack.push(n[i]);
    } else if (n && typeof n === "object") {
      yield n;
      const values = Object.values(n);
      for (let i = values.length - 1; i >= 0; i--) stack.push(values[i]);
    }
  }
}

/** Returns the users in a response as flat objects, de-duplicated by ID. */
export function extractUsers(data) {
  const users = new Map();
  for (const obj of walk(data)) {
    const u = obj.user_results?.result;
    if (!u || u.__typename !== "User" || users.has(u.rest_id)) continue;
    const legacy = u.legacy ?? {};
    users.set(u.rest_id, {
      id: u.rest_id,
      username: u.core?.screen_name ?? legacy.screen_name ?? "",
      name: u.core?.name ?? legacy.name ?? "",
      followers: legacy.followers_count ?? null,
      following: legacy.friends_count ?? null,
      verified: Boolean(u.is_blue_verified ?? legacy.verified),
      bio: legacy.description ?? u.profile_bio?.description ?? "",
    });
  }
  return [...users.values()];
}

/** Returns the tweets in a response as flat objects, de-duplicated by ID. */
export function extractTweets(data) {
  const tweets = new Map();
  for (const obj of walk(data)) {
    let t = obj.tweet_results?.result;
    if (t?.__typename === "TweetWithVisibilityResults") t = t.tweet;
    if (!t?.legacy || tweets.has(t.rest_id)) continue;
    const author = t.core?.user_results?.result;
    tweets.set(t.rest_id, {
      id: t.rest_id,
      createdAt: t.legacy.created_at,
      author: author?.core?.screen_name ?? author?.legacy?.screen_name ?? "",
      text: t.note_tweet?.note_tweet_results?.result?.text ?? t.legacy.full_text ?? "",
      likes: t.legacy.favorite_count ?? 0,
      retweets: t.legacy.retweet_count ?? 0,
      replies: t.legacy.reply_count ?? 0,
      views: t.views?.count ? Number(t.views.count) : null,
    });
  }
  return [...tweets.values()];
}
