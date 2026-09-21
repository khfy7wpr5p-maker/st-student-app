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
