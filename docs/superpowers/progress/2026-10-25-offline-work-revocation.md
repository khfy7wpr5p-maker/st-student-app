# Progress — plan: docs/superpowers/plans/2026-10-25-offline-work-revocation.md

Baseline: cb60406780e612a5cb853b0aef46f014025db13b. Fresh dedicated clone/branch fix/offline-work-revocation; no pre-existing changes, no AGENTS.md found. npm ci --ignore-scripts; npm test 817/817 passed.

Ruling: execute inline in the newly cloned dedicated branch; no additional worktree or repeated approval needed. User approved the concrete design and requested implementation.
Ruling: add local accessRevocations object store (v3→v4), preserving all existing stores/data. Required to remember revocation when a delayed package arrives after revoke before any package was cached; no cloud schema change. Verify upgrade and restart behavior.
Pre-flight: repository APIs feed coordinator and offline read service; optional APIs retain compatibility with existing test adapters. Lifecycle only changes bootstrap/list handling; protected music sources remain unchanged.

Task 1: complete — repository regressions reproduced RED before implementation; memory/IndexedDB parity, durable tombstones before first package, stale package/Piece writes, unrelated student/new identity, genuine v3 upgrade, legacy revoked graph migration, second connection and transaction rollback pass.
Task 2: complete — exact missing-list reconciliation for Piece/legacy rows; moves and transient/UNKNOWN status preserve snapshots; delayed metadata/package/list responses cannot restore revoked access; account-switch reads rejected. Real service and real repositories exercised.
Task 3: complete — single-flight sync/status reads, metadata-only access checks, online restore/sign-in and reconnect, list-only refresh, late old-session UI result guard. Initial revalidation skips playback recovery; original reconnect recovery remains. Already-open practice remains intact.
Task 4: engineering verification complete locally; browser/physical qualification open.

Final independent review: one Important finding — offline Piece listing ignored in-memory revoke after graph persistence abort. Fixed with failing then passing test `confirmed Piece revocation remains hidden in this session if local graph persistence aborts`. No Critical findings. Reviewer did not judge browser/audio continuity, real device acceptance or production backend deletion semantics.
Additional boundary check: a blocked/failed local database read must preserve authorized online Piece opening; RED→GREEN regression added.

Fresh verification on final source:
- npm test: 846/846 pass, 0 fail, exit 0.
- git diff --check and new browser-test syntax: exit 0.
- node scripts/generate-st-piano-bank.mjs + git diff --exit-code -- vendor/st-piano: exit 0, no generated sample changes.
- git diff --exit-code for src/practice, src/playback, vendor, violinFingerboard.js, violinDockPresentation.js, renderStudentApp.js: exit 0; protected source unchanged.
- Chromium browser suite attempted: unavailable executable. Playwright install chromium/webkit failed with truncated/non-ZIP download. WebKit suite also attempted: unavailable executable. Neither browser result is PASS.
- New browser regression is in the existing Chromium/WebKit CI matrix; real IndexedDB reopen and offline list/open checks.
- Shell cache v49 replaces v48 atomically; private package bytes and musical sample caches are retained. Installed-PWA migration unit test passes.

Remaining acceptance: GitHub CI exact-head Chromium/WebKit + renderer provenance; real iPhone installed-PWA upgrade/offline/reopen and active playback/fingerboard/cursor/orange-follow smoke. No main merge, deployment, production data writes or account test records.
