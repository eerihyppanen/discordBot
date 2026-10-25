# Bot Cleanup and Skin Browsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Complete the user's five cleanup requests and add safe skin undo and browsing.
**Architecture:** Keep the existing JSON stores and command registry; add a focused skin component handler and derive help from real command definitions.
**Tech Stack:** Node 24, discord.js 14, node:test, esbuild.
**Spec:** docs/superpowers/specs/2026-10-25-cleanup-skins-design.md

## Global Constraints

- Work in the existing isolated cloud checkout and feature branch; do not create a worktree.
- Preserve JSON file formats, existing console data, and permissions on manual PUBG edits.
- No new dependencies, Discord writes, publication, or merging.
- Use Node 24 across development, CI and production.

## Review Focus

- Undo must leave data unchanged if persistence fails; test with an unwritable destination.
- Outdated pagination buttons must clamp after undo, and clear components for an empty collection.
- Unauthorized or malformed buttons must never edit the original message or modify a collection.
- Long legacy skin names and detailed command help must respect Discord embed limits.
- Regional PC aliases must resolve to one Steam player without summing overlapping match windows or losing console records.

### Task 1: PC records and live help

**Files:** src/utils/pubgWinsSystem.js, src/commands/pubg-wins-add.js, src/commands/help.js, tests/commands.test.js, tests/pubg-records.test.js, tests/help.test.js.
**Interfaces:** Preserve updatePlayerWins/getPlayerWins signatures; accept only username/wins/matches in the manual command. Help consumes interaction.client.commands and command.data.toJSON().

- [x] Write tests for live help, current metadata, full manual-PC edits, legacy aliases and conflict resolution.
- [x] Run targeted tests; confirm failures describe the old help and record behavior.
- [x] Implement normalization and metadata-driven help; keep Manage Server checks.
- [x] Run targeted tests and the full suite; commit the task.

### Task 2: Skin undo and browsing

**Files:** src/utils/skinSystem.js, src/utils/skinList.js, src/commands/lege.js, src/utils/interactionHandler.js, src/app.js, tests/skins.test.js, tests/skin-list.test.js.
**Interfaces:** skins.undo(userId) returns {skin, userData} or null. Skin button IDs encode owner and requested page; handleSkinButton(interaction) acknowledges navigation and renders current data. dispatchInteraction routes commands and buttons inside lifecycle.run.

- [x] Write tests for persisted undo, empty undo, failed writes, page boundaries, long names, invalid/unauthorized buttons, stale pages and routing.
- [x] Run targeted tests; confirm failures from missing behavior.
- [x] Implement queued undo, ten-item pages, owner checks and common interaction dispatch.
- [x] Run targeted tests and full suite; commit the task.

### Task 3: Remove dead code and modernize setup

**Files:** package.json/package-lock.json, unused source files, Dockerfile, .dockerignore, .nvmrc, nodemon.json, .devcontainer/*, .github/workflows/*, README.md.
**Interfaces:** npm test/build/start/dev/deploy-commands remain supported; Node 24 is the runtime floor.

- [x] Remove confirmed unused files and packages; use frozen dependency installation for verification.
- [x] Update Node and release actions; make devcontainer setup preserve an existing .env and use the checkout's real path.
- [x] Replace template documentation with accurate commands, deployment, DATA_DIR and migration notes.
- [x] Run npm ci, all tests, build, dependency audit and diff checks. Check Docker availability; report a build as unrun if unavailable.
- [x] Review the completed diff, address material findings and commit.

## Completion evidence

- Task 1: completed in b40b0d9; new help/PC tests were observed failing and then passing; full suite 65/65.
- Task 2: completed in 8aa1eb6; undo/navigation tests were observed failing and then passing; full suite 74/74.
- Task 3: devcontainer path/preservation tests were observed failing and then passing; frozen install and full suite 76/76; build passed; production audit 0 findings.
- Production Docker image built with verified TLS and a temporary CA secret. An in-container smoke check loaded all 17 commands and exercised persisted skins, undo, page buttons, dispatch and generated help using production dependencies only.
- Remote release tags verified from the upstream action repositories. The devcontainer image tag was selected from the Microsoft Container Registry tag list after the old-generation tag was confirmed unavailable.
- Fresh read-only review found no actionable defects. Its scope limits were arbitrary repair of individually malformed legacy records, future registries over 25 commands, and live provider/API behavior. These are outside the requested cleanup; existing valid formats and all current 17 commands are covered. No live Discord registration or image publication was performed.
