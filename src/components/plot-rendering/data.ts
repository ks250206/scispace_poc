import uPlot from "uplot";
import type { Dataset, PlotSeries, PlotSpec } from "../../domain/types";

export const sortedPlotSeries = (series: PlotSeries[]): PlotSeries[] =>
  [...series].sort(
    (left, right) => left.drawOrder - right.drawOrder || left.y.localeCompare(right.y),
  );

export const buildSortedAlignedPlotData = (dataset: Dataset, spec: PlotSpec): uPlot.AlignedData => {
  const series = sortedPlotSeries(spec.series);
  const points = dataset.rows
    .map((row, rowIndex) => {
      const x = Number(row[spec.x] ?? rowIndex);
      const yValues = series.map((item) => Number(row[item.y]));
      return { x, yValues, rowIndex };
    })
    .filter(
      (point) => Number.isFinite(point.x) && point.yValues.every((value) => Number.isFinite(value)),
    )
    .sort((left, right) => left.x - right.x || left.rowIndex - right.rowIndex);

  return [
    points.map((point) => point.x),
    ...series.map((_, seriesIndex) => points.map((point) => point.yValues[seriesIndex] ?? 0)),
  ] as uPlot.AlignedData;
};
