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


Task 3: RED run `35632866806` at `9512ab84f8b65e14bb791c4da999d0804fbc7548`: 83 pass / 8 expected failures covering missing workspace state, private render-source API, notation updates, and practice control delegates.

Task 3: Ruling: clear private Practice package/render-source on every successful navigation away from Practice and on session replacement, not only Home/Sign Out — prevents stale private package retention across screens/users — cost if wrong: a future navigation flow that expected to retain hidden Practice state will need explicit re-open.

Task 3: GREEN run `35632979447` at `d87a7935b8554b35e530f81c8e5373aebdf406e6`: 91/91 tests PASS, 0 fail.

Task 3: complete (commits `ad404fc..d87a793`, tests: full GitHub CI → 91/91 pass).


Task 4 renderer: RED run `35633139821` at `9fa0113d5ebd19d0d347b10df51e82edf140c061`: expected missing `renderPracticeWorkspace.js`.

Task 4 renderer delegation: RED run `35633344952` at `cd5d97d903a6696ce8b3f701813a8a8c85d11378`: Practice screen still used STUDENT-03 title-only renderer.

Task 4 renderer delegation: GREEN run `35633414923` at `7932945eb085574460b1ed81d18ff761b457637f`.

Task 4 practice actions: RED run `35633484781` at `0d8a295ab4f38be65eeb0618c9a572c1bf37ef37`: 100/101 pass; only approved practice actions were not yet whitelisted.

Task 4 practice actions: GREEN run `35633553788` at `7759d2c614e4d94dcbda05b349baf7ea1962ec24`.

Task 4 notation lifecycle: RED run `35633787011` at `bcb3fa99a9752387acfd69c62b43cf678247a044`: notation adapter was not invoked/disposed and tempo/repeat DOM values were not forwarded.

Task 4: Ruling: mount owns one serialized notation lifecycle Promise and avoids replacing identical Practice markup, because resetting `#st-score-root` after a successful render would erase renderer-owned SVG and invite duplicate rendering — cost if wrong: a future renderer needing forced same-package rerender requires an explicit refresh key/API.

Task 4: Ruling: Practice presentation identity includes packageId plus DOM generation; package switches force `dispose -> repaint -> render`, while same-package same-markup renders are idempotent — cost if wrong: an in-place source change under the same immutable packageId would not rerender, which is forbidden by the package immutability contract anyway.

Task 4: GREEN run `35633947702` at `dd23e95c20eaaf5e42cd0509276cbb75d0c930b0`: 107/107 tests PASS, 0 fail.

Task 4: complete (commits `3db8a38..dd23e95`, tests: full GitHub CI → 107/107 pass).
