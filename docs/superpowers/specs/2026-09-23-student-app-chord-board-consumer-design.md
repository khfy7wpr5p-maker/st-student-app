# ST Student App — CHORD_BOARD Secure Delivery Consumer Design

Date: 2026-09-23  
Status: DESIGN SPEC — implementation not started  
Target repository: `khfy7wpr5p-maker/st-student-app`  
Reference repository (read-only): `khfy7wpr5p-maker/seslitab-guitar-reader`

## 1. Goal

Add a safe Student App consumer for Secure Delivery `CHORD_BOARD` assignments.

A valid CHORD_BOARD assignment must be listable in My Work, open into a dedicated student chord workspace, render the exact immutable six-string voicing supplied by SesliTab, and reopen offline for the same authenticated student when an authorized cached package exists.

The existing SCORE flow must remain semantically unchanged.

This design deliberately does not force CHORD_BOARD into MusicXML, the SCORE Practice Workspace, the notation renderer, or SCORE playback.

## 2. Fresh-read baseline

Fresh-read Student App main at design time:

`3cb883224ec34403ad2768845630f6f7fcb03745`

Existing open historical Student App PRs are not implementation bases:

- PR #9 is diverged and substantially behind current main.
- PR #13 is diverged and substantially behind current main.
- PR #15 pilot is diverged and behind current main.

Implementation must start from current main on a new isolated branch.

Fresh-read SesliTab reference main:

`c5e215b0cdffa4b640bbb9b015db2a5ca59d1e52`

Current Student App reality:

- `PRACTICE_TYPES` already includes `SCORE` and `CHORD_BOARD`.
- My Work can display CHORD_BOARD as “Akor çalışması”.
- CHORD_BOARD cards are intentionally non-actionable.
- `studentAppController.openAssignment()` fails closed with `chord board unavailable`.
- `createSecureDeliveryAssignmentRow()` accepts only SCORE.
- `createSecureDeliveryStudent08ReadService()` exposes only `getScorePracticeItem()`.
- `createSecureDeliveryOfflineReadService()` is SCORE-item-specific.
- Existing private offline package storage is IndexedDB-backed and keyed by authenticated student plus access identity plus package identity.
- Private package payloads are not stored in Service Worker Cache Storage.

Current SesliTab producer reality:

- SesliTab creates `StudentChordBoardPackageV1`.
- Secure Delivery restores a strict SCORE / CHORD_BOARD package union.
- Student delivery read returns the exact CHORD_BOARD package to the authorized student.
- The assigned voicing is an immutable exact snapshot and is never reconstructed from chord symbol or catalog position.

## 3. Architectural choice

### Chosen approach

Use a dedicated CHORD_BOARD consumer path, sharing only the Secure Delivery discriminated-union boundary with SCORE.

Flow:

```text
Secure Delivery response
        |
        v
strict assignment + package discrimination
        |
        +--------------------+
        |                    |
      SCORE              CHORD_BOARD
        |                    |
existing SCORE read      dedicated chord read
existing Practice        dedicated Chord Board workspace
existing SCORE cache     shared authorized offline repository
        |                    |
notation/playback        exact immutable chord snapshot
```

### Why this approach

It minimizes risk to the already verified SCORE path.

The two package types share:

- authenticated Secure Delivery authority;
- assignment lifecycle;
- identity checks;
- private `student_private` scope;
- authorized offline repository;
- revocation/sync behavior;
- session-race isolation.

They do not share:

- package validators;
- presentation models;
- SCORE MusicXML / notation behavior;
- SCORE playback behavior.

### Rejected alternatives

#### One generic Practice engine for SCORE and CHORD_BOARD

Rejected for this stage because it would require broad changes across controller, Practice workspace, package semantics, and playback/notation boundaries. It creates unnecessary regression risk.

#### Fully separate CHORD_BOARD offline subsystem

Rejected because it would duplicate student scoping, immutable package conflict handling, revocation, and sync behavior that already exists and is security-sensitive.

