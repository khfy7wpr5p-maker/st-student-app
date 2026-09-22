# STUDENT-06 progress — iPhone / Safari / VoiceOver Acceptance

Status: PHYSICAL ACCEPTANCE A-D PASS (2026-09-22)

Base:
- PR #5 / STUDENT-05 main'e merge edildi.
- PR #6 base: `main`.
- Feature branch: `feat/student-06-iphone-voiceover-acceptance`.

## Approved scope

- automated mobile/accessibility acceptance coverage
- VoiceOver focus-loss regression protection
- Firebase production-like browser wiring
- physical iPhone/Safari/VoiceOver acceptance
- offline reload acceptance
- no unrelated product features
- no Student App Firestore write capability

## VoiceOver focus regression

RED:
- commit `0caed0df8598e7bedec9e348652d26798ebdb48e`
- CI 35654668783
- 175 tests / 174 pass / 1 expected fail
- failure: same-screen connectivity repaint lost focused VoiceOver control

GREEN:
- commit `7615b23187e571d36aef5416a178351818b88d03`
- CI 35654751399
- 175/175 pass
- behavior: same-presentation repaint restores matching focused action control; navigation changes do not force focus restoration.

## Firebase production-like wiring

Verified implementation:
- Firebase JS SDK 12.19.0 browser modules
- Email/Password Authentication
- Firebase uid -> stable Student App studentId
- Firestore Sharing Adapter behind provider boundary
- IndexedDB canonical offline package cache
- Service Worker static shell + pinned Firebase runtime modules
- no Analytics
- no Storage
- no service-account credential in Student App

## Firestore physical test fixture

Mobile Firebase Console saved some manually entered string values as empty strings. The manual path was stopped.

A bounded seed tool was added instead:
- `scripts/student06SeedFixture.js`
- `scripts/seed-student06-firestore.mjs`

Safety:
- dry-run by default
- `--apply` required for live write
- short-lived Google access token only
- token never stored in repository or Student App
- four exact test documents only
- Student App Security Rules remain read-only

TDD:
- seed-plan RED: 196 tests / 193 pass / 3 expected fail
- seed-plan GREEN: 196/196 pass
- commit/CLI RED: 198 tests / 196 pass / 2 expected fail
- commit/CLI GREEN: 198/198 pass

Cloud Shell evidence:
- `DRY RUN: 4 bounded writes`
- `COMMITTED: 4 bounded writes`

## Physical iPhone/Safari acceptance

A. Safari core flow — PASS
- Firebase sign-in
- Home
- Public Pool
- My Work
- private Practice open
- real Firestore manifest + chunk read

B. VoiceOver — PASS
- primary navigation labels and order
- Practice headings/labels
- no provider/internal identifiers announced

C. VoiceOver focus preservation — PASS
- focus left on `Havuz`
- network status changed
- focus remained on the same control

D. Offline reload — PASS
- work opened online and cached
- Wi-Fi/cellular disabled
- app reported `Çevrimdışı`
- Safari reload succeeded
- cached private Practice reopened

E. Notation/playback runtime — NOT RUN / NOT BLOCKING
- verified renderer runtime is not deployed into the Student App browser context
- trusted playback port is not connected
- bounded UNAVAILABLE UI is expected

## Current verification state before closure commit

- latest full CI evidence: 198/198 pass, 0 fail
- GitHub Pages deployment: success
- physical A-D: PASS

## Merge gate

PR #6 remains unmerged.
Merge to `main` still requires explicit human approval.
