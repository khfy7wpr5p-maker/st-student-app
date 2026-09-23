# STUDENT-08 S08-3 Student Consumer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the STUDENT-08 shell to the authenticated Secure Delivery HTTP read boundary for Havuz and private SCORE work, preserving legacy publication flows and adding exact-delivery offline SCORE support without fake publication IDs.

**Architecture:** Add strict Student App network contracts and a provider-neutral Secure Delivery-backed `Student08ReadPort`. Generalize Practice/offline identity from publication-only IDs to a tagged `PracticeAccessRef` while retaining backward-compatible publication adapters. Browser composition activates Secure Delivery only when an explicit non-secret HTTPS API base URL is configured; otherwise existing behavior remains unchanged.

**Tech Stack:** Browser ES modules, Firebase Auth 12.19.0, native `fetch`, IndexedDB/fake-indexeddb, Node.js native `node:test`, existing Student App Practice/Playback runtime.

**Spec:** `docs/superpowers/specs/2026-09-23-student-08-s08-3-secure-delivery-integration-design.md`

## Global Constraints

- Student App performs no teacher write.
- Student App performs no TD-06 direct Firestore read.
- Firebase ID token is ephemeral and never persisted.
- Server derives authority from verified bearer identity, never caller-supplied IDs.
- Pool recipient lists remain server-private.
- Private SCORE package remains exact-student and revoke-aware.
- No credential, provider diagnostic, Firestore path, teacher ID, evidence ID, or recipient list enters normal Student UI state; the PracticePackage v1 intended-recipient field remains confined to package validation.
- Cross-account stale async responses cannot replace the current session state.
- Offline records remain partitioned by local authenticated UID.
- Existing publication-backed flows remain backward-compatible.
- No production endpoint URL is invented or committed.
- No production Firebase rules/schema/index/credential/billing/deploy action occurs.
- TD-07 Chord Board and STUDENT-09 remain out of scope.
- Merge requires separate explicit human approval.

## Review Focus

1. **Duplicate/malformed server rows:** duplicate Pool or assignment IDs and unknown fields must fail closed rather than silently selecting one. Covered by Tasks 1 and 3.
2. **Account switch during an in-flight HTTP read:** late Student A results must not replace Student B state. Covered by Task 7 controller integration test.
3. **Legacy IndexedDB v1 upgrade:** existing publication cache must remain readable after the access-key migration. Covered by Task 5 migration test.
4. **404/revoked versus transient 5xx/network failure:** only bounded not-found/revoked responses may revoke Secure Delivery cache; transient failures preserve cache and report sync error. Covered by Task 6.
5. **Token lifecycle:** each HTTP request must obtain a fresh Firebase ID token, and token text must never enter sessions, client objects, IndexedDB, logs, or UI state. Covered by Task 2.

---

### Task 1: Add strict Student network contracts

**Files:**
- Create: `src/contracts/studentPoolView.js`
- Create: `src/contracts/secureDeliveryAssignment.js`
- Create: `test/student08SecureDeliveryContracts.test.js`

**Interfaces:**
- Produces: `createStudentPoolView(value)`
- Produces: `createSecureDeliveryAssignmentRow(value)`
- Produces: `toStudentAssignmentView(row)`
- Consumes: existing `validatePracticePackage(value)`, `ASSIGNMENT_STATES`, and `PRACTICE_TYPES`.

- [ ] **Step 1: Write failing strict-contract tests**

Create `test/student08SecureDeliveryContracts.test.js` with these core cases:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  createStudentPoolView,
} from "../src/contracts/studentPoolView.js";
import {
  createSecureDeliveryAssignmentRow,
  toStudentAssignmentView,
} from "../src/contracts/secureDeliveryAssignment.js";
import {
  makeApprovedPracticePackage,
} from "./support/practiceFixtures.js";

test("StudentPoolView accepts only sanitized fields", () => {
  const view = createStudentPoolView({
    poolItemId: "pool-a",
    title: "Duyuru",
    shortDescription: "Kısa",
    detailText: "Detay",
    publishedAt: "2026-09-23T10:00:00Z",
    audienceMode: "SELECTED",
  });

  assert.equal(view.poolItemId, "pool-a");
  assert.equal("recipientStudentIds" in view, false);

  assert.throws(
    () => createStudentPoolView({
      ...view,
      recipientStudentIds: ["student-a"],
    }),
    /unsupported|recipient/i,
  );
});

