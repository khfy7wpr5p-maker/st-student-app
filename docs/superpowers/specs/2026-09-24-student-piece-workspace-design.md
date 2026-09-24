# ST Student App — Piece Workspace Architecture Design

Date: 2026-09-24  
Status: DESIGN SPEC — implementation not started  
Target repository: `khfy7wpr5p-maker/st-student-app`  
Producer/reference repository: `khfy7wpr5p-maker/seslitab-guitar-reader`  
Design branch base: `998c22f441584052204e04fe6f931341ffd22c8d`  
Dependency context: Student App PR #29 CHORD_BOARD consumer is still unmerged at design time.

## 1. Goal

Change the Student App from assignment-type-first navigation to a piece-first learning model.

A student should see musical works such as:

- Cambaz
- Fikrimin İnce Gülü

Opening a work enters one shared Piece Workspace. The same workspace can expose only the content that actually exists for that piece:

- Nota
- TAB
- Akorlar

The workspace must maximize usable score area on iPhone, keep an explicit back control, preserve the existing SCORE notation/playback path, preserve the exact CHORD_BOARD Secure Delivery path, and allow future TAB integration without redesigning the student navigation again.

Every piece must be identified by authority data, never by display title.

## 2. User experience target

Primary flow:

```text
Aktif Çalışmalar
├── Cambaz
└── Fikrimin İnce Gülü

Cambaz
  ↓
← Geri        Cambaz

[ Nota ] [ TAB ] [ Akorlar ]

        shared focus-mode workspace
```

The same Piece Workspace component is reused for every piece. A new piece adds data, not a new screen implementation.

Examples:

```text
Cambaz
[ Nota ] [ Akorlar ]

Fikrimin İnce Gülü
[ Nota ] [ TAB ] [ Akorlar ]
```

A view selector is capability-driven:

- show Nota only when an authorized SCORE child exists;
- show TAB only when a supported authorized TAB child exists;
- show Akorlar only when one or more authorized CHORD_BOARD children exist.

The initial Piece implementation does not wait for TAB. SCORE + CHORD_BOARD must be sufficient to ship Piece Workspace.

## 3. Fresh-read baseline and discovered gap

At design time the current Student App contracts treat SCORE and CHORD_BOARD as separate assignments.

The existing Student App `PrivateAssignment` shape contains:

- `assignmentId`
- `studentId`
- `practiceType`
- `teacherNote`
- `state`
- `assignedAt`
- `revokedAt`
- type-specific source data

There is no authoritative `pieceId`, work identity, arrangement identity, or parent manifest that can prove that a SCORE assignment and one or more CHORD_BOARD assignments belong to the same musical work.

Therefore the Student App must not group assignments by:

- title equality;
- package title;
- chord title;
- teacher note;
- timestamps;
- list adjacency;
- any client-side guess.

The missing authority is a Piece-level identity and Piece-level assignment manifest.

## 4. Architectural choice

### Chosen approach

Introduce a Piece as the student-visible parent unit and keep musical content packages independently validated below it.

```text
PieceAssignment
  |
  +-- SCORE child reference
  |
  +-- TAB child reference (future)
  |
  +-- CHORD_BOARD child references[]
```

The Piece layer owns:

- stable piece identity;
- arrangement identity;
- student recipient authority;
- student-visible title;
- piece-level lifecycle;
- piece-level teacher note;
- the exact list of child assignment references.

The existing child systems continue to own:

- SCORE package validation;
- SCORE MusicXML/notation/playback behavior;
- CHORD_BOARD exact voicing validation;
- CHORD_BOARD rendering;
- each child package's Secure Delivery authorization;
- child package offline bytes.

### Why this approach

It gives the student one coherent work without turning SCORE, TAB and chords into one oversized package.

It also lets a teacher update one child, such as a chord voicing, without republishing the entire piece payload.

### Rejected alternatives

#### Group by title

Rejected because two arrangements can have the same title and a renamed piece can break grouping. Display text is not authority.

#### Keep three visible assignments and only style them together

Rejected because lifecycle, folder placement and student navigation remain fragmented. It does not solve the user-facing model.

#### One monolithic PiecePackage containing all score, TAB and chord bytes

