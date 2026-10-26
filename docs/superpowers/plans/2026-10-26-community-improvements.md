# Community Improvements Implementation Plan

> For agentic workers: use superpowers:executing-plans inline, with test-first verification and one fresh whole-branch review.

**Goal:** Implement the five approved improvements and modestly faster leveling, then present a tested branch for merge approval.

**Architecture:** Extend the existing JSON stores and slash-command metadata. Keep API snapshots, moderator totals and profile preferences in separate files. Bound and cache PUBG HTTP requests centrally.

**Tech Stack:** Node 24, discord.js 14, native fetch, node:test; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-community-improvements-design.md`

## Global Constraints

- Work on a feature branch; ask permission before merging.
- Save user settings and manual totals before success responses.
- Preserve all existing player records and XP; unchanged level thresholds and reward cooldowns.
- Build and test without live Discord/game credentials.

## Review Focus

- Cache failures, expiry and concurrent identical lookups must not conceal failures or exceed three HTTP requests.
- Partial PUBG match fetches must not overwrite a complete stored snapshot.
- Manual totals must survive API refreshes and restarts.
- Clearing one saved username must preserve the other; failed writes must not acknowledge success.
- A missing welcome channel or rejected send must not produce an unhandled rejection.

### Task 1: Leveling and small cleanups

- [x] Add failing tests for 20 XP/cooldown, wallet-only output, and welcome channel/delivery handling.
- [x] Implement changes in `levelingSystem.js`, `economy.js`, `guildMemberAdd.js`; run reward/event/command tests.

### Task 2: Saved profiles and independent PUBG totals

- [x] Add tests for profile persistence, partial updates, clear, invalid values and failed writes; test independent API/manual totals across restart.
- [x] Add `profileSystem.js`; extend `createPubgWinsSystem(file, { saveDelayMs })` and export manual-store methods. Register both stores in app initialization/shutdown.

### Task 3: Reliable PUBG fetching

- [x] Add failing client tests for caching, expiry, request coalescing, cache bounds, failures and global concurrency.
- [x] Implement `createPubgClient({ fetchImpl, now, playerTtlMs, matchTtlMs, maxEntries, concurrency })` with `getPlayer` and `getMatchStats` methods.
- [x] Add command regression tests proving partial lookups preserve saved snapshots; consume the cached client and show partial status.

### Task 4: Command integration and documentation

- [x] Add failing command tests for profile set/show/clear, saved-name fallbacks and explicit overrides, manual leaderboard selection and permissions.
- [x] Implement `/profile`, optional lookup usernames, leaderboard source choice, and manual-update routing. Update generated-help assertions, README and sample settings.

### Task 5: Verification and review

- [x] Full test suite, build, dependency audit and production Docker smoke checks.
- [x] Fresh read-only review; resolve important findings with regression tests.
- [x] Commit and publish only the feature branch, verify main unchanged, and ask permission to merge.

## Progress

Implementation decisions follow the design; the user's instruction reserves approval for the tested merge result.

- Baseline: 129 tests passed before changes.
- Task 1: failing XP/welcome/balance regressions became 25 passing targeted tests.
- Task 2: profile/manual persistence regressions became 11 passing persistence and migration tests.
- Task 3: caching, concurrency and partial-snapshot regressions became 15 passing tests.
- Task 4: command/profile/manual-source regressions became 38 passing command tests.
- Full suite: 153 tests passed; build passed; dependency audit reported zero vulnerabilities.
- Production Docker build and smoke checks passed with network disabled: all 15 command definitions, profile fallbacks, cache reuse and concurrency, partial-result protection, independent durable manual totals, XP/level progression, legacy bank preservation and welcome delivery.
- Fresh independent reviewer ran 29 focused tests and found no Critical, Important or Minor issues. Queue admission limits and multiple-process coordination remain outside this single-process bot's scope; historical rows without source metadata retain their documented behavior.
- [ ] User merge approval: request after publishing the tested branch. Main remains at the original base until approval.

## Follow-up: more XP

The user requested another increase for messages and wins while asking which actions currently award XP. The review branch now awards 30 XP per eligible message, 100 XP per Colonist win and +50 XP per complete three-win streak step. Cooldowns, coins, existing XP and level thresholds are unchanged.

- Updated reward assertions failed at the previous rates, then passed with the new constants.
- Full suite: 156 tests passed, including both game-session and moderator receipt recovery across the old/new reward rates, cooldowns, streak steps and duplicate protection.
- Build and compiled-runtime XP smoke passed. No XP is granted for losses; coins retain their existing amounts.
- Changes remain on the feature branch awaiting explicit merge permission.

## Follow-up: admin status

Add the requested `/admin status` under the existing Manage Server permission gate. Replies are private. Show Discord readiness and gateway latency, process uptime, memory use, Node version, loaded command count, and whether the PUBG/FACEIT keys and command-registration settings are present. Never display secret values or send diagnostic API requests. Missing and sample-placeholder keys must not appear configured. Explain that configured keys have not been authenticated by this command.

- [x] Add regression tests for metadata, permission checks, private replies, actual SDK client state, missing/sample configuration, secret redaction and absence of API calls.
- [x] Implement a focused status renderer and route the subcommand before the Colonist fallback.
- [x] Update README/help, run full tests/build and a compiled status check, then commit only to the review branch.
- [x] Keep main unchanged pending merge approval. Configurable XP and extra `/level` reward information remain proposals, not part of this request.


Status verification: 161 full-suite tests passed, build passed, and compiled-runtime checks passed with an actual SDK client. Permission checks, ephemeral replies, missing/sample settings and secret masking are covered; no external API calls are made. The branch remains unmerged.
