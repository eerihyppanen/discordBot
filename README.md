# Discord Bot

A Discord bot for a gaming community: PUBG Steam PC statistics, Colonist results,
legendary skin collections, XP and roles, virtual coins, and reminders.

## Development

Use **Node.js 24** (`nvm use` reads `.nvmrc`) and install the locked dependencies:

```sh
npm ci
cp .env-sample .env  # only if you do not already have a .env
```

Fill in the settings locally or inject them through your hosting platform.
Keep credentials out of Git and do not share `.env`.

| Variable | Used for |
| --- | --- |
| `TOKEN` | Required Discord bot token |
| `CLIENT_ID`, `GUILD_ID` | Required when registering slash commands |
| `DATA_DIR` | Persistent JSON directory; defaults to `data` in the working directory |
| `PUBG_API_KEY` | PUBG commands |
| `FACEIT_API_KEY` | FACEIT command |
| `CHANNEL_ID` | Optional welcome channel ID; takes priority over the name |
| `CHANNEL_NAME` | Optional welcome channel name when no ID is configured |

```sh
npm test                 # local regression suite, no live API keys needed
npm run build            # compile source into build/
npm run dev              # reload source changes with nodemon and load .env
npm start                # build, load .env and connect the bot
npm run prod             # run an existing build using injected variables
```

The devcontainer uses Node 24 and runs `npm ci`. It copies `.env-sample` only when
`.env` is absent, so reopening a checkout preserves local configuration.

## Discord configuration and command registration

Create a Discord application and bot, and invite it with the `bot` and
`applications.commands` scopes. Enable Server Members and Message Content intents
for welcomes and message XP. Grant the channels used by the bot Send Messages and
Embed Links; level role management also requires Manage Roles and a suitable bot
role position.

After changing command definitions, register them for your development server:

```sh
npm run deploy-commands
```

This requires `TOKEN`, `CLIENT_ID`, and `GUILD_ID`. Every command is validated before
Discord's existing command list is replaced. A failed import, invalid definition,
or API request exits with failure. The legacy `node deploy-commands.js` entry point
runs the same implementation. Registration changes Discord server configuration;
normal builds and tests do not register commands.

## Commands

`/help` lists the commands actually loaded by the bot. `/help command:lege` shows
current subcommands, required and optional parameters, and available choices.

| Area | Commands |
| --- | --- |
| PUBG Steam PC | `/pubg stats [username] [view]`, `/pubg leaderboard [source]` |
| Moderator tools | `/admin pubg-stats username wins matches`, `/admin colonist-cancel player`, `/admin status` (Manage Server required) |
| Other games | `/faceit [username]`, `/colonist game`, `/colonist win`, `/colonist stats`, `/colonist-leaderboard` |
| Saved game usernames | `/profile set [pubg] [faceit]`, `/profile show`, `/profile clear game` |
| Cosmetic profiles | `/profile shop`, `/profile buy item`, `/profile inventory`, `/profile equip item`, `/profile unequip type`, `/profile card [user]` |
| Legendary skins | `/lege add`, `/lege undo`, `/lege count`, `/lege list`, `/lege leaderboard` |
| XP | `/level`, `/leaderboard` |
| Virtual economy | `/balance`, `/daily`, `/gamble coinflip`, `/gamble slots`, `/gamble dice` |
| Other | `/remind time message`, `/8ball question`, `/help` |

PUBG lookups and manual statistics both use Steam PC player records; platform and
region inputs are no longer required. Recent PUBG statistics cover up to the last
20 available matches, not lifetime totals. `/pubg stats` defaults to the recent-match
summary; `view:last` shows the latest match's details without changing the ranking.
Successful player responses are cached for two minutes and match statistics for
fifteen minutes in memory. Concurrent identical requests share their work, caches
are bounded to 500 entries, and at most three PUBG requests run at a time.
The ranking is refreshed only when every requested match is successfully analyzed.
Partial results are labelled and leave the previous saved ranking intact.

