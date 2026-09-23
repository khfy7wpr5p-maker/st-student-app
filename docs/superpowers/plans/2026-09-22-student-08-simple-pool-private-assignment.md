# STUDENT-08 — Simple Pool + Private Assignment Management Implementation Plan

**Date:** 2026-09-22  
**Repository:** `khfy7wpr5p-maker/st-student-app`  
**Target baseline:** `main@a5ede988f198c49b70021d621554b55e6b961502`  
**Architecture source:** `docs/superpowers/specs/2026-09-22-student-08-09-simple-sharing-interactive-practice-design.md`  
**Status:** implementation plan only; no product-code change is authorized by this document.

## 1. Goal

Implement only STUDENT-08:

- simple signed-in navigation;
- Havuz card/detail read model;
- ALL / SELECTED pool visibility;
- per-student PrivateAssignment read model;
- ACTIVE / COMPLETED / REPERTOIRE folders;
- per-assignment teacher note;
- SCORE / CHORD_BOARD type routing;
- bounded Chord Board student consumer only after its producer snapshot contract is stable.

Do not start STUDENT-09. Do not implement measure hit-testing, one-shot measure playback, automatic cursor follow or deterministic note/chord highlight in this plan.

## 2. Baseline facts confirmed before this plan

Fresh read confirms:

- `main` is still exactly `a5ede988f198c49b70021d621554b55e6b961502`;
- PR #9 is open, draft and mergeable;
- PR #9 head before this plan is `056ef874193c99115721a6478664255ffcaa3c0a`;
- existing `public_pool` rejects `recipientStudentId`;
- existing `student_private` requires exactly one `recipientStudentId`;
- Practice Package v1 requires MusicXML;
- current student read path exposes Public Pool / My Work through Practice Package publications;
- current playback port supports current-measure repeat toggling, not arbitrary tapped-measure targeting.

These findings match the approved STUDENT-08/09 architecture spec. No architecture correction is required before planning.

## 3. Invariants that must remain unchanged

1. Student App is read-only for teacher-owned lifecycle.
2. Firebase authenticated `uid` remains the stable `studentId`.
3. displayName, nickname and email are never authorization keys.
4. Existing Practice Package v1 schema is not overloaded to represent targeted Havuz items.
5. Existing teacher-approved SCORE package path remains immutable.
6. Existing notation, playback and offline failure domains remain independent.
7. Private Practice Package offline storage remains IndexedDB-owned.
8. Static runtime assets remain Cache Storage-owned.
9. Student UI never receives raw provider errors, raw MusicXML, package internals, recipient lists or admin credentials.
10. No Student App action can publish, revoke, complete, promote to repertoire or edit teacher notes.
11. No live Firestore write, rules deployment, migration, billing or credential operation is part of STUDENT-08 implementation.
12. No cross-repository source write is authorized.

## 4. Implementation strategy

Use one bounded implementation branch/worktree created from a fresh exact `main` after this plan is approved.

Use TDD. Each substage should land in dependency order and remain reviewable. Do not combine STUDENT-09 or unrelated refactors into the same PR.

Preferred sequence:

```text
S08-1 Contracts / read models
  ->
S08-2 Provider-neutral read services
  ->
S08-3 Firebase read adapter mapping + authorization tests
  ->
S08-4 Signed-in shell / 25-75 responsive layout
  ->
S08-5 Havuz card/detail
  ->
S08-6 My Work folders + typed routing
  ->
S08-7 Chord Board bounded consumer, only if producer contract is stable
  ->
S08-8 Regression / accessibility / security closure
```

If the repository's current module naming differs, use the nearest existing convention and report the deviation instead of performing a broad rename/refactor.

---

# S08-1 — Contracts / Read Models

## Purpose

Introduce Student App-owned contracts that express the new product semantics without mutating Practice Package v1.

## New bounded domain objects

### PoolItem

Minimum fields:

- `poolItemId`
- `title`
- optional bounded `description`
- optional `publishedAt`
- optional bounded/new-marker metadata
- `audienceMode: "ALL" | "SELECTED"`
- for SELECTED only: `recipientStudentIds[]`
- `revokedAt` or equivalent read-side revocation marker

