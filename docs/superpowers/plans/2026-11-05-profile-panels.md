# Profile panels

The user approved consolidating nine profile subcommands into four and authorised pushing or merging after verification. Work starts from `be2f2dffa6772865f80fc8c5c003be59a68445c8` on a feature branch; merge the reviewed result after checks pass.

## Design

- `/profile card [user]` remains public and reads cosmetics only.
- `/profile settings` privately shows saved names. Edit buttons open one-game modals, and clear buttons remove one or both saved names. Saving one game preserves the other.
- `/profile shop` privately shows prices, wallet balance and purchase buttons. Owned items are labelled and disabled; the domain service still prevents duplicate charges.
- `/profile inventory` privately shows owned items with no prices. Separate title/badge selectors contain owned items only. Removal buttons unequip items without losing ownership. Shop/inventory navigation reuses the same private message.
- Component and modal IDs bind to the caller. Validate owner, component type, action and selected item before mutation. Recheck ownership in the economy service.
- Acknowledge mutations promptly, then serialize each message's mutations and publications to prevent late HTTP edits overwriting newer panel state. Read fresh data for each action; do not store private message tokens or use temporary collectors.
- Keep persistence formats, balances, ownership, XP and saved usernames unchanged. Legacy cached slash commands redirect to the new panel with an explanation and perform no writes from old inputs.

## Tasks

- [x] Write failing panel tests for owned-only selectors, private settings, modal saves, owner guards, duplicate/failed purchases, stale/forged controls, removed commands and routing.
- [x] Implement the four command definitions, private panels and shared component routing.
- [x] Update help, lookup guidance and README; run all tests and build.
- [x] Fresh read-only review, production smoke checks and required fixes.

## Verification

- All 202 tests pass; the production build and `git diff --check` pass.
- An independent read-only review found no defects and passed 46 targeted tests.
- The production Docker image passes a network-disabled smoke test covering command registration metadata, private settings and modals, purchases, owned-only selectors, equip/remove actions, public-card privacy, owner checks, legacy redirects and panel navigation.
- A regression test confirms an acknowledgement failure behind a pending panel edit neither mutates state nor causes an unhandled rejection.

## Integration

Commit, publish and merge the verified branch as authorised, then verify GitHub main. Re-register slash commands when deploying so Discord exposes the four-command layout.
