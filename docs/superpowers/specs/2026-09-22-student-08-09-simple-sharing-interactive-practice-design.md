# STUDENT-08/09 Simple Sharing, Personal Practice and Interactive Score Architecture Design

**Date:** 2026-09-22  
**Status:** Design/spec only. No product-code implementation is authorized by this document.  
**Repository:** `khfy7wpr5p-maker/st-student-app`  
**Baseline main:** `a5ede988f198c49b70021d621554b55e6b961502`  
**Related read-only baselines:** Rendering Layer `49dcb4737e802f956fc483ab2c8eac62a2508846`; Chord Board `6f8b869c32e9c2c5045449f79f4a686c0a67bb6d`; OMR Correction Engine `875717ebbb4bd07bab33082a809b7a12d1b6e9b7`.

## 1. Product intent

Keep the Student App deliberately small. Complexity stays in contracts and management services; the student sees only a few large, understandable destinations and actions.

The signed-in information architecture is:

```text
Left navigation (~25%)      Selected content (~75%)

Havuz                       list/detail for pool content
Benim Çalışmalarım          active/completed/repertoire or practice
Çıkış
```

On widths that cannot safely sustain the two-pane layout, the same navigation may collapse responsively, but no extra product area is introduced.

## 2. Simplicity invariants

- No technical identifiers, package terms, provider names, XML, runtime details or debug text in the student UI.
- No chat, comments, social profile, scoring, analytics dashboard, payment, group-management system or push-notification system in this scope.
- No student-side editor, OMR, correction engine or teacher authority.
- No student "Hazırım" control.
- Completion and repertoire placement are teacher-owned decisions.
- Student App remains read-only with respect to teacher-owned work and assignment state.

## 3. Havuz

Havuz is no longer defined as a notation-practice workspace. It is a lightweight repertoire/announcement area.

### Visible behavior

A pool card may show only the information needed for scanning:

- title;
- short description;
- date when applicable;
- a small `Yeni` marker when applicable.

Tapping a card opens its text/detail in the right content area. Pool items do **not** open notation, playback, measure interaction or Chord Board practice.

### Audience

Default audience is every student. Teacher may optionally select multiple students.

```text
audienceMode = ALL
or
audienceMode = SELECTED + recipientStudentIds[]
```

### Domain separation

Existing Practice Package v1 `public_pool` means an authenticated-all-students score publication and explicitly forbids recipient IDs. Do not overload that contract for targeted announcements.

STUDENT-08 introduces a separate `PoolItem` / pool-visibility domain for announcements and repertoire notices. Existing Practice Package v1 remains unchanged until a deliberate migration is designed.

## 4. Benim Çalışmalarım

The personal area has three student-visible folders:

```text
Benim Çalışmalarım
├─ Aktif Çalışmalar
├─ Bitmiş Çalışmalar
└─ Repertuarım
```

Assignment state is intentionally small:

- `ACTIVE`
- `COMPLETED`
- `REPERTOIRE`

The teacher owns transitions. A student cannot mark an assignment completed and cannot move it to repertoire.

A completed work may remain in `COMPLETED`, or the teacher may later move it to `REPERTOIRE`. Repertoire is therefore an explicit teacher decision, not an automatic consequence of completion.

## 5. Private assignment model

A teacher may select one or many students for the same source work.

Multi-select does **not** create one shared private record. It creates one `PrivateAssignment` per student so authorization, teacher note and lifecycle remain student-specific.

```text
shared approved source
├─ assignment(student A, note A)
├─ assignment(student B, note B)
└─ assignment(student C, note C)
```

Students never see the other recipients.

Teacher notes are attached to the private assignment, not to the shared immutable source package. This permits different notes for different students without duplicating or mutating the score source.

Independent free-form personal messages are out of scope.

## 6. Assignment content types

STUDENT-08/09 recognizes two practice types:

- `SCORE`
- `CHORD_BOARD`

The assignment wrapper is responsible for type, student, teacher note and lifecycle state. Content authority stays in the type-specific source.

### SCORE

Uses the existing teacher-approved score / Practice Package path.

Student workspace may provide:

- notation;
- playback;
- tempo when teacher-permitted;
- automatic playback follow;
- active note/chord highlighting;
- measure-tap replay.

### CHORD_BOARD

Chord homework is **not** converted to MusicXML merely for transport.

Practice Package v1 requires MusicXML, so a Chord Board task must not be forced into that schema. A Chord Board assignment carries a bounded immutable snapshot of the teacher-selected chord voicing.

Minimum snapshot data is enough to preserve the exact assigned shape independently of future catalog reordering:

- displayed chord symbol;
- canonical chord identity;
- six-string fret vector;
- fingering/barre metadata needed by the diagram;
- any bounded exact MIDI/audio evidence needed by the consumer.

A chord assignment may contain a small ordered homework list of chord snapshots, but it has no rhythm-sequencing, automatic grading or progression-analysis semantics in this scope.

Student presentation remains simple: chord name, diagram, teacher note and chord audition.

## 7. STUDENT-09 interactive score behavior

The student does not select notes.

### Measure interaction

The interaction target is the **measure**.

```text
tap anywhere in measure
→ resolve partId + measureIndex
→ play that measure once from its start
```

There is no separate visible "measure repeat" switch in the target student UX.

For backward compatibility, the existing `allowMeasureRepeat` teacher permission may gate this bounded measure-replay capability in the first implementation slice. The user-facing behavior is one-shot measure replay; indefinite looping is not implied by tapping a measure.

### Follow feedback

During normal playback:

- a measure cursor follows playback automatically;
- currently sounding note(s) or chord may be highlighted automatically;
- previous highlight is cleared when playback advances, pauses, stops, package changes, navigation occurs or sign-out happens.