Rules:

- ALL must not require recipient IDs.
- SELECTED must require at least one valid stable `studentId`.
- Recipient IDs must never be rendered to the student UI.
- Revoked items are excluded from new online reads.
- PoolItem is announcement/repertoire detail only and must not contain a practice-launch authority.

### PrivateAssignment

Minimum fields:

- `assignmentId`
- `studentId`
- `practiceType: "SCORE" | "CHORD_BOARD"`
- optional bounded `teacherNote`
- `state: "ACTIVE" | "COMPLETED" | "REPERTOIRE"`
- immutable source reference/snapshot
- publication/revocation metadata sufficient for read-side filtering

Rules:

- one student per PrivateAssignment;
- same source may create N separate assignments;
- no shared recipient list;
- state changes are teacher-owned;
- Student App receives no lifecycle mutation method.

For SCORE, the source reference must resolve through the existing approved Practice Package path.

For CHORD_BOARD, the source must be a bounded immutable voicing snapshot. MusicXML must not be fabricated merely to fit Practice Package v1.

## Candidate files

Prefer small dedicated modules under existing contract/sharing conventions, for example:

- `src/contracts/poolItem.js`
- `src/contracts/privateAssignment.js`
- focused contract tests beside current contract test conventions

Do not modify `schemas/practice-package-v1.schema.json` merely to fit these new domains.

## TDD tests

Add failing tests first for:

- valid ALL PoolItem;
- valid SELECTED PoolItem;
- SELECTED with empty recipients rejected;
- malformed recipient IDs rejected;
- revoked marker validation;
- PrivateAssignment SCORE;
- PrivateAssignment CHORD_BOARD;
- invalid lifecycle state rejected;
- invalid practice type rejected;
- missing target student rejected;
- frozen / non-mutating normalized results if that matches current repository convention.

## Exit gate

Contracts can represent the approved semantics without changing Practice Package v1.

---

# S08-2 — Provider-Neutral Read Services

## Purpose

Create read-only Student App service seams before Firebase-specific code.

## Required read operations

Pool:

- `listPoolItems({ session })`
- `getPoolItem({ session, poolItemId })` if a detail seam is needed

Private assignment:

- `listAssignments({ session, state? })`
- `getAssignment({ session, assignmentId })`

Names may follow repository conventions, but authority must remain read-only.

## Authorization behavior

### PoolItem

- unauthenticated -> fail closed;
- ALL -> visible to authenticated eligible student;
- SELECTED -> visible only if authenticated `studentId` is in the target set;
- target set is never returned as student-visible data;
- revoked -> excluded.

### PrivateAssignment

- unauthenticated -> fail closed;
- target student -> readable;
- another student -> fail closed;
- revoked -> excluded;
- teacher note visible only through the target assignment.

## Compatibility rule

Do not silently replace the existing SCORE Practice Package authorization seam. The new assignment read model should wrap/reference it.

## TDD tests

- unauthenticated pool read;
- ALL visibility;
- SELECTED matching student;
- SELECTED mismatching student;
- cross-student assignment read;
- revoked PoolItem;
- revoked PrivateAssignment;
- recipient-list non-disclosure;
- adapter returns wrong-scope/wrong-student data -> service rejects rather than trusting it.

## Exit gate

Core domain and authorization are testable without Firebase SDK types.

---

# S08-3 — Firebase Read Adapter Mapping

## Purpose

Map Firestore read results into the new provider-neutral seams without granting Student App write authority.

## Rules

- Firebase `uid` is the only stable authorization student ID.
- No admin/service-account secret enters browser code.
- No client write surface for assignment lifecycle or teacher note.
- Do not deploy or silently modify live Firestore rules/schema.
- Production schema/rules changes require teacher-side producer contract alignment and separate explicit approval.

## Implementation constraint

If current Firestore collections do not yet contain finalized PoolItem / PrivateAssignment documents, implement adapter boundaries and deterministic test fixtures only. Do not invent or deploy a production collection layout under this task.