Rejected because independent child updates become expensive, offline replacement becomes coarse, and existing safe SCORE/CHORD contracts would be duplicated or bypassed.

## 5. Domain model

The architecture distinguishes a stable musical-work identity from the student-specific assignment authority.

### 5.1 Piece identity

A Piece is identified by:

- `pieceId`: stable unique work identity in this product;
- `arrangementId`: identifies the concrete pedagogical arrangement/version family;
- `title`: display title only.

`pieceId` and `arrangementId` are authority identifiers. `title` is never used for joins.

Two records titled “Cambaz” may coexist safely when their identities differ.

### 5.2 PieceAssignmentV1

Recommended authority shape:

```text
PieceAssignmentV1
  schemaVersion
  pieceAssignmentId
  pieceId
  arrangementId
  studentId
  title
  teacherNote
  state
  assignedAt
  revokedAt
  contentRefs
    scoreAssignmentId
    chordAssignmentIds[]
```

Initial schema requirements:

- `schemaVersion === "1.0.0"`;
- all IDs are normalized non-empty authority strings;
- `studentId` is server-authorized identity, not a client-supplied trust signal;
- `state` is one of `ACTIVE | COMPLETED | REPERTOIRE`;
- `revokedAt` is nullable;
- `scoreAssignmentId` may be null if the piece currently has no SCORE;
- `chordAssignmentIds` is a deduplicated array and may be empty;
- at least one supported child reference must exist for an active usable Piece;
- the Piece title does not need to match any child package title.

TAB is architecturally reserved but not added to V1 authority merely as a dead field. When a real TAB package contract exists, PieceAssignment gets a versioned extension that adds an explicit TAB child reference.

This keeps V1 strict and avoids pretending a TAB contract already exists.

## 6. Piece-level lifecycle authority

Student folder placement is derived only from `PieceAssignment.state`.

```text
ACTIVE
  ↓
COMPLETED
  ↓
REPERTOIRE
```

A Piece moves as one unit.

Example:

When Cambaz changes from ACTIVE to COMPLETED:

- Cambaz leaves Aktif Çalışmalar;
- Cambaz appears in Bitmiş Çalışmalar;
- its SCORE and chord children do not independently remain visible in other folders.

Child assignment lifecycle remains relevant to authorization/revocation, but it does not independently choose the student's Piece folder.

The Student App gains no lifecycle write authority. Teacher/backend authority remains the source of lifecycle changes.

## 7. Folder navigation

Student-visible folders are separate destinations:

- Aktif Çalışmalar
- Bitmiş Çalışmalar
- Repertuarım

They must not consume Piece Workspace width with three permanent large controls.

The default My Work destination should be Aktif Çalışmalar.

Completed and Repertoire remain reachable from compact navigation outside the Piece Workspace.

Once a Piece is opened, folder navigation withdraws and the workspace enters focus mode.

## 8. Secure Delivery authority boundary

Piece grouping must be authorized by the backend/producer boundary, not reconstructed by the Student App.

Recommended flow:

```text
Teacher authority
      ↓
PieceAssignmentV1
      ↓
Secure Delivery Piece manifest
      ↓
Student App Piece read service
      ↓
authorized child refs
  ├── SCORE
  └── CHORD_BOARD[]
```

The Piece manifest proves only grouping/lifecycle authority. It does not replace child package validation.

For every referenced child, the Student App must still use the appropriate dedicated consumer:

- SCORE → existing SCORE read/validation path;
- CHORD_BOARD → existing dedicated CHORD_BOARD read/validation path;
- TAB → future dedicated TAB path.

The Student App must never accept a Piece manifest that causes:

- cross-student child resolution;
- a SCORE ref to resolve to CHORD_BOARD;
- a CHORD ref to resolve to SCORE;
- an unknown child type;
- duplicate identity ambiguity;
- a child reference not authorized for the same authenticated student.

## 9. Read-service boundaries

Recommended Student App interfaces:

```js
listPieces({ session, state })
getPiece({ session, pieceAssignmentId })
getPieceScoreItem({ session, pieceAssignmentId })
listPieceChordItems({ session, pieceAssignmentId })
```

