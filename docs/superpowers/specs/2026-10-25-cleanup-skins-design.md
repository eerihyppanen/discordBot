# Bot cleanup and skin collection corrections

The user requested all five cleanup proposals and the previously proposed skin undo and browsing features. Preserve current commands and saved data except for explicitly obsolete code and PC-only command options.

- Remove unused helpers, the stray example entrypoint, the empty test bot and unused packages. Preserve the deployment compatibility entrypoint.
- Derive general and detailed help from the live command collection, including subcommands, required/optional inputs and choices. Replace template documentation with current usage.
- Standardize Node 24 in package engines, Docker, CI and devcontainers; keep installation locked and noninteractive. Update release actions without publishing anything during development.
- Manual PUBG edits accept username, wins and matches and write the same Steam record as API lookups. Preserve the newer main-branch player-key migration: back up original rows before initialization normalizes regional snapshots by player identity, preferring the newest complete record. Never sum overlapping match totals; preserve console records and the JSON record shape.
- `/lege undo` removes the invoking user's last stored skin and commits the corrected count and lastUnbox before confirmation. Empty undo reports that nothing can be undone.
- `/lege list` shows ten items per page with previous/next buttons. Only the originating user can navigate their own collection. Buttons read current stored data and clamp obsolete pages after changes. Empty, malformed or unauthorized navigation must not modify data or another user's message.
- Long legacy skin names must fit Discord's message limits. No new dependencies or live Discord writes are needed.

Approach: reuse existing JSON queues and discord.js builders. Use a dedicated skin-list renderer and component handler rather than per-message collectors, so buttons continue to work after a restart and go through the existing lifecycle and error handling. Generate help directly from registered command metadata rather than maintaining another command catalog.
