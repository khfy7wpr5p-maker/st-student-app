import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { AUDIO_CALIBRATION, AUDIO_MASTER_GAIN } from '../src/playback/audioCalibration.js';
test('calibration covers every qualified sample root with bounded immutable gains and no trimming',async()=>{
 const sandbox={};vm.runInNewContext(await readFile(new URL('../vendor/st-score-audio/st-score-audio-engine.js',import.meta.url),'utf8'),sandbox);
 const runtime=sandbox.STScoreAudioEngine;
 for(const manifest of [runtime.SALAMANDER_GRAND_PIANO_MANIFEST,runtime.FREEPATS_CLASSICAL_GUITAR_MANIFEST,runtime.VSCO2CE_SOLO_VIOLIN_ARCO_VIB_MANIFEST]){
  const profile=AUDIO_CALIBRATION[manifest.instrumentId];
  assert.deepEqual(profile.samples.map(s=>s.rootMidi),Array.from(manifest.samples,s=>s.rootMidi));
  assert.ok(Object.isFrozen(profile));assert.ok(Object.isFrozen(profile.samples));
  for(const s of profile.samples){assert.ok(s.gain>0&&s.gain<=16);assert.equal(s.offsetSeconds,0);assert.ok(Object.isFrozen(s));}
 }
 assert.ok(AUDIO_MASTER_GAIN>0&&AUDIO_MASTER_GAIN<1);
});
