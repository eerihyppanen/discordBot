# Colonist Game Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement the approved Discord game-card flow without admin approval or a user-entered game ID.
**Architecture:** A durable session state machine controls rosters and one final winner. The existing statistics/XP/economy queues apply a whole game's outcome using receipts and recover interrupted transactions at startup. Stateless Discord buttons render stored state and require membership plus the matching guild/channel.
**Tech Stack:** Node 24, discord.js 14, node:test, existing atomic JSON stores.
**Spec:** docs/superpowers/specs/2026-10-26-colonist-games-design.md

## Global Constraints

- Work in the existing isolated cloud checkout on feat/colonist-game-sessions.
- Preserve all legacy stats, moderator-confirmation receipts and recovery behavior.
- No new dependencies, live Discord writes, direct main merge, or deployment.
- Persist sessions and transaction receipts in DATA_DIR; one bot process per directory.

## Review Focus

- Competing winners and duplicate confirmations must produce exactly one outcome.
- Crashes before/after coin, XP and stats writes must recover all participants once.
- A skipped reward must still record the game and must not reset reward eligibility.
- Bots, outsiders, stale cards and cross-channel/guild buttons must not mutate state.
- A Discord message/role failure after completion must not undo a saved game.

### Task 1: Whole-game outcomes
**Files:** src/utils/colonistSystem.js, tests/colonist-game-results.test.js.
**Interface:** recordGameResult({ id, guildId, players:[{id,username}], winnerId, finishedAt }) returns {winnerId,xpReward,coinReward,rewarded,newBalance,alreadyRecorded}; existing legacy exports remain.
- [x] Write tests for one winner/all losses, concurrent retries/conflicts, reward-only cooldown, failed writes and pending-participant protection.
- [x] Observe expected failures; implement durable receipts, stats snapshots and startup recovery.
- [x] Run targeted tests and the full regression suite.

### Task 2: Persistent game state
**Files:** src/utils/colonistGameSystem.js, tests/colonist-games.test.js, tests/fixtures/colonist-game-recovery.mjs, tests/colonist-game-recovery.test.js.
**Interface:** createColonistGameSystem(store,{recordResult,now}) exposes initialize/flush/create/get/activeFor/attachMessage/join/leave/start/cancel/confirm. Context is {guildId,channelId}; player is {id,username,bot?}.
- [x] Write failing tests for lobby permissions, locked rosters, one active game, idempotent confirmation and restart recovery.
- [x] Implement the state machine and recovery; persist `recording` before effects.
- [x] Exercise real crash boundaries in child processes; run the full suite.

### Task 3: Discord flow and integration
**Files:** src/utils/colonistGameUI.js, src/commands/colonist.js, src/utils/interactionHandler.js, src/app.js, tests/colonist-game-ui.test.js, existing command/reward tests, README.md.
**Interface:** command.handleButton routes colonist:game buttons; /game posts/reopens the card, /win privately confirms, /confirm retains old moderator behavior.
- [x] Write failing command/button tests for actor checks, self-confirmation, roster updates and failed public-message updates.
- [x] Implement Finnish game cards and stateless controls; initialize/flush games in app lifecycle.
- [x] Update legacy command tests to /confirm; document registration, persistence and reward semantics.
- [x] Verify npm test, build, audit, production-image behavior and a fresh read-only review.
- [x] Commit the feature branch; leave merge/deployment for the user.

## Completion evidence

- New outcome and game-state tests observed failing before implementation, then passing.
- Legacy moderator command fixtures now target `/colonist confirm`; ordinary `/win` has no required inputs.
- Four real child-process crash boundaries (reserved session, coins, XP, stats) recover one winner, all losses and one payout across repeated restarts.
- Reservation and final session-file failures preserve a single winner and retry without duplicate effects.
- All 130 regression tests pass. Build passes. Full dependency audit reports 0 vulnerabilities. All 17 command definitions validate.
- A fresh read-only reviewer identified out-of-order public message edits; the failing delayed-join reproduction now passes with a per-game publication queue that reads current state. Completion and reopened-card publications share this queue.
- Private success-reply failures and synchronous public/role API errors are isolated after durable completion; regressions pass. The reward cooldown is shared symmetrically with the legacy fallback and skipped rewards never postpone eligibility.
- Production Docker image builds with verified TLS. Its compiled commands exercise the full lobby/join/start/private-confirm/result flow using production dependencies only, with no live provider requests; a second container verifies persisted data after restart.
- Integration/deployment: committed to the feature branch for review; slash commands must be re-registered on deployment. No live bot session, Discord registration, main merge or production deployment was performed.
