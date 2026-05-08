import type { StoreApi } from "zustand/vanilla";
import { executeScispaceCommand } from "../../domain/scispace";
import type { CommandHistoryEntry } from "../../domain/types";
import type { SciSpaceDatabase } from "../db";
import { applyScispaceResult } from "./resultAppliers";
import { nextActiveDatasetId, retitleWindow } from "./createStoreHelpers";
import {
  captureSnapshot,
  cloneState,
  isUndoableCommand,
  persistLayout,
  restoreSnapshot,
} from "./projectPersistence";
import type { ScispaceState } from "./stateTypes";
import { ensureWorkspaceWindows, normalizePlotSpec } from "./workspaceDefaults";

interface ExecutionActionContext {
  db: SciSpaceDatabase;
  get: StoreApi<ScispaceState>["getState"];
  set: StoreApi<ScispaceState>["setState"];
}

export const createExecutionActions = ({
  db,
  get,
  set,
}: ExecutionActionContext): Pick<ScispaceState, "runScispace" | "undo" | "redo"> => ({
  runScispace: async (input, options) => {
    const undoBefore = isUndoableCommand(input) ? captureSnapshot(get()) : undefined;
    let result = executeScispaceCommand(input, {
      datasets: get().datasets,
      files: get().files,
      plotSpecs: get().plotSpecs,
      pendingImports: get().pendingImports,
      uploadPayloads: get().uploadPayloads,
    });

    result = await applyScispaceResult(result, {
      db,
      get,
      input,
      nextActiveDatasetId,
      retitleWindow,
      set,
    });

    const commandHistoryEntry: CommandHistoryEntry = {
      id: crypto.randomUUID(),
      command: input,
      output: result.output,
      kind: result.kind,
      status: result.kind === "error" ? "error" : "success",
      createdAt: Date.now(),
      source: options?.source ?? "terminal",
    };
    set((state) => ({
      terminalEvents: [...state.terminalEvents, result.output],
      commandHistory: [...state.commandHistory, commandHistoryEntry],
      projectDirty: result.kind === "error" ? state.projectDirty : true,
      undoStack:
        undoBefore && result.kind !== "error"
          ? [
              ...state.undoStack,
              {
                id: crypto.randomUUID(),
                command: input,
                before: undoBefore,
                after: captureSnapshot(get()),
                createdAt: Date.now(),
              },
            ]
          : state.undoStack,
      redoStack: undoBefore && result.kind !== "error" ? [] : state.redoStack,
    }));
    persistLayout(db, get());
    return result;
  },

  undo: async () => {
    const entry = get().undoStack.at(-1);
    if (!entry) return;
    const commandHistory = get().commandHistory;
    await restoreSnapshot(db, entry.before, commandHistory);
    set((state) => ({
      files: cloneState(entry.before.files),
      datasets: cloneState(entry.before.datasets),
      windows: ensureWorkspaceWindows(cloneState(entry.before.windows)),
      plotSpecs: cloneState(entry.before.plotSpecs).map(normalizePlotSpec),
      pendingImports: cloneState(entry.before.pendingImports),
      uploadPayloads: cloneState(entry.before.uploadPayloads),
      columnSelections: cloneState(entry.before.columnSelections),
      activeDatasetId: entry.before.activeDatasetId,
      activeWindowId: entry.before.activeWindowId,
      currentPlotId: entry.before.currentPlotId,
      viewport: cloneState(entry.before.viewport),
      terminalEvents: [...state.terminalEvents, `Undo: ${entry.command}`],
      projectDirty: true,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, entry],
    }));
    persistLayout(db, get());
  },

  redo: async () => {
    const entry = get().redoStack.at(-1);
    if (!entry) return;
    const commandHistory = get().commandHistory;
    await restoreSnapshot(db, entry.after, commandHistory);
    set((state) => ({
      files: cloneState(entry.after.files),
      datasets: cloneState(entry.after.datasets),
      windows: ensureWorkspaceWindows(cloneState(entry.after.windows)),
      plotSpecs: cloneState(entry.after.plotSpecs).map(normalizePlotSpec),
      pendingImports: cloneState(entry.after.pendingImports),
      uploadPayloads: cloneState(entry.after.uploadPayloads),
      columnSelections: cloneState(entry.after.columnSelections),
      activeDatasetId: entry.after.activeDatasetId,
      activeWindowId: entry.after.activeWindowId,
      currentPlotId: entry.after.currentPlotId,
      viewport: cloneState(entry.after.viewport),
      terminalEvents: [...state.terminalEvents, `Redo: ${entry.command}`],
      projectDirty: true,
      undoStack: [...state.undoStack, entry],
      redoStack: state.redoStack.slice(0, -1),
    }));
    persistLayout(db, get());
  },
});
