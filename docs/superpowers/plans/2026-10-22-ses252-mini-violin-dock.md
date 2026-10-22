# SES-252 Mini Violin Dock Implementation Plan

**Goal:** Keep the existing violin fingering and active notation visible together on phones, without changing musical playback.

**Spec:** https://app.notion.com/p/4012be2e5664819abfbfd16f4769279b and SES-252/253/254/255. Source audit was presented to the user; the subsequent explicit approval starts implementation. Merge/deploy are not authorized.

**Architecture:** Retain the score SVG and document scroll owner. On compact screens only, group the existing violin presenter and unchanged transport in a fixed dock outside the score overflow container. A presentation observer measures dock obstruction and keeps the existing playing cursor visible; it never infers pitch, owns time, or changes a playback port. Detail controls remain outside snapshot-replaced markup.

## Constraints

- No AudioContext, scheduler, parser, MusicXML, engine or API changes.
- Keep desktop and non-violin/SCORE behavior intact.
- Preserve exact existing fingering snapshot, normalized string position and abstention.
- Keep VoiceOver focus, pause/restart/tempo, retained score DOM, offline cache and disposal safe.
- 100–140px is a target, not a fixed device-independent contract.

## Tasks and evidence

- [x] G0: Pin main `097b7b9`; map renderPracticeWorkspace/renderPieceWorkspace, piece-workspace-fusion.css, mountStudentApp.paint/onClick, violinFingerboard.show/clear and violinFollowCoordinator.bind/updatePosition. Review existing CI Chromium 17/17 and WebKit 17/17 at run 39707674641. Baseline local `npm test`: 757/757.
- [x] T1: First run compact markup/open-E tests RED (missing common dock and zero badge); add shared layout and snapshot-only compact/detail display. First run observer tests RED (missing presentation module); implement measured safe-area/keyboard layout, focus-safe detail and geometry-only cursor visibility.
- [ ] T2: Full local unit suite, Chromium/WebKit real 28-measure fixture at measures 21/24 and 320x568, 390x680, 844x390, 568x320; verify full active system above dock and collect screenshots. Preserve note size, focus and paused beat during details.
- [ ] Independent final branch review and remedy material findings.
- [ ] Physical iPhone Safari/VoiceOver/Dynamic Type acceptance (cannot be claimed from desktop WebKit).

## Review focus

- A stale or detached cursor must not move a different score.
- Pause, details and intentional viewport scrolling must not reset musical state.
- Keyboard, short landscape and text wrapping must not cover transport or notation.
- Page/control repaint must not lose expanded state or keyboard focus.
- Warm-cache v44 migration must load the new module atomically in v45.

## Decisions

- The new design cannot pass a visibility test before it exists. Existing-layout source/CI evidence belongs to G0; new-layout geometry belongs to T1/T2. Physical acceptance remains open.
- Event-driven, coalesced requestAnimationFrame is a layout flush, not an independent musical clock. No recurring animation loop is introduced.
- Linux browser installation in this workspace failed on unavailable Chromium download and missing WebKit system libraries; new browser evidence will run in the existing GitHub Actions matrix.
