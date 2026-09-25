import { renderStudentApp } from "./src/ui/renderStudentApp.js";
import { createNotationRuntimeLoader } from "./src/practice/notationRuntimeLoader.js";
import { createStNotationAdapter } from "./src/practice/notationAdapter.js";

const MUSICXML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<score-partwise version="3.1">',
  '<part-list><score-part id="P1"><part-name>Guitar TAB</part-name></score-part></part-list>',
  '<part id="P1"><measure number="1"><attributes>',
  '<divisions>1</divisions><key><fifths>0</fifths></key>',
  '<time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>',
  '<clef number="1"><sign>G</sign><line>2</line></clef>',
  '<clef number="2"><sign>TAB</sign><line>5</line></clef>',
  '<staff-details number="2"><staff-lines>6</staff-lines>',
  '<staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>',
  '<staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>',
  '<staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>',
  '<staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>',
  '<staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>',
  '<staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>',
  '</staff-details></attributes>',
  '<note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>',
  '<note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>',
  '<backup><duration>4</duration></backup>',
  '<note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><voice>5</voice><type>half</type><staff>2</staff><notations><technical><string>1</string><fret>7</fret></technical></notations></note>',
  '<note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>5</voice><type>half</type><staff>2</staff><notations><technical><string>1</string><fret>12</fret></technical></notations></note>',
  '</measure></part></score-partwise>',
].join("");

function chordModel(id, symbol, root, frets, teacherNote) {
  return Object.freeze({
    assignmentId: id,
    packageId: id,
    title: symbol + " Akor çalışması",
    teacherNote,
    chord: Object.freeze({ displaySymbol: symbol, displayRoot: root }),
    strings: Object.freeze(frets.map((fret, index) => Object.freeze({
      stringNumber: 6 - index,
      fret,
      state: fret < 0 ? "MUTED" : fret === 0 ? "OPEN" : "FRETTED",
      finger: fret < 1 ? 0 : Math.min(fret, 4),
    }))),
    barres: Object.freeze([]),
    offlineAvailable: true,
    offlineSaveFailed: false,
  });
}

const chords = Object.freeze([
  chordModel("demo-am", "Am", "A", [-1, 0, 2, 2, 1, 0], "Sesleri tek tek kontrol et."),
  chordModel("demo-c", "C", "C", [-1, 3, 2, 0, 1, 0], "Bileğini rahat tut."),
]);

const practice = Object.freeze({
  packageId: "demo-score-tab",
  title: "Gitar etüdü",
  capabilities: Object.freeze({
    notation: "AVAILABLE",
    guitarTab: "AVAILABLE",
    playback: "UNAVAILABLE",
    tempoChange: "UNAVAILABLE",
    measureRepeat: "UNAVAILABLE",
  }),
  practice: Object.freeze({ tempoBpm: 80 }),
});

const pieceWorkspace = {
  pieceAssignmentId: "demo-piece",
  pieceId: "demo-piece",
  arrangementId: "demo-arrangement",
  title: "Gitar etüdü — Nota ve TAB",
  teacherNote: "Nota ve TAB satırları birlikte gösteriliyor. Örnek perdeler: 7 ve 12.",
  folderState: "ACTIVE",
  selectedView: "SCORE",
  selectedChordId: "demo-am",
  availableViews: Object.freeze({ score: true, tab: true, chords: true }),
  score: Object.freeze({ status: "AVAILABLE", practice }),
  chords: Object.freeze({ status: "AVAILABLE", items: chords }),
};

const assignments = Object.freeze([
  Object.freeze({
    itemKind: "PIECE",
    pieceAssignmentId: "demo-piece",
    pieceId: "demo-piece",
    arrangementId: "demo-arrangement",
    title: "Gitar etüdü — Nota ve TAB",
    teacherNote: "Nota ve TAB örneği",
    state: "ACTIVE",
    assignedAt: "2026-09-25",
  }),
  Object.freeze({
    assignmentId: "demo-am",
    title: "Am Akor çalışması",
    practiceType: "CHORD_BOARD",
    teacherNote: "Am akor diyagramını aç.",
    state: "ACTIVE",
    assignedAt: "2026-09-25",
  }),
]);

const listState = {
  screen: "my_work",
  student08: true,
  session: Object.freeze({ studentId: "preview-student" }),
  items: assignments,
  assignmentState: "ACTIVE",
  practice: null,
  chordBoard: null,
};
const pieceState = {
  screen: "piece_workspace",
  student08: true,
  session: listState.session,
  items: assignments,
  practice: null,
  chordBoard: null,
  pieceWorkspace,
};
let state = pieceState;

document.title = "ST Student — güncel arayüz önizlemesi";
const root = document.querySelector("#app");
const shell = document.createElement("div");
shell.className = "latest-demo-shell";
const sidebar = document.createElement("aside");
sidebar.className = "latest-demo-folders";
sidebar.setAttribute("aria-label", "Çalışma klasörleri");
sidebar.innerHTML = [
  "<p class='latest-demo-kicker'>ST STUDENT</p>",
  "<h1>Çalışmalar</h1>",
  "<p class='latest-demo-caption'>Güncel arayüz · örnek içerik</p>",
  "<nav aria-label='Klasörler'>",
  "<p class='latest-demo-folder'>📁 Aktif çalışmalar</p>",
  "<button type='button' class='latest-demo-work is-selected' data-demo-action='open-piece'>Gitar etüdü · Nota / TAB</button>",
  "<button type='button' class='latest-demo-work' data-demo-action='open-chord'>Akorlar · Am / C</button>",
  "</nav>",
  "<p class='latest-demo-footnote'>Gösterim için örnek nota/TAB ve akor verisi kullanılıyor.</p>",
].join("");

