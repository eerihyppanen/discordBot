# Runtime recovery, reward settings and cosmetics

Implement the three requested improvements on a review branch. Preserve existing records and ask before merging.

## Runtime

Use the existing `clientReady` handler and remove the deprecated `ready` listener. Fatal uncaught exceptions and unhandled rejections stop new work, attempt bounded store flushes and disconnect, then exit with failure so an external supervisor can restart the bot. Normal SIGINT/SIGTERM remain successful unless saving fails. A fatal error during a normal shutdown escalates its exit code. The shutdown deadline must keep the event loop alive until exit.

## Reward settings

One validated module reads settings at process startup. Defaults remain 30 message XP, 60 seconds between message rewards, 100 Colonist win XP, +50 XP per three-win streak step, and 30 minutes between Colonist rewards. Environment overrides are `MESSAGE_XP`, `MESSAGE_XP_COOLDOWN_SECONDS`, `COLONIST_WIN_XP`, `COLONIST_STREAK_BONUS_XP`, and `COLONIST_REWARD_COOLDOWN_MINUTES`. XP allows zero; cooldowns must be positive integers. Invalid settings fail startup with the setting name but without echoing values. Existing XP, level thresholds, coin amounts and durable reward receipts are preserved. `/level` shows actual configured rewards and cooldowns. Replace the obsolete generic 15-XP default with the configured message amount.

## Cosmetics

The optional preference question offers profile titles/badges or Discord cosmetic roles. The stated default is titles and badges, visible on `/profile card [user]`; saved game names stay private in `/profile show`. A fixed catalog advertises item names and prices; slash-command choices carry stable item IDs internally. Purchases, ownership and wallet deductions share one atomic economy-file transaction; duplicate purchases cannot charge twice. Equip requires ownership, and users can unequip without losing items. Cosmetics never alter XP, roles, game statistics or permissions. Profile clearing removes game names only.

Prefer the existing `/profile` root over extra top-level commands: add shop, buy, inventory, equip, unequip and card. Shop actions are private; cards are public and contain cosmetic information only. Start with three titles and three badges, priced from 300 to 2500 coins. No random rewards, transfers or real-money purchases.

## Approach

Build on Node 24, discord.js, native JSON queues and the existing lifecycle, with no new dependencies. Storing cosmetic ownership beside coins avoids multi-file purchase recovery. Profile cosmetics avoid managing extra Discord roles or interfering with level roles. Runtime supervisors own restart; the bot does not spawn replacement copies of itself.
