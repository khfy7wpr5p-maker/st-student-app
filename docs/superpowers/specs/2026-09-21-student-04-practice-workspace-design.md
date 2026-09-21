# STUDENT-04 — Read-only Practice Workspace Design

Date: 2026-09-21

Student App base main:
`d497c04825a7412784ba5ba9c590e579bad5f0f7`

Referenced ST Score Rendering Layer main:
`13c32eefccd5bf2c227e815aa27aae4a0583801d`

## 1. Goal

STUDENT-04 turns the existing minimal Practice shell into a read-only Practice Workspace.

A student who is already authorized to open a Practice Package should be able to use whichever approved presentation/practice capabilities are actually available without one missing or failed capability globally blocking the whole workspace.

The intended student experience remains simple:

```text
Open Practice
  -> title
  -> notation when available
  -> playback/practice controls only when genuinely supported
  -> TAB / violin presentation only when supported
```

STUDENT-04 does not add editing, teacher approval, OMR, account management, offline sync, social features, or payment behavior.

## 2. Confirmed architecture decisions

### 2.1 Reuse ST Score Rendering Layer

Student App must not import or depend directly on OpenSheetMusicDisplay.

Notation presentation must use the ST-owned rendering boundary exposed by `st-score-rendering-layer`, specifically the consumer-neutral browser runtime / browser-host contract.

The referenced renderer revision is:

`13c32eefccd5bf2c227e815aa27aae4a0583801d`

The integration target is the generic browser runtime surface:

```js
globalThis.__ST_SCORE_RENDER_HOST__
```

or an equivalent injected adapter that implements the same Student App-owned notation port.

The Student App repository must not duplicate OSMD rendering logic.

### 2.2 Playback is independent from notation

Rendering success must not authorize playback.

Rendering failure must not automatically disable a playback capability that is independently available.

ST Score Rendering Layer has no playback engine and is not a playback gate.

### 2.3 No invented canonical event timing schema

The current Practice Package contract only requires:

```text
content.canonicalEvents: array<object>
```

It does not define a stable timing/event schema sufficient for trustworthy playback generation.

Therefore STUDENT-04 must not invent a private canonical-event format, guess onset/duration fields, or synthesize playback from unknown event objects.

Until a trusted playback port and supported event contract are available, playback is reported as unavailable rather than simulated incorrectly.

### 2.4 Capability failure isolation

A subordinate capability failure does not make the whole workspace fail.

Examples:

- notation error + playback unavailable -> workspace remains open with title/navigation and notation error status;
- notation unavailable + future playback available -> playback may still operate;
- TAB unavailable -> standard notation may remain available;
- violin-specific data unavailable -> standard notation may remain available;
- tempo change disabled -> playback availability is unchanged;
- measure repeat disabled -> playback availability is unchanged.

The whole Practice Workspace is unavailable only when the authorized Practice Package itself cannot be obtained or safely projected.

## 3. Current Practice Package reality

Practice Package v1 currently includes:

- `title`
- `content.score.format === "musicxml"`
- `content.score.data`
- `content.canonicalEvents`
- optional `content.guitarTab`
- optional `content.violin`
- optional `practice.tempoBpm`
- optional `practice.allowTempoChange`
- optional `practice.allowMeasureRepeat`
- optional `practice.ttsLanguage`

Important limitation:

- `canonicalEvents` items are not structurally defined;
- `guitarTab` object shape is not structurally defined;
- `violin` object shape is not structurally defined.

STUDENT-04 must preserve that truth instead of pretending those objects are already consumable contracts.

## 4. Capability model

Each independent workspace capability uses one of three states:

```text
AVAILABLE
UNAVAILABLE
ERROR
```

### AVAILABLE

The required source/adapter contract exists and the capability can be offered to the student.

### UNAVAILABLE

The package/runtime does not provide enough supported information for the capability.

This is an expected state, not an application error.

### ERROR

The capability was expected to operate but failed during use or initialization.