## 4. Secure Delivery contract boundary

Introduce a Student App-owned strict CHORD_BOARD contract implementation. The Student App must not import runtime code from SesliTab.

Recommended new module boundary:

`src/contracts/studentChordBoardPackage.js`

It owns:

- `STUDENT_CHORD_BOARD_PACKAGE_SCHEMA_VERSION = "1.0.0"`
- `STUDENT_CHORD_BOARD_PACKAGE_TYPE = "CHORD_BOARD"`
- exact CHORD_BOARD voicing snapshot normalization;
- `validateStudentChordBoardPackageV1()`;
- `restoreStudentChordBoardPackageV1()`.

A second small boundary may be introduced if useful:

`src/contracts/secureDeliveryPackage.js`

Its responsibility is only package discrimination and restoration.

### 4.1 SCORE behavior

SCORE continues to use the existing `validatePracticePackage()` contract.

No `packageType` field is invented for SCORE.

Existing SCORE package rules and SCORE Practice behavior remain unchanged.

### 4.2 CHORD_BOARD top-level contract

A valid `StudentChordBoardPackageV1` has these exact top-level fields:

- `schemaVersion`
- `packageType`
- `packageId`
- `title`
- `assignmentAuthority`
- `publication`
- `content`
- `practice`

Required invariants:

- `schemaVersion === "1.0.0"`
- `packageType === "CHORD_BOARD"`
- `packageId` is non-empty and matches `assignmentAuthority.assignmentId`
- `assignmentAuthority.state === "teacher_assigned"`
- `assignmentAuthority.assignedAt` is present and valid according to the mirrored producer contract
- `publication.scope === "student_private"`
- `publication.recipientStudentId` is non-empty
- `content` contains exactly `chordBoard`
- `practice` is plain JSON data and `practice.teacherNote` is a string

The Student App validator must mirror the producer contract closely enough that a producer-valid package is consumer-valid and malformed/mixed packages fail closed.

### 4.3 Package discrimination

Secure Delivery assignment validation becomes type-aware.

For `practiceType === "SCORE"`:

- validate package with existing SCORE validator;
- reject CHORD_BOARD-specific package shape;
- preserve current SCORE identity and private-scope checks.

For `practiceType === "CHORD_BOARD"`:

- require `package.packageType === "CHORD_BOARD"`;
- validate using the dedicated CHORD_BOARD validator/restorer;
- require package identity and assignment authority identity to match the assignment row;
- require `practice.teacherNote` to match assignment `teacherNote`;
- require `publication.scope === "student_private"`.

Unknown `practiceType`, unknown `packageType`, or mixed SCORE/CHORD_BOARD fields fail closed.

There is no fallback from invalid CHORD_BOARD to SCORE.

## 5. Exact voicing contract

The durable musical authority is `content.chordBoard`.

The Student App preserves the exact immutable snapshot; it never selects a voicing from a mutable catalog.

Required snapshot shape:

```text
ChordBoardVoicingSnapshot
  schemaVersion
  sourceKind
  chord
    canonicalSymbol
    canonicalRoot
    quality
    displayRoot
    displaySymbol
  voicing
    frets[6]
    fingers[6]
    barres[]
    shape
    generated
    curated
  provenance
    sourceRepository
    sourceCommit
    catalogFingerprint
  voicingFingerprint
```

Required semantics:

- `schemaVersion === 1`
- `sourceKind === "chord_board_exact_voicing"`
- array index 0..5 maps guitar strings 6..1, low E to high E
- fret `-1` = muted
- fret `0` = open
- fret `1..20` = fretted
- muted string finger must be `-1`
- open string finger must be `0`
- fretted string finger must be `1..4`
- barre finger must be `1..4`
- barre fret must be `1..20`
- barre strings must be `1..6`
- `fromString >= toString`

The full snapshot is restored and deeply frozen.

The UI may project only student-relevant fields, but the offline stored package retains the exact validated snapshot.

