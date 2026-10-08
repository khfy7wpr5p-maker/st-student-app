# Gate 5 — Account Service Firebase production gate

Production Firebase project: `st-student-app-85cde`.

Confirmed production Realtime Database URL:

```text
https://st-student-app-85cde-default-rtdb.europe-west1.firebasedatabase.app
```

This value was confirmed from Firebase and was not inferred from the project ID. Any future replacement URL must be confirmed from Firebase rather than inferred.

The emulator-only project `demo-st-student-account` must never be used for production deployment.

## Ownership decision

`st-student-app` owns the project-wide Firebase client rules for the shared production project. The Account Service repository keeps its stricter emulator/private-service rules for service-local verification, but those rules must not overwrite the Student App production Firestore rules because the Student App still needs its existing authenticated publication read paths.

Account Service and Secure Delivery server-side writes use trusted Admin SDK boundaries. Their private collections stay inaccessible to browser clients because the project-wide Firestore rules expose only the existing Student App publication paths.

## Preflight

1. Confirm the current branch is the reviewed Gate 5 revision.
2. Confirm Firebase CLI authentication is supplied by the deployment environment; do not commit service-account JSON, access tokens, or credentials.
3. Confirm the selected project is exactly `st-student-app-85cde`.
4. Confirm the RTDB target is exactly `https://st-student-app-85cde-default-rtdb.europe-west1.firebasedatabase.app`.
5. Run the full repository test suite before any production command.
6. Review `firebase/firestore.rules`, `firebase/database.rules.json`, and `firebase/firestore.indexes.json` as one change set.

## Firestore rules and indexes

The project-wide manifest is `firebase.json`.

Deploy only the reviewed Firebase surfaces:

```bash
firebase deploy --project st-student-app-85cde --only firestore:rules,firestore:indexes,database
```

The current Account Service queries require no new composite index, so the reviewed `firebase/firestore.indexes.json` intentionally contains no speculative composite indexes.

## Realtime Database presence rule

Root reads and writes remain denied. An authenticated client may write only its own presence subtree:

```text
presence/{firebaseUid}
```

The rule is:

```text
auth != null && auth.uid === $uid
```

Presence remains informational and never grants assignment authority.

The Firebase Web SDK requires the actual Realtime Database URL. The confirmed production URL is pinned in `firebaseConfig.databaseURL`. A deployment may still override it with either:

```text
VITE_FIREBASE_DATABASE_URL
```

or the native runtime configuration field:

```text
globalThis.__ST_STUDENT_APP_CONFIG__.firebaseDatabaseUrl
```

Overrides are accepted only when they are HTTPS roots for the same `st-student-app-85cde` default RTDB hostname. Missing runtime overrides therefore fall back to the confirmed production URL instead of disabling presence.

## Firestore TTL

Account Service writes one idempotency record per app boot at:

```text
studentUsage/{studentId}/sessions/{clientSessionId}
```

Each record already contains an `expiresAt` Firestore timestamp set to 30 days after the session start. Repository search confirmed no other application collection uses the `sessions` collection-group name in the Student App, SesliTab, or Account Service production code.

Enable TTL on collection group `sessions`, field `expiresAt`:

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=sessions \
  --enable-ttl \
  --project=st-student-app-85cde
```

TTL deletion is asynchronous. Do not treat TTL enablement as immediate deletion evidence.

## Verification after production change

- Confirm Firestore rules still allow the existing authenticated Student App publication reads and deny client writes.
- Confirm Account Service private collections cannot be read or written directly from a browser client.
- Confirm an authenticated Student App client can write only its own Realtime Database presence path.
- Confirm a different UID cannot write another user's presence path.
- Confirm the configured RTDB URL is exactly `https://st-student-app-85cde-default-rtdb.europe-west1.firebasedatabase.app`.
- Confirm the Firestore TTL policy for `sessions.expiresAt` is enabled in `st-student-app-85cde`.
- Confirm no composite indexes were added unless a production query explicitly requires one.

## Stop condition

Gate 5 does not deploy the Account Service or SesliTab application itself. Application hosting, public endpoint activation, production runtime environment configuration, and end-to-end rollout remain Gate 6 work.