An ERROR in one capability must not automatically convert unrelated capabilities to ERROR or close the workspace.

Initial capability keys:

- `notation`
- `playback`
- `tempoChange`
- `measureRepeat`
- `guitarTab`
- `violin`

## 5. Safe Practice Workspace projection

The existing STUDENT-03 controller currently reduces a Practice Package to title/package identifiers.

STUDENT-04 introduces a dedicated workspace projection boundary.

The full package may be consumed internally by this projection, but the generic HTML renderer must not receive teacher-only metadata, operational Publication recipient fields, OMR/debug/editor data, or approval internals.

Proposed Student App-owned model:

```js
{
  publicationId,
  packageId,
  title,

  notation: {
    capability: "AVAILABLE" | "UNAVAILABLE" | "ERROR",
    sourceId,
    musicXml
  },

  playback: {
    capability: "AVAILABLE" | "UNAVAILABLE" | "ERROR"
  },

  practice: {
    tempoBpm,
    tempoChange: "AVAILABLE" | "UNAVAILABLE" | "ERROR",
    measureRepeat: "AVAILABLE" | "UNAVAILABLE" | "ERROR"
  },

  guitarTab: {
    capability: "AVAILABLE" | "UNAVAILABLE" | "ERROR"
  },

  violin: {
    capability: "AVAILABLE" | "UNAVAILABLE" | "ERROR"
  }
}
```

This is an internal workspace model, not a new cross-repository package format.

### MusicXML handling

MusicXML may exist in the internal notation model because the renderer requires it.

It must never be inserted into the Student App HTML as text, attribute content, debug output, status text, or developer-facing JSON.

Only the notation adapter receives the MusicXML payload.

The generic Student App renderer receives capability/status information, title, and presentation container state.

## 6. Notation integration port

STUDENT-04 defines a Student App-owned notation adapter so UI/controller code does not depend directly on global runtime details.

Runtime-accurate Student App interface:

```js
notationAdapter.isAvailable()
notationAdapter.render({ musicXml })
notationAdapter.dispose()
```

The pinned generic renderer runtime owns a DOM root with the fixed id `st-score-root`. Student App creates that root only on the Practice screen before invoking the adapter. The global runtime call itself does not receive an arbitrary container argument.

The adapter responsibilities are:

- feature-detect the ST renderer runtime;
- reject malformed/unavailable runtime surfaces cleanly;
- pass only bounded MusicXML to the ST renderer;
- never import OSMD directly;
- translate runtime success/failure into Student App capability state;
- support cleanup/dispose when switching work or leaving Practice.

The Student App must not scrape rendered SVG to create canonical note identity.

Note selection/editing is outside STUDENT-04.

## 7. TAB and violin behavior

### 7.1 MusicXML-encoded tablature

If the approved MusicXML itself contains tablature that the existing ST Score Rendering Layer can render, notation rendering may naturally include that presentation.

This does not require Student App to interpret `content.guitarTab`.

### 7.2 `content.guitarTab`

A non-null object does not automatically mean AVAILABLE.

Because its object shape is not yet defined, STUDENT-04 must treat it as unsupported unless a separate trusted contract is established.

No inferred string/fret mapping is allowed.

### 7.3 `content.violin`

A non-null object does not automatically mean AVAILABLE.

Because its object shape is not yet defined, STUDENT-04 must not guess how to render it.

Standard notation may still be shown through the MusicXML renderer.

## 8. Playback and practice controls

### 8.1 Playback

STUDENT-04 must not create a new playback engine.

No Play/Pause button should be advertised as functional unless an injected trusted playback port reports support and exposes the matching control methods.

The trusted port boundary is:

```js
playbackPort.canPlayPackage(pkg)
playbackPort.playPackage(pkg)
playbackPort.pausePackage(pkg)
playbackPort.restartPackage(pkg)

playbackPort.canChangeTempoForPackage(pkg)
playbackPort.setTempoForPackage(pkg, bpm)

playbackPort.canRepeatMeasureForPackage(pkg)
playbackPort.setMeasureRepeatEnabledForPackage(pkg, enabled)
```

