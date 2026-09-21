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
