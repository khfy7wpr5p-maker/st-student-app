# Follow startup recovery — task 2, bounded first slice

## Contract

A failed green cursor move must remain retryable on the next position tick in the same measure. Only a successful move may populate the cursor deduplication key. Explicit runtime rejection must propagate through the notation adapter so orange highlight failures also remain retryable. Preserve void-return renderer methods, package/source identity, stale generation guards, exact event mapping, playback plan and audio clock. Deliver the changed modules through atomic shell v32. No latency, backend, data mutation, renderer pin or UI policy changes.

## Evidence

- Cursor throw/false tests first failed because the cursor remained absent on a second tick within the measure. Fixed by committing the deduplication key only after success and a current-generation check.
- Adapter false-rejection test first failed (true instead of false). Real adapter/coordinator orange-retry integration also failed against the baseline adapter, then passed with the fix. Void-return host methods remain successful.
- Cache migration test first failed because v31 installation overwrote the active recovery module bytes. v32 separates installation and removes stale v31 only during activation.
- `npm test`: 716 passed, 0 failed, 0 skipped. `git diff --check` and syntax checks passed. Browser CI and physical Android acceptance are pending.

## Separate source-data finding — unresolved

Read-only reproduction against the supplied `Bülbülüm_Altın_Kafeste(AkorEşlik).xml`: P0 has divisions=4096 and 85 notes; P1 has no divisions and 662 notes. The production approximate compiler returns null. This is a deterministic reason both followers cannot bind when that unmodified XML is the delivered score source. It does not explain a phone-specific login recovery by itself. Do not borrow a time unit from another part or alter the user's source XML. Actual student-delivered package content must be compared before choosing a producer fix or a formally justified compiler compatibility rule.

Automatic OSMD redraw losing presentation remains a separate, unconfirmed trigger; this patch does not claim to fix it. The overall second task is partial until delivered-data and real-device evidence close those boundaries. Third-task opening latency is untouched.
