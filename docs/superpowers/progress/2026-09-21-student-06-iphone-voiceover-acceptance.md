# STUDENT-06 progress — iPhone / Safari / VoiceOver Acceptance

Base dependency: STUDENT-05 feature head db1ed163188bca9b369ba86290e33345d97b7aa4. PR #5 remains unmerged; STUDENT-06 is intentionally stacked and must not bypass that merge gate.

Approved scope:
- automated mobile/accessibility acceptance coverage
- VoiceOver focus-loss regression protection
- physical iPhone/Safari/VoiceOver acceptance checklist
- no unrelated product features

RED:
- commit 0caed0df8598e7bedec9e348652d26798ebdb48e
- GitHub CI 35654668783
- 175 tests / 174 pass / 1 fail
- expected failure: same-screen connectivity repaint lost focused VoiceOver control

GREEN:
- commit 7615b23187e571d36aef5416a178351818b88d03
- GitHub CI 35654751399
- 175/175 pass
- fix: preserve matching focused data-action control across same-presentation repaint; do not restore focus across navigation/presentation changes.

Physical acceptance status:
- NOT YET RUN.
- Requires physical iPhone + Safari + VoiceOver.
- End-to-end auth/Firestore/offline acceptance additionally requires Firebase production-like provisioning/configuration, which STUDENT-05 intentionally did not commit.
