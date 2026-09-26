# ST Score Browser Runtime in Student App

## Purpose

STUDENT-07A consumes the ST Score Rendering Layer only as a read-only notation presentation dependency. Student App does not use OSMD objects as its product contract and does not grant the renderer authentication, sharing, teacher-editing, playback, filesystem, or network authority.

## Pinned provenance

- Rendering Layer repository: `khfy7wpr5p-maker/st-score-rendering-layer`
- Source revision: `375cb5f134a91606eeac59df9cbe33dedbe57e47`
- Runtime target: `browser`
- Score renderer contract: `0.2.0`
- OpenSheetMusicDisplay: `2.1.2`
- Student App asset root: `vendor/st-score-runtime/`
- Integrity authority: `vendor/st-score-runtime/runtime-manifest.json`

The vendored runtime graph is generated output. Do not hand-edit generated runtime or vendor files.

## Deterministic update procedure

1. Fresh-read the intended Rendering Layer revision and obtain explicit approval before changing the pin.
2. Check out the exact approved Rendering Layer revision.
3. Install its declared dependencies and run `npm run build`.
4. Export with the exact source revision recorded:

   ```bash
   ST_SCORE_RENDERER_SOURCE_REVISION=<approved-sha> node scripts/export-browser-runtime.mjs browser-runtime
   ```

5. Verify `runtime-manifest.json` before copying:
   - `runtimeTarget === "browser"`
   - expected `scoreRendererContractVersion`
   - exact `rendererSourceRevision`
   - reviewed OSMD version/license
   - every manifest byte count and SHA-256 matches the generated file.
6. Copy the exported directory byte-for-byte to `vendor/st-score-runtime/`.
7. Update the service-worker shell cache version when the runtime asset graph changes.
8. Run Student App focused tests and the full `npm test` suite.
9. Re-run physical iPhone/Safari/VoiceOver notation acceptance before merge.

No runtime CDN fallback is permitted. A Rendering Layer or OSMD upgrade is a separately reviewed change, not an automatic dependency refresh.

## Browser integration contract

The exported browser runtime relies on the same dependency shape as its generated `index.html`:

- the Student App page declares a static import map for the pinned ST modules;
- the pinned local `opensheetmusicdisplay.min.js` vendor script loads before the ST module bootstrap;
- `#st-score-root` exists before `browser-bootstrap.mjs` evaluates;
- the bootstrap emits `st-score-render-host-ready` with the renderer contract version;
- generated runtime HTML authorizes the inline import map and runtime style with deterministic SHA-256 CSP hashes; `unsafe-inline` is not permitted;
- the Student App runtime loader accepts only bounded same-origin asset URLs and resolves READY / UNAVAILABLE / ERROR.

The bootstrap binds to one `#st-score-root` object for its browser lifetime. Student App therefore retains that DOM object across Practice repaints, package changes, temporary navigation away from Practice, and later Practice re-entry while disposing presentation state at the existing lifecycle gates.

## Offline and privacy boundary

Service Worker Cache Storage contains only explicit static application/runtime assets. It does not store MusicXML or personalized Practice Package content.

Authorized private Practice Packages remain on the existing IndexedDB path. Cached renderer assets never imply authorization to a package.

## Failure behavior

- missing local runtime configuration -> notation UNAVAILABLE;
- runtime asset/bootstrap/contract failure -> notation ERROR;
- MusicXML/renderer failure -> notation ERROR;
- renderer disposal detail is suppressed from Student UI;
- playback, tempo, repeat, TAB, violin, sharing, authentication, and offline authorization remain independent.

## Physical acceptance

Target-device rendering has been qualified on the physical iPhone/Safari path: notation visibility/stability, VoiceOver-accessible Nota region, orientation/resize recovery, navigation reopen and authorized offline reopen have passed. Later Nota/TAB lifecycle and recovery work was also re-verified on iPhone.

This remains a **repeatable release gate**, not a one-time waiver. Any approved renderer revision change must re-run provenance checks, Chromium/WebKit browser gates and the physical iPhone/Safari/VoiceOver notation checklist before release.
