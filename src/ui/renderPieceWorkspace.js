import { escapeHtml } from "./escapeHtml.js";
import {
  PIECE_WORKSPACE_VIEWS,
} from "./pieceWorkspaceViewModel.js";
import {
  renderChordBoardWorkspace,
} from "./renderChordBoardWorkspace.js";
import {
  renderPracticeWorkspace,
} from "./renderPracticeWorkspace.js";

function selected(viewModel, view) {
  return viewModel.selectedView === view;
}

function chordAssignmentId(item) {
  return typeof item?.assignmentId === "string" &&
    item.assignmentId.length > 0
    ? item.assignmentId
    : item?.packageId ?? "";
}

function renderViewButton(
  viewModel,
  view,
  label,
) {
  const active = selected(
    viewModel,
    view,
  );

  return `
    <button
      type="button"
      role="tab"
      data-action="select-piece-view"
      data-piece-view="${view}"
      aria-selected="${active ? "true" : "false"}"
      tabindex="${active ? "0" : "-1"}"
    >${label}</button>
  `;
}

function renderPieceTeacherNote(
  viewModel,
) {
  if (
    typeof viewModel.teacherNote !==
      "string" ||
    viewModel.teacherNote.length === 0
  ) {
    return "";
  }

  return `
    <p class="piece-teacher-note">
      <span class="sr-only">Öğretmen notu: </span>
      ${escapeHtml(
        viewModel.teacherNote,
      )}
    </p>
  `;
}

function renderScorePanel(viewModel) {
  if (
    viewModel.availableViews.score !==
      true ||
    viewModel.score?.practice === null
  ) {
    return "";
  }

  const hidden = selected(
    viewModel,
    PIECE_WORKSPACE_VIEWS.SCORE,
  )
    ? ""
    : " hidden";

  return `
    <div
      class="piece-score-panel"
      data-piece-panel="SCORE"${hidden}
    >
      ${renderPracticeWorkspace(
        viewModel.score.practice,
        {
          showHomeAction: false,
          showTitle: false,
        },
      )}
    </div>
  `;
}

function renderChordSelector(
  viewModel,
  selectedChordId,
) {
  return `
    <div
      class="piece-chord-selector"
      role="group"
      aria-label="Parçanın akorları"
    >
      ${viewModel.chords.items
        .map((item) => {
          const id =
            chordAssignmentId(item);
          const active =
            id === selectedChordId;

          return `
            <button
              type="button"
              data-action="select-piece-chord"
              data-assignment-id="${escapeHtml(
                id,
              )}"
              aria-pressed="${active ? "true" : "false"}"
            >${escapeHtml(
              item.chord.displaySymbol,
            )}</button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderChordPanel(viewModel) {
  if (
    viewModel.availableViews.chords !==
      true ||
    viewModel.chords?.items?.length ===
      0
  ) {
    return "";
  }

  const hidden = selected(
    viewModel,
    PIECE_WORKSPACE_VIEWS.CHORDS,
  )
    ? ""
    : " hidden";
  const selectedChord =
    viewModel.chords.items.find(
      (item) =>
        chordAssignmentId(item) ===
        viewModel.selectedChordId,
    ) ??
    viewModel.chords.items[0];
  const selectedChordId =
    chordAssignmentId(selectedChord);

  return `
    <div
      class="piece-chords-panel"
      data-piece-panel="CHORDS"${hidden}
    >
      ${renderChordSelector(
        viewModel,
        selectedChordId,
      )}
      ${renderChordBoardWorkspace(
        selectedChord,
        {
          showTeacherNote: false,
        },
      )}
    </div>
  `;
}

export function renderPieceWorkspace(
  viewModel,
) {
  if (
    viewModel === null ||
    typeof viewModel !== "object"
  ) {
    throw new TypeError(
      "Piece Workspace view model required",
    );
  }

  const viewButtons = [];

  if (
    viewModel.availableViews?.score ===
    true
  ) {
    viewButtons.push(
      renderViewButton(
        viewModel,
        PIECE_WORKSPACE_VIEWS.SCORE,
        "Nota",
      ),
    );
  }

  if (
    viewModel.availableViews?.chords ===
    true
  ) {
    viewButtons.push(
      renderViewButton(
        viewModel,
        PIECE_WORKSPACE_VIEWS.CHORDS,
        "Akorlar",
      ),
    );
  }

  if (viewButtons.length === 0) {
    throw new Error(
      "Piece Workspace has no available view",
    );
  }

  return `
    <section
      class="piece-workspace"
      aria-labelledby="piece-title"
    >
      <header class="piece-workspace-header">
        <button
          type="button"
          class="piece-back"
          data-action="back-from-piece"
        >← Geri</button>
        <h1 id="piece-title">${escapeHtml(
          viewModel.title,
        )}</h1>
      </header>

      ${renderPieceTeacherNote(
        viewModel,
      )}

      <div
        class="piece-view-selector"
        role="tablist"
        aria-label="Çalışma görünümü"
      >
        ${viewButtons.join("")}
      </div>

      <div class="piece-workspace-content">
        ${renderScorePanel(
          viewModel,
        )}
        ${renderChordPanel(
          viewModel,
        )}
      </div>
    </section>
  `;
}
