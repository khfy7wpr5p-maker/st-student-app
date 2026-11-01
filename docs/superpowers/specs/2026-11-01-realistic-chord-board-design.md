# Approved Student chord appearance

The owner approved the six-step Student-only adaptation on 2026-11-01.
Reference: Guitar Chord Board 0.22.0, commit
`7fb86d231c35e6d3ce7bc07c5b0cfbd845da4b30`.

Apply its dark wooden neck, metal frets, wound bass strings, ivory finger/barre
markers and visible string/actual-fret numbers to the existing Student SVG.
Both the standalone CHORD_BOARD workspace and Piece Akorlar panel use it.
Keep `renderChordDiagramSvg(viewModel)` and the exact authorized snapshot model.
Preserve all fret/finger/barre metadata, semantic descriptions and teacher notes.

The change is presentation-only. Keep package contracts, catalog provenance,
assignment/offline stores, all playback, SCORE/TAB follow and accepted violin
presentation unchanged. No new dependency, network asset, animation or external
repository edit. Package version stays independent of the 0.22.0 visual reference.

Use component-scoped CSS and private per-instance SVG resource IDs. Keep an
unchanged immutable workspace's SVG stable across no-op application paints;
standalone and Piece own separate instances. Direct renderer calls still
generate unique resources, including repeated calls with the same snapshot. Existing
non-chord styles remain intact. Adapt typography to narrow Student panels; check
320/390 px phones, landscape and iPad. Bump only the shell cache from v50 to v51
and verify atomic upgrade including the old chord renderer and accepted violin.

Deliver verified code and a PR. Production merge/deployment is a separate action.
