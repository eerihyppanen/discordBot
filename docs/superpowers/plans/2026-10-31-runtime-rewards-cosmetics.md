# Runtime, Rewards and Cosmetics Implementation Plan

> Execute inline with test-first checks and a fresh final review. User approval is required before merge.

**Spec:** `docs/superpowers/specs/2026-10-31-runtime-rewards-cosmetics-design.md`

**Goal:** Improve recovery, expose configurable XP, and make virtual coins useful for cosmetic profiles.

**Architecture:** Extend the existing lifecycle; validate startup settings in one module; keep purchases and ownership atomic in `economy.json`; render public cosmetics separately from private saved usernames.

**Constraints:** Node 24; no new dependencies; preserve balances, XP, receipts and cooldown defaults; no live Discord access needed; feature branch only.

## Review focus

- Fatal errors during shutdown must produce failure, including when a flush stalls.
- Environment settings must affect actual rewards, displayed rules and cooldown checks consistently.
- Old interrupted receipts must recover their original amounts after settings change.
- Concurrent purchases/gambling/rewards must not overspend or lose ownership.
- Public cards must never reveal saved game names or other private profile settings.

## Task 1: Runtime recovery

- [x] Add failing lifecycle and child-process tests for fatal exit, flush, escalation, deadlines and absence of the old ready listener.
- [x] Extend lifecycle fatal shutdown, add reusable process handlers, and remove duplicate startup/error handlers.
- [x] Run lifecycle, shutdown and runtime tests; document supervisor restart configuration.

## Task 2: Reward settings

- [x] Add settings validation, configured-reward/cooldown and `/level` display regressions.
- [x] Implement one settings module and consume it in message XP, Colonist rewards and `/level`.
- [x] Run reward, settings, level and old-receipt recovery tests; document environment values.

## Task 3: Cosmetic economy

- [x] Resolve the optional cosmetic preference, stating the default if unanswered.
- [x] Add purchase/equip/inventory persistence, concurrency, insufficient funds and failed-write tests.
- [x] Implement fixed catalog and atomic economy operations without changing existing reward receipts.

## Task 4: Cosmetic commands

- [x] Add command tests for shop/buy/equip/unequip/inventory, public cards, private usernames and cross-user isolation.
- [x] Extend `/profile`, update generated-help assertions and README.

## Task 5: Verify and prepare review

- [x] Full suite, build, audit and production-container smoke checks.
- [x] Fresh read-only review; fix important issues with regression tests.
- [x] Commit/publish the review branch, verify main unchanged, and ask permission to merge.

## Progress

Base: `aa53b2db358a91161980705c9429a9c5ab50899a`. The optional cosmetic question is pending; runtime and XP work do not depend on it.

Implementation progress: runtime tests went from five expected failures to 10 passes; configurable reward and recovery checks passed 29 tests; atomic cosmetic checks passed 25 tests including existing economy/game behavior; profile/privacy/help checks passed 18 tests. The optional preference received no answer during independent work; the stated default is profile titles and badges. Main is unchanged.

Final verification: 182 full-suite tests pass and the build passes. Independent review ran 22 focused tests and found no blocking issues. A minor design wording issue about displaying raw item IDs was resolved in the spec: users select names/prices in Discord choices, with stable IDs kept internally. A final admission-order regression caught deferred shutdown; fatal and signal handlers now stop new work synchronously (two failing tests became green).

Production audit reports zero vulnerabilities. Full audit reports two moderate advisories in unchanged development-only nodemon/minimatch; npm reports no automatic fix. Dependency versions were not changed. Production Docker feature checks passed for purchases, duplicate protection, public-card privacy, configured rewards/cooldowns and displayed rules. The compiled app saved pending XP and exited with failure on a simulated uncaught exception; final-image verification follows the admission-order fix.

Final-image result: Docker build and both network-disabled smoke checks passed after the admission-order fix. All 15 command definitions validate; cosmetics, configured XP and fatal save/exit paths work in production dependencies only.

- [ ] Merge approval: publish the tested feature branch and request permission; main remains at the original base until approval.
