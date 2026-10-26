# Colonist games in Discord

Approved user flow: a friend group plays a game with exactly one winner. A player
opens `/colonist game`; members join a persistent public game card; its creator
starts it and locks the roster. A participant presses `Voitin` and confirms their
own claim. No moderator or manually supplied match identifier is required. One
winner and every other participant's loss are recorded once per game, together
with games played, streaks and rewards. Sessions survive a bot restart.

Implementation choices:
- Creator joins automatically. Games have 2–8 human participants and at most one
  unfinished game per participant. Only the creator starts/cancels the game; roster
  changes are allowed only in the lobby. A player may reopen their active card
  using `/colonist game` in its original channel.
- `/colonist win` opens the same private confirmation for the caller's active game.
  Move the existing moderator-only fallback to `/colonist confirm`; retain its
  existing recovery and receipts for backwards compatibility.
- A single claim is committed before results are applied. A recording state locks
  the winner and roster; retries and startup recovery finish the same transaction.
  Persist all participant statistics atomically and retain durable economy/XP
  receipts. Never double-pay or record a loss twice after retries or restarts.
- Every session counts in statistics. The existing 30-minute interval limits only
  the winner's XP/coins, with a separate last-reward timestamp. Skipped rewards do
  not postpone the next eligible reward. No admin confirmation or external API.
- Discord IDs and game context determine authority. Wrong guild/channel, outsiders,
  bots, late joins, and old buttons cannot change a completed result. A private
  confirmation can be dismissed without modifying the game. No collector timers.
- Public result updates and role synchronization follow durable completion; a
  Discord error cannot roll back a saved result or invite a second winner.

Non-goals: automatic Colonist.io result verification, teams, editing a finished
result, and automatic main-branch merge or production deployment.