The exact method names may follow existing repository naming, but responsibilities must remain separate.

### listPieces

Returns Piece summaries only:

```js
{
  pieceAssignmentId,
  pieceId,
  arrangementId,
  title,
  state,
  availableViews: {
    score: true | false,
    chords: true | false,
    tab: false
  }
}
```

It must not expose child package internals.

### getPiece

Returns the validated Piece manifest/view metadata needed to enter Piece Workspace.

### getPieceScoreItem

Resolves only the SCORE child authorized by the Piece manifest and then delegates to the existing SCORE package consumer.

### listPieceChordItems

Resolves only the CHORD_BOARD child IDs authorized by the Piece manifest and delegates to the existing CHORD_BOARD consumer for each item.

A malformed or unauthorized child is isolated as a child failure where safe; it must not silently substitute another assignment.

## 10. Piece Workspace application state

Recommended state shape:

```text
PieceWorkspaceState
  pieceAssignmentId
  pieceId
  arrangementId
  title
  folderState
  selectedView
  selectedChordId
  availableViews
  returnContext
    folderState
    scrollPosition
  score
    status
    viewModel
  chords
    status
    items[]
  tab
    status
```

Initial `selectedView` selection:

1. SCORE if available;
2. otherwise CHORDS if available;
3. future TAB only according to the then-approved product rule.

The app must not enter a Piece with zero supported authorized views.

## 11. Focus-mode mobile workspace

Piece Workspace must prioritize the musical content area.

Required shell:

```text
← Geri        Piece title

[ Nota ] [ TAB ] [ Akorlar ]

       content area
```

Rules:

- explicit visible `← Geri` control is mandatory;
- Piece title remains visible;
- left large navigation/sidebar is not shown inside the workspace;
- only one content view is visually active at a time;
- selector controls are compact and touch accessible;
- unavailable views are omitted, not shown as dead permanent tabs;
- the content area receives the majority of phone width.

The Piece Workspace is one reusable screen, not one screen implementation per piece.

## 12. Back behavior

The explicit back action returns to the folder from which the Piece was opened.

Example:

```text
Aktif Çalışmalar
  ↓
Cambaz
  ↓
Akorlar
  ↓
← Geri
  ↓
Aktif Çalışmalar
```

Return context contains:

- folder state;
- list scroll position where technically available.

The list should restore the prior scroll position after returning when the same folder/session is still current.

Changing Nota/Akorlar inside a Piece does not modify the return destination.

Browser-history integration is not required for V1; the explicit in-app back control is the required contract.

## 13. SCORE integration and notation lifecycle

Piece Workspace must reuse the existing SCORE Practice capabilities. It must not create a second notation renderer.

The exact physical regression contract for `#st-score-root` remains critical.

Required behavior:

- the SCORE view owns exactly one persistent `#st-score-root` DOM object after it is first mounted for the active piece;
- repainting Piece UI must not replace that DOM object;
- switching `Nota → Akorlar → Nota` must not create a new score-root object for the same active SCORE child;
- hiding the SCORE view may visually hide its panel but must not dispose notation solely because another Piece view is selected;
- leaving the Piece, changing Piece identity, sign-out, revocation, or explicit teardown may dispose the active notation according to the existing lifecycle boundary.

The recommended presentation strategy is to keep the SCORE panel mounted after first activation and toggle visibility instead of destroying/recreating it.

### Playback

Existing SCORE playback remains SCORE-only.

When the user leaves the Nota view for Akorlar, active playback must not continue invisibly. The controller should pause playback without disposing the SCORE package or notation DOM.

Returning to Nota reuses the same active Piece SCORE state where supported by the current playback/notation adapters.

## 14. CHORD_BOARD integration

Piece Workspace does not invent a new chord contract.

The Akorlar view consumes the existing validated CHORD_BOARD view models.

Expected flow:

```text
Akorlar

Am   F   G   C

[selected exact chord diagram]
```

The list of available chords comes only from `PieceAssignment.contentRefs.chordAssignmentIds`.

The existing exact immutable voicing remains authority.

Do not:

