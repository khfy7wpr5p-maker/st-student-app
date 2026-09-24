import { createStudentSession } from "./src/auth/session.js";
import { createSecureDeliveryStudent08ReadService } from "./src/sharing/secureDeliveryStudent08ReadService.js";
import { createStNotationAdapter } from "./src/practice/notationAdapter.js";
import { createNotationRuntimeLoader } from "./src/practice/notationRuntimeLoader.js";
import { createPlaybackPlanResolver } from "./src/playback/playbackPlanResolver.js";
import { createPianoSampleBank } from "./src/playback/pianoSampleBank.js";
import { createWebAudioPianoEngine } from "./src/playback/webAudioPianoEngine.js";
import { createStudentPlaybackPort } from "./src/playback/studentPlaybackPort.js";
import { createStudentAppController } from "./src/ui/studentAppController.js";
import { mountStudentApp } from "./src/ui/mountStudentApp.js";
import { registerStudentAppServiceWorker } from "./src/offline/serviceWorkerRegistration.js";

const STUDENT_ID = "piece-preview-student";
const ASSIGNED_AT = "2026-09-24T10:00:00Z";

function musicXml(sequence) {
  const measures = [];
  for (let m = 0; m < 4; m += 1) {
    const notes = sequence.slice(m * 4, m * 4 + 4).map(([step, octave]) =>
      `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration><type>quarter</type></note>`
    ).join("");
    measures.push(
      `<measure number="${m + 1}">${m === 0 ? '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' : ""}${notes}</measure>`
    );
  }
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>' +
    '<part id="P1">' + measures.join("") + '</part></score-partwise>';
}

function scorePackage({ packageId, workId, title, sequence }) {
  return {
    schemaVersion: "1.0.0",
    packageId,
    workId,
    title,
    approvedRevision: {
      revisionId: `rev-${packageId}`,
      state: "teacher_approved",
      approvedAt: ASSIGNED_AT,
    },
    publication: {
      scope: "student_private",
      recipientStudentId: STUDENT_ID,
    },
    content: {
      score: {
        format: "musicxml",
        data: musicXml(sequence),
      },
      canonicalEvents: [],
    },
    practice: {
      tempoBpm: 80,
      allowTempoChange: true,
      allowMeasureRepeat: true,
      ttsLanguage: "tr-TR",
    },
  };
}

function scoreRow({ assignmentId, packageId, workId, title, sequence }) {
  return {
    deliveryId: assignmentId,
    assignmentId,
    packageId,
    practiceType: "SCORE",
    teacherNote: "Önce notayı incele, sonra dinle.",
    state: "ACTIVE",
    assignedAt: ASSIGNED_AT,
    deliveredAt: "2026-09-24T10:01:00Z",
    package: scorePackage({ packageId, workId, title, sequence }),
  };
}

function chordRow({ assignmentId, symbol, root, quality, frets, fingers, barres = [], shape = "open" }) {
  const teacherNote = `${symbol} akorunu temiz seslerle çalış.`;
  return {
    deliveryId: assignmentId,
    assignmentId,
    packageId: assignmentId,
    practiceType: "CHORD_BOARD",
    teacherNote,
    state: "ACTIVE",
    assignedAt: ASSIGNED_AT,
    deliveredAt: "2026-09-24T10:01:00Z",
    package: {
      schemaVersion: "1.0.0",
      packageType: "CHORD_BOARD",
      packageId: assignmentId,
      title: `${symbol} Akoru`,
      assignmentAuthority: {
        assignmentId,
        state: "teacher_assigned",
        assignedAt: ASSIGNED_AT,
      },
      publication: {
        scope: "student_private",
        recipientStudentId: STUDENT_ID,
      },
      content: {
        chordBoard: {
          schemaVersion: 1,
          sourceKind: "chord_board_exact_voicing",
          chord: {
            canonicalSymbol: symbol,
            canonicalRoot: root,
            quality,
            displayRoot: root,
            displaySymbol: symbol,
          },
          voicing: {
            frets,
            fingers,
            barres,
            shape,
            generated: false,
            curated: true,
          },
          provenance: {
            sourceRepository: "st-guitar-chord-board",
            sourceCommit: "preview-fixture",
            catalogFingerprint: "a".repeat(64),
          },
          voicingFingerprint: "b".repeat(64),
        },
      },
      practice: { teacherNote },
    },
  };
}

const cambazSequence = [
  ["C",4],["D",4],["E",4],["G",4],
  ["G",4],["E",4],["D",4],["C",4],
  ["E",4],["F",4],["G",4],["A",4],
  ["A",4],["G",4],["E",4],["C",4],
];
const fikriminSequence = [
  ["E",4],["F",4],["G",4],["A",4],
  ["B",4],["A",4],["G",4],["F",4],
  ["D",4],["E",4],["F",4],["G",4],
  ["G",4],["F",4],["E",4],["D",4],
];

