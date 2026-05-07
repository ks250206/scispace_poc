import { create } from "zustand";
import {
  createSeedDataset,
  detectImportPreset,
  datasetToDelimitedText,
  defaultImportParseOptions,
  datasetColumnIds,
  normalizeDataset,
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
  PersistedLayout,
  PlotSpec,
  ScispaceCommandResult,
  ViewportState,
  VirtualFile,
  WorkspaceWindow,
} from "../domain/types";
import {
  appDb,
  readPersistedLayout,
  type ProjectRecord,
  type SciSpaceDatabase,
  writePersistedLayout,
} from "./db";

interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

interface ScispaceState {
  initialized: boolean;
  files: VirtualFile[];
  datasets: Dataset[];
  projects: ProjectSummary[];
  currentProjectId?: string;
  windows: WorkspaceWindow[];
  plotSpecs: PlotSpec[];
  pendingImports: PendingImport[];
  terminalEvents: string[];
  commandHistory: CommandHistoryEntry[];
  undoStack: UndoHistoryEntry[];
  redoStack: UndoHistoryEntry[];
  terminalCommandLineRequest?: { id: string; command: string };
  columnSelections: Record<string, string[]>;
  activeDatasetId?: string;
  activeWindowId?: string;
  currentPlotId?: string;
  viewport: ViewportState;
  initialize: () => Promise<void>;
  importTextFile: (name: string, text: string) => Promise<ImportFileResult>;
  openImportDialog: (fileName: string, text: string) => string;
  confirmImport: (importId: string) => Promise<ImportFileResult | undefined>;
  setDatasetColumnSelection: (datasetId: string, columnIds: string[]) => void;
  toggleDatasetColumn: (datasetId: string, columnId: string) => void;
  selectDataset: (datasetId: string) => Promise<void>;
  openTable: (datasetId: string, columnIds?: string[]) => Promise<void>;
  openPlot: (spec: PlotSpec) => Promise<void>;
  openPlotConfig: (plotId: string) => void;
  runScispace: (
    input: string,
    options?: { source?: CommandHistorySource },
  ) => Promise<ScispaceCommandResult>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  closeWindow: (id: string) => void;
  createNewProject: (name?: string) => Promise<void>;
  saveCurrentProject: (name?: string) => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
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

interface ProjectSnapshot {
  files: VirtualFile[];
  datasets: Dataset[];
  windows: WorkspaceWindow[];
  plotSpecs: PlotSpec[];
  pendingImports: PendingImport[];
  columnSelections: Record<string, string[]>;
  activeDatasetId?: string;
  activeWindowId?: string;
  currentPlotId?: string;
  viewport: ViewportState;
}

interface UndoHistoryEntry {
  id: string;
  command: string;
  before: ProjectSnapshot;
  after: ProjectSnapshot;
  createdAt: number;
}

const centerTileX = 1920;
const centerTileY = 1080;
const plotWindowChromeHeight = 94;
const tableWindowHeightForRows = (visibleRows: 10 | 20 | 50): number =>
  34 + 38 + 32 + visibleRows * 32;
const plotWindowHeightForSpec = (height: number): number => height + plotWindowChromeHeight;
const visibleWorkspaceOrigin = (viewport: ViewportState): { x: number; y: number } => {
  const scale = Math.max(0.01, viewport.scale);
  return {
    x: -viewport.x / scale,
    y: -viewport.y / scale,
  };
};

const newWindowPosition = (
  state: Pick<ScispaceState, "viewport" | "windows">,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } => {
  const origin = visibleWorkspaceOrigin(state.viewport);
  const cascade = state.windows.length % 8;
  return {
    x: Math.round(origin.x + offsetX + cascade * 24),
    y: Math.round(origin.y + offsetY + cascade * 20),
  };
};

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
    height: plotWindowHeightForSpec(360),
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
      drawOrder: 0,
    },
  ],
  zoomMode: "xy",
  axes: { x: defaultPlotAxis("time"), y: defaultPlotAxis("signal") },
  grid: { x: true, y: true },
  border: true,
  size: { width: 640, height: 360 },
  font: { family: "Inter, system-ui, sans-serif", size: 12 },
  padding: { top: 12, right: 12, bottom: 12, left: 12 },
  annotations: [],
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
    columnSelections: { [seed.id]: datasetColumnIds(seed) },
  };
};

