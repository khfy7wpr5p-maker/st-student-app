# STUDENT-03 Minimal Shell Implementation Plan

Goal: implement the approved STUDENT-03 shell with no new dependencies.

## Task 1 — Shell controller

Create:
- `src/ui/studentAppController.js`
- `test/studentAppController.test.js`

TDD behaviors:
- unauthenticated initial state is `sign_in`;
- attaching a valid STUDENT-02 session enters `home`;
- Public Pool uses `sharingService.listPublicPool`;
- My Work uses `sharingService.listMyWork`;
- Open Practice uses `sharingService.getPracticeItem`;
- sign out clears session/data and returns to `sign_in`;
- controller exposes no publish/revoke operations.

## Task 2 — Semantic renderer

Create:
- `src/ui/renderStudentApp.js`
- `test/renderStudentApp.test.js`

TDD behaviors:
- each screen has a clear heading;
- Home has Public Pool / My Work navigation;
- lists use semantic list markup;
- empty states are visible;
- practice shell renders title only;
- dynamic titles are HTML-escaped;
- MusicXML/raw score data is never rendered;
- private recipient/debug/OMR/editor internals are never rendered.

## Task 3 — Browser mount adapter

Create:
- `src/ui/mountStudentApp.js`
- `test/shellActions.test.js`

Keep browser glue thin:
- action names map only to controller navigation/read methods;
- no management/write actions;
- host-provided auth callback may attach a returned session;
- root gets renderer output after actions.

No jsdom dependency is added; event/action dispatch logic must remain separately testable as pure functions.

## Task 4 — Minimal static entry

Create:
- `index.html`
- `src/ui/main.js`

The default page renders the Sign In shell without pretending that a real auth provider exists. It must not embed fake credentials or hardcoded student accounts.

## Task 5 — Docs and verification

Update:
- `README.md`
- `docs/architecture.md`

Verify exact branch head:
- `npm test`
- full GitHub CI
- no dependency changes
- no secrets
- no provider SDK
- no STUDENT-04/05 scope creep

Open PR and stop before merge.
