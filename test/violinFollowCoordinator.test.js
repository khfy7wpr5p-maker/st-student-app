import test from "node:test";
import assert from "node:assert/strict";

import {
  createViolinFollowCoordinator,
} from "../src/practice/violinFollowCoordinator.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));

function pkg(packageId = "pkg-a") {
  return Object.freeze({ packageId });
}

function fSharpEvent(partId = "P1") {
  return Object.freeze({
    eventId: `${partId}:0:1:0`,
    partId,
    measureIndex: 0,
    midi: 66,
    pitch: Object.freeze({ step: "F", alter: 1, octave: 4 }),
  });
}

function makeIndex({ activeEvents = [fSharpEvent()], eventMapping = "EXACT" } = {}) {
  return Object.freeze({
    measureMapping: "EXACT",
    eventMapping,
    resolveMeasureHit() {
      return null;
    },
    resolveBeat() {
      return Object.freeze({
        measureIndex: 0,
        cursorTarget: Object.freeze({ partId: "P1", measureIndex: 0 }),
        highlightRefs: Object.freeze([]),
        activeEvents:
          eventMapping === "EXACT"
            ? Object.freeze(activeEvents)
            : null,
      });
    },
  });
}

function makePlaybackPort() {
  const callbacks = [];
  const calls = [];
  return {
    callbacks,
    calls,
    getScoreFollowPlaybackContextForPackage(work) {
      calls.push(["context", work.packageId]);
      return Object.freeze({
        plan: Object.freeze({
          packageId: work.packageId,
          measures: Object.freeze([{ index: 0, startBeat: 0, endBeat: 4 }]),
        }),
        timingProvenance: Object.freeze({
          kind: "EXACT_SCORE_SOURCE",
          musicXml: "<score-partwise/>",
        }),
      });
    },
    subscribePositionForPackage(work, listener) {
      const record = { packageId: work.packageId, listener, active: true };
      callbacks.push(record);
      calls.push(["subscribe", work.packageId]);
      return () => {
        record.active = false;
        calls.push(["unsubscribe", work.packageId]);
      };
    },
  };
}

function makePresentation() {
  const calls = [];
  return {
    calls,
    async show(snapshot) {
      calls.push(["show", snapshot]);
      return true;
    },
    async clear() {
      calls.push(["clear"]);
      return true;
    },
  };
}

test("binds only exact current package source and subscribes to existing playback positions", () => {
  const playbackPort = makePlaybackPort();
  const presentationPort = makePresentation();
  const coordinator = createViolinFollowCoordinator({
    playbackPort,
    presentationPort,
    createIndex: () => makeIndex(),
  });

  assert.equal(
    coordinator.bind({
      pkg: pkg(),
      sourceId: "pkg-a",
      musicXml: "<score-partwise/>",
      targetPartId: "P1",
    }),
    true,
  );
  assert.equal(playbackPort.callbacks.length, 1);

  assert.equal(
    coordinator.bind({
      pkg: pkg(),
      sourceId: "tab:pkg-a",
      musicXml: "<score-partwise/>",
      targetPartId: "P1",
    }),
    false,
  );
});

test("F# playback position presents D string high second finger", async () => {
  const playbackPort = makePlaybackPort();
  const presentationPort = makePresentation();
  const coordinator = createViolinFollowCoordinator({
    playbackPort,
    presentationPort,
    createIndex: () => makeIndex(),
  });

  coordinator.bind({
    pkg: pkg(),
    sourceId: "pkg-a",
    musicXml: "<score-partwise/>",
    targetPartId: "P1",
  });
  playbackPort.callbacks[0].listener({ beat: 0, playing: true, generation: 9 });
  await flush();

  const shown = presentationPort.calls.find(([name]) => name === "show")?.[1];
  assert.equal(shown.state, "AVAILABLE");
  assert.equal(shown.playing, true);
  assert.equal(shown.primary.stringId, "D");
  assert.equal(shown.primary.finger, 2);
  assert.equal(shown.primary.placement, "HIGH");
});

test("paused snapshot keeps current fingering but marks it non-playing", async () => {
  const playbackPort = makePlaybackPort();
  const presentationPort = makePresentation();
  const coordinator = createViolinFollowCoordinator({
    playbackPort,
    presentationPort,
    createIndex: () => makeIndex(),
  });

  coordinator.bind({
    pkg: pkg(),
    sourceId: "pkg-a",
    musicXml: "<score-partwise/>",
    targetPartId: "P1",
  });
  playbackPort.callbacks[0].listener({ beat: 0, playing: false, generation: 10 });
  await flush();

  const shown = presentationPort.calls.find(([name]) => name === "show")?.[1];
  assert.equal(shown.state, "AVAILABLE");
  assert.equal(shown.playing, false);
});