## TDD/security tests

- authenticated matching read;
- unauthenticated read denied;
- cross-student private assignment denied;
- SELECTED pool mismatch denied;
- revoked record excluded;
- malformed provider record fail-closed;
- provider error is mapped to bounded Student App error, not raw backend text.

## Exit gate

Read adapter behavior is correct against stable fixture contracts; any live producer/schema dependency is explicitly reported.

---

# S08-4 — Signed-In Shell / Responsive 25-75 Layout

## Purpose

Replace the current signed-in information architecture with the approved minimal destinations while preserving current Practice behavior.

## Visible navigation

- Havuz
- Benim Çalışmalarım
- Çıkış

On wide/landscape view:

- left navigation approximately 25%;
- selected content approximately 75%.

On narrow portrait:

- preserve the same information architecture responsively;
- do not add a new product area.

## UI rules

- short Turkish copy;
- large touch targets;
- semantic navigation and buttons;
- no packageId, revisionId, Firebase, XML, provider or debug terminology;
- preserve keyboard focus-visible behavior;
- preserve current sign-out lifecycle disposal.

## TDD/accessibility tests

- navigation contains only approved destinations in signed-in shell;
- responsive semantic structure remains valid;
- keyboard reachability;
- safe sign-out;
- navigation away from SCORE practice still disposes active playback/notation as currently required.

## Exit gate

Simple shell is present without altering authority or current SCORE lifecycle.

---

# S08-5 — Havuz Card / Detail

## Purpose

Make Havuz a simple repertoire/announcement area, not a Practice launcher.

## Visible behavior

Card may show:

- title;
- short description;
- optional date;
- optional small `Yeni` marker.

Selecting a card opens its detail in the selected content area.

## Hard prohibition

Havuz item must never:

- open SCORE notation;
- start playback;
- expose measure interaction;
- open Chord Board practice;
- reuse Practice Package `public_pool` as targeted PoolItem semantics.

## TDD tests

- ALL card appears for authenticated student;
- SELECTED card appears only to target student;
- non-target student does not receive the item;
- revoked item absent;
- card activation opens detail;
- no Practice launch action is emitted;
- no SCORE/CHORD_BOARD router is invoked from Havuz.

## Exit gate

Havuz is authorization-correct and presentation-only.

---

# S08-6 — Benim Çalışmalarım Folders + Type Routing

## Purpose

Expose personal assignments using teacher-owned lifecycle state.

## Visible folders

- Aktif Çalışmalar -> `ACTIVE`
- Bitmiş Çalışmalar -> `COMPLETED`
- Repertuarım -> `REPERTOIRE`

Filtering must be exact; one state must not leak into another folder.

## Teacher note

- teacher note is assignment-specific;
- student may read it;
- Student App exposes no edit control.

## Typed routing

### SCORE

Route to existing Practice Package / Practice Workspace behavior.

Preserve:

- notation;
- playback;
- tempo permission;
- existing offline downloaded SCORE behavior;
- capability independence.

### CHORD_BOARD

Do not route through MusicXML or SCORE internals.

If stable snapshot producer contract is not yet available, render a bounded unavailable/pending state and report the dependency. Do not fabricate a snapshot.

## TDD tests

- ACTIVE filter;
- COMPLETED filter;
- REPERTOIRE filter;
- teacher note belongs only to exact assignment;
- cross-student teacher note impossible;
- SCORE invokes only SCORE path;
- CHORD_BOARD never invokes SCORE/MusicXML path;
- unknown practiceType fail-closed.

## Exit gate

Personal folders and type routing work without giving the student lifecycle authority.

---

# S08-7 — Bounded Chord Board Student Consumer

## Entry condition

Start only if a reviewed, versioned teacher-side Chord Board snapshot/export contract is stable.

If not stable, stop this substage as blocked; do not modify the Chord Board repository under this task.

## Minimum consumer presentation

- chord name;
- large readable diagram;
- teacher note;
- chord audition.

## Snapshot invariants

Old assignments must preserve exact assigned voicing even if future catalog ordering changes.

Minimum snapshot evidence must be sufficient for:

