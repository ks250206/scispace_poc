import { create } from "zustand";
import {
  createSeedDataset,
  datasetToDelimitedText,
  defaultImportParseOptions,
  normalizeDataValue,
  normalizeVirtualPath,
  parseDelimitedText,
} from "../domain/csv";
import {
  defaultPlotAxis,
  executeScispaceCommand,
  normalizePlotSpecForCommand,
} from "../domain/scispace";
import type {
  CommandHistoryEntry,
  CommandHistorySource,
  Dataset,
  ImportFileResult,
  ImportParseOptions,
  PendingImport,
  PlotSpec,
  ScispaceCommandResult,
  ViewportState,
  VirtualFile,
  WorkspaceWindow,
} from "../domain/types";
import { appDb, readPersistedLayout, type SciSpaceDatabase, writePersistedLayout } from "./db";

interface ScispaceState {
  initialized: boolean;
  files: VirtualFile[];
  datasets: Dataset[];
  windows: WorkspaceWindow[];
  plotSpecs: PlotSpec[];
  pendingImports: PendingImport[];
  terminalEvents: string[];
  commandHistory: CommandHistoryEntry[];
  terminalCommandLineRequest?: { id: string; command: string };
  activeDatasetId?: string;
  activeWindowId?: string;
  currentPlotId?: string;
  viewport: ViewportState;
  initialize: () => Promise<void>;
  importTextFile: (name: string, text: string) => Promise<ImportFileResult>;
  openImportDialog: (fileName: string, text: string) => string;
  updateImportOptions: (importId: string, options: Partial<ImportParseOptions>) => void;
  confirmImport: (importId: string) => Promise<ImportFileResult | undefined>;
  cancelImport: (importId: string) => void;
  selectDataset: (datasetId: string) => Promise<void>;
  openTable: (datasetId: string) => Promise<void>;
  openPlot: (spec: PlotSpec) => Promise<void>;
  openPlotConfig: (plotId: string) => void;
  updateDatasetCell: (
    datasetId: string,
    rowIndex: number,
    column: string,
    value: string,
  ) => Promise<void>;
  runScispace: (
    input: string,
    options?: { source?: CommandHistorySource },
  ) => Promise<ScispaceCommandResult>;
  closeWindow: (id: string) => void;
  createNewProject: () => Promise<void>;
  createDirectory: (name: string, parentPath?: string) => Promise<VirtualFile | undefined>;
  renameVirtualItem: (path: string, name: string) => Promise<void>;
  moveVirtualItem: (path: string, targetDirectory: string) => Promise<void>;
  deleteVirtualItem: (path: string) => Promise<void>;
  updateWindow: (
    id: string,
    patch: Partial<Pick<WorkspaceWindow, "x" | "y" | "width" | "height">>,
  ) => void;
  focusWindow: (id: string) => void;
  setViewport: (viewport: ViewportState) => void;
  sendCommandToTerminalLine: (command: string) => void;
}

const centerTileX = 1920;
const centerTileY = 1080;
const tableWindowHeightForRows = (visibleRows: 10 | 20 | 50): number =>
  34 + 38 + 32 + visibleRows * 32;

const initialWindows = (): WorkspaceWindow[] => [
  {
    id: "browser-main",
    kind: "browser",
    title: "Data Browser",
    x: centerTileX + 64,
    y: centerTileY + 72,
    width: 300,
    height: 440,
    zIndex: 1,
  },
  {
    id: "table-seed",
    kind: "table",
    title: "Table - waveform.csv",
    x: centerTileX + 396,
    y: centerTileY + 88,
    width: 650,
    height: tableWindowHeightForRows(10),
    zIndex: 2,
    datasetId: "seed-waveform",
  },
  {
    id: "plot-seed",
    kind: "plot",
    title: "Plot - waveform.csv",
    x: centerTileX + 1088,
    y: centerTileY + 88,
    width: 640,
    height: 420,
    zIndex: 3,
    datasetId: "seed-waveform",
    plotId: "seed-plot",
  },
  {
    id: "terminal-main",
    kind: "terminal",
    title: "Terminal",
    x: centerTileX + 64,
    y: centerTileY + 756,
    width: 1664,
    height: 300,
    zIndex: 4,
  },
  {
    id: "history-main",
    kind: "history",
    title: "Command History",
    x: centerTileX + 1328,
    y: centerTileY + 532,
    width: 420,
    height: 520,
    zIndex: 5,
  },
];