const style = document.createElement("style");
style.textContent = [
  ".latest-demo-shell{width:min(100%,88rem);margin:0 auto;padding:1rem;display:grid;grid-template-columns:minmax(13rem,25%) minmax(0,1fr);gap:1rem;align-items:start}",
  ".latest-demo-folders{position:sticky;top:1rem;min-height:70vh;padding:1rem;background:var(--st-sidebar,#f3f6fa);border:1px solid var(--st-border,#d8dee8);border-radius:1rem}",
  ".latest-demo-folders h1{font-size:1.35rem;margin:.25rem 0 .5rem}",
  ".latest-demo-kicker{font-size:.75rem;letter-spacing:.1em;font-weight:700;color:var(--st-text-muted,#667085)}",
  ".latest-demo-caption,.latest-demo-footnote{font-size:.9rem;color:var(--st-text-muted,#667085);margin:0 0 1rem}",
  ".latest-demo-folders nav{display:grid;gap:.45rem;margin-top:1rem}",
  ".latest-demo-folder,.latest-demo-work{width:100%;text-align:left;border:1px solid transparent;border-radius:.65rem;padding:.75rem;background:transparent;color:var(--st-text,#1f2937);font:inherit;overflow-wrap:anywhere}",
  ".latest-demo-work{cursor:pointer}",
  ".latest-demo-work{padding-left:1.4rem}",
  ".latest-demo-work.is-selected,.latest-demo-folder:hover,.latest-demo-work:hover{background:#fff;border-color:var(--st-border,#d8dee8)}",
  ".latest-demo-footnote{margin-top:1.5rem}",
  "#app{width:100%;max-width:none;margin:0;padding:0}",
  "@media(max-width:640px){.latest-demo-shell{grid-template-columns:1fr;padding:.5rem;gap:.5rem}.latest-demo-folders{position:static;min-height:0;padding:.75rem}.latest-demo-folders nav{grid-template-columns:1fr 1fr;gap:.25rem}.latest-demo-work{padding-left:.75rem}.latest-demo-footnote{margin:.5rem 0 0}}",
].join("");

document.head.append(style);
root.before(shell);
shell.append(sidebar, root);

const runtimeLoader = createNotationRuntimeLoader({
  bootstrapUrl: "./vendor/st-score-runtime/browser-bootstrap.mjs",
  vendorUrl: "./vendor/st-score-runtime/vendor/opensheetmusicdisplay.min.js",
});
const notationAdapter = createStNotationAdapter({ runtimeLoader });
let renderToken = 0;

async function render() {
  const token = ++renderToken;
  const persistentScoreRoot = root.querySelector("#st-score-root");
  if (persistentScoreRoot) persistentScoreRoot.remove();
  root.innerHTML = renderStudentApp(state, {
    connectivityState: "ONLINE",
    status: "Örnek eser · canlı öğrenci verisi kullanılmıyor",
  });

  if (state.screen !== "piece_workspace") return;

  let target = root.querySelector("#st-score-root");
  if (persistentScoreRoot && target) {
    target.replaceWith(persistentScoreRoot);
    target = persistentScoreRoot;
  }
  if (!target) return;
  target.textContent = "Nota ve TAB yükleniyor…";

  const result = await notationAdapter.render({ musicXml: MUSICXML });
  if (token !== renderToken) return;
  if (result.capability !== "AVAILABLE") {
    const currentTarget = root.querySelector("#st-score-root");
    if (currentTarget) currentTarget.textContent = "Nota/TAB bu önizlemede yüklenemedi.";
  }
}

shell.addEventListener("click", async (event) => {
  const demoButton = event.target.closest("[data-demo-action]");
  if (demoButton) {
    const action = demoButton.dataset.demoAction;
    if (action === "open-piece") {
      state = pieceState;
      await render();
    } else if (action === "open-chord") {
      pieceWorkspace.selectedView = "CHORDS";
      state = pieceState;
      await render();
    }
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  if (actionButton.dataset.action === "select-piece-view") {
    pieceWorkspace.selectedView = actionButton.dataset.pieceView;
    await render();
  } else if (actionButton.dataset.action === "select-piece-chord") {
    pieceWorkspace.selectedChordId = actionButton.dataset.assignmentId;
    await render();
  } else if (actionButton.dataset.action === "back-from-piece") {
    state = pieceState;
    pieceWorkspace.selectedView = "SCORE";
    await render();
  } else if (actionButton.dataset.action === "open-piece") {
    state = pieceState;
    await render();
  } else if (actionButton.dataset.action === "open-assignment") {
    pieceWorkspace.selectedView = "CHORDS";
    state = pieceState;
    await render();
  } else if (actionButton.dataset.action === "show-my-work") {
    state = pieceState;
    await render();
  }
});

await render();
