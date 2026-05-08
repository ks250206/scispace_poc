import type { StoreApi } from "zustand";
import {
  datasetColumnIds,
  datasetToDelimitedText,
  detectImportPreset,
  normalizeVirtualPath,
} from "../../domain/csv";
import type {
  Dataset,
  PendingImport,
  PlotSpec,
  ScispaceCommandResult,
  WorkspaceWindow,
} from "../../domain/types";
import type { SciSpaceDatabase } from "../db";
import { persistLayout } from "./projectPersistence";
import {
  createPreviews,
  emptyColumnIds,
  normalizeColumnNames,
  readCommandPath,
} from "./importPreview";
import type { ScispaceState } from "./stateTypes";
import {
  makeFileRecord,
  newWindowPosition,
  normalizePlotSpec,
  plotWindowHeightForSpec,
} from "./workspaceDefaults";
import { parentDirectoryOf, uniquifyPath } from "./virtualFiles";

interface ResultApplyContext {
  db: SciSpaceDatabase;
  get: StoreApi<ScispaceState>["getState"];
  set: StoreApi<ScispaceState>["setState"];
  input: string;
  retitleWindow: (
    window: WorkspaceWindow,
    datasets: Dataset[],
    plotSpecs: PlotSpec[],
  ) => WorkspaceWindow;
  nextActiveDatasetId: (datasets: Dataset[], current?: string) => string | undefined;
}

export const applyScispaceResult = async (
  initialResult: ScispaceCommandResult,
  context: ResultApplyContext,
): Promise<ScispaceCommandResult> => {
  const { db, get, input, nextActiveDatasetId, retitleWindow, set } = context;
  let result = initialResult;

  const applyPlotResult = async (
    current: ScispaceCommandResult,
  ): Promise<ScispaceCommandResult> => {
    let result = current;
    if (result.kind === "open-table") await get().openTable(result.datasetId, result.columnIds);
    if (result.kind === "plot" || result.kind === "plot-created") await get().openPlot(result.spec);
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

    return result;
  };

  const applyImportOpenResult = async (
    current: ScispaceCommandResult,
  ): Promise<ScispaceCommandResult> => {
    let result = current;
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

    return result;
  };

  const applyDatasetResult = async (
    current: ScispaceCommandResult,
  ): Promise<ScispaceCommandResult> => {
    let result = current;
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
        columnSelections: {
          ...state.columnSelections,
          [dataset.id]: datasetColumnIds(dataset),
        },
        activeDatasetId: dataset.id,
      }));
    }

    return result;
  };

  const applyImportResult = async (
    current: ScispaceCommandResult,
  ): Promise<ScispaceCommandResult> => {
    let result = current;
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

    return result;
  };

  const applyFileResult = async (
    current: ScispaceCommandResult,
  ): Promise<ScispaceCommandResult> => {
    let result = current;
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

    return result;
  };

  result = await applyPlotResult(result);
  result = await applyImportOpenResult(result);
  result = await applyDatasetResult(result);
  result = await applyImportResult(result);
  result = await applyFileResult(result);

  return result;
};