const ensureWorkspaceWindows = (windows: WorkspaceWindow[]): WorkspaceWindow[] => {
  let nextWindows = windows;
  if (!nextWindows.some((window) => window.kind === "terminal")) {
    const zIndex = Math.max(0, ...nextWindows.map((window) => window.zIndex)) + 1;
    nextWindows = [
      ...nextWindows,
      {
        id: "terminal-main",
        kind: "terminal",
        title: "Terminal",
        x: centerTileX + 64,
        y: centerTileY + 756,
        width: 1664,
        height: 300,
        zIndex,
      },
    ];
  }
  if (!nextWindows.some((window) => window.kind === "history")) {
    const zIndex = Math.max(0, ...nextWindows.map((window) => window.zIndex)) + 1;
    nextWindows = [
      ...nextWindows,
      {
        id: "history-main",
        kind: "history",
        title: "Command History",
        x: centerTileX + 1328,
        y: centerTileY + 532,
        width: 420,
        height: 520,
        zIndex,
      },
    ];
  }
  return nextWindows;
};

const seedPlot = (): PlotSpec => ({
  id: "seed-plot",
  type: "line",
  plotType: "line",
  source: "seed-waveform",
  x: "time",
  y: "signal",
  title: "waveform.csv: signal vs time",
  series: [
    {
      y: "signal",
      label: "signal",
      color: "#2563eb",
      lineWidth: 2,
      markerSize: 6,
      markerShape: "circle",
    },
  ],
  zoomMode: "xy",
  axes: { x: defaultPlotAxis("time"), y: defaultPlotAxis("signal") },
  grid: { x: true, y: true },
  border: true,
  size: { width: 640, height: 360 },
  axisLabels: { x: "time", y: "signal" },
});

const normalizePlotSpec = (spec: PlotSpec): PlotSpec => {
  return normalizePlotSpecForCommand(spec);
};

const initialViewport = (): ViewportState => ({ x: -1920, y: -1080, scale: 1 });

const makeFileRecord = (
  path: string,
  text: string,
  datasetId?: string,
  parseError?: string,
): VirtualFile => ({
  id: path,
  path,
  name: path.split("/").at(-1) ?? path,
  kind: "file",
  text,
  datasetId,
  parseError,
  createdAt: Date.now(),
});

const makeDirectoryRecord = (path: string): VirtualFile => ({
  id: path,
  path,
  name: path.split("/").at(-1) ?? path,
  kind: "directory",
  createdAt: Date.now(),
});

const normalizeDirectoryPath = (path: string): string => {
  const trimmed = path.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  if (trimmed === "~" || trimmed === "~/raw") return "~/raw";
  if (trimmed.startsWith("~/raw/")) return trimmed;
  return `~/raw/${trimmed.replace(/^~\//, "").replace(/^raw\//, "")}`;
};

const safePathName = (name: string, fallback: string): string =>
  name.trim().replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? fallback;

const parentDirectoryOf = (path: string): string => {
  const slashIndex = path.lastIndexOf("/");
  return slashIndex > "~/raw".length ? path.slice(0, slashIndex) : "~/raw";
};

const joinVirtualPath = (directory: string, name: string): string =>
  `${normalizeDirectoryPath(directory)}/${safePathName(name, "untitled")}`;

const createInitialProject = () => {
  const seed = createSeedDataset();
  const file = makeFileRecord(seed.sourcePath, datasetToDelimitedText(seed), seed.id);
  return {
    files: [file],
    datasets: [seed],
    windows: initialWindows(),
    plotSpecs: [seedPlot()],
    viewport: initialViewport(),
    commandHistory: [],
  };
};