Student App does not interpret canonical-event timing to implement these methods. A future trusted playback adapter owns that responsibility.

With the current repository contract and default browser bootstrap, no playback port is injected, so playback is UNAVAILABLE.

This is intentionally honest behavior.

### 8.2 Tempo

`practice.tempoBpm` may be displayed as approved practice metadata when it is a valid positive finite number.

`tempoChange` is AVAILABLE only when both:

- a playback port supports tempo control; and
- `allowTempoChange === true`.

Otherwise it is UNAVAILABLE.

A disabled tempo-change capability must not hide notation or close the workspace.

### 8.3 Measure repeat

`measureRepeat` is AVAILABLE only when both:

- a playback/practice port supports measure repeat; and
- `allowMeasureRepeat === true`.

Otherwise it is UNAVAILABLE.

## 9. UI behavior

The Practice Workspace remains intentionally minimal.

### Required visible structure

- one page heading with the practice title;
- Back/Home navigation;
- notation region;
- capability-aware practice controls region;
- accessible capability/error status text.

### Notation state

AVAILABLE:
- show the renderer-owned notation container.

UNAVAILABLE:
- show a short student-facing message such as “Nota görünümü bu çalışma için kullanılamıyor.”

ERROR:
- show a short message such as “Nota görüntülenemedi.”
- do not expose parser/runtime/debug details.

### Playback state

AVAILABLE:
- show Play, Pause and Baştan controls that delegate only to the trusted playback port.
- when `tempoChange` is AVAILABLE, show a positive-number tempo input and apply action backed by `setTempoForPackage`.
- when `measureRepeat` is AVAILABLE, show an explicit repeat on/off control backed by `setMeasureRepeatEnabledForPackage`.

UNAVAILABLE:
- do not display a fake enabled Play button;
- a concise “Dinleme bu çalışma için kullanılamıyor.” state may be shown.

ERROR:
- keep the workspace open;
- show a bounded student-facing failure state.

### TAB / violin states

Do not display empty headings or fake controls for unavailable formats.

The absence of TAB or violin-specific presentation is not a workspace error.

## 10. Error handling

Errors are classified at the smallest capability boundary possible.

Examples:

| Condition | Workspace | Notation | Playback |
| --- | --- | --- | --- |
| authorized package opens, runtime absent | OPEN | UNAVAILABLE | independent |
| renderer throws | OPEN | ERROR | independent |
| playback port absent | OPEN | independent | UNAVAILABLE |
| TAB-specific data undefined | OPEN | independent | independent |
| package cannot be safely loaded | UNAVAILABLE | n/a | n/a |

Raw exception messages must not be placed into student-facing HTML.

Internal errors must not expose MusicXML, IDs not already intended for UI, credentials, or provider internals.

## 11. State and immutability

Practice Workspace state is read-only from the Student UI.

- Student cannot mutate Practice Package source.
- Workspace view-model objects are frozen snapshots.
- Switching practice items creates a new workspace snapshot.
- Leaving practice disposes renderer/playback resources owned by adapters.
- Student App still exposes no publish/revoke/edit/delete operation.

## 12. Accessibility baseline

STUDENT-04 extends the STUDENT-03 semantic baseline.

Required:

- notation region has an accessible label;
- capability status messages use semantic status/alert behavior where appropriate;
- disabled/unavailable controls are not represented as usable;
- keyboard navigation remains possible for all Student App-owned controls;
- visible focus remains present;
- raw SVG internals are not treated as the only accessibility surface.

Physical iPhone/Safari/VoiceOver acceptance remains STUDENT-06.

## 13. Proposed code boundaries

Student App-owned files:

- `src/practice/practiceCapabilities.js`
  - capability constants;
  - capability derivation rules.

