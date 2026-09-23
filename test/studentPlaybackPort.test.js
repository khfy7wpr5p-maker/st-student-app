import test from "node:test";
import assert from "node:assert/strict";

import { createStudentPlaybackPort } from "../src/playback/studentPlaybackPort.js";

function plan(packageId = "pkg-a", quality = "APPROXIMATE") {
  return Object.freeze({
    schemaVersion: 1,
    quality,
    packageId,
    referenceTempoBpm: 120,
    tempoMap: Object.freeze([Object.freeze({ beat: 0, bpm: 120 })]),
    measures: Object.freeze([
      Object.freeze({ index: 0, startBeat: 0, endBeat: 4 }),
    ]),
    notes: Object.freeze([
      Object.freeze({
        startBeat: 0,
        durationBeats: 1,
        midi: 60,
        measureIndex: 0,
        partId: "P1",
        voice: "1",
      }),
    ]),
  });
}

function pkg(packageId = "pkg-a", practice = {}) {
  return Object.freeze({
    packageId,
    practice: Object.freeze({
      allowTempoChange: false,
      allowMeasureRepeat: false,
      ...practice,
    }),
    content: Object.freeze({
      score: Object.freeze({
        format: "musicxml",
        data: "<score-partwise/>",
      }),
      canonicalEvents: Object.freeze([]),
    }),
  });
}

function makeEngine({ supported = true } = {}) {
  const calls = [];
  return {
    calls,
    isSupported() {
      calls.push(["isSupported"]);
      return supported;
    },
    async play(args) {
      calls.push(["play", args]);
    },
    pause() {
      calls.push(["pause"]);
    },
    async restart() {
      calls.push(["restart"]);
    },
    setTempo(value) {
      calls.push(["tempo", value]);
    },
    setMeasureRepeatEnabled(value) {
      calls.push(["repeat", value]);
    },
    dispose() {
      calls.push(["dispose"]);
    },
  };
}

test("port resolves an immutable package only once and exposes playback metadata", () => {
  let resolves = 0;
  const engine = makeEngine();
  const port = createStudentPlaybackPort({
    playbackPlanResolver: {
      resolvePackage(value) {
        resolves += 1;
        return plan(value.packageId, "FULL");
      },
    },
    engine,
  });
  const work = pkg();

  assert.equal(port.canPlayPackage(work), true);
  assert.equal(port.canPlayPackage(work), true);
  assert.equal(port.getPlaybackQualityForPackage(work), "FULL");
  assert.equal(port.getReferenceTempoForPackage(work), 120);
  assert.equal(resolves, 1);
});

test("unsupported plan or unavailable audio runtime fails closed", () => {
  const unsupported = createStudentPlaybackPort({
    playbackPlanResolver: { resolvePackage: () => null },
    engine: makeEngine(),
  });
  const noAudio = createStudentPlaybackPort({
    playbackPlanResolver: { resolvePackage: () => plan() },
    engine: makeEngine({ supported: false }),
  });

  assert.equal(unsupported.canPlayPackage(pkg()), false);
  assert.equal(unsupported.getPlaybackQualityForPackage(pkg()), null);
  assert.equal(noAudio.canPlayPackage(pkg()), false);
});

test("teacher permissions gate tempo and measure repeat", () => {
  const port = createStudentPlaybackPort({
    playbackPlanResolver: { resolvePackage: () => plan() },
    engine: makeEngine(),
  });

  assert.equal(port.canChangeTempoForPackage(pkg()), false);
  assert.equal(port.canRepeatMeasureForPackage(pkg()), false);

  const allowed = pkg("pkg-a", {
    allowTempoChange: true,
    allowMeasureRepeat: true,
  });
  assert.equal(port.canChangeTempoForPackage(allowed), true);
  assert.equal(port.canRepeatMeasureForPackage(allowed), true);
});

test("tempo selection is bounded and applied when playback starts", async () => {
  const engine = makeEngine();
  const work = pkg("pkg-a", { allowTempoChange: true });
  const port = createStudentPlaybackPort({
    playbackPlanResolver: { resolvePackage: () => plan() },
    engine,
  });

  assert.throws(
    () => port.setTempoForPackage(work, 19),
    /tempo out of range/,
  );
  assert.throws(
    () => port.setTempoForPackage(work, 301),
    /tempo out of range/,
  );

  port.setTempoForPackage(work, 80);
  await port.playPackage(work);

  const playCall = engine.calls.find(([name]) => name === "play");
  assert.equal(playCall[1].tempoBpm, 80);
  assert.equal(playCall[1].plan.packageId, "pkg-a");
});

test("repeat may be selected before play and is applied after engine ownership", async () => {
  const engine = makeEngine();
  const work = pkg("pkg-a", { allowMeasureRepeat: true });
  const port = createStudentPlaybackPort({
    playbackPlanResolver: { resolvePackage: () => plan() },
    engine,
  });

  port.setMeasureRepeatEnabledForPackage(work, true);
  await port.playPackage(work);

  const names = engine.calls.map(([name]) => name);
  assert.ok(names.indexOf("play") < names.indexOf("repeat"));
  assert.deepEqual(
    engine.calls.find(([name]) => name === "repeat"),
    ["repeat", true],
  );
});