The UI must not expose provenance internals or fingerprints.

## 6. Assignment row and Student view

`createSecureDeliveryAssignmentRow()` remains strict about allowed row fields and identity.

It changes from SCORE-only to discriminated SCORE / CHORD_BOARD validation.

The normalized assignment row continues to contain:

- `deliveryId`
- `assignmentId`
- `packageId`
- `practiceType`
- `teacherNote`
- `state`
- `assignedAt`
- `deliveredAt`
- restored immutable `package`

`deliveryId === assignmentId` remains required.

`packageId` must match the restored package.

`toStudentAssignmentView()` remains the list/detail projection and does not expose package internals.

For CHORD_BOARD the title comes from the validated CHORD_BOARD package.

## 7. Read-service interfaces

Keep:

`getScorePracticeItem({ session, assignmentId })`

Add:

`getChordBoardPracticeItem({ session, assignmentId })`

Both return the same outer access envelope:

```js
{
  accessRef: {
    kind: "SECURE_DELIVERY",
    deliveryId
  },
  package
}
```

but each enforces its own package type.

### SCORE method

If assignment is not SCORE, fail with bounded “assignment type unavailable”.

### CHORD_BOARD method

If assignment is not CHORD_BOARD, fail with bounded “assignment type unavailable”.

It returns the restored immutable `StudentChordBoardPackageV1`.

No CHORD_BOARD method calls `getScorePracticeItem()`.

No SCORE method restores CHORD_BOARD.

## 8. Controller and application state

Introduce a dedicated student-visible screen constant, for example:

`CHORD_BOARD`

Do not reuse `PRACTICE` for the chord workspace.

`openAssignment(assignmentId)` behavior:

```text
getAssignment()
  -> SCORE
       -> getScorePracticeItem()
       -> existing activatePracticeItem()
       -> PRACTICE
  -> CHORD_BOARD
       -> getChordBoardPracticeItem()
       -> activateChordBoardItem()
       -> CHORD_BOARD
  -> other
       -> fail closed
```

A CHORD_BOARD item does not initialize:

- notation runtime;
- SCORE playback plan;
- `#st-score-root`;
- MusicXML parser;
- Practice playback recovery.

The controller stores only the normalized student-facing CHORD_BOARD view model needed by the renderer plus bounded offline metadata.

Session-generation checks used by existing asynchronous assignment open must also guard the CHORD_BOARD path. A late response from a previous authenticated session must not mutate the current screen.

Sign-out clears active CHORD_BOARD state just as active SCORE state is cleared.

## 9. CHORD_BOARD student view model

Introduce a dedicated projection from restored package to student UI.

Suggested shape:

```js
{
  packageId,
  title,
  teacherNote,
  chord: {
    displaySymbol,
    displayRoot
  },
  strings: [
    {
      stringNumber,
      fret,
      state,     // "MUTED" | "OPEN" | "FRETTED"
      finger
    }
  ],
  barres: [
    {
      finger,
      fret,
      fromString,
      toString
    }
  ],
  offlineAvailable,
  offlineSaveFailed
}
```

The view model is derived only from the validated exact snapshot.

It must not contain:

- Firebase ID tokens;
- provider UIDs;
- teacher IDs;
- recipient lists beyond the current authorization result;
- Firestore paths;
- evidence IDs;
- stack traces;
- catalog repository/commit/fingerprint fields;
- voicing fingerprint.

## 10. Dedicated CHORD_BOARD workspace

Recommended new renderer boundary:

`src/ui/renderChordBoardWorkspace.js`

The workspace is read-only.

It contains:

1. title / chord identity;
2. six-string chord diagram;
3. string/fret/finger state;
4. barre geometry;
5. teacher note;
6. bounded offline status where applicable.

It does not contain SCORE notation or playback controls.

### Visual semantics

The diagram should present six guitar strings in conventional visual order while preserving the data contract mapping.

