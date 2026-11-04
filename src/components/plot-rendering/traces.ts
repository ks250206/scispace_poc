import { bisectLeft, bisectRight } from "d3-array";
import { line } from "d3-shape";
import type { PlotMarkerShape, PlotSpec } from "../../domain/types";
import { sortedPlotSeries, type PlotAxis, type PlotData } from "./data";
import type { PlotScale } from "./scales";

const markerShape = (shape: PlotMarkerShape, r: number) => {
  switch (shape) {
    case "square":
      return `m${-r},${-r}h${2 * r}v${2 * r}h${-2 * r}z`;
    case "triangle":
      return `m0,${-r}l${r},${2 * r}h${-2 * r}z`;
    case "diamond":
      return `m0,${-r}l${r},${r}l${-r},${r}l${-r},${-r}z`;
    case "cross":
      return `m${-r},${-r}l${2 * r},${2 * r}m${-2 * r},0l${2 * r},${-2 * r}`;
    case "plus":
      return `m${-r},0h${2 * r}m${-r},${-r}v${2 * r}`;
    case "circle":
      return `m${-r},0a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0z`;
  }
};

const coord = (value: number) => Math.round(value * 1000) / 1000;

export const plotTraces = (spec: PlotSpec, data: PlotData, scales: Record<PlotAxis, PlotScale>) => {
  const [minX, maxX] = scales.x.domain();
  const [minY, maxY] = scales.y.domain();
  // Include one point outside either edge so lines cross the viewport boundary.
  const first = Math.max(0, bisectLeft(data.x, minX) - 1);
  const last = Math.min(data.x.length, bisectRight(data.x, maxX) + 1);
  const xValues = data.x.slice(first, last);
  return sortedPlotSeries(spec.series).map((series) => {
    const values = data.columns.get(series.y);
    const getY = (index: number) => values?.[first + index] ?? Number.NaN;
    const defined = (x: number, index: number) =>
      (spec.axes.x.scale !== "log" || x > 0) &&
      Number.isFinite(getY(index)) &&
      (spec.axes.y.scale !== "log" || getY(index) > 0);

    const path =
      spec.plotType === "marker"
        ? null
        : line<number>()
            .defined(defined)
            .x((x) => scales.x(x))
            .y((_, index) => scales.y(getY(index)))(xValues);

    const markers: string[] = [];
    if (spec.plotType !== "line") {
      const shape = markerShape(series.markerShape, Math.max(1, series.markerSize / 2));
      xValues.forEach((x, index) => {
        const y = getY(index);
        if (x >= minX && x <= maxX && y >= minY && y <= maxY && defined(x, index)) {
          markers.push(`M${coord(scales.x(x))},${coord(scales.y(y))}${shape}`);
        }
      });
    }
    return { series, path, markerPath: markers.join("") };
  });
};
