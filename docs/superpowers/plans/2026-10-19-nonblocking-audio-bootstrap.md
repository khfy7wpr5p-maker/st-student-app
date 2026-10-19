# Nonblocking audio manifest bootstrap

## Approved scope

Only remove the piano manifest network wait from the initial Student shell. Keep audio readiness, account/session authority, playback clock, MusicXML visibility and current instrument behavior. Do not parallelize content reads, change APIs, modify Render, merge or deploy.

## Implementation

Start manifest initialization in the background before session restore. After controller and mount exist, attach completion handling: successful initialization invokes the existing guarded active-practice playback recovery and then renders. This covers a practice opened while the manifest was pending. Failure remains presentation-local; no AudioContext is created by startup. Refresh the atomic shell from v32 to v33.

## Evidence

- Production entry-body execution in Node VM replaces imported browser boundaries; uses real piano bank, engine and Student controller. A delayed manifest first reproduced blocked mounting (RED).
- Independent review found that the initial background-only change could leave an early-opened practice unavailable. The real-controller regression first failed without completion notification, then passed with guarded recovery/render. No unrelated review findings.
- Success and rejection cases verify mounting before settlement, pending fetch deduplication, unavailable playback while pending, recovery of playback/tempo after success without navigation or connectivity changes, and bounded manifest failure.
- Migration regression first failed because v32 installation overwrote the still-active bootstrap. v33 preserves v32 bytes during installation, contains current bootstrap, and removes v32 during activation.
- Final `npm test`: 718 passed, 0 failed, 0 skipped. Syntax and `git diff --check` passed. Existing static shell test intentionally updated from an awaited manifest to background readiness.
- Browser CI and physical-device acceptance remain pending. This proves removal of one blocking dependency, not a measured number of seconds saved on student devices. Render cold starts and serial content reads are unchanged.