const defaultProjectId = "project-main";
const defaultProjectName = "Main Project";

const projectSummary = (record: ProjectRecord): ProjectSummary => ({
  id: record.id,
  name: record.name,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

const layoutFromState = (
  state: ScispaceState,
  projectId = state.currentProjectId,
): PersistedLayout => ({
  windows: state.windows.filter((window) => window.kind !== "import"),
  viewport: state.viewport,
  plotSpecs: state.plotSpecs.map(normalizePlotSpec),
  commandHistory: state.commandHistory,
  columnSelections: state.columnSelections,
  currentProjectId: projectId,
});

const initialProjectRecord = (id: string, name: string, createdAt = Date.now()): ProjectRecord => {
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

const projectRecordFromState = (
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

const cloneState = <T>(value: T): T => structuredClone(value);

const captureSnapshot = (state: ScispaceState): ProjectSnapshot => ({
  files: cloneState(state.files),
  datasets: cloneState(state.datasets),
  windows: cloneState(state.windows),
  plotSpecs: cloneState(state.plotSpecs),
  pendingImports: cloneState(state.pendingImports),
  columnSelections: cloneState(state.columnSelections),
  activeDatasetId: state.activeDatasetId,
  activeWindowId: state.activeWindowId,
  currentPlotId: state.currentPlotId,
  viewport: cloneState(state.viewport),
});

const isUndoableCommand = (input: string): boolean => {
  const command = input.trim();
  if (/^table-edit\s/.test(command)) {
    return /(?:^|\s)action=(set-cell|delete-row|delete-column)(?:\s|$)/.test(command);
  }
  if (/^table-range\s/.test(command)) {
    return /(?:^|\s)action=(clear|fill-down)(?:\s|$)/.test(command);
  }
  if (/^import-confirm\s/.test(command)) return true;
  return /^file-(delete|rename|move)\s/.test(command);
};

const persistLayout = (db: SciSpaceDatabase, state: ScispaceState): void => {
  void writePersistedLayout(db, layoutFromState(state));
};

const restoreSnapshot = async (
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
        columnSelections: snapshot.columnSelections,
        currentProjectId: undefined,
      },
    });
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

const normalizeColumnSelections = (
  datasets: Dataset[],
  selections: Record<string, string[]>,
): Record<string, string[]> =>
  Object.fromEntries(
    datasets.map((dataset) => {
      const validColumnIds = datasetColumnIds(dataset);
      const selected = (selections[dataset.id] ?? validColumnIds).filter((columnId) =>
        validColumnIds.includes(columnId),
      );
      return [dataset.id, selected.length > 0 ? selected : validColumnIds];
    }),
  );

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

const emptyColumnIds = (dataset?: Dataset): string[] => {
  if (!dataset) return [];
  return dataset.columns
    .filter((column) =>
      dataset.rows.every((row) => {
        const value = row[column.id];
        return value == null || value === "";
      }),
    )
    .map((column) => column.id);
};

const createPreviews = (
  id: string,
  fileName: string,
  text: string,
  options: ImportParseOptions,
): { allPreview?: Dataset; preview?: Dataset; error?: string } => {
  const allResult = executeScispaceCommand(`import-preview ${id}`, {
    datasets: [],
    pendingImports: [
      { id, fileName, text, mode: "tabular", options: { ...options, excludedColumnIds: [] } },
    ],
  });
  const result = executeScispaceCommand(`import-preview ${id}`, {
    datasets: [],
    pendingImports: [{ id, fileName, text, mode: "tabular", options }],
  });
  if (result.kind === "import-preview" && allResult.kind === "import-preview") {
    return { allPreview: allResult.preview, preview: result.preview, error: result.error };
  }
  return { error: result.output };
};

const normalizeColumnNames = (
  options: ImportParseOptions,
  preview?: Dataset,
): ImportParseOptions => {
  if (options.hasHeader || !preview) return options;
  const columnNames = preview.columns.map(
    (column, index) => options.columnNames[index]?.trim() || column.name || `column_${index + 1}`,
  );
  return { ...options, columnNames };
};

const readCommandPath = (input: string): string | undefined => {
  const match = input.match(/(?:^|\s)path=("[^"]+"|'[^']+'|\S+)/);
  if (!match) return undefined;
  const token = match[1].replace(/^["']|["']$/g, "");
  try {
    return decodeURIComponent(token);
  } catch {
    return token;
  }
};

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
      const id = crypto.randomUUID();
      const detectedPreset = detectImportPreset(text, fileName);
      const baseOptions = detectedPreset
        ? { ...defaultImportParseOptions, ...detectedPreset.options }
        : defaultImportParseOptions;
      const initialPreview = createPreviews(id, fileName, text, baseOptions);
      const options = {
        ...baseOptions,
        excludedColumnIds: emptyColumnIds(initialPreview.allPreview),
      };
      const { allPreview, preview, error } = createPreviews(id, fileName, text, options);

      set((state) => {
        const zIndex = Math.max(0, ...state.windows.map((window) => window.zIndex)) + 1;
        const pendingImport: PendingImport = {
          id,
          fileName,
          text,
          mode: "tabular",
          options,
          detectedPreset,
          allPreview,
          preview,
          error,
        };
        const position = newWindowPosition(state, 72, 84);
        const window: WorkspaceWindow = {
          id: `import-${id}`,
          kind: "import",
          title: `Import - ${fileName}`,
          x: position.x,
          y: position.y,
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

      if (result.kind === "open-table") await get().openTable(result.datasetId, result.columnIds);
      if (result.kind === "plot" || result.kind === "plot-created")
        await get().openPlot(result.spec);
      if (
        result.kind === "plot-updated" ||
        result.kind === "plot-series-updated" ||
        result.kind === "plot-axis-updated" ||
        result.kind === "plot-annotation-updated"
      ) {
        const spec = normalizePlotSpec(result.spec);
        set((state) => {
          const plotSpecs = state.plotSpecs.map((plot) => (plot.id === spec.id ? spec : plot));
          return {
            plotSpecs,
            windows: state.windows.map((window) => {
              const retitledWindow = retitleWindow(window, state.datasets, plotSpecs);
              return retitledWindow.kind === "plot" && retitledWindow.plotId === spec.id
                ? {
                    ...retitledWindow,
                    width: spec.size.width,
                    height: plotWindowHeightForSpec(spec.size.height),
                  }
                : retitledWindow;
            }),
          };
        });
        persistLayout(db, get());
      }
      if (result.kind === "import-open") {
        const importId = result.importId;
        const detectedPreset = detectImportPreset(
          result.pendingImport.text,
          result.pendingImport.fileName,
        );
        const baseOptions = detectedPreset
          ? { ...result.pendingImport.options, ...detectedPreset.options }
          : result.pendingImport.options;
        const initialPreview = createPreviews(
          importId,
          result.pendingImport.fileName,
          result.pendingImport.text,
          baseOptions,
        );
        const options = {
          ...baseOptions,
          excludedColumnIds: emptyColumnIds(initialPreview.allPreview),
        };
        const { allPreview, preview, error } = createPreviews(
          importId,
          result.pendingImport.fileName,
          result.pendingImport.text,
          options,
        );
        const pendingImport: PendingImport = {
          ...result.pendingImport,
          options,
          detectedPreset,
          allPreview,
          preview,
          error,
        };
        set((state) => {
          const existingWindow = state.windows.find((window) => window.importId === importId);
          const zIndex = Math.max(0, ...state.windows.map((window) => window.zIndex)) + 1;
          const position = newWindowPosition(state, 72, 84);
          const window: WorkspaceWindow = {
            id: `import-${importId}`,
            kind: "import",
            title: `Import - ${pendingImport.fileName}`,
            x: position.x,
            y: position.y,
            width: 820,
            height: 540,
            zIndex,
            importId,
          };
          return {
            pendingImports: [
              ...state.pendingImports.filter((item) => item.id !== importId),
              pendingImport,
            ],
            windows: existingWindow
              ? state.windows.map((item) =>
                  item.id === existingWindow.id ? { ...item, zIndex } : item,
                )
              : [...state.windows, window],
            activeWindowId: existingWindow?.id ?? window.id,
          };
        });
        result = { ...result, pendingImport };
      }
      if (result.kind === "dataset-updated") {
        const dataset = result.dataset;
        const validColumnIds = new Set(datasetColumnIds(dataset));
        const sourceFile = get().files.find(
          (file) => file.datasetId === dataset.id || file.path === dataset.sourcePath,
        );
        const updatedFile = sourceFile
          ? { ...sourceFile, text: datasetToDelimitedText(dataset) }
          : undefined;

        await db.transaction("rw", db.datasets, db.files, async () => {
          await db.datasets.put(dataset);
          if (updatedFile) await db.files.put(updatedFile);
        });

        set((state) => {
          const datasets = state.datasets.map((item) => (item.id === dataset.id ? dataset : item));
          const files = updatedFile
            ? state.files.map((file) => (file.id === updatedFile.id ? updatedFile : file))
            : state.files;
          const plotSpecs = state.plotSpecs
            .map((plot) => {
              if (plot.source !== dataset.id) return plot;
              if (!validColumnIds.has(plot.x)) return undefined;
              const series = plot.series.filter((item) => validColumnIds.has(item.y));
              if (series.length === 0) return undefined;
              return normalizePlotSpec({ ...plot, series });
            })
            .filter((plot): plot is PlotSpec => Boolean(plot));
          const plotIds = new Set(plotSpecs.map((plot) => plot.id));
          const windows = state.windows
            .filter((window) => {
              if (window.plotId && !plotIds.has(window.plotId)) return false;
              return true;
            })
            .map((window) => {
              const retitledWindow = retitleWindow(window, datasets, plotSpecs);
              if (retitledWindow.kind === "table" && retitledWindow.datasetId === dataset.id) {
                return { ...retitledWindow, columnIds: datasetColumnIds(dataset) };
              }
              return retitledWindow;
            });
          const columnSelections = { ...state.columnSelections };
          if (columnSelections[dataset.id]) {
            const nextColumnIds = columnSelections[dataset.id].filter((columnId) =>
              validColumnIds.has(columnId),
            );
            if (nextColumnIds.length > 0) columnSelections[dataset.id] = nextColumnIds;
            else columnSelections[dataset.id] = datasetColumnIds(dataset);
          } else {
            columnSelections[dataset.id] = datasetColumnIds(dataset);
          }
          const visibleColumnIds = columnSelections[dataset.id] ?? datasetColumnIds(dataset);
          const retitledWindows = windows.map((window) =>
            window.kind === "table" && window.datasetId === dataset.id
              ? { ...window, columnIds: visibleColumnIds }
              : window,
          );

          return {
            datasets,
            files,
            windows: retitledWindows,
            plotSpecs,
            columnSelections,
            activeDatasetId: nextActiveDatasetId(datasets, state.activeDatasetId),
            currentPlotId:
              state.currentPlotId && plotIds.has(state.currentPlotId)
                ? state.currentPlotId
                : plotSpecs[0]?.id,
            activeWindowId:
              state.activeWindowId &&
              retitledWindows.some((window) => window.id === state.activeWindowId)
                ? state.activeWindowId
                : undefined,
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
          columnSelections: { ...state.columnSelections, [dataset.id]: datasetColumnIds(dataset) },
          activeDatasetId: dataset.id,
        }));
      }
      if (result.kind === "import-updated") {
        const updatedImport = result.pendingImport;
        const { allPreview, preview, error } = createPreviews(
          updatedImport.id,
          updatedImport.fileName,
          updatedImport.text,
          updatedImport.options,
        );
        const normalizedImport: PendingImport = {
          ...updatedImport,
          options: normalizeColumnNames(updatedImport.options, allPreview),
          allPreview,
          preview,
          error,
        };
        set((state) => ({
          pendingImports: state.pendingImports.map((pendingImport) =>
            pendingImport.id === normalizedImport.id ? normalizedImport : pendingImport,
          ),
        }));
        result = { ...result, pendingImport: normalizedImport };
      }
      if (result.kind === "import-confirm") {
        const importId = result.importId;
        const pendingImport = get().pendingImports.find((item) => item.id === importId);
        if (!pendingImport) {
          result = { kind: "error", output: `Pending import not found: ${importId}` };
        } else {
          const rawPath = readCommandPath(input) ?? normalizeVirtualPath(pendingImport.fileName);
          const path = uniquifyPath(rawPath, get().files);
          const dataset = result.dataset
            ? {
                ...result.dataset,
                name: path.split("/").at(-1) ?? result.dataset.name,
                sourcePath: path,
              }
            : undefined;
          const file = makeFileRecord(path, pendingImport.text, dataset?.id, result.parseError);
          await db.transaction("rw", db.datasets, db.files, async () => {
            await db.files.put(file);
            if (dataset) await db.datasets.put(dataset);
          });
          set((state) => ({
            files: [...state.files.filter((item) => item.id !== file.id), file],
            datasets: dataset
              ? [...state.datasets.filter((item) => item.id !== dataset.id), dataset]
              : state.datasets,
            columnSelections: dataset
              ? { ...state.columnSelections, [dataset.id]: datasetColumnIds(dataset) }
              : state.columnSelections,
            activeDatasetId: dataset?.id ?? state.activeDatasetId,
            pendingImports: state.pendingImports.filter((item) => item.id !== importId),
            windows: state.windows.filter((window) => window.importId !== importId),
          }));
        }
      }
      if (result.kind === "import-cancel") {
        const importId = result.importId;
        set((state) => ({
          pendingImports: state.pendingImports.filter((item) => item.id !== importId),
          windows: state.windows.filter((window) => window.importId !== importId),
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

    createNewProject: async (name) => {
      if (get().initialized && get().currentProjectId) {
        await get().saveCurrentProject();
      }
      const id = `project-${crypto.randomUUID()}`;
      const projectName = name?.trim() || `Untitled Project ${get().projects.length + 1}`;
      const record = initialProjectRecord(id, projectName);
      const initialProject = {
        files: record.files,
        datasets: record.datasets,
        windows: record.layout.windows,
        plotSpecs: record.layout.plotSpecs ?? [],
        viewport: record.layout.viewport,
        commandHistory: record.layout.commandHistory ?? [],
        columnSelections: record.layout.columnSelections ?? {},
      };
      await db.transaction("rw", db.files, db.datasets, db.layout, db.projects, async () => {
        await db.files.clear();
        await db.datasets.clear();
        await db.layout.clear();
        await db.projects.put(record);
        await db.files.bulkPut(initialProject.files);
        await db.datasets.bulkPut(initialProject.datasets);
        await db.layout.put({
          id: "main",
          value: record.layout,
        });
      });

      set({
        initialized: true,
        files: initialProject.files,
        datasets: initialProject.datasets,
        projects: [
          ...get().projects.filter((project) => project.id !== id),
          projectSummary(record),
        ],
        currentProjectId: id,
        windows: initialProject.windows,
        plotSpecs: initialProject.plotSpecs,
        pendingImports: [],
        terminalEvents: [],
        commandHistory: [],
        undoStack: [],
        redoStack: [],
        columnSelections: initialProject.columnSelections,
        terminalCommandLineRequest: undefined,
        activeDatasetId: initialProject.datasets[0]?.id,
        activeWindowId: undefined,
        currentPlotId: initialProject.plotSpecs[0]?.id,
        viewport: initialProject.viewport,
      });
      persistLayout(db, get());
    },

    saveCurrentProject: async (name) => {
      const id = get().currentProjectId ?? defaultProjectId;
      const previous = await db.projects.get(id);
      const projectName = name?.trim() || previous?.name || defaultProjectName;
      const record = projectRecordFromState(get(), id, projectName, previous);
      await db.transaction("rw", db.projects, db.layout, async () => {
        await db.projects.put(record);
        await db.layout.put({ id: "main", value: record.layout });
      });
      set((state) => ({
        currentProjectId: id,
        projects: [
          ...state.projects.filter((project) => project.id !== id),
          projectSummary(record),
        ].sort((left, right) => left.createdAt - right.createdAt),
      }));
      persistLayout(db, get());
    },

    switchProject: async (projectId) => {
      if (!projectId || projectId === get().currentProjectId) return;
      const target = await db.projects.get(projectId);
      if (!target) return;
      if (get().currentProjectId) await get().saveCurrentProject();
      const datasets = target.datasets.map(normalizeDataset);
      const plotSpecs = (target.layout.plotSpecs ?? [seedPlot()]).map(normalizePlotSpec);
      const windows = ensureWorkspaceWindows(target.layout.windows);
      const columnSelections = normalizeColumnSelections(
        datasets,
        target.layout.columnSelections ?? {},
      );
      await db.transaction("rw", db.files, db.datasets, db.layout, async () => {
        await db.files.clear();
        await db.datasets.clear();
        await db.files.bulkPut(target.files);
        await db.datasets.bulkPut(datasets);
        await db.layout.put({
          id: "main",
          value: {
            ...target.layout,
            windows,
            plotSpecs,
            columnSelections,
            currentProjectId: projectId,
          },
        });
      });
      const projects = (await db.projects.toArray()).map(projectSummary);
      const persistedConfigPlotId = windows.find(
        (window) => window.kind === "plot-config" && window.plotId,
      )?.plotId;
      set({
        files: target.files,
        datasets,
        projects,
        currentProjectId: projectId,
        windows,
        plotSpecs,
        pendingImports: [],
        terminalEvents: [],
        commandHistory: target.layout.commandHistory ?? [],
        undoStack: [],
        redoStack: [],
        columnSelections,
        activeDatasetId: datasets[0]?.id,
        activeWindowId: undefined,
        currentPlotId:
          persistedConfigPlotId && plotSpecs.some((plot) => plot.id === persistedConfigPlotId)
            ? persistedConfigPlotId
            : plotSpecs[0]?.id,
        viewport: target.layout.viewport,
      });
      persistLayout(db, get());
    },

    deleteProject: async (projectId) => {
      if (!projectId) return;
      const deletingCurrent = projectId === get().currentProjectId;
      await db.projects.delete(projectId);
      const remaining = await db.projects.toArray();
      if (!deletingCurrent) {
        set({ projects: remaining.map(projectSummary) });
        return;
      }
      const nextProject = remaining[0];
      if (nextProject) {
        set({ currentProjectId: undefined });
        await get().switchProject(nextProject.id);
        return;
      }

      const replacement = initialProjectRecord(defaultProjectId, defaultProjectName);
      await db.projects.put(replacement);
      const datasets = replacement.datasets.map(normalizeDataset);
      await db.transaction("rw", db.files, db.datasets, db.layout, async () => {
        await db.files.clear();
        await db.datasets.clear();
        await db.files.bulkPut(replacement.files);
        await db.datasets.bulkPut(datasets);
        await db.layout.put({ id: "main", value: replacement.layout });
      });
      set({
        files: replacement.files,
        datasets,
        projects: [projectSummary(replacement)],
        currentProjectId: replacement.id,
        windows: replacement.layout.windows,
        plotSpecs: (replacement.layout.plotSpecs ?? []).map(normalizePlotSpec),
        pendingImports: [],
        terminalEvents: [],
        commandHistory: [],
        undoStack: [],
        redoStack: [],
        columnSelections: replacement.layout.columnSelections ?? {},
        terminalCommandLineRequest: undefined,
        activeDatasetId: datasets[0]?.id,
        activeWindowId: undefined,
        currentPlotId: replacement.layout.plotSpecs?.[0]?.id,
        viewport: replacement.layout.viewport,
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
