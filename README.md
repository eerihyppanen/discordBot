[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=542440024)

# Javascript Discord Welcome MemeBot with GitHub Codespaces

<img src="https://octodex.github.com/images/Robotocat.png" alt="image of robotocat" width="200" style="border:100px solid black"/>

Customize and deploy your own welcome memebot for your Discord server! 

This template repository has all the code you need, with a preconfigured Codespaces development environment, to send a welcome message along with a meme when a user joins your Discord server.

## How to customize your bot
<img src="https://octodex.github.com/images/manufacturetocat.png" alt="image of manufacturetocat" width="200"/>

### Step 1: Add a .env file
This template repository requires a `.env` file to pass variables to your application. The `.env` file is used to store data that you want to keep private or hidden like API keys or tokens from external services like Discord. 

This template repository has a sample .env file, `.env-sample`, that you can rename to `.env` or copy and paste the variables in `.env-sample` into a new `.env` file. 

### Step 2: Add your favorite meme
In your `.env` file you will find a variable named `MEME_URL` where you can add a URL to your favorite meme. 

### Step 3: Add a personalized welcome message
In the `src` directory you will find another directory called `events`. Open the `events` directory and you will find the `guildMemberAdd.js` file. You'll notice that we left helpful comments on where you can update the code to your liking.

To add a welcome message, you can update the `getWelcomeMessage` function after the `content:` keyword.

