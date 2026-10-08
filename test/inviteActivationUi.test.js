import test from "node:test";
import assert from "node:assert/strict";

import { renderInviteActivation } from "../src/ui/mountInviteActivation.js";

test("CREATE invite renders the invited email as readonly and asks only for a Firebase password", () => {
  const html = renderInviteActivation({
    phase: "READY",
    accountMode: "CREATE",
    email: "ada@example.test",
    displayNameOrNickname: "Ada",
    accountStudentId: "must-not-render",
  });

  assert.match(html, /Öğrenci Daveti/);
  assert.match(html, /value="ada@example\.test"/);
  assert.match(html, /readonly/);
  assert.match(html, /data-invite-secret/);
  assert.match(html, /Hesap Oluştur ve Daveti Kabul Et/);
  assert.doesNotMatch(html, /must-not-render/);
});

test("SIGN_IN invite renders existing-account action without exposing internal identity", () => {
  const html = renderInviteActivation({
    phase: "READY",
    accountMode: "SIGN_IN",
    email: "ece@example.test",
    accountStudentId: "stable-private-id",
  });

  assert.match(html, /Giriş Yap ve Daveti Kabul Et/);
  assert.doesNotMatch(html, /stable-private-id/);
});

test("authenticated pending activation offers retry without requesting the password again", () => {
  const html = renderInviteActivation({
    phase: "AUTHENTICATED_PENDING_ACTIVATION",
    accountMode: "CREATE",
    email: "lina@example.test",
  });

  assert.match(html, /Davet etkinleştirilemedi/);
  assert.match(html, /Daveti Tekrar Dene/);
  assert.doesNotMatch(html, /data-invite-secret/);
});

test("ACTIVE invite exposes only a bounded success continuation", () => {
  const html = renderInviteActivation({
    phase: "ACTIVE",
    accountMode: "CREATE",
    email: "ada@example.test",
    accountStudentId: "stable-private-id",
    relationshipState: "ACTIVE",
  });

  assert.match(html, /Davet kabul edildi/);
  assert.match(html, /ST Student’a Devam Et/);
  assert.doesNotMatch(html, /stable-private-id/);
});
