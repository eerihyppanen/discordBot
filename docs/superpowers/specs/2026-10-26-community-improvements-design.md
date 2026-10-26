# Community bot improvements

The user requested all five remaining recommendations, a small XP increase, tests, and explicit permission before merging. Implementation proceeds on a feature branch; main is not merged or pushed until that permission arrives.

## Design

- Message rewards increase from 15 to 30 XP. The follow-up request increases Colonist wins from 50 to 100 XP and each three-win streak step from +25 to +50 XP. The 60-second message cooldown, 30-minute win-reward cooldown, existing XP, level thresholds and coin rewards stay intact. Interrupted awards retain their originally recorded reward amounts across upgrades.
- `/balance` displays the usable wallet balance. Retain stored legacy bank values without modifying balances.
- Welcome messages skip absent/non-message channels, await delivery, and log delivery failures. Prefer optional `CHANNEL_ID`, with `CHANNEL_NAME` as the existing fallback. Remove unused meme helpers/settings.
- Cache successful PUBG player responses for two minutes and match participant stats for fifteen minutes, with bounded cache size, duplicate-request coalescing, and at most three simultaneous HTTP requests per client. Failed and missing responses are retried. Summaries analyze at most twenty matches and update saved rankings only when every requested match was successfully analyzed. Partial results explicitly preserve the existing ranking.
- New moderator-entered PUBG totals live separately in `pubgManualStats.json`, with immediate durable writes. API snapshots continue in `pubgWins.json`. `/pubg leaderboard source:recent|manual` makes the distinction visible; recent is the default. Historic rows lack source metadata, so preserve them as existing recent snapshots rather than inventing an origin.
- `/profile set [pubg] [faceit]`, `/profile show`, and `/profile clear game:pubg|faceit|all` manage only the caller's usernames. Persist changes before acknowledging them in `playerProfiles.json`. An omitted username in `/pubg stats` or `/faceit` uses the caller's saved name; explicit usernames override it without changing the profile. These are convenience preferences, not proof of game-account ownership.

## Approach

Use the existing Node 24/discord.js stack, native fetch, JSON store queues and generated help without new dependencies. Separate manual and API files give clear ownership and avoid destructive schema migrations; combining both into a new versioned record would complicate legacy recovery. An in-memory cache avoids extra SD-card writes. All data files remain part of the existing complete-directory backup procedure.
