# Realistic violin fingerboard — approved visual design

Approved by Önder in this conversation after the MagicPath prototype:
project `465886118261428224`, component `465886123739189248`,
revision `467386809148641280`.

## Outcome

Apply the approved top-down, fretless violin neck to the shared Student
fingerboard presenter: shaped ebony with a maple edge, dark nut, four metallic
strings, warm active-string emphasis and a raised amber numbered marker. Keep
the existing compact card and expandable detail, not the prototype's comparison
page or example-note data. Existing eligible violin assignments and future ones
use the same presenter; assignment packages need no migration or resending.

## Binding constraints

- Preserve the `320 × 112` SVG coordinate system, G/D/A/E rows at 20/44/68/92,
  nut origin 40, string end 300 and `x = 40 + normalizedPosition * 260`.
- Preserve playback snapshots, target-part selection, musical calculations,
  score/TAB rendering, note/cursor following, controls and dock measurements.
- Open strings retain the visible 0; no stopped-finger marker is invented.
  Rest, invalid, missing and ambiguous states still clear the active drawing.
- Retain Turkish semantic descriptions and accessible controls; no live-region
  announcements, extra focusable decoration, perspective or motion loop.
- No React, WebGL, packages, remote textures, fonts or new runtime modules.
  Paint uses existing same-origin inline SVG and CSS.
- Material references must remain valid with compact/detail views and multiple
  presenters simultaneously mounted. A hidden detail must not own another
  panel's gradient definitions.
- Preserve existing panel geometry. Scope surface styling to violin panels.
- Refresh the static shell atomically; retain private packages, samples and
  the legacy compatibility cache. No backend, renderer or delivery changes.
- Implementation and a reviewable feature PR are in scope. Merge, production
  deployment and claims of physical-device acceptance are not.

## Verification

Use existing unit, violin-follow, compact dock, browser and cache migration
checks. Add focused coverage for local SVG resource ownership, which is a new
risk introduced by material painting. Inspect actual rendered stopped/open
states. Record Chromium/WebKit results and any unavailable physical-device
coverage separately.