const persistLayout = (db: SciSpaceDatabase, state: ScispaceState): void => {
  void writePersistedLayout(db, {
    windows: state.windows.filter((window) => window.kind !== "import"),
    viewport: state.viewport,
    plotSpecs: state.plotSpecs.map(normalizePlotSpec),
    commandHistory: state.commandHistory,
  });
};

const uniquifyPath = (path: string, files: VirtualFile[]): string => {
  const existing = new Set(files.map((file) => file.path));
  if (!existing.has(path)) return path;

  const slashIndex = path.lastIndexOf("/");
  const directory = slashIndex >= 0 ? path.slice(0, slashIndex + 1) : "";
  const fileName = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : "";

  for (let index = 1; ; index += 1) {
    const candidate = `${directory}${stem} (${index})${extension}`;
    if (!existing.has(candidate)) return candidate;
  }
};

const descendantPaths = (path: string, files: VirtualFile[]): Set<string> => {
  const prefix = `${path}/`;
  return new Set(
    files
      .filter((file) => file.path === path || file.path.startsWith(prefix))
      .map((file) => file.path),
  );
};

const nextActiveDatasetId = (datasets: Dataset[], current?: string): string | undefined =>
  current && datasets.some((dataset) => dataset.id === current) ? current : datasets[0]?.id;

const retitleWindow = (window: WorkspaceWindow, datasets: Dataset[], plotSpecs: PlotSpec[]) => {
  if (window.kind === "table" && window.datasetId) {
    const dataset = datasets.find((item) => item.id === window.datasetId);
    return dataset ? { ...window, title: `Table - ${dataset.name}` } : window;
  }
  if (window.kind === "plot" && window.plotId) {
    const plot = plotSpecs.find((item) => item.id === window.plotId);
    return plot ? { ...window, title: plot.title } : window;
  }
  return window;
};

const canParseAsTable = (name: string): boolean => /\.(csv|tsv)$/i.test(name);

const createPreview = (
  id: string,
  fileName: string,
  text: string,
  options: ImportParseOptions,
): { preview?: Dataset; error?: string } => {
  if (!canParseAsTable(fileName)) {
    return { error: "Raw file stored without tabular parsing" };
  }

  const result = executeScispaceCommand(`import-preview ${id}`, {
    datasets: [],
    pendingImports: [{ id, fileName, text, options }],
  });
  if (result.kind === "import-preview") {
    return { preview: result.preview, error: result.error };
  }
  return { error: result.output };
};

const normalizeColumnNames = (
  options: ImportParseOptions,
  preview?: Dataset,
): ImportParseOptions => {
  if (options.hasHeader || !preview) return options;
  const columnNames = preview.columns.map(
    (column, index) => options.columnNames[index]?.trim() || column || `column_${index + 1}`,
  );
  return { ...options, columnNames };
};

