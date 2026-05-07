import { create } from "zustand";
import {
  createSeedDataset,
  datasetToDelimitedText,
  defaultImportParseOptions,
  normalizeVirtualPath,
  parseDelimitedText,
} from "../domain/csv";
import { executeScispaceCommand } from "../domain/scispace";
import type {
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
  activeDatasetId?: string;
  activeWindowId?: string;
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
  runScispace: (input: string) => Promise<ScispaceCommandResult>;
  closeWindow: (id: string) => void;
  createNewProject: () => Promise<void>;
  updateWindow: (
    id: string,
    patch: Partial<Pick<WorkspaceWindow, "x" | "y" | "width" | "height">>,
  ) => void;
  focusWindow: (id: string) => void;
  setViewport: (viewport: ViewportState) => void;
}

const initialWindows = (): WorkspaceWindow[] => [
  {
    id: "browser-main",
    kind: "browser",
    title: "Data Browser",
    x: 64,
    y: 72,
    width: 300,
    height: 440,
    zIndex: 1,
  },
  {
    id: "table-seed",
    kind: "table",
    title: "Table - waveform.csv",
    x: 396,
    y: 88,
    width: 650,
    height: 420,
    zIndex: 2,
    datasetId: "seed-waveform",
  },
  {
    id: "plot-seed",
    kind: "plot",
    title: "Plot - waveform.csv",
    x: 1088,
    y: 88,
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
    x: 64,
    y: 612,
    width: 1664,
    height: 300,
    zIndex: 4,
  },
];

const ensureTerminalWindow = (windows: WorkspaceWindow[]): WorkspaceWindow[] => {
  if (windows.some((window) => window.kind === "terminal")) return windows;
  const zIndex = Math.max(0, ...windows.map((window) => window.zIndex)) + 1;
  return [
    ...windows,
    {
      id: "terminal-main",
      kind: "terminal",
      title: "Terminal",
      x: 64,
      y: 612,
      width: 1664,
      height: 300,
      zIndex,
    },
  ];
};

const seedPlot = (): PlotSpec => ({
  id: "seed-plot",
  type: "line",
  source: "seed-waveform",
  x: "time",
  y: "signal",
  title: "waveform.csv: signal vs time",
});

const initialViewport = (): ViewportState => ({ x: 0, y: 0, scale: 1 });

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

const createInitialProject = () => {
  const seed = createSeedDataset();
  const file = makeFileRecord(seed.sourcePath, datasetToDelimitedText(seed), seed.id);
  return {
    files: [file],
    datasets: [seed],
    windows: initialWindows(),
    plotSpecs: [seedPlot()],
    viewport: initialViewport(),
  };
};

const persistLayout = (db: SciSpaceDatabase, state: ScispaceState): void => {
  void writePersistedLayout(db, {
    windows: state.windows.filter((window) => window.kind !== "import"),
    viewport: state.viewport,
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
    viewport: { x: 0, y: 0, scale: 1 },

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

      set({
        initialized: true,
        files: nextFiles,
        datasets: nextDatasets,
        windows:
          layout.windows.length > 0 ? ensureTerminalWindow(layout.windows) : initialWindows(),
        plotSpecs: [seedPlot()],
        viewport: layout.viewport,
        activeDatasetId: nextDatasets[0]?.id,
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
          height: 420,
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
      const dataset = get().datasets.find((item) => item.id === spec.source);
      set((state) => {
        const zIndex = Math.max(0, ...state.windows.map((window) => window.zIndex)) + 1;
        return {
          plotSpecs: [...state.plotSpecs.filter((plot) => plot.id !== spec.id), spec],
          windows: [
            ...state.windows,
            {
              id: `plot-${spec.id}`,
              kind: "plot",
              title: spec.title,
              x: 760 + state.windows.length * 20,
              y: 116 + state.windows.length * 16,
              width: 640,
              height: 420,
              zIndex,
              datasetId: dataset?.id,
              plotId: spec.id,
            },
          ],
          activeWindowId: `plot-${spec.id}`,
        };
      });
      persistLayout(db, get());
    },

    runScispace: async (input) => {
      const result = executeScispaceCommand(input, { datasets: get().datasets });

      if (result.kind === "open-table") await get().openTable(result.datasetId);
      if (result.kind === "plot") await get().openPlot(result.spec);
      if (result.kind === "dataset-created") {
        await db.datasets.put(result.dataset);
        await db.files.put(
          makeFileRecord(
            result.dataset.sourcePath,
            datasetToDelimitedText(result.dataset),
            result.dataset.id,
          ),
        );
        set((state) => ({
          datasets: [...state.datasets, result.dataset],
          files: [
            ...state.files,
            makeFileRecord(
              result.dataset.sourcePath,
              datasetToDelimitedText(result.dataset),
              result.dataset.id,
            ),
          ],
          activeDatasetId: result.dataset.id,
        }));
      }

      set((state) => ({ terminalEvents: [...state.terminalEvents, result.output] }));
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
        activeDatasetId: initialProject.datasets[0]?.id,
        activeWindowId: undefined,
        viewport: initialProject.viewport,
      });
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
        return {
          windows: state.windows.map((window) =>
            window.id === id ? { ...window, zIndex } : window,
          ),
          activeWindowId: id,
        };
      });
      persistLayout(db, get());
    },

    setViewport: (viewport) => {
      set({ viewport });
      persistLayout(db, get());
    },
  }));

export const useScispaceStore = createScispaceStore(appDb);
