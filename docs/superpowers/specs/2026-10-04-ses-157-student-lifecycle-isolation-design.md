# SES-157 — Student Lifecycle Isolation + Bounded Offline Recall Design

Date: 2026-10-04

## Purpose

SES-157 proves that one teacher-owned Piece behaves as one student-visible work across lifecycle changes, does not leak SCORE/CHORD child assignments as duplicate rows, and becomes unusable after teacher revoke once authority can be revalidated.

The design is acceptance-first. Existing production behavior is preserved when it already satisfies the contract. Production code changes are only justified by a failing acceptance case.

## Scope

The acceptance fixture is one Piece containing:

- one SCORE child;
- at least two CHORD_BOARD children;
- one teacher note;
- stable Piece identity across lifecycle transitions.

Required lifecycle coverage:

- ACTIVE;
- legacy COMPLETED compatibility;
- REPERTOIRE;
- REVOKE while online;
- REVOKE after an offline warm-cache period;
- transient network failure during foreground authority revalidation.

## User-visible contract

### ACTIVE

The Piece appears exactly once in Aktif Çalışmalar. SCORE and CHORD_BOARD children are content of the Piece and must not appear as separate duplicate work rows.

### COMPLETED compatibility

Legacy COMPLETED Piece data may still be read. If present, it appears only in Bitmiş Çalışmalar. No child assignment may leak into another folder.

COMPLETED is compatibility-only and is not required as a new teacher workflow step.

### REPERTOIRE

The same immutable Piece identity appears exactly once in Repertuarım. It no longer appears in Aktif Çalışmalar. SCORE, chords, and teacher note remain attached to that Piece.

### REVOKE online

After teacher revoke, a fresh authorized read must not expose the Piece or any of its SCORE/CHORD child authorities. No hard delete or unrevoke behavior is introduced.

### REVOKE while offline

Previously cached content may remain usable while the device is genuinely offline because server authority cannot be checked.

At the first successful foreground sync after connectivity returns:

1. the Piece authority is revalidated;
2. exact server NOT_FOUND/REVOKED marks the cached Piece manifest revoked;
3. all cached SCORE/CHORD child access belonging to that Piece must also become unauthorized;
4. the Piece must disappear from active student folders and must not reopen from cache.

Cached physical bytes do not need to be deleted. Authorization must be removed.

### Transient network failure

A timeout, unavailable service, or other transient failure must not be interpreted as teacher revoke.

The sync reports an error, preserves the last known authorized cache state, and retries on a later successful foreground sync.

## Existing architecture to preserve

### Piece-first student listing

`studentAppController.showMyWork()` already reads Piece manifests and legacy assignments, collects each Piece's SCORE and CHORD child assignment IDs, and filters those children out of the legacy assignment list. This remains the canonical duplicate-suppression rule.

### Online authority

`secureDeliveryStudent08ReadService` remains the online student read boundary. Student code has no lifecycle write authority.

### Offline reads

`secureDeliveryOfflineReadService` remains responsible for serving cached Piece manifests and cached child practice packages while offline.

### Foreground revalidation

`syncCoordinator` remains the only foreground authority reconciliation path. `secureDeliveryStatusService` continues to map only exact Secure Delivery `404 NOT_FOUND` to REVOKED. Transient failures remain errors, not revocations.

### Offline repositories

Both in-memory and IndexedDB repositories retain separate Piece-manifest and child-package authorization records. Revocation changes authorization state; it does not require byte deletion.

## Required authority cascade on Piece revoke

The acceptance contract requires Piece revoke to close the whole Piece access graph:

`Piece -> SCORE child + CHORD_BOARD children`

A successful Piece revoke revalidation must therefore make both of these statements true:

- `getActivePieceManifest(...)` returns no active manifest;
- every child access reference owned by that Piece is no longer returned as active/authorized.

If current production behavior revokes only the Piece manifest while leaving a child directly launchable from cache, SES-157 is RED and the smallest authority-cascade fix is required.

