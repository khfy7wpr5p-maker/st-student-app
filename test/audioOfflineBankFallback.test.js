import test from 'node:test';
import assert from 'node:assert/strict';
import '../vendor/st-score-audio/st-score-audio-engine.js';
import {createScoreAudioVoiceAdapter} from '../src/playback/scoreAudioVoiceAdapter.js';
const runtime=globalThis.STScoreAudioEngine;
function harness(partial=false){
 let forte=false;const starts=[],urls=[];
 const c={state:'running',currentTime:0,destination:{},async resume(){},async decodeAudioData(b){return {duration:20,url:new TextDecoder().decode(b)};},createDynamicsCompressor(){return{threshold:{},knee:{},ratio:{},attack:{},release:{},connect(){}};},createGain(){return {context:c,gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}},connect(){}};},createBufferSource(){const s={buffer:null,playbackRate:{setValueAtTime(){}},connect(){},start(){starts.push(s.buffer.url);},stop(){}};return s;}};
 const adapter=createScoreAudioVoiceAdapter({runtime,audioContextFactory:()=>c,fetchImpl:async url=>{urls.push(url);return{ok:(forte||url.endsWith('_p.wav'))&&(!partial||!url.includes('_E4_')),status:404,arrayBuffer:async()=>new TextEncoder().encode(url).buffer};}});
 return {adapter,starts,urls,enableForte(){forte=true;}};
}
test('v47 p-only sample availability survives f-bank upgrade and retries forte when available',async()=>{
 const h=harness();await h.adapter.prepare({instrumentId:'VIOLIN',pitches:[60,64]});
 const play=async suffix=>{for(const midi of [60,64])h.adapter.scheduleNote({requestId:String(midi)+suffix,sourceRevisionId:'r',instrumentId:'VIOLIN',midi,startTimeSeconds:1,durationSeconds:.5});await new Promise(r=>setImmediate(r));};
 await play('old');assert.equal(h.starts.length,2);assert.ok(h.starts.every(u=>u.endsWith('_p.wav')));
 h.enableForte();await h.adapter.prepare({instrumentId:'VIOLIN',pitches:[60,64]});await play('new');
 assert.equal(h.starts.length,4);assert.ok(h.starts.slice(2).every(u=>u.endsWith('_f.wav')));
});
test('an incomplete old bank never selects a partially prepared violin lane',async()=>{
 const h=harness(true);
 await assert.rejects(h.adapter.prepare({instrumentId:'VIOLIN',pitches:[60,64]}));
 assert.throws(()=>h.adapter.scheduleNote({instrumentId:'VIOLIN',midi:60,startTimeSeconds:1,durationSeconds:.5}));
 assert.equal(h.starts.length,0);
});
test('incomplete runtime cannot advertise or silently select a p bank with f calibration',async()=>{
 for(const missing of ['ManifestSampleProvider','SALAMANDER_GRAND_PIANO_MANIFEST','FREEPATS_CLASSICAL_GUITAR_MANIFEST','VSCO2CE_SOLO_VIOLIN_ARCO_VIB_MANIFEST']){
  const incomplete={...runtime};delete incomplete[missing];
  const a=createScoreAudioVoiceAdapter({runtime:incomplete,audioContextFactory:()=>{throw new Error('must not create context');}});
  assert.equal(a.isSupported('VIOLIN'),false);await assert.rejects(a.prepare({instrumentId:'VIOLIN',pitches:[60]}));
 }
});