test("rest empty and accompaniment-only positions clear presentation", async () => {
  for (const activeEvents of [[], [fSharpEvent("P2")]]) {
    const playbackPort = makePlaybackPort();
    const presentationPort = makePresentation();
    const coordinator = createViolinFollowCoordinator({
      playbackPort,
      presentationPort,
      createIndex: () => makeIndex({ activeEvents }),
    });

    coordinator.bind({
      pkg: pkg(),
      sourceId: "pkg-a",
      musicXml: "<score-partwise/>",
      targetPartId: "P1",
    });
    playbackPort.callbacks[0].listener({ beat: 0, playing: true, generation: 1 });
    await flush();

    assert.equal(
      presentationPort.calls.some(([name]) => name === "clear"),
      true,
    );
    assert.equal(
      presentationPort.calls.some(([name]) => name === "show"),
      false,
    );
  }
});

test("ambiguous target-part chord fails closed and clears presentation", async () => {
  const playbackPort = makePlaybackPort();
  const presentationPort = makePresentation();
  const coordinator = createViolinFollowCoordinator({
    playbackPort,
    presentationPort,
    createIndex: () =>
      makeIndex({
        activeEvents: [
          fSharpEvent(),
          Object.freeze({
            eventId: "P1:0:1:1",
            partId: "P1",
            measureIndex: 0,
            midi: 67,
            pitch: Object.freeze({ step: "G", alter: 0, octave: 4 }),
          }),
        ],
      }),
  });

  coordinator.bind({
    pkg: pkg(),
    sourceId: "pkg-a",
    musicXml: "<score-partwise/>",
    targetPartId: "P1",
  });
  playbackPort.callbacks[0].listener({ beat: 0, playing: true, generation: 1 });
  await flush();

  assert.equal(presentationPort.calls.some(([name]) => name === "clear"), true);
  assert.equal(presentationPort.calls.some(([name]) => name === "show"), false);
});

test("rebind invalidates the old position callback and unsubscribes it", async () => {
  const playbackPort = makePlaybackPort();
  const presentationPort = makePresentation();
  const coordinator = createViolinFollowCoordinator({
    playbackPort,
    presentationPort,
    createIndex: () => makeIndex(),
  });

  coordinator.bind({
    pkg: pkg("pkg-a"),
    sourceId: "pkg-a",
    musicXml: "<score-partwise/>",
    targetPartId: "P1",
  });
  const old = playbackPort.callbacks[0];

  coordinator.bind({
    pkg: pkg("pkg-b"),
    sourceId: "pkg-b",
    musicXml: "<score-partwise/>",
    targetPartId: "P1",
  });
  const callCount = presentationPort.calls.length;

  old.listener({ beat: 0, playing: true, generation: 1 });
  await flush();

  assert.equal(old.active, false);
  assert.equal(presentationPort.calls.length, callCount);
});

test("presentation failures never propagate into playback callback", async () => {
  const playbackPort = makePlaybackPort();
  const presentationPort = {
    async show() {
      throw new Error("ui failure");
    },
    async clear() {
      throw new Error("ui failure");
    },
  };
  const coordinator = createViolinFollowCoordinator({
    playbackPort,
    presentationPort,
    createIndex: () => makeIndex(),
  });

  coordinator.bind({
    pkg: pkg(),
    sourceId: "pkg-a",
    musicXml: "<score-partwise/>",
    targetPartId: "P1",
  });

  assert.doesNotThrow(() => {
    playbackPort.callbacks[0].listener({ beat: 0, playing: true, generation: 1 });
  });
  await flush();
});

test("clear and dispose unsubscribe current playback position and clear presentation", async () => {
  const playbackPort = makePlaybackPort();
  const presentationPort = makePresentation();
  const coordinator = createViolinFollowCoordinator({
    playbackPort,
    presentationPort,
    createIndex: () => makeIndex(),
  });

  coordinator.bind({
    pkg: pkg(),
    sourceId: "pkg-a",
    musicXml: "<score-partwise/>",
    targetPartId: "P1",
  });
  await coordinator.clear();

  assert.equal(playbackPort.callbacks[0].active, false);
  assert.equal(presentationPort.calls.some(([name]) => name === "clear"), true);

  await coordinator.dispose();
});

test("coordinator source contains no independent timer or audio clock", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../src/practice/violinFollowCoordinator.js", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /setInterval|setTimeout|requestAnimationFrame|AudioContext|webkitAudioContext/);
});
