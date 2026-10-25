import { childrenNamed, firstChildNamed, elementChildren, localNameOf, textOf } from './musicXmlPlaybackDom.js';

// Musical policy for symbols; numeric MusicXML values are percentages of MIDI forte=90.
const SYMBOLS = Object.freeze({pp:32,p:48,mp:64,mf:80,f:90,ff:112});
function numeric(node) {
  const raw=node?.getAttribute?.('dynamics');
  if(typeof raw!=='string'||!raw.trim()) return undefined;
  const n=Number(raw);
  return Number.isFinite(n)&&n>=0 ? Math.min(127,Math.round(90*n/100))/127 : undefined;
}
function symbol(containers) {
  const marks=containers.flatMap(elementChildren);
  return marks.length===1 && Object.hasOwn(SYMBOLS,localNameOf(marks[0])) ? SYMBOLS[localNameOf(marks[0])]/127 : undefined;
}
export function noteExpression(note) {
  return numeric(note) ?? symbol(childrenNamed(note,'notations').flatMap(n=>childrenNamed(n,'dynamics')));
}
export function directionExpression(node,cursor,divisions) {
  const direct=localNameOf(node)==='sound';
  const sounds=direct?[node]:childrenNamed(node,'sound');
  const sound=sounds.find(n=>numeric(n)!==undefined)??sounds[0];
  const velocity=numeric(sound)??symbol(childrenNamed(node,'direction-type').flatMap(n=>childrenNamed(n,'dynamics')));
  if(velocity===undefined) return null;
  const soundOffset=firstChildNamed(sound,'offset');
  const visualOffset=firstChildNamed(node,'offset');
  const offset=soundOffset??(visualOffset?.getAttribute('sound')==='yes'?visualOffset:null);
  const amount=offset===null?0:Number(textOf(offset));
  if(!Number.isFinite(amount)||(amount!==0&&!(divisions>0)))return null;
  const beat=cursor+(amount===0?0:amount/divisions);
  return {beat,velocity,staff:direct?null:textOf(firstChildNamed(node,'staff'))||null,voice:direct?null:textOf(firstChildNamed(node,'voice'))||null};
}

// Index by scope, then binary-search each applicable lane. No per-note scan over the score.
export function applyExpressions(notes,events) {
  const lanes=new Map();
  const key=(part,staff,voice)=>JSON.stringify([part,staff,voice]);
  events.forEach((e,order)=>{
    if(!Number.isFinite(e.beat)||e.beat<0)return;
    const k=key(e.partId,e.staff,e.voice);
    if(!lanes.has(k))lanes.set(k,[]);
    lanes.get(k).push({...e,order,specificity:Number(e.staff!==null)+Number(e.voice!==null)});
  });
  for(const lane of lanes.values())lane.sort((a,b)=>a.beat-b.beat||a.order-b.order);
  for(const n of notes){
    let chosen=null;
    for(const staff of [null,n.expressionStaff]) for(const voice of [null,n.voice]){
      const lane=lanes.get(key(n.partId,staff,voice));if(!lane)continue;
      let lo=0,hi=lane.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(lane[mid].beat<=n.startBeat+1e-9)lo=mid+1;else hi=mid;}
      const e=lane[lo-1];if(!e)continue;
      if(!chosen||e.beat>chosen.beat+1e-9||(Math.abs(e.beat-chosen.beat)<=1e-9&&(e.specificity>chosen.specificity||(e.specificity===chosen.specificity&&e.order>chosen.order))))chosen=e;
    }
    const v=n.localVelocity??chosen?.velocity;
    if(v!==undefined)n.velocity=v;
  }
}

// FULL timing is authoritative. Enrich only an exact, unique multiset match.
export function enrichTrustedExpression(plan,compiled) {
  if(!compiled||compiled.notes.length!==plan.notes.length)return plan;
  const key=n=>JSON.stringify([n.partId,n.voice,n.measureIndex,n.midi,n.startBeat,n.durationBeats]);
  const byKey=new Map();
  for(const n of compiled.notes){const k=key(n);if(byKey.has(k))return plan;byKey.set(k,n);}
  const seen=new Set();
  for(const n of plan.notes){const k=key(n);if(seen.has(k)||!byKey.has(k))return plan;seen.add(k);}
  const notes=plan.notes.map(n=>n.velocity===undefined&&byKey.get(key(n)).velocity!==undefined?{...n,velocity:byKey.get(key(n)).velocity}:n);
  return {...plan,notes};
}
