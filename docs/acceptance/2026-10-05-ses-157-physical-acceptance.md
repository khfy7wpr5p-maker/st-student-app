# SES-157 Physical Acceptance Handoff

Date: 2026-10-05

## Scope

This checklist is the release-level physical acceptance gate for SES-157. Automated Node, Chromium, and WebKit evidence does not substitute for a real iPhone Safari + VoiceOver check.

## Preconditions

- Use the exact candidate build associated with the SES-157 merge candidate SHA.
- Sign in as an authorized student with one Piece containing SCORE plus chord child content.
- The same Piece must be movable by teacher authority from ACTIVE to REPERTOIRE without changing Piece identity.
- Do not expose internal Piece, assignment, package, provider, token, or student authority IDs in the student UI.

## iPhone Safari acceptance

- [ ] Open `Benim Çalışmalarım` on physical iPhone Safari.
- [ ] In `Aktif Çalışmalar`, the Piece appears exactly once.
- [ ] SCORE child does not appear as a separate work row.
- [ ] CHORD_BOARD child or children do not appear as separate work rows.
- [ ] The Piece title control is reachable and has an understandable accessible name.
- [ ] After teacher-side ACTIVE → REPERTOIRE transition and a successful foreground refresh/sync, the Piece disappears from `Aktif Çalışmalar`.
- [ ] The same Piece appears exactly once in `Repertuarım`.
- [ ] Opening the Piece exposes the authorized `Nota` and `Akorlar` views without duplicate work rows.
- [ ] Layout remains usable at the normal iPhone viewport without horizontal overflow or clipped primary controls.

## VoiceOver acceptance

- [ ] VoiceOver announces `Aktif Çalışmalar`, `Bitmiş Çalışmalar`, and `Repertuarım` as distinct usable controls.
- [ ] VoiceOver announces the Piece title once in the selected lifecycle folder.
- [ ] Child SCORE/Akor assignment identities are not announced as extra standalone works.
- [ ] Focus remains understandable after switching lifecycle folders.
- [ ] Opening the Piece exposes the `Çalışma görünümü` tablist and the `Nota` / `Akorlar` controls with understandable names and selected state.
- [ ] No internal IDs, token/provider details, raw MusicXML, or debug strings are announced.

## Warm-cache revoke acceptance

- [ ] While online, open/cache the Piece and its available SCORE/Akor content.
- [ ] Go offline and confirm previously authorized cached work may remain usable while authority cannot be revalidated.
- [ ] Revoke the Piece from teacher authority while the device remains offline.
- [ ] Restore connectivity and allow the first successful foreground sync to complete.
- [ ] After that successful sync, the Piece is no longer launchable from active offline cache.
- [ ] Direct cached SCORE child is no longer launchable.
- [ ] Direct cached CHORD_BOARD child or children are no longer launchable.
- [ ] A transient network error before successful revalidation does not falsely remove valid cached authority.

## Evidence to record

- Device model and iOS version:
- Safari version/build:
- VoiceOver enabled: yes / no
- Candidate commit SHA:
- ACTIVE → REPERTOIRE result:
- Warm-cache revoke result:
- VoiceOver result:
- Any screenshots/video references:
- Tester/date:

## Completion rule

SES-157 may be considered automated-engineering complete when its exact candidate SHA is green in the full Node and Chromium/WebKit CI matrix. Release-level completion remains pending until every applicable physical checkbox above is verified and the evidence fields are filled in.