# STUDENT-09 — Interactive Score Follow v1 Progress — 2026-09-27

## Scope

Repository: `khfy7wpr5p-maker/st-student-app`

Approved baseline:

`ced3f4366ffccf42bc82aa70d0bcb3cef770621e`

Accepted Rendering Layer revision:

`13aa0843158257a207afe062879743d58048cc6d`

No new repository, runtime Python dependency, renderer public-contract change, Render service/domain, merge or deployment is authorized by this progress record.

## Tasks 1–8

Tasks 1–3 were already green before this continuation.

Task 4 — bounded one-measure playback range + position observation: PASS.

Task 5 — StudentPlaybackPort score-follow context/range/subscription extension: PASS.

Task 6 — ScoreFollowCoordinator + stale-evidence guard: PASS.

Task 7 — Piece/SCORE lifecycle integration: PASS.

Task 8 — browser/offline safety: PASS.

Task 8 exact automated evidence head before documentation:

`86ad3b0efe4377277d19fb697558f797257ecfc0`

At that head:

- unit/contract suite: PASS;
- renderer-runtime integrity: PASS;
- Chromium full browser suite: PASS;
- WebKit full browser suite: PASS;
- real pinned renderer geometry acceptance: PASS;
- service-worker cache version: `st-student-shell-v17`;
- follow module graph imports successfully while the matching origin module paths are blocked, with zero blocked origin requests.

## Production behavior

- Interactive measure replay is SCORE-only.
- Renderer measure HIT must match current `sourceId + renderEpoch`.
- Notehead, rest and true measure whitespace resolve to the containing measure.
- Outside-measure and stale evidence fail closed.
- Replay uses one validated measure `startBeat/endBeat` range.
- Playback position observation moves the measure cursor automatically.
- Exact supported note/chord highlight requires exact score timing provenance.
- Missing/unsupported event provenance leaves measure replay and cursor usable but disables note/chord highlight.
- TAB and CHORDS never inherit SCORE follow identity.
- Student App remains read-only; no edit authority is introduced.

## Offline/static authority

Service Worker v17 adds only:

- `src/practice/scoreFollowIndex.js`
- `src/practice/scoreFollowCoordinator.js`

to the required same-origin shell graph.

Private Practice Package data remains in the existing authorized IndexedDB path and is not moved to Cache Storage.

## MSMD geometry hardening

Result: **ADOPTED_TEST_IDEA**

No MSMD runtime dependency or code transplant was added.

Useful geometry invariants are exercised through the real pinned renderer browser fixture:

- note ownership;
- rest ownership;
- measure whitespace ownership;
- outside-measure rejection;
- fresh client coordinates after scrolling to a later measure.

This is additive regression evidence only. SES-38 remains complete and its public hit-test contract is unchanged.

## Partitura semantic reference matrix

Result: **MATRIX_READY / runtime integration deferred**

| Partitura reference concept | Student-side comparison surface | Current authority decision |
| --- | --- | --- |
| `note_array()` note inventory | `ScoreFollowIndex` exact event refs / PlaybackPlan notes | Reference-only; Partitura is not runtime identity authority |
| measure membership | MusicXML source membership + `resolveMeasureHit` | `partId + measureIndex` remains authoritative |
| `beat_map` / beat position | PlaybackPlan measure ranges + `resolveBeat` | PlaybackPlan timing remains runtime authority |
| note onset / duration | PlaybackPlan timing + exact ScoreFollowIndex events | Reference fixture may compare later |
| voice | exact event traversal / renderer refs | Existing Student/renderer identity remains authoritative |
| staff | ScoreFollowIndex supported single-staff guard | Multi-staff exact highlight remains fail-closed in current scope |
| ties | playback timing can merge audio while visual segments remain distinct | Existing tested Student semantics retained |
| grace notes | exact event mapping currently fails closed where unsupported | No Partitura-based runtime fallback |

No Partitura, NumPy, SciPy, PyTorch or Python runtime dependency was added. A future precomputed oracle fixture may be introduced only under a separate bounded task if it can remain offline/reference-only.

## Guardrails checkpoint before Task 9 final gate

- Renderer contract changed: NO.
- PlaybackPlan public schema changed: NO.
- New repository: NO.
- New runtime dependency: NO.
- Secure Delivery authority changed: NO.
- Chord Board authority changed: NO.
- Teacher/OMR/editor code touched: NO.
- New Render service/domain: NO.
- Deployment: NO.
- Merge: NO.
- Physical iPhone/Safari acceptance for this feature: NOT RUN.

## Next

Task 9:

1. verify documentation-only head;
2. whole-branch Guardrails review against approved spec/plan;
3. open/update draft PR;
4. require exact-head GitHub Actions + Sonar quality gate;
5. stop at Human Merge Gate.
