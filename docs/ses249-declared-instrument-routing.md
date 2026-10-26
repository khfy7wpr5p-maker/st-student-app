# SES-249 explicit derived MusicXML instrument routing

The Teacher opt-in is one `identification/miscellaneous/miscellaneous-field` named `seslitab-part-instruments-version` with text `1`. Standard score-instrument and midi-instrument declarations carry the part map. This uses PracticePackage 1.0.0 without a new package field or migration. All old unmarked packages keep their prior uniform selection / violin-plus-declared-piano behavior.

The marked route requires exact unique part IDs, declared instrument references, complete supported static MIDI programs (1 piano, 25 classical guitar, 41 violin), default GM bank, and non-percussion channels. It rejects unknown versions, duplicate markers/IDs, undeclared references and mid-score instrument changes. A violin mapping requires the existing explicit violin target descriptor to name a VIOLIN part; multiple violin lanes can sound while one selected part drives the board. Polyphonic target events retain V1 abstention.

The existing shared AudioContext, one scheduler, musical plan, tempo, pitch, event identity, sample provider and transport ownership are unchanged. PWA shell v47 includes the new reader for offline reopen and migrates v46 clients.

Verification: baseline 779/779 Node tests. Added all nine supported sound pairs, alternate IDs/body order, malformed declarations, target consistency, genuine sample-resolver guitar/violin integration and v46→v47 cache migration. Physical iPhone acceptance is separate. Release this consumer before the associated SES-249 Teacher producer; no live assignment is rewritten.
