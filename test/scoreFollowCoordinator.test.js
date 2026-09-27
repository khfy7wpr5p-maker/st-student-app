import test from "node:test";
import assert from "node:assert/strict";

import { createScoreFollowCoordinator } from "../src/practice/scoreFollowCoordinator.js";

function pkg(packageId = "pkg-a") {
  return Object.freeze({ packageId });
}

function measureIndex({
  eventMapping = "EXACT",
  hit = {
    measureIndex: 0,
    startBeat: 0,
    endBeat: 4,
    cursorTarget: { partId: "P1", measureIndex: 0 },
  },
  beatResult = {
    measureIndex: 0,
    cursorTarget: { partId: "P1", measureIndex: 0 },
    highlightRefs: [
      { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 1 },
    ],
  },
} = {}) {
  return Object.freeze({
    measureMapping: "EXACT",
    eventMapping,
    resolveMeasureHit(target) {
      if (target?.partId !== "P1" || target?.measureIndex !== 0) {
        return null;
      }
      return hit;
    },
    resolveBeat() {
      return beatResult;
    },
  });
}

function makePlaybackPort() {
  const calls = [];
  const callbacks = [];
  return {
    calls,
    callbacks,
    getScoreFollowPlaybackContextForPackage(work) {
      calls.push(["context", work.packageId]);
      return Object.freeze({
        plan: Object.freeze({ packageId: work.packageId }),
        timingProvenance: null,
      });
    },
    async playMeasureOnceForPackage(work, range) {
      calls.push(["playMeasure", work.packageId, range]);
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

function makeAdapter() {
  const calls = [];
  let hitResult = {
    kind: "HIT",
    sourceId: "pkg-a",
    renderEpoch: "render-1",
    target: { partId: "P1", measureIndex: 0 },
  };
  return {
    calls,
    setHit(result) {
      hitResult = result;
    },
    hitTestMeasureDetailed(point) {
      calls.push(["hit", point]);
      return hitResult;
    },
    async moveCursor(target) {
      calls.push(["cursor", target]);
      return true;
    },
    async clearHighlights() {
      calls.push(["clearHighlights"]);
      return true;
    },
    async highlight(target) {
      calls.push(["highlight", target]);
      return true;
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("fresh current measure HIT forwards coordinates unchanged and replays exactly once", async () => {
  const adapter = makeAdapter();
  const playbackPort = makePlaybackPort();
  const created = [];
  const coordinator = createScoreFollowCoordinator({
    notationAdapter: adapter,
    playbackPort,
    createIndex(args) {
      created.push(args);
      return measureIndex();
    },
  });
  const work = pkg();

  assert.equal(
    coordinator.bind({
      pkg: work,
      sourceId: "pkg-a",
      musicXml: "<score-partwise/>",
      renderEvidence: { sourceId: "pkg-a", renderEpoch: "render-1" },
    }),
    true,
  );

  assert.equal(
    await coordinator.handlePoint({ clientX: 12.5, clientY: 88.25 }),
    true,
  );

  assert.deepEqual(adapter.calls[0], [
    "hit",
    { clientX: 12.5, clientY: 88.25 },
  ]);
  assert.deepEqual(
    playbackPort.calls.filter(([name]) => name === "playMeasure"),
    [["playMeasure", "pkg-a", { startBeat: 0, endBeat: 4 }]],
  );
  assert.equal(created[0].packageId, "pkg-a");
  assert.equal(created[0].sourceId, "pkg-a");
});

test("MISS unknown measure and stale renderer evidence never replay", async () => {
  const adapter = makeAdapter();
  const playbackPort = makePlaybackPort();
  let index = measureIndex();
  const coordinator = createScoreFollowCoordinator({
    notationAdapter: adapter,
    playbackPort,
    createIndex: () => index,
  });

  coordinator.bind({
    pkg: pkg(),
    sourceId: "pkg-a",
    musicXml: "<score-partwise/>",
    renderEvidence: { sourceId: "pkg-a", renderEpoch: "render-1" },
  });

  adapter.setHit({
    kind: "MISS",
    sourceId: "pkg-a",
    renderEpoch: "render-1",
    reason: "outside",
  });
  assert.equal(await coordinator.handlePoint({ clientX: 1, clientY: 2 }), false);

  adapter.setHit({
    kind: "HIT",
    sourceId: "pkg-a",
    renderEpoch: "render-1",
    target: { partId: "PX", measureIndex: 0 },
  });
  assert.equal(await coordinator.handlePoint({ clientX: 1, clientY: 2 }), false);

  adapter.setHit({
    kind: "HIT",
    sourceId: "pkg-a",
    renderEpoch: "render-old",
    target: { partId: "P1", measureIndex: 0 },
  });
  assert.equal(await coordinator.handlePoint({ clientX: 1, clientY: 2 }), false);

  adapter.setHit({
    kind: "HIT",
    sourceId: "pkg-old",
    renderEpoch: "render-1",
    target: { partId: "P1", measureIndex: 0 },
  });
  assert.equal(await coordinator.handlePoint({ clientX: 1, clientY: 2 }), false);

  assert.equal(
    playbackPort.calls.some(([name]) => name === "playMeasure"),
    false,
  );
});

test("position updates de-duplicate cursor and exact highlight sets", async () => {
  const adapter = makeAdapter();
  const playbackPort = makePlaybackPort();
  let beatResult = {
    measureIndex: 0,
    cursorTarget: { partId: "P1", measureIndex: 0 },
    highlightRefs: [
      { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 1 },
      { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 1 },
    ],
  };
  const index = Object.freeze({
    measureMapping: "EXACT",
    eventMapping: "EXACT",
    resolveMeasureHit: () => null,
    resolveBeat: () => beatResult,
  });
  const coordinator = createScoreFollowCoordinator({
    notationAdapter: adapter,
    playbackPort,
    createIndex: () => index,
  });

  coordinator.bind({
    pkg: pkg(),
    sourceId: "pkg-a",
    musicXml: "<score-partwise/>",
    renderEvidence: { sourceId: "pkg-a", renderEpoch: "render-1" },
  });
  const callback = playbackPort.callbacks[0].listener;

  callback({ generation: 1, beat: 0, playing: true });
  await flush();
  callback({ generation: 1, beat: 0.5, playing: true });
  await flush();

  assert.equal(adapter.calls.filter(([name]) => name === "cursor").length, 1);
  assert.equal(adapter.calls.filter(([name]) => name === "clearHighlights").length, 1);
  assert.equal(adapter.calls.filter(([name]) => name === "highlight").length, 2);

  beatResult = {
    measureIndex: 0,
    cursorTarget: { partId: "P1", measureIndex: 0 },
    highlightRefs: [],
  };
  callback({ generation: 1, beat: 1, playing: true });
  await flush();

  assert.equal(adapter.calls.filter(([name]) => name === "cursor").length, 1);
  assert.equal(adapter.calls.filter(([name]) => name === "clearHighlights").length, 2);
  assert.equal(adapter.calls.filter(([name]) => name === "highlight").length, 2);
});

test("unavailable event mapping still moves measure cursor and never highlights", async () => {
  const adapter = makeAdapter();
  const playbackPort = makePlaybackPort();
  const coordinator = createScoreFollowCoordinator({
    notationAdapter: adapter,
    playbackPort,
    createIndex: () =>
      measureIndex({
        eventMapping: "UNAVAILABLE",
        beatResult: {
          measureIndex: 0,
          cursorTarget: { partId: "P1", measureIndex: 0 },
          highlightRefs: null,
        },
      }),
  });

  coordinator.bind({
    pkg: pkg(),
    sourceId: "pkg-a",
    musicXml: "<score-partwise/>",
    renderEvidence: { sourceId: "pkg-a", renderEpoch: "render-1" },
  });
  playbackPort.callbacks[0].listener({
    generation: 1,
    beat: 0,
    playing: true,
  });
  await flush();

  assert.equal(adapter.calls.filter(([name]) => name === "cursor").length, 1);
  assert.equal(adapter.calls.some(([name]) => name === "highlight"), false);
});

test("renderer cursor or highlight failures stay presentation-local", async () => {
  const adapter = makeAdapter();
  adapter.moveCursor = async () => {
    adapter.calls.push(["cursorFailure"]);
    throw new Error("renderer secret");
  };
  adapter.clearHighlights = async () => {
    adapter.calls.push(["clearFailure"]);
    throw new Error("renderer secret");
  };
  const playbackPort = makePlaybackPort();
  const coordinator = createScoreFollowCoordinator({
    notationAdapter: adapter,
    playbackPort,
    createIndex: () => measureIndex(),
  });

  coordinator.bind({
    pkg: pkg(),
    sourceId: "pkg-a",
    musicXml: "<score-partwise/>",
    renderEvidence: { sourceId: "pkg-a", renderEpoch: "render-1" },
  });

  assert.doesNotThrow(() => {
    playbackPort.callbacks[0].listener({
      generation: 1,
      beat: 0,
      playing: true,
    });
  });
  await flush();

  assert.equal(
    playbackPort.calls.some(([name]) => name === "playMeasure"),
    false,
  );
});

test("rebind invalidates an in-flight old position callback", async () => {
  const adapter = makeAdapter();
  const playbackPort = makePlaybackPort();
  const coordinator = createScoreFollowCoordinator({
    notationAdapter: adapter,
    playbackPort,
    createIndex: () => measureIndex(),
  });

  coordinator.bind({
    pkg: pkg("pkg-a"),
    sourceId: "pkg-a",
    musicXml: "<score-partwise/>",
    renderEvidence: { sourceId: "pkg-a", renderEpoch: "render-1" },
  });
  const oldCallback = playbackPort.callbacks[0].listener;

  adapter.setHit({
    kind: "HIT",
    sourceId: "pkg-b",
    renderEpoch: "render-2",
    target: { partId: "P1", measureIndex: 0 },
  });
  coordinator.bind({
    pkg: pkg("pkg-b"),
    sourceId: "pkg-b",
    musicXml: "<score-partwise/>",
    renderEvidence: { sourceId: "pkg-b", renderEpoch: "render-2" },
  });

  const callsBefore = adapter.calls.length;
  oldCallback({ generation: 1, beat: 0, playing: true });
  await flush();

  assert.equal(adapter.calls.length, callsBefore);
  assert.equal(playbackPort.callbacks[0].active, false);
});

test("bind fails closed unless SCORE source and render evidence match the package", () => {
  const adapter = makeAdapter();
  const playbackPort = makePlaybackPort();
  const coordinator = createScoreFollowCoordinator({
    notationAdapter: adapter,
    playbackPort,
    createIndex: () => measureIndex(),
  });

  assert.equal(
    coordinator.bind({
      pkg: pkg("pkg-a"),
      sourceId: "tab:pkg-a",
      musicXml: "<score-partwise/>",
      renderEvidence: { sourceId: "tab:pkg-a", renderEpoch: "render-1" },
    }),
    false,
  );
  assert.equal(
    coordinator.bind({
      pkg: pkg("pkg-a"),
      sourceId: "pkg-a",
      musicXml: "<score-partwise/>",
      renderEvidence: { sourceId: "pkg-other", renderEpoch: "render-1" },
    }),
    false,
  );
  assert.equal(playbackPort.callbacks.length, 0);
});

test("clear and dispose unsubscribe current position and clear follow presentation", async () => {
  const adapter = makeAdapter();
  const playbackPort = makePlaybackPort();
  const coordinator = createScoreFollowCoordinator({
    notationAdapter: adapter,
    playbackPort,
    createIndex: () => measureIndex(),
  });

  coordinator.bind({
    pkg: pkg(),
    sourceId: "pkg-a",
    musicXml: "<score-partwise/>",
    renderEvidence: { sourceId: "pkg-a", renderEpoch: "render-1" },
  });
  await coordinator.clear();

  assert.equal(playbackPort.callbacks[0].active, false);
  assert.equal(adapter.calls.some(([name]) => name === "clearHighlights"), true);
  assert.equal(await coordinator.handlePoint({ clientX: 1, clientY: 2 }), false);

  await coordinator.dispose();
  assert.equal(await coordinator.handlePoint({ clientX: 1, clientY: 2 }), false);
});
