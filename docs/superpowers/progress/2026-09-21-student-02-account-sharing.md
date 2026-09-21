# SDD ledger — plan: docs/superpowers/plans/2026-09-21-student-02-account-sharing.md

Execution mode: connector-only remote branch isolation; local worktree scripts are unavailable in this harness.

Pre-flight: Task 1 session contract feeds Task 2 access policy.
Pre-flight: Task 2 publication/access policy feeds Tasks 4-6 repositories and service.
Pre-flight: Task 3 package eligibility feeds Tasks 4-6 repositories and service.
Pre-flight: Task 4 repositories feed Tasks 5-6 service behavior.
Pre-flight: Task 5 service feeds Task 6 revocation/version-safety tests.
Ruling: STUDENT-01 Practice Package still contains a publication field while STUDENT-02 adds a separate operational Publication record. On publish, scope and recipient must match across both records to prevent contradictory access metadata. Cost if wrong: a legitimate future workflow that intentionally separates package-declared scope from operational scope would need an explicit contract revision.
