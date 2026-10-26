# Offline Work Revocation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Confirmed removed work cannot reappear or reopen offline; valid offline work and musical behavior are preserved.

**Architecture:** Add durable access tombstones to the existing local repository, not cloud data. Use exact status checks for missing cached list entries and existing foreground sync for full cached graphs. Keep UI integration limited to startup and list-only refresh.

**Tech Stack:** JavaScript ES modules, Node test runner, IndexedDB/fake-indexeddb, existing Playwright browser matrix.

**Spec:** docs/superpowers/specs/2026-10-25-offline-work-revocation-design.md

## Global Constraints
- No teacher, delivery, music rendering, playback, fingerboard or follow implementation edits.
- No cache reset, content deletion, cloud schema/rules change, polling, merge or deployment.
- Preserve online opening if best-effort local persistence fails.
- Exact revoked status only; filtered-list absence, errors and unknown states never revoke.

## Review Focus
- Late Piece/package responses after revocation, including children without cached bytes.
- Same identity in different students, account switch during requests, new delivery identity.
- IndexedDB v3→v4 upgrade, interrupted graph write, second repository/tab.
- Folder moves and transient failures; never clear the whole assignment metadata map.
- Revalidation during playback must retain active workspace and follow state.

### Task 1: Durable repository revocation
**Files:** src/offline/{inMemoryOfflineRepository,indexedDbOfflineRepository,syncCoordinator}.js; test/offlineRevocationRepository.test.js
**Interfaces:** isAccessRevoked({studentId,accessRef}); revokePieceAccess({studentId,pieceAssignmentId,lastVerifiedAt}); existing put/list/get interfaces remain.
- [x] Add parity tests for revoked Piece stale writes, new package on revoked access, uncached children, student/new-identity isolation, restart and v3 upgrade.
- [x] Run tests RED; add additive local tombstone store and atomic Piece graph revocation; run GREEN.

### Task 2: Read-service reconciliation
**Files:** src/offline/secureDeliveryOfflineReadService.js; src/ui/student08Composition.js; test/offlineWorkReconciliation.test.js
**Interfaces:** optional status service; cached access refs for foreground sync; existing list/open return contracts unchanged.
- [x] Add RED real service/repository tests for list absence followed by exact status, moved folder, transient failure, stale metadata and delayed opens.
- [x] Reconcile only missing cached entries; apply persistent revocation guards before returning lists/open results; run GREEN.

### Task 3: Lifecycle and single-flight sync
**Files:** src/offline/syncCoordinator.js; src/ui/main.js; src/ui/mountStudentApp.js; relevant lifecycle tests; service-worker.js only cache revision/assets.
**Interfaces:** sync({session}) coalesces by initiating student; sessionIsCurrent callback prevents token/account races; list refresh never invokes practice APIs.
- [x] Add RED tests for online restore/sign-in, coalescing, account switch and reconnect list refresh without practice reset.
- [x] Wire startup and existing reconnect; refresh only unchanged My Work; run GREEN.

### Task 4: Verification and handoff
- [x] Run npm test and git diff --check; attempt Chromium/WebKit browser matrix. Browser execution is blocked locally by unavailable executables and truncated download; CI and physical acceptance remain open.
- [x] Review protected source diff and full branch independently; fix material findings with RED→GREEN tests.
- [x] Record evidence and remaining physical iPhone/PWA acceptance. No merge/deploy.
