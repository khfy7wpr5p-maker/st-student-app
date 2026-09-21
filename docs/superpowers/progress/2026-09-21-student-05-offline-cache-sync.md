# SDD ledger — plan: docs/superpowers/plans/2026-09-21-student-05-offline-cache-sync.md

Execution mode: Native / remote GitHub feature branch.

Ruling: Local Superpowers scratch workspace is unavailable in this connector-only harness; use this tracked progress ledger instead — preserves task/RED/GREEN provenance across context compaction — cost if wrong: extra documentation commits, no runtime effect.

Pre-flight shared interfaces:
- Task 1 -> Task 2: async offline repository contract must be identical for in-memory and IndexedDB adapters; plan is consistent.
- Task 1/2 -> Task 3: offline-aware Sharing Service consumes the repository contract and returns normal delivery items plus bounded offlineAvailability; plan is consistent.
- Task 3 -> Task 5: controller methods must become await-compatible because provider/offline reads are async; plan is consistent.
- Task 1/2 -> Task 4: sync coordinator consumes listAllForStudent/markVerifiedActive/markRevoked; plan is consistent.
- Task 4 -> Task 5: sync state is safe presentation metadata only; plan is consistent.
- Task 7 -> Task 3/4: Firestore adapter must satisfy online sharing and publication-status seams without Firebase types escaping; plan is consistent.
- Task 6 -> Task 8: Service Worker is shell-only and independent from package IndexedDB; plan is consistent.

Base main: 96dcfa9791f56956012070eaed8d74da4c4dca59

Task 1: RED ac12951, CI 35645406225 -> 103 pass / 3 fail (expected missing deliveryItem/offline modules).
Task 1: complete (commits ac12951..0671305, tests: GitHub CI 35645522258 -> 124/124 pass, 0 fail).

Task 2: RED 9e2c949, CI 35645677554 -> 124 pass / 1 fail (expected missing IndexedDB adapter; npm ci succeeded).
Task 2: complete (commits 9e2c949..15b87cd, tests: GitHub CI 35645801368 -> 128/128 pass, 0 fail).

Task 3: RED 1fe7105, CI 35645959818 -> 128 pass / 2 fail (expected missing connectivity/offline-aware modules).
Task 3: complete (commits 1fe7105..19d3270, tests: GitHub CI 35646078820 -> 136/136 pass, 0 fail).

Task 4: RED eb3c672, CI 35646227389 -> 136 pass / 1 fail (expected missing syncCoordinator).
Task 4: complete (commits eb3c672..228245e, tests: GitHub CI 35646321743 -> 141/141 pass, 0 fail).

Task 5: Ruling: controller read methods are sync-or-Promise instead of always-Promise — preserves STUDENT-03/04 synchronous provider compatibility while accepting async Firebase/offline providers; shell already awaits both — cost if wrong: a caller that requires Promise identity rather than await-compatible behavior would need normalization.
Task 5: RED 051e2e3, CI 35646521926 -> 141 pass / 5 fail (expected async/offline UI gaps).
Task 5: complete (commits 051e2e3..c1c01f6, tests: GitHub CI 35646709627 -> 146/146 pass, 0 fail).

Task 6: RED 9a9fb4b, CI 35646838516 -> 146 pass / 1 fail (expected missing Service Worker registration module).
Task 6: complete (commits 9a9fb4b..bc47e17, tests: GitHub CI 35646939843 -> 150/150 pass, 0 fail).
