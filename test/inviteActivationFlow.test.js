import test from "node:test";
import assert from "node:assert/strict";

import { createInviteActivationFlow } from "../src/auth/inviteActivationFlow.js";

test("CREATE invitation uses the fixed invited email, creates Firebase account, then activates stable account identity", async () => {
  const calls = [];
  const flow = createInviteActivationFlow({
    inviteToken: "RAW_INVITE_TOKEN",
    apiClient: {
      async resolveInvitation(token) {
        calls.push(["resolve", token]);
        return {
          inviteId: "invite-1",
          studentDisplayNameOrNickname: "Ada",
          email: "ada@example.test",
          expiresAt: "2026-10-15T00:00:00.000Z",
          accountMode: "CREATE",
        };
      },
      async acceptInvitation(token) {
        calls.push(["accept", token]);
        return {
          studentId: "student-stable-1",
          relationshipState: "ACTIVE",
        };
      },
    },
    authAdapter: {
      async createAccount(credentials) {
        calls.push(["createAccount", credentials]);
        return { studentId: "firebase-uid-1" };
      },
      async signIn() {
        throw new Error("signIn must not be used for CREATE");
      },
    },
  });

  const ready = await flow.resolve();
  assert.equal(ready.email, "ada@example.test");
  assert.equal(ready.accountMode, "CREATE");
  assert.equal(JSON.stringify(ready).includes("RAW_INVITE_TOKEN"), false);

  const active = await flow.activate({ password: "student-secret" });

  assert.equal(active.phase, "ACTIVE");
  assert.equal(active.accountStudentId, "student-stable-1");
  assert.equal(active.relationshipState, "ACTIVE");
  assert.equal(JSON.stringify(active).includes("student-secret"), false);
  assert.equal(JSON.stringify(active).includes("RAW_INVITE_TOKEN"), false);
  assert.deepEqual(calls, [
    ["resolve", "RAW_INVITE_TOKEN"],
    ["createAccount", { email: "ada@example.test", password: "student-secret" }],
    ["accept", "RAW_INVITE_TOKEN"],
  ]);
});

test("SIGN_IN invitation reuses existing Firebase sign-in flow", async () => {
  const calls = [];
  const flow = createInviteActivationFlow({
    inviteToken: "RAW_INVITE_TOKEN",
    apiClient: {
      async resolveInvitation() {
        return {
          inviteId: "invite-2",
          studentDisplayNameOrNickname: "Ece",
          email: "ece@example.test",
          expiresAt: "2026-10-15T00:00:00.000Z",
          accountMode: "SIGN_IN",
        };
      },
      async acceptInvitation() {
        calls.push(["accept"]);
        return {
          studentId: "student-stable-2",
          relationshipState: "ACTIVE",
        };
      },
    },
    authAdapter: {
      async createAccount() {
        throw new Error("createAccount must not be used for SIGN_IN");
      },
      async signIn(credentials) {
        calls.push(["signIn", credentials]);
        return { studentId: "firebase-uid-2" };
      },
    },
  });

  await flow.resolve();
  const active = await flow.activate({ password: "existing-secret" });

  assert.equal(active.accountStudentId, "student-stable-2");
  assert.deepEqual(calls, [
    ["signIn", { email: "ece@example.test", password: "existing-secret" }],
    ["accept"],
  ]);
});

test("activation is complete only when account service returns relationshipState ACTIVE", async () => {
  const flow = createInviteActivationFlow({
    inviteToken: "RAW_INVITE_TOKEN",
    apiClient: {
      async resolveInvitation() {
        return {
          inviteId: "invite-3",
          studentDisplayNameOrNickname: "Mert",
          email: "mert@example.test",
          expiresAt: "2026-10-15T00:00:00.000Z",
          accountMode: "SIGN_IN",
        };
      },
      async acceptInvitation() {
        return {
          studentId: "student-stable-3",
          relationshipState: "ACTIVATING",
        };
      },
    },
    authAdapter: {
      async signIn() {
        return { studentId: "firebase-uid-3" };
      },
      async createAccount() {
        throw new Error("unexpected");
      },
    },
  });

  await flow.resolve();
  await assert.rejects(
    () => flow.activate({ password: "secret" }),
    /activation unavailable/i,
  );
  assert.equal(flow.getState().phase, "AUTHENTICATED_PENDING_ACTIVATION");
});

test("failed backend activation can be retried without recreating the Firebase account", async () => {
  let createCalls = 0;
  let acceptCalls = 0;
  const flow = createInviteActivationFlow({
    inviteToken: "RAW_INVITE_TOKEN",
    apiClient: {
      async resolveInvitation() {
        return {
          inviteId: "invite-4",
          studentDisplayNameOrNickname: "Lina",
          email: "lina@example.test",
          expiresAt: "2026-10-15T00:00:00.000Z",
          accountMode: "CREATE",
        };
      },
      async acceptInvitation() {
        acceptCalls += 1;
        if (acceptCalls === 1) {
          const error = new Error("service unavailable");
          error.code = "SERVICE_UNAVAILABLE";
          throw error;
        }
        return {
          studentId: "student-stable-4",
          relationshipState: "ACTIVE",
        };
      },
    },
    authAdapter: {
      async createAccount() {
        createCalls += 1;
        return { studentId: "firebase-uid-4" };
      },
      async signIn() {
        throw new Error("unexpected");
      },
    },
  });

  await flow.resolve();
  await assert.rejects(() => flow.activate({ password: "first-secret" }));
  assert.equal(flow.getState().phase, "AUTHENTICATED_PENDING_ACTIVATION");

  const active = await flow.activate({ password: "ignored-second-secret" });

  assert.equal(active.phase, "ACTIVE");
  assert.equal(createCalls, 1);
  assert.equal(acceptCalls, 2);
});