const rows = [
  scoreRow({ assignmentId:"score-cambaz", packageId:"pkg-score-cambaz", workId:"work-cambaz", title:"Cambaz", sequence:cambazSequence }),
  chordRow({ assignmentId:"chord-cambaz-am", symbol:"Am", root:"A", quality:"minor", frets:[-1,0,2,2,1,0], fingers:[-1,0,2,3,1,0] }),
  chordRow({ assignmentId:"chord-cambaz-f", symbol:"F", root:"F", quality:"major", frets:[1,3,3,2,1,1], fingers:[1,3,4,2,1,1], barres:[{finger:1,fret:1,fromString:6,toString:1}], shape:"barre" }),
  scoreRow({ assignmentId:"score-fikrimin", packageId:"pkg-score-fikrimin", workId:"work-fikrimin", title:"Fikrimin İnce Gülü", sequence:fikriminSequence }),
  chordRow({ assignmentId:"chord-fikrimin-dm", symbol:"Dm", root:"D", quality:"minor", frets:[-1,-1,0,2,3,1], fingers:[-1,-1,0,2,3,1] }),
];

const pieces = [
  {
    schemaVersion:"1.0.0",
    pieceAssignmentId:"piece-cambaz",
    pieceId:"work-cambaz",
    arrangementId:"guitar-standard",
    title:"Cambaz",
    teacherNote:"Nota ve akorları aynı çalışma alanında kullan.",
    state:"ACTIVE",
    assignedAt:ASSIGNED_AT,
    contentRefs:{ scoreAssignmentId:"score-cambaz", chordAssignmentIds:["chord-cambaz-am","chord-cambaz-f"] },
  },
  {
    schemaVersion:"1.0.0",
    pieceAssignmentId:"piece-fikrimin",
    pieceId:"work-fikrimin",
    arrangementId:"guitar-standard",
    title:"Fikrimin İnce Gülü",
    teacherNote:"İkinci eser aynı Piece Workspace kabuğunu kullanır.",
    state:"ACTIVE",
    assignedAt:ASSIGNED_AT,
    contentRefs:{ scoreAssignmentId:"score-fikrimin", chordAssignmentIds:["chord-fikrimin-dm"] },
  },
];

const byAssignment = new Map(rows.map((row) => [row.assignmentId, row]));
const byPiece = new Map(pieces.map((piece) => [piece.pieceAssignmentId, piece]));
const apiClient = {
  async listStudentPool() { return []; },
  async listStudentAssignments() { return rows; },
  async getStudentAssignment(id) {
    const row = byAssignment.get(id);
    if (!row) throw new Error("preview assignment unavailable");
    return row;
  },
  async listStudentPieces() { return pieces; },
  async getStudentPiece(id) {
    const piece = byPiece.get(id);
    if (!piece) throw new Error("preview Piece unavailable");
    return piece;
  },
};

const readService = createSecureDeliveryStudent08ReadService({ apiClient });
const runtimeLoader = createNotationRuntimeLoader({
  bootstrapUrl: "./vendor/st-score-runtime/browser-bootstrap.mjs",
  vendorUrl: "./vendor/st-score-runtime/vendor/opensheetmusicdisplay.min.js",
});
const notationAdapter = createStNotationAdapter({ runtimeLoader });
const sampleBank = createPianoSampleBank({ manifestUrl: "./vendor/st-piano/runtime-manifest.json" });
await sampleBank.initialize().catch(() => false);

const audioContextSupported =
  typeof (globalThis.AudioContext ?? globalThis.webkitAudioContext) === "function";
const audioContextFactory = () => {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return typeof Ctor === "function" ? new Ctor() : null;
};
const playbackPort = createStudentPlaybackPort({
  playbackPlanResolver: createPlaybackPlanResolver(),
  engine: createWebAudioPianoEngine({ audioContextFactory, audioContextSupported, sampleBank }),
});

const controller = createStudentAppController({
  sharingService: {},
  student08ReadService: readService,
  initialSession: createStudentSession({ studentId: STUDENT_ID }),
  notationAdapter,
  playbackPort,
  syncCoordinator: null,
});

await controller.showMyWork("ACTIVE");

const banner = document.createElement("div");
banner.setAttribute("role", "status");
banner.style.cssText = "position:sticky;top:0;z-index:1000;padding:.5rem .75rem;background:#fff3cd;border-bottom:1px solid #d6b656;font:600 14px system-ui;text-align:center";
banner.textContent = "UI-only Piece preview · Production değildir · bounded fixture";
document.body.prepend(banner);

const mounted = mountStudentApp({
  root: document.querySelector("#app"),
  controller,
  notationAdapter,
  async requestSignIn() { return createStudentSession({ studentId: STUDENT_ID }); },
  async requestSignOut() {},
});
await mounted.render();
registerStudentAppServiceWorker().catch(() => {});
