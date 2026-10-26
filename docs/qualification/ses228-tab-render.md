# SES-228 exact TAB rendering qualification

The original two-measure fixture `browser-tests/fixtures/tab-string-fret.musicxml`
uses standard tuning, source-sounding pitches, notation voice 1 and TAB voice 5.
Hand-checked pitches and positions:

| Measure / beat | Sounding pitch | String / fret |
| --- | --- | --- |
| 1 / 1 | E4 (64) | 1 / 0 |
| 1 / 2 | D4 (62) | 2 / 3 |
| 1 / 3 | E4 (64) | 3 / 9 |
| 2 / 1 | E4 (64) | 4 / 14 |
| 2 / 2 | A3 (57) | 5 / 12 |
| 2 / 3 | E2 (40) + G3 (55) | 6 / 0 + 3 / 0 |

`ses228-tab-string-fret.spec.mjs` renders the whole fixture at 390 and 1280 px.
It checks every visible TAB numeral against the six painted staff lines,
the complete onset order, both measures, and chord cardinality. It does not
derive expectations from the application or treat global SVG text as proof.
Changing fret 14 to 15, moving string 4 to string 3, or removing the second
measure each makes the test fail; the original fixture is restored afterward.

Run through the existing CI browser matrix with `npm run test:browser` and
`ST_BROWSER=webkit npm run test:browser`. The optional
`ST_CHROMIUM_EXECUTABLE_PATH` permits an explicitly selected local Chromium.

Local evidence (2026-10-26): both new tests pass in Chromium 141.0.7390.37
and WebKit 26.5; all 846 Node tests pass. The full browser suites have
additional failures in this host (Chromium 21/24; WebKit 17/24). Those
results do not establish a release approval. No renderer or app source was
changed. Chromium 151's CDN archive was invalid here, so the local check
used headless Chromium 141. WebKit used locally extracted system libraries.
The normal CI matrix remains necessary before merge.

Baseline comparison: the three Chromium failures reproduce on unchanged
Student main c646ab5. The seven WebKit failures also reproduce on that
same unchanged main in this host. These broader checks remain separate
from the two new TAB tests and must be checked in the normal CI environment.
