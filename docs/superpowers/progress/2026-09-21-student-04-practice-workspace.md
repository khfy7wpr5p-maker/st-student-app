# SDD ledger — plan: docs/superpowers/plans/2026-09-21-student-04-practice-workspace.md

Execution method: Native / inline.

Setup ruling: This harness has no local repository worktree attached to the GitHub connector. The isolated remote feature branch `feat/student-04-practice-workspace` is used as the execution workspace, and exact-head GitHub CI is used as the executable verification surface. Cost if wrong: local-only filesystem/worktree issues would not be covered; repository behavior and CI-tested code remain covered.

Merge base: `d497c04825a7412784ba5ba9c590e579bad5f0f7`.

Pre-flight interfaces:
- Task 1 -> Task 3: `createPracticeWorkspace`, `withNotationCapability`, capability constants; names match.
- Task 1 -> Task 4: safe workspace capability shape; names match.
- Task 2 -> Task 3/4/5: notation adapter `isAvailable/render/dispose`; names match.
- Task 3 -> Task 4: controller private render source and notation capability update; names match.
- Task 4 -> Task 5: default notation adapter injection; names match.

Ruling: The pinned generic ST renderer runtime owns `#st-score-root`; Student App creates that DOM root but does not pass arbitrary containers to `renderMusicXml`. Cost if wrong: notation integration would fail at runtime without affecting source authorization.

Ruling: A playback capability is only AVAILABLE when the trusted port both reports support and exposes the control methods that the UI will actually call. Cost if wrong: a future port would remain unavailable until its interface is corrected rather than exposing non-functional controls.


Task 1: RED run `35632222300` at `6684287b892974f462be9385ecebe142eed15fd9`: expected `ERR_MODULE_NOT_FOUND` for new practice modules; 67 pre-existing tests passed.

Task 1: Ruling: capability support probes that throw are treated as unsupported/UNAVAILABLE instead of aborting the workspace — this preserves capability failure isolation from the spec — cost if wrong: a broken future capability probe is hidden as unavailable rather than surfaced as a workspace error.

Task 1: Ruling: privacy tests distinguish safe capability labels (`guitarTab`, `violin`) and safe `publicationId` from raw package/publication objects — cost if wrong: a future field with the same label would need a more structural privacy assertion.

Task 1: GREEN run `35632476341` at `0bd03ef9712617e7ecb70a06e92b9a27f2874db0`: 77/77 tests PASS, 0 fail.

Task 1: complete (commits `689a391..0bd03ef`, tests: full GitHub CI → 77/77 pass).


Task 2: RED run `35632588814` at `5f1349b50ab2846599bf0eb6309f767b458a273f`: expected `ERR_MODULE_NOT_FOUND` for `src/practice/notationAdapter.js`.

Task 2: GREEN run `35632660664` at `8bbb0ecbeb63a1dec8c010e533fbe5b1e6b00982`: 84/84 tests PASS, 0 fail.

Task 2: complete (commits `b72ed81..8bbb0ec`, tests: full GitHub CI → 84/84 pass).
