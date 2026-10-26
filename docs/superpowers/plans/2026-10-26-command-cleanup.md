# Colonist recovery and command cleanup

The user approved implementation, verification, commit and merge to main.

1. Add regression tests for same-server cancellation across channels, moderator recovery, permissions, and result-save protection.
2. Add `/colonist cancel` and `/admin colonist-cancel player` with durable cancellation and best-effort message refresh.
3. Consolidate player lookup and recent statistics into `/pubg stats username [view]`, rankings into `/pubg leaderboard`, and manual updates into `/admin pubg-stats`.
4. Remove Groq code, settings, tests and active documentation; update command help and usage documentation.
5. Run the full tests, build, dependency audit and production-container smoke checks. Obtain a fresh read-only code review and resolve material findings.
6. Commit, integrate any newer main changes, merge and push main. Report validation and remaining worthwhile improvements.

## Validation

- Regression tests failed on the old cancellation restrictions and command schemas, then passed after implementation.
- Full suite: 129 tests passed, zero failures.
- `npm run build` passed; `npm audit` reported zero vulnerabilities, including production dependencies.
- Production Docker build passed. With network disabled, its compiled commands passed smoke checks for all 14 definitions, PUBG last/recent/ranking paths, permission checks and durable moderator cancellation after the original channel was deleted.
- A fresh read-only reviewer independently ran the 45 relevant tests and found no critical, important or minor issues.
- Remaining existing PUBG behavior (sequential requests, partial snapshots, API replacement of manual snapshots) is documented or reserved for a later change.