The implementation may map source array indices to display positions, but it must not mutate or reorder the stored snapshot.

Muted/open/fretted states must be visually distinct.

Finger numbers `1..4` must be displayed for fretted notes where meaningful.

Barres must visually span exact `fromString -> toString` geometry at the exact fret.

No guessed fingering or inferred barre may be drawn.

## 11. Accessibility

The chord workspace must be usable without relying on the diagram alone.

Required semantic structure:

- workspace region with a clear accessible name such as “Akor çalışması”;
- chord symbol as a heading;
- six-string semantic list or equivalent;
- each string announces string number, muted/open/fretted state, fret and finger;
- each barre is exposed textually with finger, fret, starting string and ending string;
- teacher note has an explicit label;
- action/navigation controls retain visible focus and existing touch target requirements.

Example semantic string:

“6. tel: kapalı.”

“5. tel: açık.”

“4. tel: 2. perde, 2. parmak.”

Example barre:

“1. parmak bare: 5. perde, 6. telden 1. tele.”

The exact Turkish wording may be refined during implementation tests, but the information content above is required.

## 12. My Work behavior

Current CHORD_BOARD cards change from informational/non-actionable to actionable only after the consumer path exists.

For supported valid CHORD_BOARD assignments:

- type label remains “Akor çalışması”;
- title remains visible;
- teacher note remains visible;
- card gets `data-action="open-assignment"` using the existing assignment action contract;
- button label follows existing Student App wording, e.g. “Çalışmayı Aç”.

SCORE cards retain their existing behavior.

ACTIVE / COMPLETED / REPERTOIRE folder behavior remains unchanged.

No new student lifecycle write authority is introduced.

## 13. Offline storage

Reuse the existing authorized offline repository and IndexedDB store.

Do not create a separate CHORD_BOARD database.

The offline repository must become package-union-aware at the Secure Delivery item normalization boundary.

### 13.1 Authorized item

The repository accepts a Secure Delivery item only after package restoration has proven it is either:

- valid SCORE `StudentPracticePackageV1`; or
- valid `StudentChordBoardPackageV1`.

The stored record continues to include:

- authenticated local `studentId`;
- `accessRef`;
- `packageId`;
- private scope;
- exact immutable restored package;
- cache timestamps;
- access state.

### 13.2 Keying and isolation

Current record identity remains:

`studentId + access identity + packageId`

For Secure Delivery, access identity remains the exact `deliveryId`.

This prevents another authenticated local student from resolving the first student’s cached package through the repository API.

### 13.3 CHORD_BOARD offline read

Add CHORD_BOARD-equivalent behavior to the offline wrapper:

`getChordBoardPracticeItem()`

Online:

1. call online read service;
2. validate exact access identity;
3. store authorized restored package in IndexedDB;
4. return item with offline availability metadata;
5. if cache write fails, still return online item and report bounded `saveFailed`.

Offline:

1. require authenticated local student;
2. resolve exact Secure Delivery accessRef;
3. fetch ACTIVE record scoped to that student;
4. require cached package type CHORD_BOARD;
5. return it with `source: "offline"`.

A cached SCORE package cannot be returned from the CHORD_BOARD method and vice versa.

## 14. Revocation and foreground sync

Reuse existing Secure Delivery status and sync architecture.

The status service becomes package-union-aware only where assignment validation currently rejects CHORD_BOARD.

Revocation remains accessRef-based; no chord-specific revocation mechanism is introduced.

Required behavior:

- exact 404/not-found maps to the existing bounded REVOKED behavior;
- transient provider failures remain transient and do not invent revocation;
- sync can mark the appropriate cached Secure Delivery package inactive/revoked;
- offline open requires an ACTIVE record;
- revoked content is not reopened as authorized merely because the package bytes remain on device.

No remote-delete guarantee is introduced for already stored device bytes.

## 15. Security and privacy

The Student App remains read-only.

Authorization authority is the authenticated server response, not request/body `studentId`.

