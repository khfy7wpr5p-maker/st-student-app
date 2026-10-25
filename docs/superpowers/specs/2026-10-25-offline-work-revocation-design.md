# Offline work revocation — approved design

Approved in chat on 2026-10-25. Repair stale offline work visibility and future opens without changing teacher delivery/editing, notation/TAB rendering, audio scheduling, fingerboard, measure cursor or orange note following.

Use existing exact status endpoints. Missing from a filtered list is never evidence of revocation. Network/auth/provider errors preserve existing offline access. Persist explicit access revocations locally, make Piece + child revocation atomic, and prevent stale responses from restoring access. Existing cached content is retained. Newly delivered access identities remain independent.

Revalidate on online session restore/sign-in, reconnect and missing cached entries during list refresh. Coalesce same-student work and status requests. Bind asynchronous outcomes to the initiating student/session. Refresh only an unchanged My Work screen, never rebuild an active practice workspace. An already-open practice may finish; future opens are denied after confirmed revocation.

Protected source: src/practice/**, src/playback/**, renderer/vendor/**, src/ui/violin*, renderStudentApp.js, teacher/backend, Firebase rules and contracts for music content. Main/mount may change only offline lifecycle wiring. No merge or production deployment in this authorization.
