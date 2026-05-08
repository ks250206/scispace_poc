import type { StoreApi } from "zustand/vanilla";
import type { SciSpaceDatabase } from "../db";
import type { ScispaceState } from "./stateTypes";
import { nextActiveDatasetId, retitleWindow } from "./createStoreHelpers";
import { persistLayout } from "./projectPersistence";
import { normalizePlotSpec } from "./workspaceDefaults";
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

interface FileActionContext {
  db: SciSpaceDatabase;
  get: StoreApi<ScispaceState>["getState"];
  set: StoreApi<ScispaceState>["setState"];
}

export const createFileActions = ({
  db,
  get,
  set,
}: FileActionContext): Pick<
  ScispaceState,
  "createDirectory" | "renameVirtualItem" | "moveVirtualItem" | "deleteVirtualItem"
> => ({
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
});
