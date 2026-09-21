# STUDENT-03 — Minimal Student App Shell Design

Date: 2026-09-21
Base main: `df12cb7f4407af1379fc25bd9011a588ed5ab0b6`

## Goal

Build the first minimal, accessible Student App shell around the completed STUDENT-02 read-only Sharing Layer.

Target navigation:

```text
Sign In
  -> Home
      -> Public Pool
      -> My Work
      -> Open Practice
```

## Architecture decision

Use vanilla ECMAScript modules and semantic HTML with no UI framework or new dependency.

The shell is split into:

- a pure controller/state layer;
- a pure HTML renderer;
- an optional browser mounting adapter.

The shell receives an authenticated STUDENT-02 session from an external auth adapter. It does not implement passwords, OAuth, Firebase, Supabase, account creation, or credentials.

## Screens

### Sign In

Shown when there is no valid student session.

The shell may expose a host callback for a future auth provider, but it cannot mint a student session itself.

### Home

Minimal navigation only:

- Public Pool
- My Work
- Sign Out

No feed, social activity, ranking, messages, or gamification.

### Public Pool

Reads through `createSharingService().listPublicPool()`.

Displays only student-safe presentation data such as title and an Open action.

### My Work

Reads through `createSharingService().listMyWork()`.

Displays only work assigned to the authenticated stable `studentId`.

### Open Practice

Reads through `createSharingService().getPracticeItem()`.

STUDENT-03 displays only a minimal read-only practice shell (title/navigation). Score rendering, playback, rhythm interaction, TAB/violin presentation, and offline behavior remain STUDENT-04/05.

## Security and privacy

- UI controller never receives the management service.
- No `publish` or `revoke` action exists in the student shell.
- Dynamic text is HTML-escaped before rendering.
- Raw MusicXML is not shown to the student.
- `recipientStudentId`, revision/debug/OMR/editor internals are not rendered.
- Session authorization uses stable `studentId`; display name/email do not replace it.
- Sign out clears current screen data and returns to Sign In.

## Accessibility baseline

STUDENT-03 establishes semantic structure only:

- one clear page heading;
- semantic navigation;
- real buttons for actions;
- list semantics for work lists;
- visible empty-state text;
- a status region suitable for `aria-live`.

Detailed VoiceOver acceptance is deferred to STUDENT-06.

## Non-goals

- real auth provider
- account creation
- cloud provisioning
- UI framework
- notation rendering
- playback
- rhythm engine
- Guitar TAB/violin renderer
- offline cache/sync
- teacher tools
- OMR/Audiveris
- messaging/groups/social/gamification/payments

## Completion

STUDENT-03 is complete when controller and renderer tests cover navigation, Public Pool, My Work, open-practice, sign-out, escaping, no raw score leakage, and no student write surface; full repository CI is green; architecture docs are updated; and a focused PR is opened for human merge approval.