![code block of get welcome message function](https://user-images.githubusercontent.com/10368374/199597840-dd83efa6-8251-4def-868f-cdadb0df6f02.png)

### Step 4 (optional): Customize even further
Maybe you want to use an API service to provide random memes or maybe you don't want to share a meme at all. No matter what route you choose, you should take this Discord bot and make it your own. :smiley:

We recommend [creating a new branch](https://docs.github.com/en/desktop/contributing-and-collaborating-using-github-desktop/making-changes-in-a-branch/managing-branches#creating-a-branch) anytime you tinker so you don't have to worry about making mistakes on your main branch. Once your new branch is in a good state, you can [merge your changes](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/about-pull-request-merges) to your main branch using a pull request. :rocket:

## How to deploy your bot

<img src="https://octodex.github.com/images/jetpacktocat.png" alt="image of jetpacktocat" width="200"/>

### Step 1: Create a new application on Discord
Visit https://discord.com/developers/applications to create a new application on Discord. Once there, click the `new application` button. After you click on the `new application` button, you can then create a new application (Note: That we created a new application called `Bot Developer`):

![Screenshot 2022-10-07 at 1 01 38 PM](https://user-images.githubusercontent.com/11372162/194497650-50b0fd9b-da26-4bd4-b106-5a5016f47842.png)

### Step 2: Open your application

After creating an application you should see the application under `My applications`. Open your newly created application by clicking on it.

![Screenshot 2022-10-07 at 1 02 12 PM](https://user-images.githubusercontent.com/11372162/194497723-e57931ef-e25c-4d40-ba73-81b09ecd059e.png)

### Step 3: Configure your bot user

Select the Bot settings to edit the details. First, click on reset token to generate a new token that you will use in your `.env` file. Copy the generated token and set the `TOKEN` variable in your `.env` file with your newly generated token.

Select the public bot option if you want your bot to be publically available.
Select all the Privileged Gateway Intents like PRESENCE INTENT, SERVER MEMBERS INTENT, MESSAGE CONTENT INTENT if your bot needs those intents.(Note: For this application you'll need all of these intents.)

![image](https://user-images.githubusercontent.com/11372162/194498518-e535b2d0-0b64-4d1d-8527-f49314be16cb.png)

### Step 4: Select your bot permissions
Open the `OAuth2` setting and then select `URL Generator`.

Select the `bot` checkbox under `SCOPES`. After, select `Send Messages`, `Mention Everyone`, and `Add Reactions`. 

Once you have set your bot permissions copy the generated url below.

![image](https://user-images.githubusercontent.com/11372162/194498853-8ba28265-ab65-4df1-9e25-8d8913decfdb.png)

### Step 5: Choose your Discord Server
Visit the generated url from the previous step and choose the server that you want to add the bot to. Once you've selected the server click continue.

![image](https://user-images.githubusercontent.com/11372162/194499328-3874ccf5-d099-4f83-b62d-af091b06773a.png)

### Step 6: Run your application

Once the bot is added it will appear on your Discord server in offline mode.

You can now run the code in the repository using the command line by typing the command `npm start`. 



## Running and updating this bot

Use Node.js 24 LTS (`nvm use`) and install the locked dependencies with `npm ci`.
Copy `.env-sample` to `.env` and set `TOKEN`, `CLIENT_ID`, and `GUILD_ID`.
The game and AI commands also need their corresponding API keys.

- Run `npm test` for the regression suite and `npm run build` to compile the bot.
- Run `npm run deploy-commands` after updating slash command definitions. In particular,
  `/pubg-wins-add` now requires **Manage Server** both in its default command permissions
  and when it executes. Successful manual edits log the actor and changed values.
- Re-register commands after this update: `/colonist win` now requires `winner` and
  `match`, `/pubg-wins-add` no longer accepts `region`, and text inputs have length limits.
- `/pubg <username>` and `/pubg-wins <username>` search Steam PC players only.
  Re-register the commands to remove their old platform and region options.
  Command registration validates the entire command set before replacing it in Discord;
  an invalid command or a failed API request exits with failure.
- `GROQ_MODEL` selects the Groq model; the default is `openai/gpt-oss-20b`.
  Check [Groq's supported models](https://console.groq.com/docs/models) when changing it.
  Authentication, model, rate-limit, timeout, and invalid-response errors are reported separately.

### Persistent data and shutdown

`DATA_DIR` defaults to `data` in the working directory. Existing `economy.json`,
`userLevels.json`, `colonistWins.json`, and `pubgSkins.json` retain their user records.
XP and economy records gain cooldown and reward-receipt fields. PUBG player keys are migrated as
described below. Economy updates share a queue and are written before success is
reported. Every JSON write uses a temporary file and atomic replacement; malformed or
unreadable data is reported instead of silently resetting users.

Legendary skins now also use `DATA_DIR`, queued atomic writes, and save-before-confirmation.
Viewing counts, lists, or leaderboards does not write skin data. If you previously set a
custom `DATA_DIR`, the old skin command still wrote to `data/pubgSkins.json` in the bot's
working directory. Stop the bot and back up that file before upgrading, then copy it into
`DATA_DIR` if no skin file is already present there. If both files exist, reconcile them
before starting; do not overwrite either collection blindly.

Keep `DATA_DIR` on a persistent disk or volume, including when deploying to Railway or
Docker. For example, mount a volume at `/data` and set `DATA_DIR=/data`. Back up this
folder before deploying. Run **one bot process per data directory**: the write queue is
within a process, so replicas must not share these JSON files.

Chat XP, PUBG wins, and unconfirmed Colonist loss statistics batch writes for up to five minutes to reduce
SD-card writes. Confirmed Colonist wins persist their coins, XP and statistics before success is reported.
XP leaderboards and level checks for existing users read the shared in-memory
XP data, including unsaved changes, without extra disk reads or scheduled writes.
Both `SIGINT` and `SIGTERM` stop accepting new work, flush current state,
finish in-flight commands, flush again, and then disconnect Discord. Shutdown has an eight-second
deadline and exits with failure if a save fails or the deadline is exceeded. A hard kill
or power failure can still lose stats that have not reached the five-minute save.

### Rewards and levels

Server messages earn 15 XP at most once per user per 60 seconds, shared across channels
and servers. Bot messages, webhooks and DMs do not earn XP. A reward can cross several
level thresholds at once. Both chat XP and confirmed Colonist wins synchronize the
winner's level role; a later eligible message retries a missed role update. The bot
needs Manage Roles and a role above the level rewards in the server hierarchy.

To confirm a Colonist win, a different member with **Manage Server** uses:

```text
/colonist win winner:@Player match:game-123456
```

Use the actual unique match ID (6–100 letters, numbers, underscores or hyphens), not
a reusable room code. Confirmation is a moderator's attestation, not an automatic
lookup against the Colonist service. Moderators cannot confirm their own wins.
The winner must be a human member of that server and can receive one confirmed win
per 30 minutes. Match IDs are case-insensitive and cannot reward another winner or
be reused across servers. `/colonist loss` still records your own losses.

If confirmation fails, retry with the **same match ID**. A durable coin receipt and
per-match XP/stat markers prevent duplicate payouts and allow startup to finish an
interrupted award. Finish a pending award before recording that player's next result.
Back up and restore the entire data directory together, not individual reward files.
Dice winnings now return 1.8 times the stake in total: a 100-coin winning bet increases
the balance by 80 coins. A sum of 7 loses.

### PUBG player-key migration

PUBG records now use the same normalized username and platform for API lookups and
manual updates; region no longer creates a separate leaderboard entry. At startup,
legacy regional duplicates are merged using the most recent `lastUpdated` snapshot.
Win counts are **not summed**, since snapshots can contain the same matches. Equal
timestamps prefer an already canonical entry, otherwise a deterministic key order.
Platforms remain separate. A username change is not automatically linked to an old name.

Before replacing any keys, the bot saves the entire original file beside it as
`pubgWins.json.before-player-keys-<unique-id>.bak`. A backup failure stops migration.
Keep this backup to review older or conflicting manual values. The new file retains
one record per username/platform, and subsequent startups do not migrate it again.

### Text and FACEIT commands

New skin names are limited to 100 characters and validated before saving. Existing
long names are shortened only for display; saved collections remain intact. `/8ball`
questions are limited to 1024 characters. FACEIT reads the player profile and the
separate CS2/CSGO lifetime-statistics endpoint, preserves zero values, and reports
authentication, rate-limit, timeout and missing-player errors separately.

### Reminders

Reminders are stored in `reminders.json` before confirmation and checked every 15 seconds.
Pending and overdue reminders resume when the bot is online again. Delivery first tries
a DM, then a normal bot message in the original channel, so it does not depend on an old
interaction token. If both destinations fail, the reminder stays saved and retries with
backoff. The bot needs permission to send messages and embed links in the fallback channel.
A crash after sending but before recording completion can cause a duplicate reminder.
