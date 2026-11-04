import { readOption, tokenizeCommand } from "../../domain/scispace/commandUtils";
import type { CommandHistoryEntry, PersistedLayout } from "../../domain/types";
import { type ProjectRecord, type SciSpaceDatabase, writePersistedLayout } from "../db";
import type { ProjectSnapshot, ProjectSummary, ScispaceState } from "./stateTypes";
import { createInitialProject, normalizePlotSpec } from "./workspaceDefaults";

export const defaultProjectId = "project-main";
export const defaultProjectName = "Main Project";

export const projectSummary = (record: ProjectRecord): ProjectSummary => ({
  id: record.id,
  name: record.name,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export const layoutFromState = (
  state: ScispaceState,
  projectId = state.currentProjectId,
): PersistedLayout => ({
  windows: state.windows.filter((window) => window.kind !== "import"),
  viewport: state.viewport,
  plotSpecs: state.plotSpecs.map(normalizePlotSpec),
  commandHistory: state.commandHistory,
  uploadPayloads: state.uploadPayloads,
  columnSelections: state.columnSelections,
  currentProjectId: projectId,
});

export const initialProjectRecord = (
  id: string,
  name: string,
  createdAt = Date.now(),
): ProjectRecord => {
  const initialProject = createInitialProject();
  return {
    id,
    name,
    files: initialProject.files,
    datasets: initialProject.datasets,
    layout: {
      windows: initialProject.windows,
      viewport: initialProject.viewport,
      plotSpecs: initialProject.plotSpecs,
      commandHistory: initialProject.commandHistory,
      columnSelections: initialProject.columnSelections,
      currentProjectId: id,
    },
    createdAt,
    updatedAt: createdAt,
  };
};

export const projectRecordFromState = (
  state: ScispaceState,
  id: string,
  name: string,
  previous?: ProjectRecord,
): ProjectRecord => {
  const now = Date.now();
  return {
    id,
    name,
    files: cloneState(state.files),
    datasets: cloneState(state.datasets),
    layout: layoutFromState(state, id),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
};

export const cloneState = <T>(value: T): T => structuredClone(value);

export const captureSnapshot = (state: ScispaceState): ProjectSnapshot => ({
  files: cloneState(state.files),
  datasets: cloneState(state.datasets),
  windows: cloneState(state.windows),
  plotSpecs: cloneState(state.plotSpecs),
  pendingImports: cloneState(state.pendingImports),
  uploadPayloads: cloneState(state.uploadPayloads),
  columnSelections: cloneState(state.columnSelections),
  activeDatasetId: state.activeDatasetId,
  activeWindowId: state.activeWindowId,
  currentPlotId: state.currentPlotId,
  viewport: cloneState(state.viewport),
});

export const isUndoableCommand = (input: string): boolean => {
  const command = input.trim();
  if (/^dataset-(new|calc)\s/.test(command)) return true;
  if (/^table-edit\s/.test(command)) {
    return /(?:^|\s)action=(set-cell|delete-row|delete-column|insert-column)(?:\s|$)/.test(command);
  }
  if (/^table-range\s/.test(command)) {
    return /(?:^|\s)action=(clear|fill-down)(?:\s|$)/.test(command);
  }
  if (/^plot-(set|series|annotation)\s/.test(command)) {
    const [name, ...args] = tokenizeCommand(command);
    const textOption = name === "plot-set" ? "title" : name === "plot-series" ? "label" : "text";
    return readOption(args, textOption) !== undefined;
  }
  if (/^import-confirm\s/.test(command)) return true;
  return /^file-(delete|rename|move)\s/.test(command);
};

export const persistLayout = (db: SciSpaceDatabase, state: ScispaceState): void => {
  void writePersistedLayout(db, layoutFromState(state));
};

export const restoreSnapshot = async (
  db: SciSpaceDatabase,
  snapshot: ProjectSnapshot,
  commandHistory: CommandHistoryEntry[],
): Promise<void> => {
  await db.transaction("rw", db.files, db.datasets, db.layout, async () => {
    await db.files.clear();
    await db.datasets.clear();
    await db.files.bulkPut(snapshot.files);
    await db.datasets.bulkPut(snapshot.datasets);
    await db.layout.put({
      id: "main",
      value: {
        windows: snapshot.windows.filter((window) => window.kind !== "import"),
        viewport: snapshot.viewport,
        plotSpecs: snapshot.plotSpecs.map(normalizePlotSpec),
        commandHistory,
        uploadPayloads: snapshot.uploadPayloads,
        columnSelections: snapshot.columnSelections,
        currentProjectId: undefined,
      },
    });
  });
};