test("Secure Delivery assignment requires exact metadata and no fake publication", () => {
  const row = createSecureDeliveryAssignmentRow({
    deliveryId: "assignment-a",
    assignmentId: "assignment-a",
    packageId: "pkg-a",
    practiceType: "SCORE",
    teacherNote: "Yavaş çalış.",
    state: "ACTIVE",
    assignedAt: "2026-09-23T10:00:00Z",
    deliveredAt: "2026-09-23T10:01:00Z",
    package: makeApprovedPracticePackage({
      packageId: "pkg-a",
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  });

  const view = toStudentAssignmentView(row);

  assert.deepEqual(view.sourceRef, {
    sourceKind: "SECURE_DELIVERY",
    deliveryId: "assignment-a",
  });
  assert.equal(JSON.stringify(view).includes("publicationId"), false);
  assert.equal(view.state, "ACTIVE");
});

test("Secure Delivery assignment rejects extra fields and identity mismatches", () => {
  const base = {
    deliveryId: "assignment-a",
    assignmentId: "assignment-a",
    packageId: "pkg-a",
    practiceType: "SCORE",
    teacherNote: "",
    state: "COMPLETED",
    assignedAt: "2026-09-23T10:00:00Z",
    deliveredAt: "2026-09-23T10:01:00Z",
    package: makeApprovedPracticePackage({
      packageId: "pkg-a",
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  };

  assert.throws(
    () => createSecureDeliveryAssignmentRow({
      ...base,
      teacherId: "teacher-a",
    }),
    /unsupported/i,
  );
  assert.throws(
    () => createSecureDeliveryAssignmentRow({
      ...base,
      deliveryId: "delivery-other",
    }),
    /deliveryId|assignmentId/i,
  );
  assert.throws(
    () => createSecureDeliveryAssignmentRow({
      ...base,
      packageId: "pkg-other",
    }),
    /packageId/i,
  );
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
node --test test/student08SecureDeliveryContracts.test.js
```

Expected: FAIL because the two contract modules do not exist.

- [ ] **Step 3: Implement `StudentPoolView`**

Create `src/contracts/studentPoolView.js`:

```js
const KEYS = Object.freeze([
  "poolItemId",
  "title",
  "shortDescription",
  "detailText",
  "publishedAt",
  "audienceMode",
]);

const text = (value, name) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
};

export function createStudentPoolView(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("StudentPoolView must be an object");
  }

  for (const key of Object.keys(value)) {
    if (!KEYS.includes(key)) {
      throw new TypeError(`unsupported StudentPoolView field: ${key}`);
    }
  }

  if (!["ALL", "SELECTED"].includes(value.audienceMode)) {
    throw new TypeError("audienceMode must be ALL or SELECTED");
  }

  return Object.freeze({
    poolItemId: text(value.poolItemId, "poolItemId"),
    title: text(value.title, "title"),
    shortDescription:
      typeof value.shortDescription === "string"
        ? value.shortDescription
        : (() => { throw new TypeError("shortDescription must be a string"); })(),
    detailText:
      typeof value.detailText === "string"
        ? value.detailText
        : (() => { throw new TypeError("detailText must be a string"); })(),
    publishedAt: text(value.publishedAt, "publishedAt"),
    audienceMode: value.audienceMode,
  });
}
```

- [ ] **Step 4: Implement the Secure Delivery assignment validator**

Create `src/contracts/secureDeliveryAssignment.js` with strict allowed keys, exact ID checks, PracticePackage validation, and normalized UI view:

```js
import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
} from "./privateAssignment.js";
import {
  PRACTICE_PACKAGE_SCOPES,
  validatePracticePackage,
} from "./practicePackage.js";

const KEYS = Object.freeze([
  "deliveryId",
  "assignmentId",
  "packageId",
  "practiceType",
  "teacherNote",
  "state",
  "assignedAt",
  "deliveredAt",
  "package",
]);

function requiredText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function createSecureDeliveryAssignmentRow(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("SecureDeliveryAssignmentRow must be an object");
  }

  for (const key of Object.keys(value)) {
    if (!KEYS.includes(key)) {
      throw new TypeError(
        `unsupported SecureDeliveryAssignmentRow field: ${key}`,
      );
    }
  }

  const deliveryId = requiredText(value.deliveryId, "deliveryId");
  const assignmentId = requiredText(value.assignmentId, "assignmentId");
  const packageId = requiredText(value.packageId, "packageId");

  if (deliveryId !== assignmentId) {
    throw new Error("deliveryId must match assignmentId");
  }
  if (value.practiceType !== PRACTICE_TYPES.SCORE) {
    throw new TypeError("practiceType must be SCORE");
  }
  if (!Object.values(ASSIGNMENT_STATES).includes(value.state)) {
    throw new TypeError("state is invalid");
  }
  if (typeof value.teacherNote !== "string") {
    throw new TypeError("teacherNote must be a string");
  }

  const validation = validatePracticePackage(value.package);
  if (!validation.ok) {
    throw new TypeError(
      `invalid PracticePackage: ${validation.errors.join("; ")}`,
    );
  }
  if (value.package.packageId !== packageId) {
    throw new Error("packageId must match package");
  }
  if (
    value.package.publication.scope !==
    PRACTICE_PACKAGE_SCOPES.STUDENT_PRIVATE
  ) {
    throw new Error("Secure Delivery package must be student_private");
  }

  const packageSnapshot =
    structuredClone(value.package);

  const deepFreeze = (node) => {
    if (
      node !== null &&
      typeof node === "object" &&
      !Object.isFrozen(node)
    ) {
      for (const child of Object.values(node)) {
        deepFreeze(child);
      }
      Object.freeze(node);
    }
    return node;
  };

  return Object.freeze({
    deliveryId,
    assignmentId,
    packageId,
    practiceType: value.practiceType,
    teacherNote: value.teacherNote,
    state: value.state,
    assignedAt: requiredText(value.assignedAt, "assignedAt"),
    deliveredAt: requiredText(value.deliveredAt, "deliveredAt"),
    package: deepFreeze(packageSnapshot),
  });
}

export function toStudentAssignmentView(value) {
  const row = createSecureDeliveryAssignmentRow(value);

  return Object.freeze({
    assignmentId: row.assignmentId,
    title: row.package.title,
    practiceType: row.practiceType,
    teacherNote: row.teacherNote,
    state: row.state,
    assignedAt: row.assignedAt,
    sourceRef: Object.freeze({
      sourceKind: "SECURE_DELIVERY",
      deliveryId: row.deliveryId,
    }),
  });
}
```

- [ ] **Step 5: Run contract tests**

Run:

```bash
node --test test/student08SecureDeliveryContracts.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/contracts/studentPoolView.js src/contracts/secureDeliveryAssignment.js test/student08SecureDeliveryContracts.test.js
git commit -m "feat: add secure delivery student read contracts"
```

### Task 2: Add ephemeral Firebase token access and Secure Delivery HTTP client

**Files:**
- Create: `src/config/secureDeliveryConfig.js`
- Create: `src/providers/secureDelivery/secureDeliveryApiClient.js`
- Modify: `src/providers/firebase/firebaseAuthAdapter.js`
- Modify: `src/providers/firebase/firebaseBrowserRuntime.js`
- Create: `test/secureDeliveryConfig.test.js`
- Create: `test/secureDeliveryApiClient.test.js`
- Modify: `test/firebaseAuthAdapter.test.js`

**Interfaces:**
- Produces: `createSecureDeliveryConfig(env)`
- Produces: `createSecureDeliveryApiClient({ baseUrl, getIdToken, fetchImpl })`
- Produces: `authAdapter.getIdToken()`

- [ ] **Step 1: Write failing config/client/token tests**

Add tests that require:

```js
assert.deepEqual(
  createSecureDeliveryConfig({}),
  Object.freeze({ enabled: false, baseUrl: null }),
);

assert.deepEqual(
  createSecureDeliveryConfig({
    VITE_SECURE_DELIVERY_API_BASE_URL:
      "https://student-api.example.test/api/secure-delivery/v1/",
  }),
  Object.freeze({
    enabled: true,
    baseUrl:
      "https://student-api.example.test/api/secure-delivery/v1",
  }),
);

assert.throws(
  () => createSecureDeliveryConfig({
    VITE_SECURE_DELIVERY_API_BASE_URL: "http://example.test/api",
  }),
  /https/i,
);
```

For the HTTP client, assert two calls receive two different fresh tokens and exact paths:

```js
const tokens = ["token-1", "token-2"];
await client.listStudentPool();
await client.getStudentAssignment("assignment-a");

assert.deepEqual(calls, [
  [
    "https://student-api.example.test/api/secure-delivery/v1/student/pool",
    "GET",
    "Bearer token-1",
  ],
  [
    "https://student-api.example.test/api/secure-delivery/v1/student/assignments/assignment-a",
    "GET",
    "Bearer token-2",
  ],
]);
assert.equal(JSON.stringify(client).includes("token-1"), false);
```

Extend `firebaseAuthAdapter.test.js`:

```js
test("getIdToken returns an ephemeral token only for current authenticated user", async () => {
  const user = { uid: "uid-a" };
  const adapter = createFirebaseAuthAdapter({
    auth: { currentUser: user },
    sdk: {
      browserLocalPersistence: {},
      async setPersistence() {},
      onAuthStateChanged() { return () => {}; },
      async getIdToken(candidate) {
        assert.equal(candidate, user);
        return "fresh-token";
      },
    },
  });

  assert.equal(await adapter.getIdToken(), "fresh-token");
  assert.equal(JSON.stringify(adapter).includes("fresh-token"), false);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
node --test test/secureDeliveryConfig.test.js test/secureDeliveryApiClient.test.js test/firebaseAuthAdapter.test.js
```

Expected: FAIL because config/client modules and `getIdToken` do not yet exist.

- [ ] **Step 3: Implement explicit opt-in configuration**

Create `src/config/secureDeliveryConfig.js`:

```js
export function createSecureDeliveryConfig(
  env = import.meta.env ?? {},
) {
  const raw =
    env?.VITE_SECURE_DELIVERY_API_BASE_URL;

  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return Object.freeze({
      enabled: false,
      baseUrl: null,
    });
  }

  const url = new URL(String(raw).trim());
  if (url.protocol !== "https:") {
    throw new TypeError(
      "Secure Delivery API base URL must use https",
    );
  }

  return Object.freeze({
    enabled: true,
    baseUrl: url.toString().replace(/\/$/u, ""),
  });
}
```

No endpoint value is committed.

- [ ] **Step 4: Implement the bounded HTTP client**

Create `src/providers/secureDelivery/secureDeliveryApiClient.js`:

```js
function requiredText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export class SecureDeliveryApiError extends Error {
  constructor({ status, code, message }) {
    super(message);
    this.name = "SecureDeliveryApiError";
    this.status = status;
    this.code = code;
  }
}

export function createSecureDeliveryApiClient({
  baseUrl,
  getIdToken,
  fetchImpl = globalThis.fetch,
}) {
  const root = requiredText(baseUrl, "baseUrl").replace(/\/$/u, "");
  if (typeof getIdToken !== "function" || typeof fetchImpl !== "function") {
    throw new TypeError("Secure Delivery client seams are incomplete");
  }

  async function request(path) {
    const token = requiredText(await getIdToken(), "Firebase ID token");
    const response = await fetchImpl(`${root}/${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) {
      throw new SecureDeliveryApiError({
        status: response.status,
        code:
          typeof body?.error?.code === "string"
            ? body.error.code
            : "SECURE_DELIVERY_UNAVAILABLE",
        message: "Secure Delivery request failed",
      });
    }

    return body.data;
  }

  return Object.freeze({
    listStudentPool() {
      return request("student/pool");
    },
    listStudentAssignments() {
      return request("student/assignments");
    },
    getStudentAssignment(deliveryId) {
      return request(
        `student/assignments/${encodeURIComponent(
          requiredText(deliveryId, "deliveryId"),
        )}`,
      );
    },
  });
}
```

- [ ] **Step 5: Add `authAdapter.getIdToken()`**

Extend the adapter SDK seam to require no token at construction, but validate it when called:

```js
async getIdToken() {
  const user = auth?.currentUser;
  if (
    user === null ||
    user === undefined ||
    typeof sdk?.getIdToken !== "function"
  ) {
    throw new Error("authenticated Firebase user required");
  }

  const token = await sdk.getIdToken(user);
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new Error("Firebase ID token unavailable");
  }

  return token;
},
```

In `firebaseBrowserRuntime.js`, import Firebase Auth `getIdToken` and inject it into the SDK seam. Do not put the returned token into the runtime object.

- [ ] **Step 6: Run Task 2 tests**

Run:

```bash
node --test test/secureDeliveryConfig.test.js test/secureDeliveryApiClient.test.js test/firebaseAuthAdapter.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/config/secureDeliveryConfig.js src/providers/secureDelivery/secureDeliveryApiClient.js src/providers/firebase/firebaseAuthAdapter.js src/providers/firebase/firebaseBrowserRuntime.js test/secureDeliveryConfig.test.js test/secureDeliveryApiClient.test.js test/firebaseAuthAdapter.test.js
git commit -m "feat: add secure delivery authenticated HTTP client"
```

### Task 3: Implement the Secure Delivery-backed Student08ReadPort

**Files:**
- Create: `src/sharing/secureDeliveryStudent08ReadService.js`
- Create: `test/secureDeliveryStudent08ReadService.test.js`

**Interfaces:**
- Consumes: Task 1 contracts and Task 2 API client.
- Produces the existing controller surface: `listPoolItems`, `getPoolItem`, `listAssignments`, `getAssignment`, `getScorePracticeItem`.

- [ ] **Step 1: Write failing read-port tests**

Test ALL/SELECTED sanitized Pool rows without recipient data, duplicate IDs, state filtering, exact delivery routing, malformed rows, and no fake publication:

```js
const service = createSecureDeliveryStudent08ReadService({
  apiClient: {
    async listStudentPool() {
      return [
        {
          poolItemId: "pool-a",
          title: "Duyuru",
          shortDescription: "",
          detailText: "Detay",
          publishedAt: "2026-09-23T10:00:00Z",
          audienceMode: "SELECTED",
        },
      ];
    },
    async listStudentAssignments() {
      return [assignmentRow("assignment-a", "COMPLETED")];
    },
    async getStudentAssignment(deliveryId) {
      assert.equal(deliveryId, "assignment-a");
      return assignmentRow("assignment-a", "COMPLETED");
    },
  },
});

assert.equal(
  (await service.listPoolItems({ session: studentA }))[0].poolItemId,
  "pool-a",
);
assert.deepEqual(
  (await service.listAssignments({
    session: studentA,
    state: "COMPLETED",
  })).map((item) => item.assignmentId),
  ["assignment-a"],
);

const practice = await service.getScorePracticeItem({
  session: studentA,
  assignmentId: "assignment-a",
});
assert.deepEqual(practice.accessRef, {
  kind: "SECURE_DELIVERY",
  deliveryId: "assignment-a",
});
assert.equal("publication" in practice, false);
```

Also test duplicate Pool IDs and duplicate assignment IDs reject with an error. Mutate the original server row after normalization and assert the returned package/title remain unchanged, proving provider data was snapshotted rather than retained by reference.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
node --test test/secureDeliveryStudent08ReadService.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the read port**

Create the service with this structure:

```js
import { getAuthenticatedStudentId } from "../auth/session.js";
import {
  ASSIGNMENT_STATES,
  PRACTICE_TYPES,
} from "../contracts/privateAssignment.js";
import {
  createStudentPoolView,
} from "../contracts/studentPoolView.js";
import {
  createSecureDeliveryAssignmentRow,
  toStudentAssignmentView,
} from "../contracts/secureDeliveryAssignment.js";

function requireSession(session) {
  if (getAuthenticatedStudentId(session) === null) {
    throw new Error("unauthenticated");
  }
}

function uniqueById(rows, key, label) {
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row[key])) {
      throw new Error(`duplicate ${label} authority`);
    }
    seen.add(row[key]);
  }
  return rows;
}

export function createSecureDeliveryStudent08ReadService({
  apiClient,
}) {
  if (
    typeof apiClient?.listStudentPool !== "function" ||
    typeof apiClient?.listStudentAssignments !== "function" ||
    typeof apiClient?.getStudentAssignment !== "function"
  ) {
    throw new TypeError("Secure Delivery API client is incomplete");
  }

  async function listPoolItems({ session }) {
    requireSession(session);
    const raw = await apiClient.listStudentPool();
    if (!Array.isArray(raw)) {
      throw new TypeError("student Pool response must be an array");
    }
    return Object.freeze(
      uniqueById(
        raw.map(createStudentPoolView),
        "poolItemId",
        "Pool",
      ),
    );
  }

  async function getPoolItem({ session, poolItemId }) {
    const items = await listPoolItems({ session });
    const item =
      items.find((candidate) => candidate.poolItemId === poolItemId) ??
      null;
    if (item === null) {
      throw new Error("pool item not found");
    }
    return item;
  }

  async function normalizedAssignments(session) {
    requireSession(session);
    const raw = await apiClient.listStudentAssignments();
    if (!Array.isArray(raw)) {
      throw new TypeError("student assignment response must be an array");
    }
    return uniqueById(
      raw.map(createSecureDeliveryAssignmentRow),
      "assignmentId",
      "assignment",
    );
  }

  return Object.freeze({
    listPoolItems,
    getPoolItem,

    async listAssignments({ session, state } = {}) {
      if (
        state !== undefined &&
        !Object.values(ASSIGNMENT_STATES).includes(state)
      ) {
        throw new TypeError("assignment state filter is invalid");
      }
      const rows = await normalizedAssignments(session);
      return Object.freeze(
        rows
          .filter((row) => state === undefined || row.state === state)
          .map(toStudentAssignmentView),
      );
    },

    async getAssignment({ session, assignmentId }) {
      requireSession(session);
      const row = createSecureDeliveryAssignmentRow(
        await apiClient.getStudentAssignment(assignmentId),
      );
      if (row.assignmentId !== assignmentId) {
        throw new Error("assignment identity mismatch");
      }
      return toStudentAssignmentView(row);
    },

    async getScorePracticeItem({ session, assignmentId }) {
      requireSession(session);
      const row = createSecureDeliveryAssignmentRow(
        await apiClient.getStudentAssignment(assignmentId),
      );
      if (
        row.assignmentId !== assignmentId ||
        row.practiceType !== PRACTICE_TYPES.SCORE
      ) {
        throw new Error("assignment identity mismatch");
      }

      return Object.freeze({
        accessRef: Object.freeze({
          kind: "SECURE_DELIVERY",
          deliveryId: row.deliveryId,
        }),
        package: row.package,
      });
    },
  });
}
```

- [ ] **Step 4: Run read-port tests**

Run:

```bash
node --test test/secureDeliveryStudent08ReadService.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/sharing/secureDeliveryStudent08ReadService.js test/secureDeliveryStudent08ReadService.test.js
git commit -m "feat: add secure delivery STUDENT-08 read port"
```

### Task 4: Generalize Practice authorization identity without fake publication IDs

**Files:**
- Create: `src/practice/practiceAccessRef.js`
- Modify: `src/practice/practiceWorkspace.js`
- Modify: `test/practiceWorkspace.test.js`

**Interfaces:**
- Produces: `createPracticeAccessRef(value)`
- Produces: `practiceAccessKey(value)`
- Practice workspace accepts either existing legacy `{ publication, package }` or new `{ accessRef, package }`.

- [ ] **Step 1: Add failing access-ref tests**

Add:

```js
assert.deepEqual(
  createPracticeAccessRef({
    kind: "SECURE_DELIVERY",
    deliveryId: "assignment-a",
  }),
  {
    kind: "SECURE_DELIVERY",
    deliveryId: "assignment-a",
  },
);
assert.equal(
  practiceAccessKey({
    kind: "SECURE_DELIVERY",
    deliveryId: "assignment-a",
  }),
  "SECURE_DELIVERY:assignment-a",
);
assert.equal(
  practiceAccessKey({
    kind: "PUBLICATION",
    publicationId: "pub-a",
  }),
  "PUBLICATION:pub-a",
);
```

Add a Practice workspace test with:

```js
const workspace = createPracticeWorkspace({
  deliveryItem: {
    accessRef: {
      kind: "SECURE_DELIVERY",
      deliveryId: "assignment-a",
    },
    package: makeApprovedPracticePackage({
      packageId: "pkg-a",
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  },
  notationRuntimeAvailable: true,
});

assert.deepEqual(workspace.viewModel.accessRef, {
  kind: "SECURE_DELIVERY",
  deliveryId: "assignment-a",
});
assert.equal("publicationId" in workspace.viewModel, false);
```

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
node --test test/practiceWorkspace.test.js
```

Expected: FAIL because Secure Delivery access refs are unsupported.

- [ ] **Step 3: Implement tagged access refs**

Create `src/practice/practiceAccessRef.js`:

```js
function text(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function createPracticeAccessRef(value) {
  if (value?.kind === "PUBLICATION") {
    return Object.freeze({
      kind: "PUBLICATION",
      publicationId: text(value.publicationId, "publicationId"),
    });
  }
  if (value?.kind === "SECURE_DELIVERY") {
    return Object.freeze({
      kind: "SECURE_DELIVERY",
      deliveryId: text(value.deliveryId, "deliveryId"),
    });
  }
  throw new TypeError("unsupported PracticeAccessRef");
}

export function practiceAccessKey(value) {
  const ref = createPracticeAccessRef(value);
  return ref.kind === "PUBLICATION"
    ? `PUBLICATION:${ref.publicationId}`
    : `SECURE_DELIVERY:${ref.deliveryId}`;
}
```

- [ ] **Step 4: Adapt Practice workspace input**

In `practiceWorkspace.js`, normalize legacy items:

```js
function accessRefForItem(item) {
  if (item?.accessRef !== undefined) {
    return createPracticeAccessRef(item.accessRef);
  }

  return createPracticeAccessRef({
    kind: "PUBLICATION",
    publicationId: item?.publication?.publicationId,
  });
}
```

Use the normalized `accessRef` in the view model:

```js
const accessRef = accessRefForItem(item);
const viewModel = {
  accessRef,
  packageId: pkg.packageId,
  title: pkg.title,
  // existing fields...
};

if (accessRef.kind === "PUBLICATION") {
  viewModel.publicationId = accessRef.publicationId;
}
```

Keep all current package validation and playback behavior unchanged.

- [ ] **Step 5: Run legacy and new Practice tests**

Run:

```bash
node --test test/practiceWorkspace.test.js test/student08Ui.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/practice/practiceAccessRef.js src/practice/practiceWorkspace.js test/practiceWorkspace.test.js
git commit -m "feat: generalize practice access identity"
```

### Task 5: Migrate offline storage to tagged access identity

**Files:**
- Modify: `src/offline/offlineRecord.js`
- Modify: `src/offline/inMemoryOfflineRepository.js`
- Modify: `src/offline/indexedDbOfflineRepository.js`
- Modify: `test/inMemoryOfflineRepository.test.js`
- Modify: `test/indexedDbOfflineRepository.test.js`

**Interfaces:**
- Consumes: Task 4 `PracticeAccessRef`.
- Produces: `getActiveByAccessRef({ studentId, accessRef })`.
- Preserves: `getActiveByPublicationId({ studentId, publicationId })` as a compatibility wrapper.
- `putAuthorized` accepts either existing `deliveryItem` or new `practiceItem`.

- [ ] **Step 1: Add failing in-memory Secure Delivery cache tests**

Add a helper:

```js
import {
  makeApprovedPracticePackage,
} from "./support/practiceFixtures.js";

const securePractice = (deliveryId = "assignment-a") => ({
  accessRef: {
    kind: "SECURE_DELIVERY",
    deliveryId,
  },
  package: makeApprovedPracticePackage({
    packageId: "pkg-secure",
    scope: "student_private",
    recipientStudentId: "server-student-a",
  }),
});
```

Assert:

```js
await repo.putAuthorized({
  studentId: "uid-a",
  practiceItem: securePractice(),
  cachedAt: "2026-09-23T11:00:00Z",
  lastVerifiedAt: "2026-09-23T11:00:00Z",
});

const cached = await repo.getActiveByAccessRef({
  studentId: "uid-a",
  accessRef: {
    kind: "SECURE_DELIVERY",
    deliveryId: "assignment-a",
  },
});

assert.equal(cached.packageId, "pkg-secure");
assert.equal(
  await repo.getActiveByAccessRef({
    studentId: "uid-b",
    accessRef: cached.accessRef,
  }),
  null,
);
```

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
node --test test/inMemoryOfflineRepository.test.js test/indexedDbOfflineRepository.test.js
```

Expected: FAIL because generic access-ref methods and records do not exist.

- [ ] **Step 3: Generalize `OfflineRecord`**

Normalize either legacy delivery or new practice item:

```js
function practiceItemFromInput({ deliveryItem, practiceItem }) {
  if (practiceItem !== undefined) {
    return {
      accessRef: createPracticeAccessRef(practiceItem.accessRef),
      package: practiceItem.package,
      publication: null,
    };
  }

  const legacy = createDeliveryItem(
    deliveryItem?.publication,
    deliveryItem?.package,
  );
  return {
    accessRef: createPracticeAccessRef({
      kind: "PUBLICATION",
      publicationId: legacy.publication.publicationId,
    }),
    package: legacy.package,
    publication: legacy.publication,
  };
}
```

Store canonical:

```js
{
  studentId,
  accessRef,
  accessKey: practiceAccessKey(accessRef),
  packageId: package.packageId,
  scope: package.publication.scope,
  publication: publication ?? null,
  package,
  cachedAt,
  lastVerifiedAt,
  accessState
}
```

For a legacy publication record, also preserve its existing `publicationId` field for backward compatibility.

For `PUBLICATION` private cache, preserve the existing local check that `package.publication.recipientStudentId === studentId`. For `SECURE_DELIVERY`, do **not** compare the server's internal PracticePackage recipient ID to the local Firebase UID; require `student_private` scope and rely on the server-authorized read plus the local UID cache partition. Add this regression:

```js
await repo.putAuthorized({
  studentId: "firebase-uid-a",
  practiceItem: {
    accessRef: {
      kind: "SECURE_DELIVERY",
      deliveryId: "assignment-a",
    },
    package: makeApprovedPracticePackage({
      packageId: "pkg-secure",
      scope: "student_private",
      recipientStudentId: "server-student-a",
    }),
  },
  cachedAt: "2026-09-23T11:00:00Z",
  lastVerifiedAt: "2026-09-23T11:00:00Z",
});

assert.notEqual(
  await repo.getActiveByAccessRef({
    studentId: "firebase-uid-a",
    accessRef: {
      kind: "SECURE_DELIVERY",
      deliveryId: "assignment-a",
    },
  }),
  null,
);
```

- [ ] **Step 4: Add generic repository methods and compatibility wrappers**

Use a backward-compatible primary-key helper. Publication records keep their existing v1 key format; only Secure Delivery records use the tagged identity:

```js
function cacheKey({
  studentId,
  accessRef,
  packageId,
}) {
  const ref = createPracticeAccessRef(accessRef);

  return ref.kind === "PUBLICATION"
    ? `${studentId}\u0000${ref.publicationId}\u0000${packageId}`
    : `${studentId}\u0000SECURE_DELIVERY:${ref.deliveryId}\u0000${packageId}`;
}

const studentAccessKey = ({
  studentId,
  accessRef,
}) =>
  `${studentId}\u0000${practiceAccessKey(accessRef)}`;
```

This avoids rewriting IndexedDB primary keys for existing publication cache records.

Implement:

```js
getActiveByAccessRef({ studentId, accessRef })
markVerifiedActive({ studentId, accessRef, packageId, lastVerifiedAt })
markRevoked({ studentId, accessRef, lastVerifiedAt })
```

Keep:

```js
getActiveByPublicationId({ studentId, publicationId }) {
  return getActiveByAccessRef({
    studentId,
    accessRef: {
      kind: "PUBLICATION",
      publicationId,
    },
  });
}
```

Existing publication callers remain valid.

- [ ] **Step 5: Add IndexedDB v1 → v2 migration test**

Create a database with version 1 and a legacy record lacking `accessRef/accessKey`, close it, then open through the new repository. Assert:

```js
const legacy = await reopened.getActiveByPublicationId({
  studentId: "student-a",
  publicationId: "pub-a",
});

assert.equal(legacy.packageId, "pkg-a");
assert.deepEqual(legacy.accessRef, {
  kind: "PUBLICATION",
  publicationId: "pub-a",
});
```

- [ ] **Step 6: Implement additive IndexedDB migration**

Set repository default `dbVersion = 2`.

Change the handler signature to `request.onupgradeneeded = (event) => { ... }`.

During `onupgradeneeded`:

```js
if (!store.indexNames.contains("byStudentAccess")) {
  store.createIndex(
    "byStudentAccess",
    "studentAccessKey",
    { unique: false },
  );
}

if (event.oldVersion < 2) {
  const cursorRequest = store.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (cursor === null) return;

    const value = cursor.value;
    if (
      typeof value.accessKey !== "string" &&
      typeof value.publicationId === "string"
    ) {
      value.accessRef = {
        kind: "PUBLICATION",
        publicationId: value.publicationId,
      };
      value.accessKey =
        `PUBLICATION:${value.publicationId}`;
      value.studentAccessKey =
        `${value.studentId}\u0000${value.accessKey}`;
      // Keep the existing v1 cacheKey primary key unchanged.
      cursor.update(value);
    }
    cursor.continue();
  };
}
```

New storage records always include `studentAccessKey`.

- [ ] **Step 7: Run offline repository suites**

Run:

```bash
node --test test/inMemoryOfflineRepository.test.js test/indexedDbOfflineRepository.test.js test/offlineAwareSharingService.test.js
```

Expected: PASS, including all legacy publication tests.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/offline/offlineRecord.js src/offline/inMemoryOfflineRepository.js src/offline/indexedDbOfflineRepository.js test/inMemoryOfflineRepository.test.js test/indexedDbOfflineRepository.test.js
git commit -m "feat: add tagged offline practice access identity"
```

### Task 6: Add Secure Delivery offline opening and revalidation

**Files:**
- Create: `src/offline/secureDeliveryOfflineReadService.js`
- Create: `src/offline/secureDeliveryStatusService.js`
- Modify: `src/offline/syncCoordinator.js`
- Create: `test/secureDeliveryOfflineReadService.test.js`
- Modify: `test/syncCoordinator.test.js`

**Interfaces:**
- Consumes: Task 3 read port, Task 5 generic offline repository.
- Produces: Secure Delivery cached SCORE opening by exact `deliveryId`.
- Produces: `createSecureDeliveryStatusService({ apiClient })`.

- [ ] **Step 1: Write failing online-cache/offline-open tests**

Assert:

```js
const listeners = new Set();
let connectivityState = "ONLINE";
const connectivityPort = {
  getState() {
    return connectivityState;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setState(next) {
    connectivityState = next;
    for (const listener of listeners) listener(next);
  },
};

const service = createSecureDeliveryOfflineReadService({
  onlineReadService,
  offlineRepository,
  connectivityPort,
  clock: () => "2026-09-23T12:00:00Z",
});

const online = await service.getScorePracticeItem({
  session: studentA,
  assignmentId: "assignment-a",
});
assert.equal(online.offlineAvailability.deviceAvailable, true);

connectivityPort.setState("OFFLINE");

const offline = await service.getScorePracticeItem({
  session: studentA,
  assignmentId: "assignment-a",
});
assert.equal(offline.offlineAvailability.source, "offline");
assert.equal(offline.package.packageId, "pkg-a");

await assert.rejects(
  () => service.getScorePracticeItem({
    session: studentB,
    assignmentId: "assignment-a",
  }),
  /offline practice unavailable/i,
);
```

Pool and assignment list methods delegate online. While offline they throw `new Error("secure delivery list unavailable offline")`; they never fabricate authorization lists.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
node --test test/secureDeliveryOfflineReadService.test.js test/syncCoordinator.test.js
```

Expected: FAIL because Secure Delivery offline services do not exist.

- [ ] **Step 3: Implement Secure Delivery offline wrapper**

Core helpers and behavior:

```js
function annotate(
  item,
  source,
  deviceAvailable,
  saveFailed = false,
) {
  return Object.freeze({
    ...item,
    offlineAvailability: Object.freeze({
      source,
      deviceAvailable,
      saveFailed,
    }),
  });
}

async function getScorePracticeItem({
  session,
  assignmentId,
}) {
  const studentId = requireStudentId(session);
  const accessRef = {
    kind: "SECURE_DELIVERY",
    deliveryId: assignmentId,
  };

  if (isOffline()) {
    const record =
      await offlineRepository.getActiveByAccessRef({
        studentId,
        accessRef,
      });
    if (record === null) {
      throw new Error("offline practice unavailable");
    }
    return annotate({
      accessRef: record.accessRef,
      package: record.package,
    }, "offline", true);
  }

  const item =
    await onlineReadService.getScorePracticeItem({
      session,
      assignmentId,
    });

  const now = clock();
  try {
    await offlineRepository.putAuthorized({
      studentId,
      practiceItem: item,
      cachedAt: now,
      lastVerifiedAt: now,
    });
    return annotate(item, "online", true);
  } catch {
    return annotate(item, "online", false, true);
  }
}
```

- [ ] **Step 4: Implement bounded Secure Delivery cache status**

`createSecureDeliveryStatusService({ apiClient })`:

```js
async getAccessStatus({ accessRef }) {
  if (accessRef.kind !== "SECURE_DELIVERY") {
    throw new TypeError("Secure Delivery access ref required");
  }

  try {
    const row = createSecureDeliveryAssignmentRow(
      await apiClient.getStudentAssignment(accessRef.deliveryId),
    );
    return Object.freeze({
      state: "ACTIVE",
      packageId: row.packageId,
    });
  } catch (error) {
    if (
      error instanceof SecureDeliveryApiError &&
      error.status === 404 &&
      error.code === "NOT_FOUND"
    ) {
      return Object.freeze({ state: "REVOKED" });
    }
    throw error;
  }
}
```

- [ ] **Step 5: Generalize sync routing by `accessRef.kind`**

Extend `createForegroundSyncCoordinator` to accept optional `secureDeliveryStatusService`.

Use `record.accessKey` groups instead of publication ID groups.

For each group:

```js
const status =
  group.accessRef.kind === "PUBLICATION"
    ? await publicationStatusService.getPublicationStatus({
        session,
        publicationId: group.accessRef.publicationId,
        scope: group.scope,
      })
    : await secureDeliveryStatusService.getAccessStatus({
        session,
        accessRef: group.accessRef,
      });
```

Pass the same `accessRef` to generic `markVerifiedActive` and `markRevoked`.

- [ ] **Step 6: Add revoke/transient regression tests**

Test exact outcomes:

```js
// exact Secure Delivery 404 / NOT_FOUND
assert.equal(result.state, SYNC_STATES.SYNCED);
assert.equal(result.revoked, 1);
assert.equal(
  await repo.getActiveByAccessRef({
    studentId: "uid-a",
    accessRef: secureRef,
  }),
  null,
);

// network/503 error
assert.equal(result.state, SYNC_STATES.SYNC_ERROR);
assert.equal(result.failed, 1);
assert.notEqual(
  await repo.getActiveByAccessRef({
    studentId: "uid-a",
    accessRef: secureRef,
  }),
  null,
);
```

- [ ] **Step 7: Run Task 6 suites**

Run:

```bash
node --test test/secureDeliveryOfflineReadService.test.js test/syncCoordinator.test.js test/offlineAwareSharingService.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```bash
git add src/offline/secureDeliveryOfflineReadService.js src/offline/secureDeliveryStatusService.js src/offline/syncCoordinator.js test/secureDeliveryOfflineReadService.test.js test/syncCoordinator.test.js
git commit -m "feat: add secure delivery offline practice support"
```

### Task 7: Wire explicit browser composition into STUDENT-08

**Files:**
- Modify: `src/offline/defaultOfflineInfrastructure.js`
- Modify: `src/ui/main.js`
- Create: `test/student08SecureDeliveryComposition.test.js`
- Modify: `test/student08Ui.test.js`

**Interfaces:**
- Consumes: Tasks 2, 3, 5, and 6.
- Produces: configured browser runtime with Secure Delivery-backed `student08ReadService`.
- Preserves: legacy sharing service and existing Firebase Firestore adapter for current legacy publication flows.

- [ ] **Step 1: Expose the offline repository only to composition**

Change `createDefaultOfflineInfrastructure` return objects to include:

```js
offlineRepository
```

When IndexedDB is unavailable:

```js
offlineRepository: null
```

This is a composition seam only; it is not UI state.

- [ ] **Step 2: Write failing composition tests**

Create `test/student08SecureDeliveryComposition.test.js` around a small new pure composition helper exported from `src/ui/student08Composition.js`:

```js
const disabled = createStudent08Composition({
  config: { enabled: false, baseUrl: null },
  authAdapter,
  fetchImpl,
  connectivityPort,
  offlineRepository,
});
assert.equal(disabled.student08ReadService, null);

const enabled = createStudent08Composition({
  config: {
    enabled: true,
    baseUrl: "https://student-api.example.test/api/secure-delivery/v1",
  },
  authAdapter,
  fetchImpl,
  connectivityPort,
  offlineRepository,
});
assert.equal(
  typeof enabled.student08ReadService.listPoolItems,
  "function",
);
assert.equal(
  "token" in enabled,
  false,
);
```

- [ ] **Step 3: Implement pure composition helper**

Create `src/ui/student08Composition.js`:

```js
export function createStudent08Composition({
  config,
  authAdapter,
  fetchImpl,
  connectivityPort,
  offlineRepository,
}) {
  if (config?.enabled !== true) {
    return Object.freeze({
      student08ReadService: null,
      secureDeliveryStatusService: null,
    });
  }

  const apiClient = createSecureDeliveryApiClient({
    baseUrl: config.baseUrl,
    getIdToken: () => authAdapter.getIdToken(),
    fetchImpl,
  });

  const onlineReadService =
    createSecureDeliveryStudent08ReadService({
      apiClient,
    });

  const student08ReadService =
    offlineRepository === null
      ? onlineReadService
      : createSecureDeliveryOfflineReadService({
          onlineReadService,
          offlineRepository,
          connectivityPort,
        });

  return Object.freeze({
    student08ReadService,
    secureDeliveryStatusService:
      createSecureDeliveryStatusService({
        apiClient,
      }),
  });
}
```

- [ ] **Step 4: Wire `main.js`**

After Firebase/offline infrastructure creation:

```js
const secureDeliveryConfig =
  createSecureDeliveryConfig();

const student08Composition =
  createStudent08Composition({
    config: secureDeliveryConfig,
    authAdapter: firebaseRuntime.authAdapter,
    fetchImpl: globalThis.fetch,
    connectivityPort:
      offlineInfrastructure.connectivityPort,
    offlineRepository:
      offlineInfrastructure.offlineRepository,
  });
```

When Secure Delivery is enabled and an offline repository exists, compose foreground verification using the existing legacy Firestore status service plus the new Secure Delivery status service:

```js
const syncCoordinator =
  secureDeliveryConfig.enabled &&
  offlineInfrastructure.offlineRepository !== null
    ? createForegroundSyncCoordinator({
        offlineRepository:
          offlineInfrastructure.offlineRepository,
        publicationStatusService:
          firebaseRuntime.sharingService,
        secureDeliveryStatusService:
          student08Composition.secureDeliveryStatusService,
      })
    : null;
```

Pass both:

```js
student08ReadService:
  student08Composition.student08ReadService,
syncCoordinator,
```

to `createStudentAppController`.

With Secure Delivery disabled, `syncCoordinator` remains `null`, preserving the current browser behavior. Do not add a direct Firestore TD-06 adapter.

- [ ] **Step 5: Add stale-session integration regression**

In `test/student08Ui.test.js` or the composition test, create a deferred `listPoolItems` request for Student A, attach Student B before resolving it, then resolve Student A. Assert:

```js
assert.equal(
  controller.getState().session.studentId,
  "student-b",
);
assert.notEqual(
  controller.getState().items[0]?.poolItemId,
  "student-a-late-pool",
);
```

This pins the existing `sessionGeneration` protection through the Secure Delivery path.

- [ ] **Step 6: Run composition/UI tests**

Run:

```bash
node --test test/student08SecureDeliveryComposition.test.js test/student08Ui.test.js test/student08Focus.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/offline/defaultOfflineInfrastructure.js src/ui/student08Composition.js src/ui/main.js test/student08SecureDeliveryComposition.test.js test/student08Ui.test.js
git commit -m "feat: wire secure delivery into STUDENT-08"
```

### Task 8: Full regression and merge-readiness evidence

**Files:**
- No product-code changes expected.

**Interfaces:**
- Consumes: all earlier tasks plus the Teacher Plan A merged/read-model contract.
- Produces: exact-head verification evidence only.

- [ ] **Step 1: Confirm Teacher dependency**

Fresh-read `khfy7wpr5p-maker/seslitab-guitar-reader` and require the Teacher Plan A implementation PR to be merged with green exact-main CI before calling S08-3 provider mapping complete.

Expected student assignment fields:

```text
deliveryId
assignmentId
packageId
practiceType
teacherNote
state
assignedAt
deliveredAt
package
```

- [ ] **Step 2: Run focused STUDENT-08/S08-3 tests**

Run:

```bash
node --test   test/student08SecureDeliveryContracts.test.js   test/secureDeliveryConfig.test.js   test/secureDeliveryApiClient.test.js   test/firebaseAuthAdapter.test.js   test/secureDeliveryStudent08ReadService.test.js   test/practiceWorkspace.test.js   test/inMemoryOfflineRepository.test.js   test/indexedDbOfflineRepository.test.js   test/secureDeliveryOfflineReadService.test.js   test/syncCoordinator.test.js   test/student08SecureDeliveryComposition.test.js   test/student08Ui.test.js   test/student08Focus.test.js
```

Expected: zero failures.

- [ ] **Step 3: Run the full Student App suite**

Run:

```bash
npm test
```

Expected: zero failures.

- [ ] **Step 4: Run deterministic piano-bank verification**

Use the repository CI command shown by the current `.github/workflows/ci.yml`; do not substitute an older command. Expected: PASS.

- [ ] **Step 5: Run whitespace verification**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 6: Verify exact-head GitHub checks**

Require on the exact PR head:

```text
CI: success
SonarCloud Code Analysis: success when emitted
unresolved review threads: 0
base drift against current target base: 0
```

- [ ] **Step 7: Stop before merge/deploy/physical preview**

Report:

```text
current main SHA
PR #10 head/base status
S08-3 implementation branch and PR number
exact S08-3 head SHA
changed files
focused/full test counts
CI/Sonar results
Teacher dependency merge SHA
TD-07 remains blocked
physical iPhone/Safari/VoiceOver acceptance remains pending
no production endpoint activation/deploy
no STUDENT-09
```

Do not merge, deploy, set production endpoint configuration, change Firebase rules/credentials/billing, or start a physical preview without the corresponding explicit approval.