The cascade must use server-resolved/cached Piece content references. It must not guess child IDs or scan unrelated student assignments.

## Data flow

### Online lifecycle read

Teacher lifecycle change -> Secure Delivery authoritative Piece -> Student read service -> Piece manifest -> Student folder.

Child rows referenced by the Piece are suppressed from legacy assignment rows.

### Offline use

Authorized online read -> Piece manifest + authorized child packages cached -> connectivity becomes OFFLINE -> cached Piece views may remain usable.

### Reconnect revoke

Connectivity returns -> foreground sync -> exact Piece status check -> REVOKED -> revoke Piece manifest + referenced child access -> subsequent folder/open calls fail closed.

### Reconnect transient failure

Connectivity returns -> foreground sync -> status request fails transiently -> SYNC_ERROR -> no invented revoke -> existing authorization remains until a later successful status check.

## Fail-closed rules

- Duplicate Piece authority is an error.
- Duplicate assignment authority is an error.
- Piece/child identity mismatch is an error.
- Missing expected SCORE/CHORD authority must not be silently replaced with another assignment.
- Exact NOT_FOUND may mean revoked only at the secure authority boundary already defined by `secureDeliveryStatusService`.
- Generic network errors must never revoke access.
- Revoked Piece or child authority must not be launchable through a stale folder row or direct cached access path after successful reconnect sync.

## Acceptance test matrix

### Automated contract tests

1. ACTIVE Piece with SCORE + two chords renders one Piece row and zero child duplicate rows.
2. Legacy COMPLETED Piece appears only in COMPLETED and does not leak children elsewhere.
3. REPERTOIRE Piece appears only in Repertuarım, retains same Piece identity, teacher note, SCORE reference, and chord references.
4. Moving the same Piece between ACTIVE and REPERTOIRE never creates a second Piece identity.
5. Online revoke makes fresh Piece and child reads unavailable.
6. Warm offline cache keeps authorized Piece views usable while genuinely offline.
7. Successful reconnect after revoke removes Piece authorization and every Piece-owned child authorization.
8. After that sync, direct cached Piece/SCORE/CHORD launch attempts fail closed.
9. Transient reconnect failure reports SYNC_ERROR and does not mark Piece or children revoked.
10. A later successful reconnect can still revoke the same cached graph.
11. In-memory and IndexedDB repository behavior is equivalent for Piece/child revoke semantics.

### Browser acceptance

WebKit/Chromium browser tests verify:

- folder isolation;
- Repertuarım navigation;
- one Piece row only;
- no visible child duplicates;
- revoked work is no longer launchable after successful reconnect reconciliation;
- accessible folder/work controls remain operable.

### Physical-device acceptance

SES-157 is not fully Done until the relevant warm-cache/reconnect and VoiceOver-critical flow is repeated on physical iPhone Safari. Browser automation is supporting evidence, not a substitute for that physical check.

If physical-device testing reveals a defect, that defect is recorded as a focused issue rather than broadening SES-157 without bound.

## Files expected to be touched during implementation

Acceptance-first changes are expected primarily in tests. Likely surfaces are:

- `test/studentPieceOffline.test.js`;
- student Piece/folder controller tests;
- IndexedDB/in-memory repository tests;
- browser acceptance tests.

Production files are changed only if RED tests prove a gap. The most likely production seam, if required, is the Piece revoke cascade in `src/offline/syncCoordinator.js` plus narrowly scoped offline-repository support for revoking referenced child access.

No unrelated UI redesign, lifecycle redesign, storage migration, or hard-delete feature is in scope.

## Completion gates

Automated engineering completion requires:

- focused SES-157 tests green;
- full Student App test suite green;
- Chromium/WebKit browser regression green;
- security/quality workflows green where configured;
- diff review showing no unrelated production changes.

Release-level SES-157 completion additionally requires the physical iPhone Safari + VoiceOver evidence described above.

Only after SES-157 is accepted should SES-158 Repertoire E2E acceptance proceed.