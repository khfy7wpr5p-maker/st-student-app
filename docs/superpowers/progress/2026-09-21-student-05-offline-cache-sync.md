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

Task 7: RED a695c6e, CI 35647170582 -> 150 pass / 4 fail (expected missing Firebase adapters/rules).
Task 7: complete (commits a695c6e..155468f, tests: GitHub CI 35647354464 -> 166/166 pass, 0 fail).


Task 8 Step 1-2: complete at d292f22e0ed1a090a733d699adb98291fa4ac221, GitHub CI 35647630681 -> 169/169 pass, 0 fail.

Task 8 Step 3: README and architecture updated to current STUDENT-05 truth: Firebase Authentication + Cloud Firestore selected; provisioning/config not committed; IndexedDB owns Practice Package offline cache; Service Worker is static-shell only; authorized online open caches best-effort; restored trusted studentId is required offline; explicit REVOKED blocks cached access; network/provider failure never revokes; Firestore chunks are bounded to 256 KiB; Cloud Storage, Background Sync API and push remain absent; physical iPhone/Safari/VoiceOver acceptance remains STUDENT-06.

Task 8 Step 4: source-boundary scans investigated across src/ui, src/offline, src/providers/firebase, firebase/firestore.rules and service-worker.js. No credential literals, Firebase Storage use, Student UI/offline management write authority, or raw score/canonical/recipient leakage in UI modules found.

Final review: self-review (no subagent tool available in this harness).

Final review finding — Important: offline repositories rejected a second packageId for the same publication, contradicting immutable-version preservation and causing foreground sync to misclassify preserved older versions.
Final review RED 74b8f6d0a732b6e516dc40343d1fb34cd5dc7b90, GitHub CI 35653099720 -> 167 pass / 4 fail of 171 (expected version-cache failures).
Final review partial GREEN eac10fd6ab747fb98fcb0b5103ee7074dec5a7b8, GitHub CI 35653277356 -> 169 pass / 2 fail of 171; repository version storage fixed, sync grouping/revocation still exposed.
Final review additional RED 5c8023e680e06a4ee6811b09771722ae3977048a, GitHub CI 35653496429 -> 169 pass / 3 fail of 172; pins behavior for a newer ACTIVE server package that is not yet cached.
Final review fixed 164af4ac2d75ea3cb784cbe354e4e99c4437c054 — immutable versions preserved, foreground sync groups by publication, exact package verification refreshes only matching version, publication revocation blocks all cached versions; GitHub CI 35653604376 -> 172/172 pass.
Final review parity coverage c0e4713d144289faa4ddaccc86303f9ae8488bd7, GitHub CI 35653749799 -> 174/174 pass, including IndexedDB all-version revocation and exact-version verification.

Ruling: Aynı publicationId altında birden fazla immutable packageId cache kaydı korunur; offline list/open en yeni ACTIVE cachedAt kaydını seçer, revocation publication düzeyinde bütün cached sürümleri REVOKED yapar ve ACTIVE verification exact packageId'yi yeniler — tasarımın immutable version ve revocation kurallarıyla uyumludur — cost if wrong: latest-version selection policy repository selector seviyesinde değiştirilebilir; saklanan immutable snapshot'lar kaybolmaz.

Ruling: Provider ACTIVE olarak cache'de bulunmayan daha yeni bir packageId bildirirse mevcut ACTIVE cache otomatik revoke edilmez ve sync failure sayılmaz — newer-version availability revocation kanıtı değildir ve STUDENT-05 yeni paketi background indirmez — cost if wrong: gelecekte explicit update-available metadata/counter eklenmesi gerekir, mevcut snapshot korunur.

Task 8 Step 5: connector-only harness içinde local shell çalıştırılmadı; repository CI workflow exact olarak `npm ci` ve `npm test` çalıştırır. Latest pre-documentation exact-head verification: c0e4713d144289faa4ddaccc86303f9ae8488bd7 / CI 35653749799 / 174 tests / 174 pass / 0 fail.

Task 8 Step 6: whole-branch explicit self-review completed against main...feat/student-05-offline-cache-sync with focus on cross-student isolation, revocation vs network failure, immutable versions, raw-data leakage, Service Worker scope, Firestore chunk bounds, provider-neutral core, no Firebase Storage/paid dependency, and STUDENT-01..04 regression risk. One Important finding above was fixed with RED -> GREEN evidence. No remaining Critical or Important finding identified.

Task 8 Step 7: this ledger/README/architecture closure is committed with message `docs: close STUDENT-05 offline cache sync`.

Deferred minor: Firebase project provisioning/configuration and real backend credentials are intentionally external and not committed.
Deferred minor: Firestore Security Rules are contract-tested in repository CI but live Firebase project/emulator acceptance is deferred until provisioning exists.
Deferred minor: physical iPhone/Safari/VoiceOver and real-device offline acceptance remain STUDENT-06.