- `src/practice/practiceWorkspace.js`
  - converts an authorized Practice Package into an immutable safe workspace model;
  - preserves MusicXML only on the internal notation branch;
  - does not infer undefined TAB/violin/canonical-event semantics.

- `src/practice/notationAdapter.js`
  - Student App-owned port around the ST Score Rendering Layer runtime;
  - no direct OSMD imports.

- `src/ui/renderPracticeWorkspace.js`
  - semantic capability-aware Student UI;
  - never renders MusicXML/debug/internal package fields.

- existing `src/ui/studentAppController.js`
  - open-practice flow stores the workspace snapshot rather than only a title summary.

- existing `src/ui/mountStudentApp.js`
  - coordinates notation adapter lifecycle with Practice screen entry/exit.

Tests should remain in focused matching files under `test/`.

## 14. Dependency and deployment policy

STUDENT-04 does not add OSMD directly to `st-student-app`.

It does not vendor-copy unverified renderer internals.

The integration is against the ST-owned renderer runtime/port.

Embedding or deploying an exact exported renderer asset graph is a deployment/integration action and must preserve the renderer runtime manifest/integrity boundary. STUDENT-04 core architecture must remain testable with a deterministic notation adapter fake.

## 15. Security / privacy invariants

Unchanged:

- only authorized Practice Packages can reach the workspace;
- Student App cannot create teacher approval;
- Student App cannot modify teacher source;
- no OMR/editor/debug surfaces;
- no public/private access weakening;
- no credentials or provider secrets;
- no publication management surface.

New STUDENT-04 invariants:

- MusicXML is render input, not student-facing text;
- capability errors do not dump internal exceptions;
- no direct OSMD dependency;
- no guessed canonical timing;
- no guessed guitarTab/violin object semantics.

## 16. Testing requirements

The implementation plan must include TDD evidence for at least:

1. valid MusicXML produces notation AVAILABLE when a compatible notation adapter exists;
2. missing renderer runtime produces notation UNAVAILABLE without closing workspace;
3. renderer failure produces notation ERROR without affecting independent capability state;
4. raw MusicXML never appears in rendered HTML;
5. undefined `canonicalEvents` item shape does not accidentally enable playback;
6. playback defaults to UNAVAILABLE without a trusted playback port;
7. tempo control requires both teacher permission and playback-port support;
8. measure repeat requires both teacher permission and practice-port support;
9. non-null but undefined-shape `guitarTab` does not become AVAILABLE;
10. non-null but undefined-shape `violin` does not become AVAILABLE;
11. MusicXML-encoded TAB can remain a notation-renderer concern;
12. workspace state is immutable;
13. leaving/swapping Practice disposes notation resources;
14. Student UI still exposes no write/management actions;
15. malformed/failed capability details are not leaked to student HTML.

Final verification must include the full repository suite and exact-head GitHub CI.

## 17. Explicit non-goals

STUDENT-04 does not implement:

- a new MusicXML parser;
- a new notation engine;
- direct OSMD integration;
- a new playback/audio/MIDI engine;
- guessed canonical event timing;
- inferred guitar fingering;
- inferred violin semantics;
- note editing;
- note selection/canonical edit mapping;
- teacher approval or publishing;
- offline cache/sync;
- real auth/cloud provider;
- messaging/groups/social/gamification/payments;
- physical iPhone VoiceOver acceptance.

## 18. Completion criteria

STUDENT-04 is complete when:

- Practice opens into an immutable capability-aware workspace;
- notation uses the ST renderer boundary through a Student App-owned adapter;
- missing/failed notation does not globally block the workspace;
- playback is truthfully unavailable unless a trusted playback port exists;
- tempo/repeat controls are capability + permission gated;
- undefined TAB/violin object shapes are not guessed;
- MusicXML never appears in student-facing HTML;
- no Student write surface is introduced;
- docs match production behavior;
- full tests and exact PR-head CI are green;
- PR is opened;
- merge waits for explicit human approval.
