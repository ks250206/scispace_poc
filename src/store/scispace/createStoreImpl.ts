import { create } from "zustand";
import {
  datasetColumnIds,
  defaultImportParseOptions,
  normalizeDataset,
  normalizeVirtualPath,
  parseDelimitedText,
} from "../../domain/csv";
import type { Dataset, WorkspaceWindow } from "../../domain/types";
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
  newWindowPosition,
  normalizePlotSpec,
  tableWindowHeightForRows,
  plotWindowHeightForSpec,
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

    ...createExecutionActions({ db, get, set }),
    ...createWindowActions({ db, get, set }),
    ...createProjectActions({ db, get, set }),
    ...createFileActions({ db, get, set }),
  }));

export const useScispaceStore = createScispaceStore(appDb);