Required fail-closed cases include:

- unknown `practiceType`;
- unknown `packageType`;
- CHORD_BOARD assignment carrying SCORE package;
- SCORE assignment carrying CHORD_BOARD package;
- package/assignment identity mismatch;
- delivery/assignment identity mismatch;
- malformed snapshot;
- wrong fret/finger combinations;
- malformed barre geometry;
- teacher-note authority mismatch;
- non-private CHORD_BOARD publication;
- cross-student offline lookup;
- revoked assignment;
- late async response from a prior session.

Private package data must not enter Service Worker Cache Storage.

UI error handling must not expose provider internals, ownership information, Firebase details, stack traces, or package provenance.

## 16. Failure handling

Contract violations throw internally and fail closed.

Student-visible errors should remain bounded and non-diagnostic, e.g.:

- “Bu akor çalışması açılamadı.”
- “Bu çalışma çevrimdışı kullanılamıyor.”

Do not display validator internals to the student.

Network/transient errors must not be converted into authorization failure unless the existing status contract specifically identifies revoked/not-found.

If the CHORD_BOARD diagram cannot be constructed from a package that already passed the strict validator, treat that as an internal consumer defect rather than guessing missing data.

## 17. Service Worker boundary

No CHORD_BOARD assignment package payload is added to Service Worker static/runtime Cache Storage.

Only application shell assets may be cached there.

The current private-data boundary remains:

- shell/runtime static assets: Service Worker Cache Storage;
- authenticated private SCORE/CHORD_BOARD packages: IndexedDB authorized offline repository.

A later Service Worker cache-version maintenance change is separate from this feature unless required by the implementation branch’s verified preview behavior.

## 18. Expected implementation files

Expected new files:

- `src/contracts/studentChordBoardPackage.js`
- `src/ui/chordBoardViewModel.js` or equivalent focused projection
- `src/ui/renderChordBoardWorkspace.js`
- focused CHORD_BOARD contract/read/UI/offline tests

Expected existing files to change:

- `src/contracts/secureDeliveryAssignment.js`
- `src/sharing/secureDeliveryStudent08ReadService.js`
- `src/offline/offlineRecord.js` and/or the smallest shared package-eligibility boundary needed to accept the strict union
- `src/offline/secureDeliveryOfflineReadService.js`
- `src/offline/secureDeliveryStatusService.js` only if current SCORE-only validation blocks CHORD_BOARD
- `src/ui/student08Composition.js` if interface completeness checks require the new method
- `src/ui/studentAppController.js`
- `src/ui/renderStudentApp.js`
- existing tests whose intentional “CHORD_BOARD unavailable” expectation becomes supported behavior
- `docs/architecture.md` and/or README only where architecture reality must be updated after implementation

Files not expected to change:

- SesliTab producer repository;
- `st-guitar-chord-board`;
- SCORE notation renderer;
- SCORE MusicXML playback compiler;
- piano sample runtime;
- production Firebase rules/configuration.

## 19. TDD sequence

Implementation must use RED -> GREEN slices.

### Slice 1 — strict CHORD_BOARD contract

RED tests:

- valid package restores deeply immutable data;
- unknown top-level field rejected;
- unknown packageType rejected;
- malformed/mixed package rejected;
- invalid fret/finger rejected;
- invalid barre rejected;
- identity mismatch rejected.

GREEN only the contract/restorer.

### Slice 2 — Secure Delivery assignment union

RED tests:

- SCORE row still accepted unchanged;
- CHORD_BOARD row accepted;
- SCORE/CHORD package mismatch rejected;
- teacherNote mismatch rejected;
- package identity mismatch rejected.

GREEN only assignment union boundary.

### Slice 3 — Student08 read service

RED tests:

- CHORD_BOARD list/detail works;
- `getChordBoardPracticeItem()` returns exact item;
- it never calls SCORE practice path;
- SCORE method rejects CHORD_BOARD;
- assignment identity mismatch remains fail-closed.

