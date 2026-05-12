import { datasetColumnIds, datasetToDelimitedText } from "../../domain/csv";
import type { PlotSpec, ScispaceCommandResult } from "../../domain/types";
import { persistLayout } from "./projectPersistence";
import type { ResultApplyContext } from "./resultApplyContext";
import { makeFileRecord, normalizePlotSpec } from "./workspaceDefaults";

export const applyDatasetResult = async (
  current: ScispaceCommandResult,
  context: ResultApplyContext,
): Promise<ScispaceCommandResult> => {
  let result = current;
  const { db, get, nextActiveDatasetId, retitleWindow, set } = context;
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
      const previousDataset = state.datasets.find((item) => item.id === dataset.id);
      const previousColumnIds = previousDataset ? datasetColumnIds(previousDataset) : [];
      const columnSelections = { ...state.columnSelections };
      if (columnSelections[dataset.id]) {
        const previousSelection = columnSelections[dataset.id];
        const selectedAllPreviousColumns =
          previousColumnIds.length > 0 &&
          previousColumnIds.every((columnId) => previousSelection.includes(columnId));
        const nextColumnIds = selectedAllPreviousColumns
          ? datasetColumnIds(dataset)
          : previousSelection.filter((columnId) => validColumnIds.has(columnId));
        columnSelections[dataset.id] =
          nextColumnIds.length > 0 ? nextColumnIds : datasetColumnIds(dataset);
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
