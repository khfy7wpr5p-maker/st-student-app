# STUDENT-03 execution ledger

Base main: `df12cb7f4407af1379fc25bd9011a588ed5ab0b6`
Branch: `feat/student-03-minimal-shell`

## Decisions

- No UI framework or dependency added.
- Controller receives only STUDENT-02 read-only Sharing Service.
- Full Practice Package is reduced to safe UI summaries before rendering.
- Default browser entry does not mint fake student sessions.
- Auth provider remains external.
- Auth session is snapshotted to frozen stable `studentId` only.

## TDD evidence

- Controller RED: run `35625906436` — missing controller module.
- Controller GREEN: run `35625954937`.
- Renderer RED: run `35626015171`.
- Renderer test corrections: runs `35626153109`, `35626209976`.
- Renderer GREEN: run `35626268476`.
- Shell actions RED: run `35626322451`.
- Browser mount/actions GREEN: run `35626387248`.
- Static entry RED: run `35626457296` — missing `index.html` and `src/ui/main.js`.
- Static entry GREEN: run `35626526444`.
- Mutable-session security RED: run `35626589983`.
- Mutable-session security GREEN: run `35626640764`.

## Scope exclusions preserved

No real auth provider, cloud provisioning, provider SDK, notation rendering, playback, rhythm UI, TAB/violin renderer, offline cache, teacher tools, OMR, messaging, groups, social features, gamification, or payments were introduced.
