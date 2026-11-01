import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { renderChordDiagramSvg } from '../src/ui/chordDiagramSvg.js';
import { createChordBoardViewModel } from '../src/ui/chordBoardViewModel.js';
import { renderStudentApp } from '../src/ui/renderStudentApp.js';
import { makeChordBoardPracticeItem } from './support/chordBoardFixtures.js';

function view(frets=[-1,3,2,0,1,0],fingers=[-1,3,2,0,1,0],barres=[]) {
  return {chord:{displaySymbol:'C'},strings:frets.map((fret,i)=>({stringNumber:6-i,fret,finger:fingers[i]})),barres};
}
function documentFor(svg) {
  return new DOMParser().parseFromString(`<div xmlns="http://www.w3.org/1999/xhtml">${svg}</div>`,'text/xml');
}
function labels(doc,name) {
  return [...doc.getElementsByTagName('text')].filter(n=>n.getAttribute('class').split(' ').includes(name)).map(n=>n.textContent);
}

test('Student chord diagram shows bass-to-treble string labels and actual first-position frets',()=>{
  const doc=documentFor(renderChordDiagramSvg(view()));
  assert.deepEqual(labels(doc,'string-number'),['6','5','4','3','2','1']);
  assert.deepEqual(labels(doc,'fret-number'),['1','2','3','4','5']);
});

test('Student fifth-position chord labels actual frets and preserves exact fingers/barre',()=>{
  const data=view([5,7,7,6,5,5],[1,3,4,2,1,1],[{finger:1,fret:5,fromString:6,toString:1}]);
  const before=JSON.stringify(data);
  const svg=renderChordDiagramSvg(data);
  assert.deepEqual(labels(documentFor(svg),'fret-number'),['5','6','7','8','9']);
  assert.doesNotMatch(svg,/class="fret-line nut-line"/);
  assert.match(svg,/data-fret="5" data-from-string="6" data-to-string="1"/);
  assert.equal(JSON.stringify(data),before);
});

test('coexisting Student chord SVGs have unique local material IDs with no remote resources',()=>{
  const sameView=view();
  const first=renderChordDiagramSvg(sameView);
  const second=renderChordDiagramSvg(sameView);
  const all=[...(`${first}${second}`).matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.ok(all.length>10,'material resources are defined');
  assert.equal(new Set(all).size,all.length);
  for(const svg of [first,second]) {
    const own=new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
    const refs=[...svg.matchAll(/url\(#([^\)]+)\)/g)].map(m=>m[1]);
    assert.ok(refs.length>6);
    for(const ref of refs)assert.ok(own.has(ref),`resource ${ref} belongs to its own SVG`);
    assert.doesNotMatch(svg,/<image\b|https?:\/\/|<animate\b/);
  }
});

test('no-op Student paints keep the same immutable chord markup without sharing resources between routes',()=>{
  const chordBoard=createChordBoardViewModel(makeChordBoardPracticeItem());
  const common={student08:true,session:{studentId:'material-fixture'},items:[],practice:null};
  const states=[
    {...common,screen:'chord_board',chordBoard},
    {...common,screen:'piece_workspace',pieceWorkspace:{
      pieceAssignmentId:'material-piece',title:'Akor',teacherNote:'',selectedView:'CHORDS',
      selectedChordId:chordBoard.assignmentId,availableViews:{score:false,chords:true},
      score:{status:'UNAVAILABLE',practice:null},chords:{status:'AVAILABLE',items:[chordBoard]},
    }},
  ];
  const rendered=states.map(state=>{
    const first=renderStudentApp(state);
    assert.equal(first===renderStudentApp(state),true,'unchanged markup must preserve mountStudentApp no-op paints and transient controls');
    return first;
  });
  const materialIds=rendered.flatMap(html=>[...html.matchAll(/\bid="(student-chord-[^"]+)"/g)].map(match=>match[1]));
  assert.equal(materialIds.length,new Set(materialIds).size,'standalone and Piece own different SVG instances even for the same snapshot');
});