test("pause and restart only delegate for the active matching package", async () => {
  const engine = makeEngine();
  const port = createStudentPlaybackPort({
    playbackPlanResolver: {
      resolvePackage: (value) => plan(value.packageId),
    },
    engine,
  });
  const a = pkg("pkg-a");
  const b = pkg("pkg-b");

  assert.throws(() => port.pausePackage(a), /playback package inactive/);
  assert.throws(() => port.restartPackage(a), /playback package inactive/);

  await port.playPackage(a);
  port.pausePackage(a);
  await port.restartPackage(a);

  assert.throws(() => port.pausePackage(b), /playback package inactive/);
  assert.equal(engine.calls.some(([name]) => name === "pause"), true);
  assert.equal(engine.calls.some(([name]) => name === "restart"), true);
});

test("switching package disposes the old engine domain before new playback", async () => {
  const engine = makeEngine();
  const port = createStudentPlaybackPort({
    playbackPlanResolver: {
      resolvePackage: (value) => plan(value.packageId),
    },
    engine,
  });

  await port.playPackage(pkg("pkg-a"));
  await port.playPackage(pkg("pkg-b"));

  const names = engine.calls.map(([name]) => name);
  const firstPlay = names.indexOf("play");
  const dispose = names.indexOf("dispose");
  const secondPlay = names.lastIndexOf("play");

  assert.ok(firstPlay < dispose);
  assert.ok(dispose < secondPlay);
});

test("dispose clears active ownership and bounded errors do not leak provider detail", async () => {
  const engine = makeEngine();
  engine.play = async () => {
    throw new Error("secret provider trace");
  };
  const work = pkg();
  const port = createStudentPlaybackPort({
    playbackPlanResolver: { resolvePackage: () => plan() },
    engine,
  });

  await assert.rejects(
    () => port.playPackage(work),
    /^Error: playback operation failed$/,
  );

  engine.play = async (args) => {
    engine.calls.push(["play", args]);
  };
  await port.playPackage(work);
  port.disposePackage(work);

  assert.throws(() => port.pausePackage(work), /playback package inactive/);
  assert.equal(engine.calls.at(-1)[0], "dispose");
});


test("missing local sample detail is bounded at the playback port", async () => {
  const engine = makeEngine();
  engine.play = async () => {
    throw new Error(
      "piano sample load failed: ./vendor/st-piano/samples/Fs4.wav",
    );
  };
  const port = createStudentPlaybackPort({
    playbackPlanResolver: { resolvePackage: () => plan() },
    engine,
  });

  await assert.rejects(
    () => port.playPackage(pkg()),
    /^Error: playback operation failed$/,
  );
});


test("failed active tempo change does not commit a hidden tempo selection", async () => {
  const engine = makeEngine();
  const work = pkg("pkg-a", { allowTempoChange: true });
  const port = createStudentPlaybackPort({
    playbackPlanResolver: { resolvePackage: () => plan() },
    engine,
  });

  port.setTempoForPackage(work, 90);
  await port.playPackage(work);

  engine.setTempo = () => {
    throw new Error("tempo engine failure");
  };

  assert.throws(
    () => port.setTempoForPackage(work, 80),
    /^Error: tempo operation failed$/,
  );

  engine.setTempo = (value) => {
    engine.calls.push(["tempo", value]);
  };
  await port.playPackage(work);

  const playCalls = engine.calls.filter(([name]) => name === "play");
  assert.equal(playCalls.at(-1)[1].tempoBpm, 90);
});

test("failed active repeat change does not commit hidden repeat state", async () => {
  const engine = makeEngine();
  const work = pkg("pkg-a", { allowMeasureRepeat: true });
  const port = createStudentPlaybackPort({
    playbackPlanResolver: { resolvePackage: () => plan() },
    engine,
  });

  await port.playPackage(work);
  engine.setMeasureRepeatEnabled = () => {
    throw new Error("repeat engine failure");
  };

  assert.throws(
    () => port.setMeasureRepeatEnabledForPackage(work, true),
    /^Error: measure repeat operation failed$/,
  );

  engine.setMeasureRepeatEnabled = (value) => {
    engine.calls.push(["repeat", value]);
  };
  await port.playPackage(work);

  assert.equal(
    engine.calls.some(([name, value]) => name === "repeat" && value === true),
    false,
  );
});


test("late async tempo success cannot restore disposed package selection", async () => {
  const engine = makeEngine();
  const work = pkg("pkg-a", { allowTempoChange: true });
  let resolveTempo;
  const tempoGate = new Promise((resolve) => {
    resolveTempo = resolve;
  });
  const port = createStudentPlaybackPort({
    playbackPlanResolver: { resolvePackage: () => plan() },
    engine,
  });

  await port.playPackage(work);
  engine.setTempo = () => tempoGate;

  const pending = port.setTempoForPackage(work, 80);
  port.disposePackage(work);
  resolveTempo();
  await pending;

  engine.setTempo = (value) => {
    engine.calls.push(["tempo", value]);
  };
  await port.playPackage(work);

  const playCalls = engine.calls.filter(([name]) => name === "play");
  assert.equal(playCalls.at(-1)[1].tempoBpm, 120);
});


test("preparePackage restores playback availability after audio runtime recovery", async () => {
  let supported = false;
  const engine = makeEngine({ supported: false });
  engine.isSupported = () => {
    engine.calls.push(["isSupported"]);
    return supported;
  };
  engine.prepare = async () => {
    engine.calls.push(["prepare"]);
    supported = true;
    return true;
  };

  const port = createStudentPlaybackPort({
    playbackPlanResolver: {
      resolvePackage: (value) => plan(value.packageId),
    },
    engine,
  });
  const work = pkg();

  assert.equal(port.canPlayPackage(work), false);
  assert.equal(await port.preparePackage(work), true);
  assert.equal(port.canPlayPackage(work), true);
  assert.equal(
    engine.calls.some(([name]) => name === "prepare"),
    true,
  );
});
