import { create } from "zustand";
import {
  datasetColumnIds,
  defaultImportParseOptions,
  normalizeDataset,
  normalizeVirtualPath,
  parseDelimitedText,
} from "../../domain/csv";
import { executeScispaceCommand } from "../../domain/scispace";
import type { CommandHistoryEntry, Dataset, WorkspaceWindow } from "../../domain/types";
import { appDb, readPersistedLayout, type ProjectRecord, type SciSpaceDatabase } from "../db";
import {
  captureSnapshot,
  cloneState,
  defaultProjectId,
  defaultProjectName,
  isUndoableCommand,
  persistLayout,
  projectSummary,
  restoreSnapshot,
} from "./projectPersistence";
import type { ScispaceState } from "./stateTypes";
import {
  createInitialProject,
  ensureWorkspaceWindows,
  initialWindows,
  initialViewport,
  makeFileRecord,
  newWindowPosition,
  normalizePlotSpec,
  tableWindowHeightForRows,
  plotWindowHeightForSpec,
  seedPlot,
} from "./workspaceDefaults";
import { canParseAsTable } from "./importPreview";
import {
  descendantPaths,
  joinVirtualPath,
  makeDirectoryRecord,
  normalizeDirectoryPath,
  parentDirectoryOf,
  rewriteAffectedVirtualPaths,
  safePathName,
  uniquifyPath,
} from "./virtualFiles";
import { applyScispaceResult } from "./resultAppliers";
import {
  nextActiveDatasetId,
  normalizeColumnSelections,
  retitleWindow,
} from "./createStoreHelpers";
import { createImportDialogState } from "./importDialogState";
import { createProjectActions } from "./projectActions";