`/admin pubg-stats` sets **independent manual totals**, saved before confirmation.
`/pubg leaderboard source:manual` ranks those totals; the default `source:recent`
ranks recent-match snapshots. API refreshes cannot overwrite manual totals.
Historic rows did not record whether they were manual or API updates, so those rows
remain in the existing recent-ranking table. Re-enter any historic manual totals
with `/admin pubg-stats` to place them in the separate manual table.

### Saved usernames

Use `/profile set pubg:YourName faceit:YourName` to save either or both names.
After that, `/pubg stats` and `/faceit` can use your saved names without a username
argument. An explicit username looks up someone else without changing your profile.
`/profile show` displays your preferences privately. `/profile clear game:pubg`,
`game:faceit`, or `game:all` removes them. Profiles save only the caller's settings,
survive restarts, and are a convenience rather than verified game-account ownership.

### Cosmetic coin purchases

`/profile shop` lists permanent cosmetic titles and badges with their coin prices.
Select an item with `/profile buy`, then wear it with `/profile equip`.
`/profile inventory` shows owned items; `/profile unequip type:title`, `type:badge`
or `type:all` removes the current selection without losing ownership. You can equip
one title and one badge at a time. Repeating a purchase never charges twice.

| Item | Type | Coins |
| --- | --- | ---: |
| The Regular | Title | 500 |
| Master Tactician | Title | 1,000 |
| Community Legend | Title | 2,500 |
| 🎲 Dice Enthusiast | Badge | 300 |
| 🍗 Chicken Dinner | Badge | 750 |
| 👑 Golden Crown | Badge | 1,500 |

Shop actions and inventory are private. `/profile card [user]` displays a public
card containing only the selected cosmetics and Discord identity. Saved PUBG/FACEIT
names stay private; clearing saved names does not remove purchases. Coins and item
ownership save together in `economy.json` before confirming a purchase. Cosmetics
do not change level titles, Discord roles, permissions, XP or coin rewards.

### Welcome messages

Set `CHANNEL_ID` to keep welcomes working when a channel is renamed, or use the
existing `CHANNEL_NAME` setting. With neither configured, welcomes are disabled.
Missing/non-message channels are skipped; delivery is awaited and failures logged.
The unused meme helpers and `MEME_URL` setting have been removed.

### Bot status

`/admin status` requires Manage Server and replies privately. It shows the current
Discord connection and gateway latency, process uptime, memory use, Node version
and architecture, loaded command count, and configuration flags for PUBG, FACEIT
and slash-command registration. Secret values and IDs are never displayed.
API keys are checked for presence, including detection of the sample API keys;
the command does not authenticate them or make external API calls. A game stats
lookup verifies whether its API key is accepted. Re-register slash commands to
make the new status subcommand available.

### Correcting and browsing legendary skins

Use `/lege add skin:Gold AKM` to record a drop (names are limited to 100 characters). `/lege undo` removes **your most
recently added skin**, updates the count and last-drop timestamp, and saves the
change before confirming it. It cannot remove someone else's skin. Repeating undo
removes the preceding skin; an empty collection reports that there is nothing to undo.

`/lege list` shows the newest ten skins. Previous/Next buttons browse the remaining
pages, and only the user who opened the list can navigate it. Buttons read current
data, so an old page adjusts after an addition or undo. Browsing never writes data.

### Reminders

`/remind time:30m message:Check the oven` accepts seconds, minutes, hours, or days,
up to seven days. Pending reminders persist across restarts. Every 15 seconds the
bot checks for due reminders, tries a DM, then falls back to the original channel.
If both fail, it retains the reminder and retries with backoff. A crash after
sending but before recording completion can cause a duplicate delivery.

## Rewards and levels

