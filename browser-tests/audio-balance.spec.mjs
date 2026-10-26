import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright';
import {startRepositoryStaticServer} from './support/static-server.mjs';

test('native audio renders XML p/f, zero velocity and 72-voice overload protection', {timeout:120000}, async()=>{
 const server=await startRepositoryStaticServer();let browser;
 try{
  browser=await ({chromium,webkit}[process.env.ST_BROWSER??'chromium']).launch({headless:true,...(process.env.ST_BROWSER_EXECUTABLE_PATH?{executablePath:process.env.ST_BROWSER_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage();const fetched=[];
  if(process.env.ST_AUDIO_SAMPLE_DIRECTORY){
   const root=process.env.ST_AUDIO_SAMPLE_DIRECTORY;
   const assets=JSON.parse(await readFile(root+'/production-root-inputs.json','utf8'));
   const byUrl=new Map(assets.map(a=>[a.url,a.path]));
   await page.route('https://raw.githubusercontent.com/**',async route=>{
    const url=route.request().url();const path=byUrl.get(url);fetched.push(url);
    if(!path){await route.abort();return;}
    await route.fulfill({status:200,body:await readFile(path),headers:{'access-control-allow-origin':'*'}});
   });
  }
  await page.route('**/src/ui/main.js', route=>route.fulfill({contentType:'application/javascript',body:''}));
  await page.goto(server.baseUrl+'/index.html');
  await page.addScriptTag({url:server.baseUrl+'/vendor/st-score-audio/st-score-audio-engine.js'}).catch(async error=>{
   if(!await page.evaluate(()=>Boolean(globalThis.STScoreAudioEngine)))throw error;
  });
  const result=await page.evaluate(async()=>{
   const {createScoreAudioVoiceAdapter}=await import('/src/playback/scoreAudioVoiceAdapter.js');
   const {compileApproximateMusicXmlPlayback}=await import('/src/playback/musicXmlApproximatePlayback.js');
   async function render(mark,{dense=false}={}){
    const c=new OfflineAudioContext(2,44100,44100);
    // Offline rendering has no user gesture. Only the unlock-state getter is overridden;
    // all decoders, nodes, parameter automation, summing and compression are native.
    Object.defineProperty(c,'state',{get:()=> 'running'});
    const adapter=createScoreAudioVoiceAdapter({runtime:globalThis.STScoreAudioEngine,audioContextFactory:()=>c});
    const instruments=dense?['VIOLIN','GRAND_PIANO','CLASSICAL_GUITAR']:['VIOLIN'];
    for(const instrumentId of instruments)await adapter.prepare({instrumentId,pitches:[60]});
    const xml=`<score-partwise><part-list/><part id="lead"><measure number="1"><attributes><divisions>1</divisions></attributes><direction><direction-type><dynamics><${mark}/></dynamics></direction-type></direction><note ${mark==='zero'?'dynamics="0"':''}><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note></measure></part></score-partwise>`;
    const plan=compileApproximateMusicXmlPlayback({packageId:'native',content:{score:{format:'musicxml',data:xml}}});
    const velocity=dense?1:plan.notes[0].velocity;
    for(const instrumentId of instruments)for(let i=0;i<(dense?24:1);i++)adapter.scheduleNote({requestId:instrumentId+i,sourceRevisionId:'native',instrumentId,midi:60,startTimeSeconds:.01,durationSeconds:.5,velocity});
    // scheduleNote resolves decoded data asynchronously; drain tasks before rendering.
    await new Promise(resolve=>setTimeout(resolve,50));
    const buffer=await c.startRendering();let peak=0,power=0;
    for(let ch=0;ch<2;ch++){const x=buffer.getChannelData(ch);for(const v of x){peak=Math.max(peak,Math.abs(v));power+=v*v;}}
    return {rms:Math.sqrt(power/(buffer.length*2)),peak,velocity};
   }
   return {p:await render('p'),f:await render('f'),zero:await render('zero'),dense:await render('ff',{dense:true})};
  });
  assert.ok(result.p.rms>0);assert.ok(Math.abs(result.f.rms/result.p.rms-90/48)<.02,JSON.stringify(result));
  assert.equal(result.zero.peak,0);
  assert.ok(result.dense.peak>0&&result.dense.peak<Math.SQRT1_2,JSON.stringify(result));
  if(fetched.length)assert.ok(fetched.filter(u=>u.includes('Solo%20Violin')).every(u=>u.endsWith('_f.wav')));
  console.log('Native audio measurement',JSON.stringify(result));
 }finally{await browser?.close();await server.close();}
});
