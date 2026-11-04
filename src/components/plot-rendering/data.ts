import { bisectLeft, bisectRight, extent } from "d3-array";
import { finitePlotValue } from "../../domain/scispace/plotSpec";
import type { Dataset, PlotSeries } from "../../domain/types";

export type PlotDomain = [number, number];
export type PlotAxis = "x" | "y";
export type PlotDomains = Record<PlotAxis, PlotDomain>;

type Extents = Partial<Record<"linear" | "log", PlotDomain>>;

export interface PlotData {
  x: number[];
  columns: Map<string, (number | null)[]>;
  extents: Record<PlotAxis, Extents>;
}

const getExtents = (values: (number | null)[]): Extents => {
  const [min, max] = extent(values, (value) => value ?? undefined);
  const [positiveMin, positiveMax] = extent(values, (value) =>
    value !== null && value > 0 ? value : undefined,
  );
  return {
    linear: min !== undefined && max !== undefined ? [min, max] : undefined,
    log:
      positiveMin !== undefined && positiveMax !== undefined
        ? [positiveMin, positiveMax]
        : undefined,
  };
};

export const sortedPlotSeries = (series: PlotSeries[]): PlotSeries[] =>
  [...series].sort((a, b) => a.drawOrder - b.drawOrder || a.y.localeCompare(b.y));

export const buildPlotData = (dataset: Dataset, xColumn: string, yColumns: string[]): PlotData => {
  const rows = dataset.rows
    .flatMap((row) => {
      const x = finitePlotValue(row[xColumn]);
      return x === null ? [] : [{ x, row }];
    })
    .sort((a, b) => a.x - b.x);
  const x = rows.map((item) => item.x);
  const columns = new Map<string, (number | null)[]>();
  const yExtents: Extents = {};
  for (const column of yColumns) {
    const values = rows.map(({ row }) => finitePlotValue(row[column]));
    columns.set(column, values);
    const extents = getExtents(values);
    for (const scale of ["linear", "log"] as const) {
      const next = extents[scale];
      if (!next) continue;
      const current = yExtents[scale];
      yExtents[scale] = current
        ? [Math.min(current[0], next[0]), Math.max(current[1], next[1])]
        : next;
    }
  }
  return { x, columns, extents: { x: getExtents(x), y: yExtents } };
};

export const visibleYExtent = (data: PlotData, xDomain: PlotDomain, scale: keyof Extents) => {
  const start = bisectLeft(data.x, xDomain[0]);
  const end = bisectRight(data.x, xDomain[1]);
  if (start === 0 && end === data.x.length) return data.extents.y[scale];
  let min = Infinity;
  let max = -Infinity;
  for (const values of data.columns.values()) {
    for (let index = start; index < end; index += 1) {
      const value = values[index];
      if (value == null || (scale === "log" && value <= 0)) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return min <= max ? ([min, max] as PlotDomain) : undefined;
};