### Slice 4 — controller and dedicated screen

RED tests:

- My Work CHORD_BOARD action opens CHORD_BOARD screen;
- SCORE still opens PRACTICE;
- CHORD_BOARD never activates SCORE package, notation or playback;
- late prior-session response is ignored;
- sign-out clears active chord state.

### Slice 5 — renderer and accessibility

RED tests:

- exact display symbol;
- all six strings;
- muted/open/fretted semantics;
- exact finger values;
- exact barre geometry;
- teacher note;
- semantic VoiceOver text;
- no internal provenance/fingerprint leakage;
- responsive layout.

### Slice 6 — offline union support

RED tests:

- online CHORD_BOARD caches to the same authorized repository;
- warm offline same-student reopen works;
- cold offline fails boundedly;
- cross-student access denied;
- SCORE cache cannot satisfy CHORD_BOARD read;
- CHORD_BOARD cache cannot satisfy SCORE read;
- cache-save failure does not block online open;
- revoked item cannot reopen as ACTIVE.

### Slice 7 — integrated regression

Run:

- all CHORD_BOARD focused tests;
- current SCORE Secure Delivery contract tests;
- current SCORE Student08 read tests;
- offline/online regression matrix;
- UI/responsive/accessibility tests;
- full `npm test`;
- deterministic generated piano asset verification required by CI;
- `git diff --check`;
- exact-head CI;
- Sonar Quality Gate.

## 20. Physical acceptance gate

Because this feature adds a new student-visible screen, merge-ready evidence must include a bounded physical acceptance checklist for iPhone/Safari/VoiceOver.

Preview deployment requires separate explicit approval.

Physical checklist should cover:

- My Work CHORD_BOARD card opens;
- dedicated chord workspace appears;
- six strings render correctly;
- muted/open/fretted markers are visually distinguishable;
- finger numbers match package;
- barre geometry matches package;
- VoiceOver announces chord, each string and barres;
- orientation change does not lose state;
- offline reopen works for a previously cached authorized assignment;
- reconnect does not replace the exact voicing with a different one;
- SCORE assignment still opens the existing notation Practice unchanged.

Do not mark physical acceptance PASS until the human tester confirms it on the actual device.

## 21. Explicit non-goals

Not part of this design:

- writes to SesliTab;
- writes to `st-guitar-chord-board`;
- production Firebase project/provisioning changes;
- Authentication provider changes;
- Firestore Rules/index deployment;
- Firebase Admin credentials;
- billing;
- production deployment;
- real identity mappings/grants;
- teacher controls in Student App;
- student assignment lifecycle writes;
- fake MusicXML conversion;
- chord audio/playback;
- chord selection/editing;
- guessed fingering;
- catalog lookup by symbol or voicing index;
- unrelated UI redesign.

## 22. Definition of done for merge-ready

The implementation is MERGE-READY only when all are true:

1. this written design and the later implementation plan were explicitly approved before product-code implementation;
2. implementation started from current main on an isolated branch;
3. only approved Student App scope changed;
4. SCORE path remains green and semantically unchanged;
5. valid CHORD_BOARD delivery can be listed, opened and rendered;
6. rendered chord comes from the exact immutable snapshot;
7. CHORD_BOARD never enters SCORE/MusicXML Practice;
8. malformed/mixed/unauthorized packages fail closed;
9. same-student offline reopening is supported without cross-student leakage;
10. revocation/session isolation remains intact;
11. accessibility and responsive tests pass;
12. full regression suite and exact-head CI pass;
13. Sonar Quality Gate passes;
14. no production Firebase/deployment/cross-repo write occurred;
15. exact head SHA, changed files, test counts and remaining physical gate are reported;
16. implementation stops NOT MERGED until explicit human merge approval.

## 23. Next gate

After this design spec is approved, the next and only development-process step is to write the detailed implementation plan using the Superpowers writing-plans workflow.

No production implementation may begin from design approval alone.