- look up a voicing from chord symbol;
- infer chord membership from title;
- reconstruct a child assignment;
- expose provenance/fingerprints to the student;
- add chord playback unless separately designed and approved.

Visible “Teller” / “Bareler” explanatory sections are not required. Accessibility semantics remain available to assistive technology.

## 15. TAB integration boundary

TAB is a future Piece view, not part of the first Piece implementation.

The Piece Workspace shell must be designed so adding TAB later does not require navigation redesign.

V1 rules:

- no fake TAB tab;
- no placeholder TAB content;
- no conversion of SCORE to TAB inside Student App;
- no generic `practiceType: TAB` until a real producer/consumer contract is designed;
- no TAB authority reference in PieceAssignmentV1 until that contract exists.

A future version may add:

```text
contentRefs
  scoreAssignmentId
  tabAssignmentId
  chordAssignmentIds[]
```

Only then does the TAB selector appear for a Piece carrying a valid authorized TAB child.

## 16. Teacher note behavior

`PieceAssignment.teacherNote` is the primary Piece-level instruction shown in Piece Workspace.

Existing child packages retain their own current note fields for contract compatibility and legacy flows.

Piece Workspace must not concatenate notes from multiple child packages into an invented combined instruction.

If content-specific instructions are later required, they need an explicit designed field rather than implicit merging.

## 17. Partial availability and failure isolation

A Piece is a container of independently authorized content.

One child failure must not automatically collapse another valid child.

Required examples:

- SCORE unavailable, valid chords available → Piece can open Akorlar;
- one invalid/revoked chord child, SCORE valid → Nota still opens;
- future TAB unavailable offline, SCORE cached → Nota remains usable;
- all supported children unavailable/revoked → Piece cannot open as usable content.

Student-visible failures are bounded and local to the affected view.

Do not leak:

- provider stack traces;
- Firebase paths;
- ownership internals;
- authorization evidence IDs;
- package provenance;
- fingerprints.

## 18. Offline model

Reuse the existing authenticated IndexedDB private-data boundary.

Do not place Piece manifests or private child packages in Service Worker Cache Storage.

Recommended local model:

```text
studentId + pieceAssignmentId
          ↓
authorized Piece manifest
          ↓
child access refs
  ├── SCORE authorized offline record
  └── CHORD_BOARD authorized offline records[]
```

Offline requirements:

- Piece manifest is scoped to the authenticated student;
- child packages remain stored under their existing secure access/package identity rules;
- a cached Piece manifest cannot authorize a child that is absent, revoked, wrong-type or owned by another student;
- warm-offline Piece open succeeds for available authorized cached views;
- a missing offline child disables only that view where another authorized view remains available;
- foreground sync/revocation can deactivate the Piece or individual child access;
- revocation bytes may remain physically stored, but revoked records are not returned as ACTIVE authorized content.

## 19. Session and race isolation

All Piece reads and child reads must use the existing session-generation pattern or an equivalent strict current-session check.

A late response from:

- a prior student;
- a prior Piece;
- a prior folder;
- a revoked manifest;

must not mutate the current Piece Workspace.

Sign-out clears:

- active Piece identity;
- return context;
- visible child state;
- active SCORE package;
- active notation lifecycle;
- selected chord state.

## 20. Legacy compatibility

Existing independent SCORE and CHORD_BOARD assignments must continue to work during migration.

The Student App must distinguish:

### Legacy item

No Piece authority exists.

Behavior:

- open with the existing SCORE or CHORD_BOARD flow;
- do not synthesize a Piece by title.

### Piece item

A valid PieceAssignment authority exists.

Behavior:

- show one Piece card in the appropriate folder;
- child assignment cards are not separately exposed in that Piece list;
- open Piece Workspace.

Migration must be explicit from producer/backend authority. The client must not “upgrade” old records by guessing relationships.

## 21. My Work presentation

For Piece-enabled records the folder list shows musical works, not package types.

Example:

```text
Aktif Çalışmalar

Cambaz
Fikrimin İnce Gülü
Uzun İnce Bir Yoldayım
```

Each Piece card needs only enough information to choose the work. Do not place Nota/Akor/TAB technical detail on the list unless later usability testing proves it is needed.

