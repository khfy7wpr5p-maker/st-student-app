export const PIECE_WORKSPACE_VIEWS = Object.freeze({
  SCORE: "SCORE",
  CHORDS: "CHORDS",
});

function freezeReturnContext(value = {}) {
  const folderState =
    typeof value.folderState === "string" &&
    value.folderState.length > 0
      ? value.folderState
      : "ACTIVE";
  const scrollPosition =
    Number.isFinite(value.scrollPosition) &&
    value.scrollPosition >= 0
      ? value.scrollPosition
      : 0;

  return Object.freeze({
    folderState,
    scrollPosition,
  });
}

export function createPieceWorkspaceViewModel({
  piece,
  scorePractice = null,
  chordItems = [],
  returnContext,
} = {}) {
  if (
    piece === null ||
    typeof piece !== "object" ||
    typeof piece.pieceAssignmentId !== "string"
  ) {
    throw new TypeError(
      "validated Piece manifest required",
    );
  }

  const chords = Object.freeze([
    ...chordItems,
  ]);
  const scoreAvailable =
    scorePractice !== null;
  const chordsAvailable =
    chords.length > 0;

  if (
    !scoreAvailable &&
    !chordsAvailable
  ) {
    throw new Error(
      "Piece content unavailable",
    );
  }

  return Object.freeze({
    pieceAssignmentId:
      piece.pieceAssignmentId,
    pieceId: piece.pieceId,
    arrangementId:
      piece.arrangementId,
    title: piece.title,
    teacherNote: piece.teacherNote,
    folderState: piece.state,
    selectedView:
      scoreAvailable
        ? PIECE_WORKSPACE_VIEWS.SCORE
        : PIECE_WORKSPACE_VIEWS.CHORDS,
    selectedChordId:
      chordsAvailable
        ? chords[0].packageId
        : null,
    availableViews: Object.freeze({
      score: scoreAvailable,
      chords: chordsAvailable,
    }),
    returnContext:
      freezeReturnContext(
        returnContext,
      ),
    score: Object.freeze({
      status:
        scoreAvailable
          ? "AVAILABLE"
          : "UNAVAILABLE",
      practice: scorePractice,
    }),
    chords: Object.freeze({
      status:
        chordsAvailable
          ? "AVAILABLE"
          : "UNAVAILABLE",
      items: chords,
    }),
  });
}

export function withPieceSelectedView(
  workspace,
  view,
) {
  if (
    !Object.values(
      PIECE_WORKSPACE_VIEWS,
    ).includes(view)
  ) {
    throw new TypeError(
      "Piece view is invalid",
    );
  }

  const available =
    view === PIECE_WORKSPACE_VIEWS.SCORE
      ? workspace.availableViews.score
      : workspace.availableViews.chords;

  if (!available) {
    throw new Error(
      "Piece view unavailable",
    );
  }

  return Object.freeze({
    ...workspace,
    selectedView: view,
  });
}

export function withPieceSelectedChord(
  workspace,
  assignmentId,
) {
  if (
    typeof assignmentId !== "string" ||
    assignmentId.trim().length === 0
  ) {
    throw new TypeError(
      "chord assignment id required",
    );
  }

  const id = assignmentId.trim();
  if (
    !workspace.chords.items.some(
      (item) =>
        item.packageId === id,
    )
  ) {
    throw new Error(
      "Piece chord unavailable",
    );
  }

  return Object.freeze({
    ...workspace,
    selectedChordId: id,
  });
}

export function withPieceScorePractice(
  workspace,
  practice,
) {
  return Object.freeze({
    ...workspace,
    score: Object.freeze({
      ...workspace.score,
      practice,
    }),
  });
}
