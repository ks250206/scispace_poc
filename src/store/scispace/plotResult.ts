import type { ScispaceCommandResult } from "../../domain/types";
import { persistLayout } from "./projectPersistence";
import type { ResultApplyContext } from "./resultApplyContext";
import { normalizePlotSpec, plotWindowHeightForSpec } from "./workspaceDefaults";

export const applyPlotResult = async (
  current: ScispaceCommandResult,
  context: ResultApplyContext,
): Promise<ScispaceCommandResult> => {
  let result = current;
  const { db, get, retitleWindow, set } = context;
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
