import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { compileApproximateMusicXmlPlayback } from '../src/playback/musicXmlApproximatePlayback.js';
import { validatePlaybackPlan } from '../src/playback/playbackPlan.js';
import { createPlaybackPlanResolver } from '../src/playback/playbackPlanResolver.js';
const parser = { parse: xml => new DOMParser().parseFromString(xml, 'application/xml') };
const note = (extra='',attrs='') => `<note ${attrs}><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff>${extra}</note>`;
const dir = (symbol,extra='') => `<direction><direction-type><dynamics><${symbol}/></dynamics></direction-type>${extra}</direction>`;
function pkg(parts) { return {packageId:'dynamics',content:{score:{format:'musicxml',data:`<score-partwise><part-list/>${parts}</score-partwise>`}}}; }
const part = (id,body) => `<part id="${id}"><measure number="1"><attributes><divisions>4</divisions></attributes>${body}</measure></part>`;
const compile = p => compileApproximateMusicXmlPlayback(p,{parser});

test('piano p and violin f remain independent with arbitrary part IDs and order',()=>{
 const p=pkg(part('strings',dir('f')+note())+part('keys',dir('p')+note()));
 const plan=compile(p);
 assert.equal(plan.notes.find(n=>n.partId==='strings').velocity,90/127);
 assert.equal(plan.notes.find(n=>n.partId==='keys').velocity,48/127);
 assert.equal(compile(pkg(part('old',note()))).notes[0].velocity,undefined);
});
test('numeric dynamics use forte=90, support silence and override symbols locally',()=>{
 const p=pkg(part('P',dir('p','<sound dynamics="100"/>')+note()+note('','dynamics="71"')+note('','dynamics="0"')+note()));
 assert.deepEqual(compile(p).notes.map(n=>n.velocity),[90/127,64/127,0,90/127]);
});
test('invalid numbers fall back to valid symbols and unknown compound marks retain state',()=>{
 const p=pkg(part('P',dir('p','<sound dynamics="NaN"/>')+note('','dynamics="-1"')+'<direction><direction-type><dynamics><sf/><mp/></dynamics></direction-type></direction>'+note()));
 assert.deepEqual(compile(p).notes.map(n=>n.velocity),[48/127,48/127]);
});
test('staff and voice scope follows beats across backup and later general directions',()=>{
 const p=pkg(part('P',dir('p','<staff>1</staff>')+note()+dir('f')+note()+'<backup><duration>8</duration></backup>'+note().replace('<staff>1</staff>','<staff>2</staff>').replace('<voice>1</voice>','<voice>2</voice>')+note().replace('<staff>1</staff>','<staff>2</staff>')));
 const notes=compile(p).notes;
 assert.deepEqual(notes.filter(n=>n.startBeat===0).map(n=>n.velocity),[48/127,undefined]);
 assert.ok(notes.filter(n=>n.startBeat===1).every(n=>n.velocity===90/127));
});
test('sound offsets override direction offsets and visual offsets do not shift playback',()=>{
 const p=pkg(part('P',dir('p','<offset>4</offset>')+note()+dir('f','<offset sound="yes">4</offset><sound dynamics="100"><offset>0</offset></sound>')+note()));
 assert.deepEqual(compile(p).notes.map(n=>n.velocity),[48/127,90/127]);
 const delayed=pkg(part('P',dir('f','<offset sound="yes">4</offset>')+note()+note()));
 assert.deepEqual(compile(delayed).notes.map(n=>n.velocity),[undefined,90/127]);
});
test('local notation does not persist and ties keep attack velocity',()=>{
 const tied=note('<tie type="start"/>')+dir('f')+note('<tie type="stop"/>');
 const p=pkg(part('P',dir('p')+tied+note('<notations><dynamics><ff/></dynamics></notations>')+note()));
 assert.deepEqual(compile(p).notes.map(n=>n.velocity),[48/127,112/127,90/127]);
 assert.equal(compile(p).notes[0].durationBeats,2);
});
test('plan preserves valid optional velocity and rejects nonfinite/out-of-range values',()=>{
 const base=compile(pkg(part('P',note())));
 for(const value of [0,.4,1]){
  const p={...base,notes:[{...base.notes[0],velocity:value}]};
  assert.equal(validatePlaybackPlan(p,{packageId:p.packageId}).plan.notes[0].velocity,value);
 }
 for(const value of [-.1,1.1,NaN,Infinity,'0.5',null]){
  const p={...base,notes:[{...base.notes[0],velocity:value}]};
  assert.equal(validatePlaybackPlan(p,{packageId:p.packageId}).ok,false);
 }
});
test('FULL expression enrichment requires exact provenance and unique matching, preserving producer velocity',()=>{
 const p=pkg(part('P',dir('p')+note()));const approximate=compile(p);
 const full={...approximate,quality:'FULL',notes:approximate.notes.map(({velocity,...n})=>n)};
 const resolve=(plan,provenance)=>createPlaybackPlanResolver({trustedTimingProvider:{resolveTrustedPlan:()=>plan,resolveTrustedProvenance:()=>provenance},approximateCompiler:compile}).resolvePackage(p);
 const provenance={kind:'EXACT_SCORE_SOURCE',musicXml:p.content.score.data};
 assert.equal(resolve(full,provenance).notes[0].velocity,48/127);
 assert.equal(resolve(full,null).notes[0].velocity,undefined);
 assert.equal(resolve({...full,notes:[{...full.notes[0],midi:61}]},provenance).notes[0].velocity,undefined);
 assert.equal(resolve({...full,notes:[{...full.notes[0],velocity:.9}]},provenance).notes[0].velocity,.9);
});