export const createScispaceStore = (db: SciSpaceDatabase = appDb) =>
  create<ScispaceState>()((set, get) => ({
    initialized: false,
    files: [],
    datasets: [],
    projects: [],
    currentProjectId: undefined,
    windows: [],
    plotSpecs: [],
    pendingImports: [],
    terminalEvents: [],
    commandHistory: [],
    undoStack: [],
    redoStack: [],
    terminalCommandLineRequest: undefined,
    columnSelections: {},
    currentPlotId: undefined,
    viewport: initialViewport(),

    initialize: async () => {
      const [files, datasets, layout, projectRecords] = await Promise.all([
        db.files.toArray(),
        db.datasets.toArray(),
        readPersistedLayout(db),
        db.projects.toArray(),
      ]);
      let nextDatasets = datasets.map(normalizeDataset);
      let nextFiles = files;

      if (nextDatasets.length === 0) {
        const initialProject = createInitialProject();
        await db.transaction("rw", db.datasets, db.files, async () => {
          await db.datasets.bulkPut(initialProject.datasets);
          await db.files.bulkPut(initialProject.files);
        });
        nextDatasets = initialProject.datasets;
        nextFiles = initialProject.files;
      } else if (nextDatasets.some((dataset, index) => dataset !== datasets[index])) {
        await db.datasets.bulkPut(nextDatasets);
      }

      const nextPlotSpecs =
        layout.plotSpecs && layout.plotSpecs.length > 0
          ? layout.plotSpecs.map(normalizePlotSpec)
          : [seedPlot()];
      const nextWindows =
        layout.windows.length > 0 ? ensureWorkspaceWindows(layout.windows) : initialWindows();
      const persistedConfigPlotId = nextWindows.find(
        (window) => window.kind === "plot-config" && window.plotId,
      )?.plotId;
      const currentProjectId = layout.currentProjectId ?? projectRecords[0]?.id ?? defaultProjectId;
      let nextProjectRecords = projectRecords;
      if (nextProjectRecords.length === 0) {
        const now = Date.now();
        const record: ProjectRecord = {
          id: currentProjectId,
          name: defaultProjectName,
          files: cloneState(nextFiles),
          datasets: cloneState(nextDatasets),
          layout: {
            windows: nextWindows,
            viewport: layout.viewport,
            plotSpecs: nextPlotSpecs,
            commandHistory: layout.commandHistory ?? [],
            columnSelections: normalizeColumnSelections(
              nextDatasets,
              layout.columnSelections ?? {},
            ),
            currentProjectId,
          },
          createdAt: now,
          updatedAt: now,
        };
        await db.projects.put(record);
        nextProjectRecords = [record];
      }

      set({
        initialized: true,
        files: nextFiles,
        datasets: nextDatasets,
        projects: nextProjectRecords.map(projectSummary),
        currentProjectId,
        windows: nextWindows,
        plotSpecs: nextPlotSpecs,
        commandHistory: layout.commandHistory ?? [],
        columnSelections: normalizeColumnSelections(nextDatasets, layout.columnSelections ?? {}),
        viewport: layout.viewport,
        activeDatasetId: nextDatasets[0]?.id,
        currentPlotId:
          persistedConfigPlotId && nextPlotSpecs.some((plot) => plot.id === persistedConfigPlotId)
            ? persistedConfigPlotId
            : nextPlotSpecs[0]?.id,
      });
      persistLayout(db, get());
    },

    importTextFile: async (name, text) => {
      const path = uniquifyPath(normalizeVirtualPath(name), get().files);
      let dataset: Dataset | undefined;
      let parseError: string | undefined;

      if (canParseAsTable(name)) {
        try {
          dataset = parseDelimitedText(
            text,
            path.split("/").at(-1) ?? name,
            path,
            Date.now(),
            defaultImportParseOptions,
          );
        } catch (error) {
          parseError = error instanceof Error ? error.message : "Unable to parse tabular file";
        }
      } else {
        parseError = "Raw file stored without tabular parsing";
      }

      const file = makeFileRecord(path, text, dataset?.id, parseError);
      await db.files.put(file);
      if (dataset) await db.datasets.put(dataset);

      set((state) => ({
        files: [...state.files.filter((item) => item.id !== file.id), file],
        datasets: dataset
          ? [...state.datasets.filter((item) => item.id !== dataset.id), dataset]
          : state.datasets,
        columnSelections: dataset
          ? { ...state.columnSelections, [dataset.id]: datasetColumnIds(dataset) }
          : state.columnSelections,
        activeDatasetId: dataset?.id ?? state.activeDatasetId,
        terminalEvents: [
          ...state.terminalEvents,
          dataset
            ? `Imported ${file.path} as dataset ${dataset.name}`
            : `Stored ${file.path}: ${parseError}`,
        ],
      }));

      return { file, dataset, parseError };
    },

    openImportDialog: (fileName, text) => {
      let id = "";
      set((state) => {
        const dialog = createImportDialogState(fileName, text, state);
        id = dialog.id;

        return {
          pendingImports: [...state.pendingImports, dialog.pendingImport],
          windows: [...state.windows, dialog.window],
          activeWindowId: dialog.window.id,
        };
      });
      persistLayout(db, get());
      return id;
    },

    confirmImport: async (importId) => {
      const pendingImport = get().pendingImports.find((item) => item.id === importId);
      if (!pendingImport) return undefined;

      const path = uniquifyPath(normalizeVirtualPath(pendingImport.fileName), get().files);
      const result = await get().runScispace(
        `import-confirm ${importId} path=${encodeURIComponent(path)} mode=${pendingImport.mode}`,
        { source: "gui" },
      );
      const file = get().files.find((item) => item.path === path);
      if (!file) return undefined;
      const dataset =
        result.kind === "import-confirm" && result.dataset
          ? get().datasets.find((item) => item.id === result.dataset?.id)
          : undefined;
      const parseError = result.kind === "import-confirm" ? result.parseError : result.output;
      return { file, dataset, parseError };
    },

    setDatasetColumnSelection: (datasetId, columnIds) => {
      const dataset = get().datasets.find((item) => item.id === datasetId);
      if (!dataset) return;
      const validColumns = new Set(datasetColumnIds(dataset));
      const nextColumnIds = columnIds.filter((columnId) => validColumns.has(columnId));
      set((state) => ({
        columnSelections: { ...state.columnSelections, [datasetId]: nextColumnIds },
      }));
      persistLayout(db, get());
    },

    toggleDatasetColumn: (datasetId, columnId) => {
      const current = get().columnSelections[datasetId] ?? [];
      const next = current.includes(columnId)
        ? current.filter((item) => item !== columnId)
        : [...current, columnId];
      get().setDatasetColumnSelection(datasetId, next);
    },

    selectDataset: async (datasetId) => {
      set({ activeDatasetId: datasetId });
      const dataset = get().datasets.find((item) => item.id === datasetId);
      if (!dataset) return;
      const selectedColumns = get().columnSelections[datasetId] ?? [];
      const columns = selectedColumns.length > 0 ? selectedColumns : datasetColumnIds(dataset);
      await get().runScispace(`table ${dataset.name} columns=${columns.join(",")}`, {
        source: "gui",
      });
    },

    openTable: async (datasetId, columnIds) => {
      const dataset = get().datasets.find((item) => item.id === datasetId);
      if (!dataset) return;
      const validColumns = new Set(datasetColumnIds(dataset));
      const resolvedColumnIds =
        columnIds && columnIds.length > 0
          ? columnIds.filter((columnId) => validColumns.has(columnId))
          : datasetColumnIds(dataset);

      set((state) => {
        const zIndex = Math.max(0, ...state.windows.map((window) => window.zIndex)) + 1;
        const existing = state.windows.find(
          (window) => window.kind === "table" && window.datasetId === datasetId,
        );
        const nextWindow: WorkspaceWindow = {
          id: `table-${datasetId}`,
          kind: "table",
          title: `Table - ${dataset.name}`,
          ...newWindowPosition(state, 96, 96),
          width: 650,
          height: tableWindowHeightForRows(10),
          zIndex,
          datasetId,
          columnIds: resolvedColumnIds,
        };
        const windows = existing
          ? state.windows.map((window) =>
              window.id === existing.id
                ? { ...window, zIndex, columnIds: resolvedColumnIds }
                : window,
            )
          : [...state.windows, nextWindow];
        return {
          windows,
          activeWindowId: existing?.id ?? `table-${datasetId}`,
          activeDatasetId: datasetId,
        };
      });
      persistLayout(db, get());
    },

    openPlot: async (spec) => {
      const normalizedSpec = normalizePlotSpec(spec);
      const dataset = get().datasets.find((item) => item.id === spec.source);
      set((state) => {
        const zIndex = Math.max(0, ...state.windows.map((window) => window.zIndex)) + 1;
        return {
          plotSpecs: [
            ...state.plotSpecs.filter((plot) => plot.id !== normalizedSpec.id),
            normalizedSpec,
          ],
          windows: [
            ...state.windows,
            {
              id: `plot-${normalizedSpec.id}`,
              kind: "plot",
              title: normalizedSpec.title,
              ...newWindowPosition(state, 128, 112),
              width: normalizedSpec.size.width,
              height: plotWindowHeightForSpec(normalizedSpec.size.height),
              zIndex,
              datasetId: dataset?.id,
              plotId: normalizedSpec.id,
            },
          ],
          activeWindowId: `plot-${normalizedSpec.id}`,
          currentPlotId: normalizedSpec.id,
        };
      });
      persistLayout(db, get());
    },

    openPlotConfig: (plotId) => {
      const plot = get().plotSpecs.find((item) => item.id === plotId);
      if (!plot) return;

      set((state) => {
        const existing = state.windows.find((window) => window.kind === "plot-config");
        const zIndex = Math.max(0, ...state.windows.map((window) => window.zIndex)) + 1;
        const configWindow: WorkspaceWindow = {
          id: "plot-config-main",
          kind: "plot-config",
          title: "Plot Config",
          ...newWindowPosition(state, 760, 88),
          width: 520,
          height: 680,
          zIndex,
          plotId,
        };
        return {
          currentPlotId: plotId,
          activeWindowId: existing?.id ?? configWindow.id,
          windows: existing
            ? state.windows.map((window) =>
                window.id === existing.id ? { ...window, zIndex, plotId } : window,
              )
            : [...state.windows, configWindow],
        };
      });
      persistLayout(db, get());
    },

    runScispace: async (input, options) => {
      const undoBefore = isUndoableCommand(input) ? captureSnapshot(get()) : undefined;
      let result = executeScispaceCommand(input, {
        datasets: get().datasets,
        files: get().files,
        plotSpecs: get().plotSpecs,
        pendingImports: get().pendingImports,
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
        columnSelections: cloneState(entry.before.columnSelections),
        activeDatasetId: entry.before.activeDatasetId,
        activeWindowId: entry.before.activeWindowId,
        currentPlotId: entry.before.currentPlotId,
        viewport: cloneState(entry.before.viewport),
        terminalEvents: [...state.terminalEvents, `Undo: ${entry.command}`],
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
        columnSelections: cloneState(entry.after.columnSelections),
        activeDatasetId: entry.after.activeDatasetId,
        activeWindowId: entry.after.activeWindowId,
        currentPlotId: entry.after.currentPlotId,
        viewport: cloneState(entry.after.viewport),
        terminalEvents: [...state.terminalEvents, `Redo: ${entry.command}`],
        undoStack: [...state.undoStack, entry],
        redoStack: state.redoStack.slice(0, -1),
      }));
      persistLayout(db, get());
    },

    closeWindow: (id) => {
      set((state) => {
        const target = state.windows.find((window) => window.id === id);
        if (!target) return state;

        const windows = state.windows.filter((window) => window.id !== id);
        const plotSpecs =
          target.kind === "plot" &&
          target.plotId &&
          !windows.some((window) => window.kind === "plot" && window.plotId === target.plotId)
            ? state.plotSpecs.filter((plot) => plot.id !== target.plotId)
            : state.plotSpecs;

        return {
          windows,
          plotSpecs,
          activeWindowId: state.activeWindowId === id ? undefined : state.activeWindowId,
          currentPlotId:
            target.kind === "plot" && target.plotId === state.currentPlotId
              ? plotSpecs[0]?.id
              : state.currentPlotId,
        };
      });
      persistLayout(db, get());
    },

    ...createProjectActions({ db, get, set }),

    createDirectory: async (name, parentPath = "~/raw") => {
      const safeName = safePathName(name, "");
      if (!safeName) return undefined;
      const path = uniquifyPath(joinVirtualPath(parentPath, safeName), get().files);
      const directory = makeDirectoryRecord(path);
      await db.files.put(directory);
      set((state) => ({
        files: [...state.files, directory],
        terminalEvents: [...state.terminalEvents, `Created directory ${directory.path}`],
      }));
      return directory;
    },

    renameVirtualItem: async (path, name) => {
      const target = get().files.find((file) => file.path === path);
      const safeName = safePathName(name, "");
      if (!target || !safeName || path === "~/raw") return;

      const affectedPaths =
        target.kind === "directory" ? descendantPaths(path, get().files) : new Set([path]);
      const unaffectedFiles = get().files.filter((file) => !affectedPaths.has(file.path));
      const basePath = uniquifyPath(
        joinVirtualPath(parentDirectoryOf(path), safeName),
        unaffectedFiles,
      );
      const { rewrittenFiles: renamedFiles, rewrittenAffectedFiles: renamedAffectedFiles } =
        rewriteAffectedVirtualPaths(get().files, path, basePath);
      const datasetIdsToRename = new Set(
        target.kind === "file" && target.datasetId ? [target.datasetId] : [],
      );
      const updatedDatasets = get().datasets.map((dataset) => {
        const sourceFile = renamedFiles.find((file) => file.datasetId === dataset.id);
        if (!sourceFile) return dataset;
        return {
          ...dataset,
          name: datasetIdsToRename.has(dataset.id) ? sourceFile.name : dataset.name,
          sourcePath: sourceFile.path,
        };
      });
      const updatedPlotSpecs = get().plotSpecs.map((plot) => {
        const dataset = updatedDatasets.find((item) => item.id === plot.source);
        if (!dataset || !datasetIdsToRename.has(dataset.id)) return plot;
        const title = plot.titleEdited
          ? plot.title
          : `${dataset.name}: ${plot.series.map((series) => series.y).join(", ")} vs ${plot.x}`;
        return normalizePlotSpec({ ...plot, title });
      });
      const updatedWindows = get().windows.map((window) =>
        retitleWindow(window, updatedDatasets, updatedPlotSpecs),
      );

      await db.transaction("rw", db.files, db.datasets, async () => {
        await Promise.all([...affectedPaths].map((oldPath) => db.files.delete(oldPath)));
        await db.files.bulkPut(renamedAffectedFiles);
        await db.datasets.bulkPut(updatedDatasets);
      });

      set((state) => ({
        ...state,
        files: renamedFiles,
        datasets: updatedDatasets,
        plotSpecs: updatedPlotSpecs,
        windows: updatedWindows,
        terminalEvents: [...state.terminalEvents, `Renamed ${path} to ${basePath}`],
      }));
      persistLayout(db, get());
    },

    moveVirtualItem: async (path, targetDirectory) => {
      const target = get().files.find((file) => file.path === path);
      const directory = normalizeDirectoryPath(targetDirectory);
      if (!target || path === "~/raw" || directory === parentDirectoryOf(path)) return;
      if (target.kind === "directory" && directory.startsWith(`${path}/`)) return;

      const affectedPaths =
        target.kind === "directory" ? descendantPaths(path, get().files) : new Set([path]);
      const unaffectedFiles = get().files.filter((file) => !affectedPaths.has(file.path));
      const basePath = uniquifyPath(joinVirtualPath(directory, target.name), unaffectedFiles);
      const { rewrittenFiles: movedFiles, rewrittenAffectedFiles: movedAffectedFiles } =
        rewriteAffectedVirtualPaths(get().files, path, basePath);
      const updatedDatasets = get().datasets.map((dataset) => {
        const sourceFile = movedFiles.find((file) => file.datasetId === dataset.id);
        return sourceFile ? { ...dataset, sourcePath: sourceFile.path } : dataset;
      });

      await db.transaction("rw", db.files, db.datasets, async () => {
        await Promise.all([...affectedPaths].map((oldPath) => db.files.delete(oldPath)));
        await db.files.bulkPut(movedAffectedFiles);
        await db.datasets.bulkPut(updatedDatasets);
      });

      set((state) => ({
        ...state,
        files: movedFiles,
        datasets: updatedDatasets,
        terminalEvents: [...state.terminalEvents, `Moved ${path} to ${basePath}`],
      }));
    },

    deleteVirtualItem: async (path) => {
      const target = get().files.find((file) => file.path === path);
      if (!target || path === "~/raw") return;

      const affectedPaths =
        target.kind === "directory" ? descendantPaths(path, get().files) : new Set([path]);
      const removedFiles = get().files.filter((file) => affectedPaths.has(file.path));
      const removedDatasetIds = new Set(
        removedFiles.map((file) => file.datasetId).filter((id): id is string => Boolean(id)),
      );
      const files = get().files.filter((file) => !affectedPaths.has(file.path));
      const datasets = get().datasets.filter((dataset) => !removedDatasetIds.has(dataset.id));
      const plotSpecs = get().plotSpecs.filter((plot) => !removedDatasetIds.has(plot.source));
      const windows = get().windows.filter((window) => {
        if (window.datasetId && removedDatasetIds.has(window.datasetId)) return false;
        if (window.plotId && !plotSpecs.some((plot) => plot.id === window.plotId)) return false;
        return true;
      });

      await db.transaction("rw", db.files, db.datasets, async () => {
        await Promise.all([...affectedPaths].map((oldPath) => db.files.delete(oldPath)));
        await Promise.all([...removedDatasetIds].map((datasetId) => db.datasets.delete(datasetId)));
      });

      set((state) => ({
        ...state,
        files,
        datasets,
        plotSpecs,
        windows,
        columnSelections: Object.fromEntries(
          Object.entries(state.columnSelections).filter(
            ([datasetId]) => !removedDatasetIds.has(datasetId),
          ),
        ),
        activeDatasetId: nextActiveDatasetId(datasets, state.activeDatasetId),
        currentPlotId:
          state.currentPlotId && plotSpecs.some((plot) => plot.id === state.currentPlotId)
            ? state.currentPlotId
            : plotSpecs[0]?.id,
        activeWindowId:
          state.activeWindowId && windows.some((window) => window.id === state.activeWindowId)
            ? state.activeWindowId
            : undefined,
        terminalEvents: [...state.terminalEvents, `Deleted ${path}`],
      }));
      persistLayout(db, get());
    },

    updateWindow: (id, patch) => {
      set((state) => ({
        windows: state.windows.map((window) =>
          window.id === id ? { ...window, ...patch } : window,
        ),
      }));
      persistLayout(db, get());
    },

    focusWindow: (id) => {
      set((state) => {
        const zIndex = Math.max(0, ...state.windows.map((window) => window.zIndex)) + 1;
        const target = state.windows.find((window) => window.id === id);
        return {
          windows: state.windows.map((window) =>
            window.id === id ? { ...window, zIndex } : window,
          ),
          activeWindowId: id,
          currentPlotId:
            target?.kind === "plot" && target.plotId ? target.plotId : state.currentPlotId,
        };
      });
      persistLayout(db, get());
    },

    setViewport: (viewport) => {
      set({ viewport });
      persistLayout(db, get());
    },

    sendCommandToTerminalLine: (command) => {
      set({ terminalCommandLineRequest: { id: crypto.randomUUID(), command } });
    },
  }));

export const useScispaceStore = createScispaceStore(appDb);
