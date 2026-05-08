import { datasetColumnIds } from "../../domain/csv";
import type { Dataset, PlotSpec, WorkspaceWindow } from "../../domain/types";

export const nextActiveDatasetId = (datasets: Dataset[], current?: string): string | undefined =>
  current && datasets.some((dataset) => dataset.id === current) ? current : datasets[0]?.id;

export const normalizeColumnSelections = (
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

export const retitleWindow = (
  window: WorkspaceWindow,
  datasets: Dataset[],
  plotSpecs: PlotSpec[],
) => {
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
