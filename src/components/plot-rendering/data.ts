import type uPlot from "uplot";
import { finitePlotValue } from "../../domain/scispace/plotSpec";
import type { Dataset, PlotSeries, PlotSpec } from "../../domain/types";

export const sortedPlotSeries = (series: PlotSeries[]): PlotSeries[] =>
  [...series].sort(
    (left, right) => left.drawOrder - right.drawOrder || left.y.localeCompare(right.y),
  );

export const buildSortedAlignedPlotData = (dataset: Dataset, spec: PlotSpec): uPlot.AlignedData => {
  const series = sortedPlotSeries(spec.series);
  const points = dataset.rows
    .flatMap((row) => {
      const x = finitePlotValue(row[spec.x]);
      if (x === null) return [];
      return [{ x, yValues: series.map((item) => finitePlotValue(row[item.y])) }];
    })
    .sort((left, right) => left.x - right.x);

  return [
    points.map((point) => point.x),
    ...series.map((_, seriesIndex) => points.map((point) => point.yValues[seriesIndex] ?? null)),
  ];
};
