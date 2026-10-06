import test from "node:test";
import assert from "node:assert/strict";

import { createStudentAudioSession } from "../src/playback/studentAudioSession.js";

test("student audio session reports support without eagerly creating a context", () => {
  let created = 0;

  class FakeAudioContext {
    constructor() {
      created += 1;
    }
  }

  const session = createStudentAudioSession({
    AudioContextCtor: FakeAudioContext,
  });

  assert.equal(created, 0);
  assert.equal(session.isSupported(), true);
  assert.equal(created, 0);
});

test("student audio session returns one exact context identity to every consumer", () => {
  let created = 0;

  class FakeAudioContext {
    constructor() {
      created += 1;
      this.id = created;
    }
  }

  const session = createStudentAudioSession({
    AudioContextCtor: FakeAudioContext,
  });

  const first = session.getContext();
  const second = session.audioContextFactory();
  const third = session.getContext();

  assert.equal(created, 1);
  assert.strictEqual(first, second);
  assert.strictEqual(second, third);
});

test("student audio session closes the shared context once and cannot reuse it after dispose", async () => {
  let closeCalls = 0;

  class FakeAudioContext {
    state = "running";

    async close() {
      closeCalls += 1;
      this.state = "closed";
    }
  }

  const session = createStudentAudioSession({
    AudioContextCtor: FakeAudioContext,
  });
  const context = session.getContext();

  await Promise.all([session.dispose(), session.dispose()]);

  assert.equal(closeCalls, 1);
  assert.equal(context.state, "closed");
  assert.equal(session.getContext(), null);
  assert.equal(session.audioContextFactory(), null);
});

test("student audio session degrades cleanly when Web Audio is unsupported", async () => {
  const session = createStudentAudioSession({
    AudioContextCtor: null,
  });

  assert.equal(session.isSupported(), false);
  assert.equal(session.getContext(), null);
  assert.equal(session.audioContextFactory(), null);
  await assert.doesNotReject(() => session.dispose());
});