By default, eligible server messages earn 30 XP at most once per user per 60 seconds, shared
across channels and servers. Bots, webhooks and DMs do not earn XP. Rewards can
cross multiple level thresholds. Eligible messages and confirmed Colonist wins
synchronize the member's level role; a later message can retry a missed update.
Existing XP and level thresholds are preserved. Level 2 requires 400 XP: fourteen
eligible messages instead of twenty-seven at the original 15 XP rate.
By default, recorded Colonist wins award 100 XP, plus 50 XP for each complete three-win streak
step: 100 XP at streaks 1–2, 150 at 3–5, 200 at 6–8, and so on. Losses reset the
streak. The existing win-reward cooldown and coin amounts are unchanged.
Messages and Colonist wins are the only current XP sources. Daily rewards and
gambling affect coins; PUBG/FACEIT lookups, skins, profiles, losses, and voice chat
do not award XP. Previously recorded XP is not recalculated, and interrupted saves
retain their original reward amounts when recovered after an upgrade.
`/balance` shows usable wallet coins; stored legacy bank values are retained.

### Configuring XP rewards

One validated settings module controls rewards and cooldowns. Set environment
variables and restart the bot; no JavaScript edits are needed. `/level` displays
the active values alongside level progress.

| Variable | Default | Allowed values |
| --- | ---: | --- |
| `MESSAGE_XP` | 30 | Whole number, 0–10,000 |
| `MESSAGE_XP_COOLDOWN_SECONDS` | 60 | Whole number, 1–86,400 seconds |
| `COLONIST_WIN_XP` | 100 | Whole number, 0–1,000,000 |
| `COLONIST_STREAK_BONUS_XP` | 50 | Whole number, 0–1,000,000 |
| `COLONIST_REWARD_COOLDOWN_MINUTES` | 30 | Whole number, 1–10,080 minutes |

Zero XP disables that XP award; cooldowns must stay positive. Blank/unset values
use the defaults. Invalid values stop startup and identify the setting without
echoing its value. The Colonist reward cooldown applies to both XP and coins;
coin amounts and level thresholds stay unchanged. Old interrupted reward receipts
retain their original amounts when recovered after configuration changes.
`npm start` and `npm run dev` load `.env`; production must inject these variables
or use the existing environment-file setup.

### Colonist games with friends

1. A player opens `/colonist game` in a server channel. The creator is included automatically.
2. Friends press **Liity** to join (2–8 humans). **Poistu** leaves the lobby.
3. The creator presses **Aloita** to lock the roster, then everyone plays in Colonist.io.
4. The single winner presses **Voitin**, then **Vahvista** in a private confirmation.
   `/colonist win` opens the same confirmation for the caller's active game.
5. The bot records one win and a loss for every other participant, games played,
   streaks, and eligible rewards. The public card changes to the saved result.

No admin approval or user-entered match ID is needed. This is a trusted friend-group
report, not automatic verification with Colonist.io. Outsiders and bots cannot
claim a result. Only the creator starts a game; join/leave controls lock
on start, and a result being saved cannot be cancelled or assigned to a second winner.
Each player can participate in one unfinished game at a time.

Every game counts in the statistics. XP/coins are awarded at most once per winner
per configured cooldown (30 minutes by default); a game played sooner still updates wins, losses and streaks, and
does not postpone the next reward. Level roles synchronize after a saved win.

Sessions and rosters persist across restarts in `colonistGames.json`. Reopen your
active game card with `/colonist game` in its original channel if its message was
lost. Interrupted result saves recover at startup, or the reserved winner can
retry the same confirmation. Receipts prevent duplicate wins, losses or rewards.
Closing the private confirmation with **Takaisin** does not change the game.

The creator can use `/colonist cancel` from **any channel in the original server**,
including when the original channel or message was deleted. A moderator with Manage
Server can use `/admin colonist-cancel player:@Participant` to recover an abandoned
game even when its creator is unavailable, or press **Peruuta** on the game card.
Cancellation frees every participant without recording results. Only lobby or
playing games can be cancelled; a result already being saved must finish recovery.
Refreshing the old card is best effort and never undoes a saved cancellation.

The optional legacy moderator fallback is now `/colonist confirm winner:@Player
match:game-123456`. It retains the Manage Server permission, external match-ID
and anti-self-confirmation checks for manually confirmed results. Ordinary games
use the button flow. `/colonist loss` remains available for standalone losses,
but is blocked while the caller belongs to an active game, whose losses are automatic.