- displayed symbol;
- canonical chord identity;
- six-string fret vector;
- fingering/barre diagram metadata;
- bounded exact MIDI/audio evidence needed by the consumer.

## Tests

- exact six-string shape is preserved;
- old snapshot remains stable after fixture catalog reorder;
- bounded malformed snapshot is rejected;
- no MusicXML conversion;
- no remote Chord Board runtime-internal dependency.

## Exit gate

Only stable, immutable snapshot data is consumed.

---

# S08-8 — Regression / Security / Accessibility Closure

## Mandatory focused evidence

1. PoolItem contract tests.
2. PrivateAssignment contract tests.
3. ALL/SELECTED authorization tests.
4. Cross-student assignment isolation tests.
5. Revocation tests.
6. Havuz never launches practice.
7. ACTIVE/COMPLETED/REPERTOIRE folder tests.
8. SCORE/CHORD_BOARD type-isolation tests.
9. Teacher-note isolation tests.
10. Keyboard/semantic navigation tests.

## Mandatory regression evidence

- current SCORE notation path remains PASS;
- current Student Playback path remains PASS;
- current tempo/repeat permission behavior remains PASS;
- current offline downloaded SCORE path remains PASS;
- package switch/navigation/sign-out lifecycle cleanup remains PASS;
- raw provider/backend error details still do not leak;
- deterministic piano-bank regeneration remains zero-diff;
- `git diff --check` PASS;
- full `npm test` PASS.

Current repository script:

```bash
npm test
```

Repository currently has no separate production build script in `package.json`; do not invent a successful build step. Use existing CI/static validation gates and report this explicitly unless the repository changes before implementation.

## Real-device / browser gate

Before claiming STUDENT-08 product completion, repeat the relevant signed-in mobile acceptance path on physical iPhone/Safari/VoiceOver:

- sign in;
- Havuz navigation;
- Benim Çalışmalarım folder navigation;
- open existing SCORE assignment;
- notation remains stable;
- playback remains usable;
- offline previously downloaded SCORE remains usable according to existing contract;
- sign out disposes active practice.

CHORD_BOARD physical acceptance is required only if S08-7 is actually implemented.

---

# 5. Files explicitly out of scope for silent modification

Do not alter these merely to make STUDENT-08 easier:

- ST Score Rendering Layer repository;
- ST Guitar Chord Board repository;
- ST OMR Correction Engine repository;
- teacher/SesliTab producer repository;
- production Firestore rules;
- production Firestore data;
- Firebase billing/project provisioning;
- credentials/secrets;
- Practice Package v1 schema unless a separately approved migration is opened;
- STUDENT-09 playback/renderer contracts.

Any required cross-repository change must become a separate repository-local spec/plan and requires explicit authorization.

# 6. Recommended implementation branch and PR shape

After human approval of this plan:

1. fresh-read `main`, PR #9 and required checks;
2. create a dedicated STUDENT-08 implementation branch from exact current protected `main`;
3. implement only STUDENT-08 with TDD;
4. one bounded implementation PR;
5. exact-head CI/security/accessibility verification;
6. stop before merge and report.

Do not merge this architecture/plan PR or the future implementation PR without explicit human approval.

# 7. Completion definition

STUDENT-08 is complete only when fresh evidence proves all of the following:

- Student A cannot see Student B assignment or teacher note.
- SELECTED Havuz visibility is authorization-correct.
- Havuz never opens score/chord practice.
- Folder membership maps exactly to ACTIVE / COMPLETED / REPERTOIRE.
- Student App has no lifecycle write authority.
- SCORE and CHORD_BOARD internals do not leak across routers.
- Existing SCORE notation/playback/offline behavior remains intact.
- Required accessibility checks pass.
- Full repository test/CI gates pass.
- Any unavailable teacher-producer or Chord Board snapshot dependency is explicitly reported rather than guessed.

# 8. Mandatory stop point

After this plan is reviewed and approved, the next action is implementation-method selection and creation of the isolated STUDENT-08 implementation branch.

Do not begin STUDENT-09 and do not perform cross-repository writes.