Completed and Repertoire use the same Piece cards in their own folders.

## 22. Security invariants

Fail closed for:

- missing/empty `pieceId`;
- missing/empty `pieceAssignmentId`;
- missing/empty `arrangementId`;
- unsupported Piece schema version;
- invalid Piece lifecycle state;
- duplicate child assignment IDs where prohibited;
- zero usable child refs;
- cross-student Piece access;
- cross-student child reference;
- wrong child practice type;
- child assignment not authorized by the Piece manifest;
- revoked Piece;
- revoked child;
- late stale-session response;
- client-supplied display title used as identity;
- attempt to infer missing child refs.

Piece identity never weakens existing SCORE or CHORD_BOARD validation.

## 23. Accessibility

Piece Workspace must remain usable with VoiceOver.

Required:

- back button has a clear accessible name;
- Piece title is a heading;
- view selector has a clear group/tablist-equivalent semantic;
- selected view is announced;
- hidden views are not exposed as active duplicate content;
- CHORD_BOARD exact string/barre semantics remain available;
- SCORE notation accessibility behavior remains unchanged from the current renderer;
- focus moves predictably after opening a Piece and after returning to the folder;
- touch targets preserve the existing Student App minimum sizing rules.

When returning to the folder, focus should return to the originating Piece card where feasible.

## 24. Responsive behavior

Primary physical target remains iPhone/Safari.

Piece Workspace should:

- use nearly all available content width;
- avoid permanent wide side navigation;
- keep the back control and compact view selector visible;
- avoid horizontal overflow caused by navigation chrome;
- let SCORE/TAB/CHORD content own its own bounded responsive presentation.

Desktop/tablet may later use more simultaneous space, but V1 must not depend on desktop width.

## 25. Error handling

Internal contract defects throw/fail closed.

Student messages remain bounded, for example:

- “Bu parça açılamadı.”
- “Nota şu anda kullanılamıyor.”
- “Akorlar şu anda kullanılamıyor.”
- “Bu içerik çevrimdışı kullanılamıyor.”

One view error must not claim that the whole Piece is unauthorized unless Piece authority itself is invalid/revoked.

## 26. Recommended component boundaries

Expected new focused modules:

- `src/contracts/pieceAssignment.js`
  - strict PieceAssignmentV1 normalization/validation;
- `src/contracts/secureDeliveryPiece.js` or the smallest existing-contract extension
  - strict server manifest restoration;
- `src/sharing/...PieceReadService.js`
  - Piece list/detail and child-resolution authority;
- `src/ui/pieceWorkspaceViewModel.js`
  - student-safe Piece projection;
- `src/ui/renderPieceWorkspace.js`
  - focus-mode shell, back control, view selector;
- focused Piece contract/read/controller/UI/offline tests.

Expected existing modules to integrate, not be rewritten:

- `src/ui/studentAppController.js`;
- `src/ui/renderStudentApp.js`;
- `src/ui/mountStudentApp.js`;
- existing SCORE Practice workspace;
- existing notation adapter/runtime;
- existing playback port;
- existing CHORD_BOARD view model/renderer;
- existing authorized offline repository.

The Piece feature must not require writing to `st-guitar-chord-board`.

## 27. Implementation phases

Implementation is intentionally staged.

### Phase 1 — authority contract

Add strict PieceAssignmentV1 and Piece manifest validation.

No UI changes.

### Phase 2 — read/list layer

List Piece summaries by folder and resolve exact authorized SCORE/CHORD child refs.

Legacy reads remain intact.

### Phase 3 — Piece list

My Work renders Piece cards for Piece-enabled assignments while legacy items retain their existing presentation.

### Phase 4 — Piece Workspace shell

Add:

- explicit back control;
- Piece title;
- compact capability-driven view selector;
- return context;
- focus-mode layout.

### Phase 5 — SCORE view

Embed the existing SCORE Practice content without rewriting notation/playback.

Prove persistent `#st-score-root` behavior across view switches.

### Phase 6 — CHORDS view

Render all authorized Piece chord children and allow selection of one exact diagram.

### Phase 7 — offline/revocation/session hardening

Add Piece manifest offline support, partial-view availability, revocation and race isolation.