Re-register slash commands after upgrading. The consolidated `/pubg` and `/admin`
commands replace `/pubg-wins`, `/pubg-leaderboard`, and `/pubg-wins-add`. The new
`/profile`, optional lookup usernames, and leaderboard source option also require registration.
Groq chat has been removed; its environment variables are no longer used.
Back up and restore the entire data directory together, including game sessions,
rather than restoring individual reward files.

Dice returns 1.8 times the stake in total: a winning 100-coin bet increases the
balance by 80 coins. Rolling a sum of seven loses the stake.

## Persistent data and upgrades

Keep `DATA_DIR` on persistent storage and back it up before upgrades. User records
are retained, with cooldown and reward-receipt fields added as needed. Data files: `economy.json`, `userLevels.json`, `pubgWins.json`,
`pubgManualStats.json`, `playerProfiles.json`, `colonistWins.json`, `colonistGames.json`,
`pubgSkins.json`, and `reminders.json`.

Run **one bot process per data directory**; update queues are process-local.
Writes use temporary files and atomic replacement. Malformed or unreadable JSON
is reported rather than silently resetting users. Economy, skin changes, and
reminders, profile changes, and manual PUBG totals are saved before confirmation. Colonist game results save every participant’s
statistics and the winner’s coins/XP before reporting success. Chat XP, PUBG and unconfirmed Colonist
loss statistics batch writes for up to five minutes to reduce SD-card writes.

Both `SIGINT` and `SIGTERM` stop new work, flush stores, drain active interactions
and reminder delivery, flush again, then disconnect. The shutdown deadline is eight
seconds. Failed saves or timeouts exit with failure. Hard kills or power failures
can lose batched statistics that have not yet been flushed.

Fatal uncaught exceptions and unhandled rejections also stop new work, attempt a
bounded save and disconnect, then exit with failure. A fatal error during normal
shutdown escalates its exit code. Restarts are handled by your process supervisor;
running Node directly does not automatically launch a replacement process.
The deprecated `ready` listener has been removed; startup uses `clientReady`.

An example Pi service is in `deploy/discord-bot.service.example`. Adjust its user,
project path and Node 24 executable, and configure your existing supervisor with
`Restart=on-failure` and a stop timeout greater than the bot's eight-second deadline.
For Docker, use a restart policy such as `--restart unless-stopped`. Run one bot
instance per data directory. Installing/restarting a Pi service is a separate
operation from building and testing this repository.

Two compatibility details for older installations:

- Old skin commands ignored custom `DATA_DIR` and wrote to the working directory's
  `data/pubgSkins.json`. Stop the bot, back up the old file and copy it into
  `DATA_DIR` if no destination file exists. If both exist, reconcile them before
  starting; do not overwrite either blindly.
- Legacy Steam PC-region records resolve to a single Steam record per player,
  retaining the snapshot with the latest `lastUpdated`. Overlapping recent-match
  totals are never added together. Startup migration saves a `.before-player-keys-*.bak`
  copy of every original row before writing canonical player keys. Console records remain preserved.

## Deployment

The Docker image uses Node 24, locked installs and production dependencies only:

```sh
docker build -t discord-bot .
docker run --env-file .env -e DATA_DIR=/data -v discord-bot-data:/data discord-bot
```

Local `.env`, `.git`, data and dependency directories are excluded from the build
context. In a managed environment with a TLS inspection proxy, supply its CA as a
BuildKit secret: `docker build --secret id=proxy_ca,src=/path/to/proxy-ca.pem .`.
The CA is used only in networked installation steps and is not copied into layers.

On Railway, inject the variables and attach persistent storage at `DATA_DIR`.
The repository's Railway start command runs `node build/app.js`.

CI tests and builds on Node 24. Pushing to `release` runs the tests, builds the
Docker image and pushes the configured Docker Hub tag; that workflow requires
`DOCKER_USERNAME` and `DOCKER_ACCESS_TOKEN` repository secrets.
