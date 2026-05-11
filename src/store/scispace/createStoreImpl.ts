import { create } from "zustand";
import {
  datasetColumnIds,
  defaultImportParseOptions,
  normalizeDataset,
  normalizeVirtualPath,
  parseDelimitedText,
} from "../../domain/csv";
import type { Dataset } from "../../domain/types";
import { appDb, readPersistedLayout, type ProjectRecord, type SciSpaceDatabase } from "../db";
import {
  cloneState,
  defaultProjectId,
  defaultProjectName,
  persistLayout,
  projectSummary,
} from "./projectPersistence";
import type { ScispaceState } from "./stateTypes";
import {
  createInitialProject,
  ensureWorkspaceWindows,
  initialWindows,
  initialViewport,
  makeFileRecord,
  normalizePlotSpec,
  seedPlot,
} from "./workspaceDefaults";
import { canParseAsTable } from "./importPreview";
import { uniquifyPath } from "./virtualFiles";
import { normalizeColumnSelections } from "./createStoreHelpers";
import { createImportDialogState } from "./importDialogState";
import { createProjectActions } from "./projectActions";
import { createFileActions } from "./fileActions";
import { createWindowActions } from "./windowActions";
import { createExecutionActions } from "./executionActions";
import { createWorkspaceActions } from "./workspaceActions";

export const createScispaceStore = (db: SciSpaceDatabase = appDb) =>
  create<ScispaceState>()((set, get) => ({
    initialized: false,
    files: [],
    datasets: [],
    projects: [],
    currentProjectId: undefined,
    projectDirty: false,
    windows: [],
    plotSpecs: [],
    pendingImports: [],
    terminalEvents: [],
    commandHistory: [],
    uploadPayloads: {},
    undoStack: [],
    redoStack: [],
    terminalCommandLineRequest: undefined,
    columnSelections: {},
    currentPlotId: undefined,
    tableMenuState: undefined,
    plotMenuState: undefined,
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
            uploadPayloads: layout.uploadPayloads ?? {},
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
        projectDirty: false,
        windows: nextWindows,
        plotSpecs: nextPlotSpecs,
        commandHistory: layout.commandHistory ?? [],
        uploadPayloads: layout.uploadPayloads ?? {},
        columnSelections: normalizeColumnSelections(nextDatasets, layout.columnSelections ?? {}),
        viewport: layout.viewport,
        activeDatasetId: nextDatasets[0]?.id,
        currentPlotId:
          persistedConfigPlotId && nextPlotSpecs.some((plot) => plot.id === persistedConfigPlotId)
            ? persistedConfigPlotId
            : nextPlotSpecs[0]?.id,
        tableMenuState: undefined,
        plotMenuState: undefined,
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
        projectDirty: true,
        terminalEvents: [
          ...state.terminalEvents,
          dataset
            ? `Imported ${file.path} as dataset ${dataset.name}`
            : `Stored ${file.path}: ${parseError}`,
        ],
      }));

      return { file, dataset, parseError };
    },

    stageUploadPayload: (fileName, text, mode = "tabular") => {
      const id = `upload-${crypto.randomUUID()}`;
      set((state) => ({
        uploadPayloads: {
          ...state.uploadPayloads,
          [id]: { id, fileName, text, mode, createdAt: Date.now() },
        },
      }));
      return id;
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
          projectDirty: true,
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

    ...createWorkspaceActions({ db, get, set }),
    ...createExecutionActions({ db, get, set }),
    ...createWindowActions({ db, get, set }),
    setTableMenuState: (state) =>
      set((current) => {
        const previous = current.tableMenuState;
        if (
          previous?.windowId === state.windowId &&
          previous.datasetId === state.datasetId &&
          previous.rowCount === state.rowCount &&
          previous.visibleRows === state.visibleRows &&
          previous.hasSelectedRange === state.hasSelectedRange &&
          previous.canFillDownRange === state.canFillDownRange &&
          previous.canPlotSelection === state.canPlotSelection &&
          previous.hasSelectedCell === state.hasSelectedCell &&
          previous.hasSelectedColumn === state.hasSelectedColumn
        ) {
          return current;
        }
        return { tableMenuState: state };
      }),
    clearTableMenuState: (windowId) =>
      set((state) => ({
        tableMenuState:
          state.tableMenuState?.windowId === windowId ? undefined : state.tableMenuState,
      })),
    setPlotMenuState: (state) => set({ plotMenuState: state }),
    clearPlotMenuState: (plotId) =>
      set((state) => ({
        plotMenuState: state.plotMenuState?.plotId === plotId ? undefined : state.plotMenuState,
      })),
    ...createProjectActions({ db, get, set }),
    ...createFileActions({ db, get, set }),
  }));

export const useScispaceStore = createScispaceStore(appDb);