This visual feedback is system-owned; the student does not select the highlighted note.

## 8. Rendering Layer boundary

Student App continues to use only ST-owned Rendering Layer contracts and must not scrape OSMD/SVG internals.

Current pinned Rendering Layer already supplies:

- measure cursor movement;
- note highlight / clear highlight;
- note hit-testing;
- generic rendered NOTE/REST targeting with `partId + measureIndex + eventIndex + voice`.

Two bounded gaps remain for STUDENT-09:

1. **Measure-area hit test:** current event hit-testing does not guarantee a hit when the student taps empty whitespace inside a measure. A renderer-owned `hitTestMeasure(clientX, clientY)` or equivalent measure-region contract is required.
2. **Playback-to-render identity:** current Student PlaybackPlan has timing, MIDI, part, voice and measure data but no stable renderer event identity. Precise active-note highlighting must use a deterministic identity bridge rather than pitch/MIDI guessing or DOM proximity.

Measure cursor can be delivered earlier because both layers already share `measureIndex`.

## 9. Correction Engine boundary

ST OMR Correction Engine is **not** a Student App runtime dependency.

Its deterministic exact-revision-local event identity and reverse-mapping principles are useful design references for the playback-to-render identity bridge, but correction analysis, readiness logic, proposal generation and mutation authority do not enter the student runtime.

## 10. Chord Board boundary

ST Guitar Chord Board remains the chord-domain authority for chord identity, voicing shape, fingering/barre metadata, diagram semantics and guitar audition behavior.

STUDENT-08 does not authorize a cross-repository runtime dependency automatically. Before Student App consumes Chord Board at runtime, a reviewed ST-owned export/contract or bounded snapshot renderer must be defined.

Old assignments must retain the teacher-selected voicing snapshot even if a future Chord Board release changes ranking/order of available voicings.

## 11. Teacher-side authority

Teacher management surface may expose only the small product actions needed for this model:

- Havuza Gönder;
- Öğrenciye Gönder;
- Tamamlandı;
- Repertuara Ekle;
- Geri Çek.

Multi-student selection is allowed for pool targeting and private assignment creation.

Teacher-side roster displays human-readable names/nicknames but authorization uses stable internal `studentId` / Firebase uid. Firebase client Authentication is not treated as a safe "list all users" roster API; roster management belongs to a trusted teacher-management boundary.

## 12. Data flow

```text
Teacher App / trusted management
├─ PoolItem
│  ├─ ALL
│  └─ SELECTED students
└─ PrivateAssignment
   ├─ SCORE -> teacher-approved Practice Package
   └─ CHORD_BOARD -> immutable voicing snapshot
          |
          v
Sharing / authorization layer
          |
          v
Student App (read-only)
├─ Havuz -> card/detail only
└─ Benim Çalışmalarım
   ├─ ACTIVE
   ├─ COMPLETED
   └─ REPERTOIRE
```

## 13. Security and privacy

- A private assignment is readable only by its target student.
- Multi-recipient teacher actions materialize separate private assignments; they do not reveal recipient lists to students.
- Targeted pool items are readable only by selected students.
- Pool targeting does not weaken `student_private` score authorization.
- Student App has no publish, revoke, completion, repertoire-promotion or teacher-note write authority.
- Existing private Practice Package offline storage remains IndexedDB-owned; static runtime caches remain separate.
- No teacher roster secret/admin credential is shipped to the browser.

## 14. Compatibility findings against current main

### Compatible without changing current authority

- Multiple private recipients can be implemented as separate current single-recipient publications.
- Per-student teacher notes can live in a new assignment wrapper without mutating Practice Package.
- ACTIVE/COMPLETED/REPERTOIRE can be assignment metadata outside immutable score content.
- Existing playback plan already has deterministic measure boundaries needed for measure-target playback.
- Rendering Layer already has cursor/highlight primitives.

### Requires deliberate extension

- Current Public Pool opens Practice Packages; target Havuz is announcement/repertoire detail only.
- Current Practice Package/Public Publication contracts cannot express selected-student pool visibility.
- Current My Work summaries have no assignment lifecycle state or teacher note.
- Practice Package v1 requires MusicXML and cannot natively represent Chord Board homework.
- Current playback port repeats the **current** measure through a toggle and cannot target an arbitrary tapped measure.
- Current Rendering Layer does not provide full-measure whitespace hit-testing.
- Current PlaybackPlan does not carry renderer event identity for precise active-note highlighting.

These are future implementation requirements, not defects in the merged STUDENT-07B contract.

## 15. Acceptance direction

STUDENT-08 implementation should prove:

- Havuz never opens score/chord practice;
- ALL and SELECTED pool audience are authorization-correct;
- multi-student private send creates isolated per-student assignments;
- teacher note is per assignment;
- only teacher management can complete/promote/revoke;
- folders contain exactly the matching assignment states;
- SCORE and CHORD_BOARD routing never leak one type's internals into the other.

STUDENT-09 implementation should prove:

- tapping measure whitespace resolves the correct measure;
- tapping a measure plays only that measure once;
- no note-selection state is introduced for the student;
- cursor follows playback;
- highlight uses deterministic event identity, not pitch guessing;
- pause/navigation/sign-out clears follow presentation;
- VoiceOver can invoke the measure action without extra visible instructional clutter;
- notation and playback failure domains remain independent.

## 16. Explicit non-goals

No chat, free-form personal messaging, student "Hazırım" action, student completion control, grading, practice score, gamification, social feed, group/class management, push notification system, microphone evaluation, MIDI input, automatic performance assessment, correction-engine runtime, or broad analytics.