### Phase 8 — physical acceptance

Separate preview only.

Validate on physical iPhone before any merge/deploy decision.

### Future phase — TAB

Only after a real TAB producer/consumer contract exists.

## 28. TDD and regression gates

Every implementation phase uses RED → GREEN.

Mandatory regression cases include:

1. Two pieces with the same title never merge when `pieceId` differs.
2. One Piece cannot resolve another student's SCORE or chord child.
3. Wrong child practice type fails closed.
4. `ACTIVE → COMPLETED → REPERTOIRE` moves the Piece as one unit.
5. Piece with SCORE + chords shows one Piece card, not separate child cards.
6. `Nota → Akorlar → Nota` preserves the exact same `#st-score-root` DOM object.
7. Switching away from Nota pauses hidden playback without disposing notation.
8. A chord failure does not break a valid SCORE view.
9. A SCORE failure does not break valid chord views.
10. Warm offline opens all locally authorized available views.
11. Missing offline child disables only that view when another view is usable.
12. Revoked Piece cannot reopen from cache as ACTIVE.
13. Revoked child cannot be returned merely because its bytes remain cached.
14. Late prior-session Piece/child response is ignored.
15. Explicit back returns to the originating folder and restores list position where available.
16. Legacy independent SCORE and CHORD_BOARD items still open through their current flows.
17. Piece UI exposes no child package provenance/fingerprints/provider internals.
18. Full existing SCORE playback/notation regressions remain green.
19. Full existing CHORD_BOARD exact-voicing/accessibility regressions remain green.
20. Full repository test suite, deterministic assets, `git diff --check`, exact-head CI and Sonar Quality Gate pass.

## 29. Physical acceptance gate

Before merge-ready status, a dedicated preview must be explicitly approved and physically tested.

Checklist:

- Aktif Çalışmalar shows Piece names;
- opening Cambaz enters one focus-mode Piece Workspace;
- back button is visible and returns correctly;
- Nota uses the large content area;
- Akorlar shows all assigned Piece chords;
- `Nota → Akorlar → Nota` does not lose notation;
- playback still works after returning to Nota;
- another Piece opens the same shell with different content;
- Completed/Repertoire do not occupy Piece Workspace width;
- orientation change does not lose active Piece/view;
- VoiceOver announces back, Piece title, view controls and chord semantics;
- warm offline behavior matches the available cached child set.

Human physical confirmation is required. Automated CI is not a substitute.

## 30. Explicit non-goals for V1

Not part of the first Piece implementation:

- TAB package design or renderer;
- automatic SCORE→TAB conversion in Student App;
- simultaneous phone display of Nota + TAB + Akorlar;
- grouping by title;
- teacher editing inside Student App;
- student lifecycle writes;
- new notation renderer;
- new SCORE playback engine;
- chord audio;
- writes to `st-guitar-chord-board`;
- production Firebase rule changes unless separately designed and approved;
- production deployment;
- browser-history/router redesign;
- unrelated shell redesign.

## 31. Definition of done for Piece Workspace V1

V1 is merge-ready only when:

1. written design and implementation plan were separately reviewed and approved;
2. Piece authority is explicit and title-independent;
3. Piece lifecycle controls folder placement;
4. Piece list renders works rather than child package types;
5. one shared focus-mode Piece Workspace opens any Piece;
6. explicit back navigation works;
7. SCORE reuses the existing notation/playback path;
8. `#st-score-root` survives Nota/Akorlar view switching for the active Piece;
9. all authorized Piece chords are accessible from the Akorlar view;
10. partial child failure is isolated;
11. authenticated offline/revocation/session boundaries remain intact;
12. legacy independent SCORE/CHORD_BOARD flows remain functional;
13. TAB remains absent until its real contract exists;
14. full automated regression and quality gates pass;
15. physical iPhone acceptance passes;
16. implementation remains NOT MERGED until explicit human merge approval.

## 32. Next gate

This document is the architectural design gate.

After the human partner reviews and approves this written spec, the next and only process step is to create the detailed Piece Workspace implementation plan.

Design approval does not authorize product-code implementation, merge, preview deployment, or production deployment.