export const createScispaceStore = (db: SciSpaceDatabase = appDb) =>
  create<ScispaceState>()((set, get) => ({
    initialized: false,
    files: [],
    datasets: [],
    windows: [],
    plotSpecs: [],
    pendingImports: [],
    terminalEvents: [],
    commandHistory: [],
    terminalCommandLineRequest: undefined,
    currentPlotId: undefined,
    viewport: initialViewport(),

    initialize: async () => {
      const [files, datasets, layout] = await Promise.all([
        db.files.toArray(),
        db.datasets.toArray(),
        readPersistedLayout(db),
      ]);
      let nextDatasets = datasets;
      let nextFiles = files;

      if (nextDatasets.length === 0) {
        const initialProject = createInitialProject();
        await db.transaction("rw", db.datasets, db.files, async () => {
          await db.datasets.bulkPut(initialProject.datasets);
          await db.files.bulkPut(initialProject.files);
        });
        nextDatasets = initialProject.datasets;
        nextFiles = initialProject.files;
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

      set({
        initialized: true,
        files: nextFiles,
        datasets: nextDatasets,
        windows: nextWindows,
        plotSpecs: nextPlotSpecs,
        commandHistory: layout.commandHistory ?? [],
        viewport: layout.viewport,
        activeDatasetId: nextDatasets[0]?.id,
        currentPlotId:
          persistedConfigPlotId && nextPlotSpecs.some((plot) => plot.id === persistedConfigPlotId)
            ? persistedConfigPlotId
            : nextPlotSpecs[0]?.id,
      });
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
      const id = crypto.randomUUID();
      const options = { ...defaultImportParseOptions };
      const { preview, error } = createPreview(id, fileName, text, options);

      set((state) => {
        const zIndex = Math.max(0, ...state.windows.map((window) => window.zIndex)) + 1;
        const pendingImport: PendingImport = { id, fileName, text, options, preview, error };
        const window: WorkspaceWindow = {
          id: `import-${id}`,
          kind: "import",
          title: `Import - ${fileName}`,
          x: 360 + state.pendingImports.length * 24,
          y: 130 + state.pendingImports.length * 20,
          width: 820,
          height: 540,
          zIndex,
          importId: id,
        };

        return {
          pendingImports: [...state.pendingImports, pendingImport],
          windows: [...state.windows, window],
          activeWindowId: window.id,
        };
      });
      persistLayout(db, get());
      return id;
    },

    updateImportOptions: (importId, options) => {
      set((state) => ({
        pendingImports: state.pendingImports.map((pendingImport) => {
          if (pendingImport.id !== importId) return pendingImport;
          const nextOptions = { ...pendingImport.options, ...options };
          const { preview, error } = createPreview(
            pendingImport.id,
            pendingImport.fileName,
            pendingImport.text,
            nextOptions,
          );
          return {
            ...pendingImport,
            options: normalizeColumnNames(nextOptions, preview),
            preview,
            error,
          };
        }),
      }));
    },

    confirmImport: async (importId) => {
      const pendingImport = get().pendingImports.find((item) => item.id === importId);
      if (!pendingImport) return undefined;

      const path = uniquifyPath(normalizeVirtualPath(pendingImport.fileName), get().files);
      let parseError: string | undefined;
      let dataset: Dataset | undefined;
      const result = executeScispaceCommand(
        `import-confirm ${importId} path=${encodeURIComponent(path)} raw=${String(!canParseAsTable(pendingImport.fileName))}`,
        { datasets: get().datasets, pendingImports: [pendingImport] },
      );
      if (result.kind === "import-confirm") {
        dataset = result.dataset;
        parseError = result.parseError;
      } else {
        parseError = result.output;
      }

      const file = makeFileRecord(path, pendingImport.text, dataset?.id, parseError);
      await db.files.put(file);
      if (dataset) await db.datasets.put(dataset);

      set((state) => ({
        files: [...state.files.filter((item) => item.id !== file.id), file],
        datasets: dataset
          ? [...state.datasets.filter((item) => item.id !== dataset.id), dataset]
          : state.datasets,
        activeDatasetId: dataset?.id ?? state.activeDatasetId,
        pendingImports: state.pendingImports.filter((item) => item.id !== importId),
        windows: state.windows.filter((window) => window.importId !== importId),
        terminalEvents: [
          ...state.terminalEvents,
          dataset
            ? `Imported ${file.path} as dataset ${dataset.name}`
            : `Stored ${file.path}: ${parseError}`,
        ],
      }));
      persistLayout(db, get());

      return { file, dataset, parseError };
    },

    cancelImport: (importId) => {
      set((state) => ({
        pendingImports: state.pendingImports.filter((item) => item.id !== importId),
        windows: state.windows.filter((window) => window.importId !== importId),
      }));
      persistLayout(db, get());
    },

    selectDataset: async (datasetId) => {
      set({ activeDatasetId: datasetId });
      await get().openTable(datasetId);
    },

    openTable: async (datasetId) => {
      const dataset = get().datasets.find((item) => item.id === datasetId);
      if (!dataset) return;

      set((state) => {
        const zIndex = Math.max(0, ...state.windows.map((window) => window.zIndex)) + 1;
        const existing = state.windows.find(
          (window) => window.kind === "table" && window.datasetId === datasetId,
        );
        const nextWindow: WorkspaceWindow = {
          id: `table-${datasetId}`,
          kind: "table",
          title: `Table - ${dataset.name}`,
          x: 420 + state.windows.length * 18,
          y: 102 + state.windows.length * 14,
          width: 650,
          height: tableWindowHeightForRows(10),
          zIndex,
          datasetId,
        };
        const windows = existing
          ? state.windows.map((window) =>
              window.id === existing.id ? { ...window, zIndex } : window,
            )
          : [...state.windows, nextWindow];
        return { windows, activeWindowId: existing?.id ?? `table-${datasetId}` };
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
              x: 760 + state.windows.length * 20,
              y: 116 + state.windows.length * 16,
              width: 640,
              height: 420,
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
          x: centerTileX + 1180,
          y: centerTileY + 128,
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

    updateDatasetCell: async (datasetId, rowIndex, column, value) => {
      const dataset = get().datasets.find((item) => item.id === datasetId);
      if (!dataset || !dataset.columns.includes(column) || rowIndex < 0) return;
      if (rowIndex >= dataset.rows.length) return;

      const updatedDataset: Dataset = {
        ...dataset,
        rows: dataset.rows.map((row, index) =>
          index === rowIndex ? { ...row, [column]: normalizeDataValue(value) } : row,
        ),
      };
      const sourceFile = get().files.find(
        (file) => file.datasetId === datasetId || file.path === updatedDataset.sourcePath,
      );
      const updatedFile = sourceFile
        ? { ...sourceFile, text: datasetToDelimitedText(updatedDataset) }
        : undefined;

      await db.transaction("rw", db.datasets, db.files, async () => {
        await db.datasets.put(updatedDataset);
        if (updatedFile) await db.files.put(updatedFile);
      });

      set((state) => ({
        datasets: state.datasets.map((item) => (item.id === datasetId ? updatedDataset : item)),
        files: updatedFile
          ? state.files.map((file) => (file.id === updatedFile.id ? updatedFile : file))
          : state.files,
      }));
    },

    runScispace: async (input, options) => {
      let result = executeScispaceCommand(input, {
        datasets: get().datasets,
        files: get().files,
        plotSpecs: get().plotSpecs,
      });

      if (result.kind === "open-table") await get().openTable(result.datasetId);
      if (result.kind === "plot" || result.kind === "plot-created")
        await get().openPlot(result.spec);
      if (
        result.kind === "plot-updated" ||
        result.kind === "plot-series-updated" ||
        result.kind === "plot-axis-updated"
      ) {
        const spec = normalizePlotSpec(result.spec);
        set((state) => {
          const plotSpecs = state.plotSpecs.map((plot) => (plot.id === spec.id ? spec : plot));
          return {
            plotSpecs,
            windows: state.windows.map((window) => {
              const retitledWindow = retitleWindow(window, state.datasets, plotSpecs);
              return retitledWindow.kind === "plot" && retitledWindow.plotId === spec.id
                ? { ...retitledWindow, width: spec.size.width, height: spec.size.height }
                : retitledWindow;
            }),
          };
        });
        persistLayout(db, get());
      }
      if (result.kind === "dataset-created") {
        const dataset = result.dataset;
        await db.datasets.put(dataset);
        await db.files.put(
          makeFileRecord(dataset.sourcePath, datasetToDelimitedText(dataset), dataset.id),
        );
        set((state) => ({
          datasets: [...state.datasets, dataset],
          files: [
            ...state.files,
            makeFileRecord(dataset.sourcePath, datasetToDelimitedText(dataset), dataset.id),
          ],
          activeDatasetId: dataset.id,
        }));
      }
      if (result.kind === "file-command") {
        const fileCommand = result;
        const target = get().files.find((file) => file.path === fileCommand.path);
        if (fileCommand.action === "mkdir") {
          const directory = await get().createDirectory(
            fileCommand.path.split("/").at(-1) ?? "",
            parentDirectoryOf(fileCommand.path),
          );
          result = directory
            ? { ...fileCommand, output: `Directory created: ${directory.path}` }
            : { kind: "error", output: `Directory not created: ${fileCommand.path}` };
        } else if (fileCommand.action === "rename") {
          if (!target || !fileCommand.name) {
            result = { kind: "error", output: `File not found: ${fileCommand.path}` };
          } else {
            await get().renameVirtualItem(fileCommand.path, fileCommand.name);
            result = { ...fileCommand, output: `Renamed: ${fileCommand.path}` };
          }
        } else if (fileCommand.action === "move") {
          const directory =
            fileCommand.targetDirectory === "~/raw"
              ? undefined
              : get().files.find((file) => file.path === fileCommand.targetDirectory);
          if (!target) {
            result = { kind: "error", output: `File not found: ${fileCommand.path}` };
          } else if (
            fileCommand.targetDirectory !== "~/raw" &&
            (!directory || directory.kind !== "directory")
          ) {
            result = {
              kind: "error",
              output: `Directory not found: ${fileCommand.targetDirectory}`,
            };
          } else {
            await get().moveVirtualItem(fileCommand.path, fileCommand.targetDirectory ?? "~/raw");
            result = { ...fileCommand, output: `Moved: ${fileCommand.path}` };
          }
        } else if (fileCommand.action === "delete") {
          if (!target) {
            result = { kind: "error", output: `File not found: ${fileCommand.path}` };
          } else {
            await get().deleteVirtualItem(fileCommand.path);
            result = { ...fileCommand, output: `Deleted: ${fileCommand.path}` };
          }
        }
      }

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
      }));
      persistLayout(db, get());
      return result;
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

    createNewProject: async () => {
      const initialProject = createInitialProject();
      await db.transaction("rw", db.files, db.datasets, db.layout, async () => {
        await db.files.clear();
        await db.datasets.clear();
        await db.layout.clear();
        await db.files.bulkPut(initialProject.files);
        await db.datasets.bulkPut(initialProject.datasets);
        await db.layout.put({
          id: "main",
          value: {
            windows: initialProject.windows,
            viewport: initialProject.viewport,
            plotSpecs: initialProject.plotSpecs,
            commandHistory: initialProject.commandHistory,
          },
        });
      });

      set({
        initialized: true,
        files: initialProject.files,
        datasets: initialProject.datasets,
        windows: initialProject.windows,
        plotSpecs: initialProject.plotSpecs,
        pendingImports: [],
        terminalEvents: [],
        commandHistory: [],
        terminalCommandLineRequest: undefined,
        activeDatasetId: initialProject.datasets[0]?.id,
        activeWindowId: undefined,
        currentPlotId: initialProject.plotSpecs[0]?.id,
        viewport: initialProject.viewport,
      });
      persistLayout(db, get());
    },

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
      const renamedAffectedEntries = get()
        .files.filter((file) => affectedPaths.has(file.path))
        .map((file) => {
          const nextPath =
            file.path === path ? basePath : `${basePath}${file.path.slice(path.length)}`;
          return [
            file.path,
            {
              ...file,
              id: nextPath,
              path: nextPath,
              name: nextPath.split("/").at(-1) ?? nextPath,
            },
          ] as const;
        });
      const renamedAffectedFiles = renamedAffectedEntries.map(([, file]) => file);
      const renamedByOldPath = new Map(renamedAffectedEntries);
      const renamedFiles = get().files.map((file) => {
        if (!affectedPaths.has(file.path)) return file;
        return renamedByOldPath.get(file.path) ?? file;
      });
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
      const movedAffectedEntries = get()
        .files.filter((file) => affectedPaths.has(file.path))
        .map((file) => {
          const nextPath =
            file.path === path ? basePath : `${basePath}${file.path.slice(path.length)}`;
          return [
            file.path,
            {
              ...file,
              id: nextPath,
              path: nextPath,
              name: nextPath.split("/").at(-1) ?? nextPath,
            },
          ] as const;
        });
      const movedAffectedFiles = movedAffectedEntries.map(([, file]) => file);
      const movedByOldPath = new Map(movedAffectedEntries);
      const movedFiles = get().files.map((file) => {
        if (!affectedPaths.has(file.path)) return file;
        return movedByOldPath.get(file.path) ?? file;
      });
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
