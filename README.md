# Discord Bot

A Discord bot for a gaming community: PUBG Steam PC statistics, Colonist results,
legendary skin collections, XP and roles, virtual coins, reminders, and Groq chat.

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
| `GROQ_API_KEY` | Groq chat |
| `GROQ_MODEL` | Optional model selection; defaults to `openai/gpt-oss-20b` |
| `CHANNEL_NAME` | Optional welcome channel name |
| `MEME_URL` | Optional image for customizing welcome messages |

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
| PUBG Steam PC | `/pubg username`, `/pubg-wins username`, `/pubg-leaderboard` |
| Manual PUBG statistics | `/pubg-wins-add username wins matches` (Manage Server required) |
| Other games | `/faceit username`, `/colonist win`, `/colonist loss`, `/colonist stats`, `/colonist-leaderboard` |
| Legendary skins | `/lege add`, `/lege undo`, `/lege count`, `/lege list`, `/lege leaderboard` |
| XP | `/level`, `/leaderboard` |
| Virtual economy | `/balance`, `/daily`, `/gamble coinflip`, `/gamble slots`, `/gamble dice` |
| Other | `/remind time message`, `/groq message`, `/8ball question`, `/help` |

PUBG lookups and manual statistics both use Steam PC player records; platform and
region inputs are no longer required. Recent PUBG statistics cover up to the last
20 available matches, not lifetime totals.

### Correcting and browsing legendary skins

Use `/lege add skin:Gold AKM` to record a drop. `/lege undo` removes **your most
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

## Persistent data and upgrades

Keep `DATA_DIR` on persistent storage and back it up before upgrades. Files retain
the existing JSON formats: `economy.json`, `userLevels.json`, `pubgWins.json`,
`colonistWins.json`, `pubgSkins.json`, and `reminders.json`.

Run **one bot process per data directory**; update queues are process-local.
Writes use temporary files and atomic replacement. Malformed or unreadable JSON
is reported rather than silently resetting users. Economy, skin changes, and
reminders are saved before confirmation. XP, PUBG and Colonist statistics batch
writes for up to five minutes to reduce SD-card writes.

Both `SIGINT` and `SIGTERM` stop new work, flush stores, drain active interactions
and reminder delivery, flush again, then disconnect. The shutdown deadline is eight
seconds. Failed saves or timeouts exit with failure. Hard kills or power failures
can lose batched statistics that have not yet been flushed.

Two compatibility details for older installations:

- Old skin commands ignored custom `DATA_DIR` and wrote to the working directory's
  `data/pubgSkins.json`. Stop the bot, back up the old file and copy it into
  `DATA_DIR` if no destination file exists. If both exist, reconcile them before
  starting; do not overwrite either blindly.
- Legacy Steam PC-region records resolve to a single Steam record per player,
  retaining the snapshot with the latest `lastUpdated`. Overlapping recent-match
  totals are never added together. Reads leave the file intact; the next explicit
  statistics update saves canonical records. Console records remain preserved.

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
