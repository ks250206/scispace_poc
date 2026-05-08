import type { StoreApi } from "zustand/vanilla";
import { datasetColumnIds } from "../../domain/csv";
import type { WorkspaceWindow } from "../../domain/types";
import type { SciSpaceDatabase } from "../db";
import { persistLayout } from "./projectPersistence";
import type { ScispaceState } from "./stateTypes";
import {
  newWindowPosition,
  normalizePlotSpec,
  plotWindowHeightForSpec,
  tableWindowHeightForRows,
} from "./workspaceDefaults";

interface WorkspaceActionContext {
  db: SciSpaceDatabase;
  get: StoreApi<ScispaceState>["getState"];
  set: StoreApi<ScispaceState>["setState"];
}

export const createWorkspaceActions = ({
  db,
  get,
  set,
}: WorkspaceActionContext): Pick<
  ScispaceState,
  | "setDatasetColumnSelection"
  | "toggleDatasetColumn"
  | "selectDataset"
  | "openTable"
  | "openPlot"
  | "openPlotConfig"
> => ({
  setDatasetColumnSelection: (datasetId, columnIds) => {
    const dataset = get().datasets.find((item) => item.id === datasetId);
    if (!dataset) return;
    const validColumns = new Set(datasetColumnIds(dataset));
    const nextColumnIds = columnIds.filter((columnId) => validColumns.has(columnId));
    set((state) => ({
      columnSelections: { ...state.columnSelections, [datasetId]: nextColumnIds },
      projectDirty: true,
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
        projectDirty: true,
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
        projectDirty: true,
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
        projectDirty: true,
        windows: existing
          ? state.windows.map((window) =>
              window.id === existing.id ? { ...window, zIndex, plotId } : window,
            )
          : [...state.windows, configWindow],
      };
    });
    persistLayout(db, get());
  },
});
