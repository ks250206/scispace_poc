import type {
  Dataset,
  DataValue,
  PlotAxisSpec,
  PlotMarkerShape,
  PlotPaddingSpec,
  PlotSeries,
  PlotSizeSpec,
  PlotSpec,
  PlotTextStyle,
  PlotTickDirection,
  PlotType,
} from "../types";
import { parseColor } from "./commandUtils";

export const plotColors = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];
export const plotTypes = new Set<PlotType>(["line", "line-marker", "marker"]);
export const tickDirections = new Set<PlotTickDirection>(["out", "in", "none"]);
export const markerShapes = new Set<PlotMarkerShape>([
  "circle",
  "square",
  "triangle",
  "diamond",
  "cross",
  "plus",
]);
export const defaultPlotSize: PlotSizeSpec = { width: 640, height: 360 };
export const defaultPlotFont: PlotTextStyle = { family: "Inter, system-ui, sans-serif", size: 12 };
export const defaultAxisLabelFont: PlotTextStyle = {
  family: "Inter, system-ui, sans-serif",
  size: 12,
};
export const defaultAxisValueFont: PlotTextStyle = {
  family: "Inter, system-ui, sans-serif",
  size: 11,
};
export const defaultPlotPadding: PlotPaddingSpec = { top: 12, right: 12, bottom: 12, left: 12 };
export const plotSpecSchema = {
  id: "string",
  type: '"line"',
  plotType: '"line" | "line-marker" | "marker"',
  source: "dataset id",
  x: "x column name",
  y: "primary y column name",
  title: "string",
  size: { width: "number", height: "number" },
  font: { family: "string", size: "number" },
  padding: { top: "number", right: "number", bottom: "number", left: "number" },
  zoomMode: '"x" | "y" | "xy"',
  axes: {
    x: {
      label: "string",
      mirror: "boolean (optional)",
      scale: '"linear" | "log"',
      labelStyle: { family: "string", size: "number" },
      valueStyle: { family: "string", size: "number" },
      size: "number",
      gap: "number",
      labelGap: "number",
      labelSize: "number",
      color: "#rrggbb",
      gridColor: "#rrggbb",
      tickColor: "#rrggbb",
      range: '{ mode: "auto" } | { mode: "manual", min: number, max: number }',
      ticks:
        '{ mode: "auto", orientation: "out" | "in" | "none", length: number, minor: boolean, mirror?: boolean } | { mode: "manual", interval: number, orientation: "out" | "in" | "none", length: number, minor: boolean, mirror?: boolean }',
    },
    y: {
      label: "string",
      mirror: "boolean (optional)",
      scale: '"linear" | "log"',
      labelStyle: { family: "string", size: "number" },
      valueStyle: { family: "string", size: "number" },
      size: "number",
      gap: "number",
      labelGap: "number",
      labelSize: "number",
      color: "#rrggbb",
      gridColor: "#rrggbb",
      tickColor: "#rrggbb",
      range: '{ mode: "auto" } | { mode: "manual", min: number, max: number }',
      ticks:
        '{ mode: "auto", orientation: "out" | "in" | "none", length: number, minor: boolean, mirror?: boolean } | { mode: "manual", interval: number, orientation: "out" | "in" | "none", length: number, minor: boolean, mirror?: boolean }',
    },
  },
  grid: { x: "boolean", y: "boolean" },
  border: "boolean",
  series: [
    {
      y: "y column name",
      label: "string",
      color: "#rrggbb",
      lineWidth: "number",
      markerSize: "number",
      markerShape: '"circle" | "square" | "triangle" | "diamond" | "cross" | "plus"',
      drawOrder: "number",
    },
  ],
  annotations: [
    {
      id: "string",
      type: '"text-arrow"',
      text: "string",
      x: "number",
      y: "number",
      dx: "number",
      dy: "number",
      color: "#rrggbb",
      font: { family: "string", size: "number" },
    },
  ],
} as const;

export const defaultPlotAxis = (label: string): PlotAxisSpec => ({
  label,
  mirror: false,
  range: { mode: "auto" },
  ticks: { mode: "auto", orientation: "out", length: 6, minor: false, mirror: false },
  scale: "linear",
  labelStyle: defaultAxisLabelFont,
  valueStyle: defaultAxisValueFont,
  size: 48,
  gap: 6,
  labelGap: 8,
  labelSize: 24,
  color: "#374151",
  gridColor: "#e5e7eb",
  tickColor: "#6b7280",
});

export const createPlotSeries = (columns: string[]): PlotSeries[] =>
  columns.map((column, index) => ({
    y: column,
    label: column,
    color: plotColors[index % plotColors.length] ?? "#2563eb",
    lineWidth: 2,
    markerSize: 6,
    markerShape: "circle",
    drawOrder: index,
  }));

export const normalizeSeriesStyle = (series: PlotSeries, index: number): PlotSeries => ({
  y: series.y,
  label: series.label || series.y,
  color: series.color || plotColors[index % plotColors.length] || "#2563eb",
  lineWidth: Number.isFinite(series.lineWidth) ? series.lineWidth : 2,
  markerSize: Number.isFinite(series.markerSize) ? series.markerSize : 6,
  markerShape: markerShapes.has(series.markerShape) ? series.markerShape : "circle",
  drawOrder: Number.isFinite(series.drawOrder) ? series.drawOrder : index,
});

export const normalizeAxis = (axis: PlotAxisSpec | undefined, label: string): PlotAxisSpec => {
  const fallback = defaultPlotAxis(label);
  return {
    ...fallback,
    ...axis,
    label: axis?.label ?? label,
    mirror: axis?.mirror === true,
    range: axis?.range ?? fallback.range,
    scale: axis?.scale === "log" ? "log" : "linear",
    ticks: {
      ...fallback.ticks,
      ...axis?.ticks,
      length:
        Number.isFinite(axis?.ticks.length) && Number(axis?.ticks.length) >= 0
          ? Number(axis?.ticks.length)
          : fallback.ticks.length,
      minor: Boolean(axis?.ticks.minor),
      mirror: axis?.ticks.mirror === true,
    },
    labelStyle: normalizeTextStyle(axis?.labelStyle, fallback.labelStyle),
    valueStyle: normalizeTextStyle(axis?.valueStyle, fallback.valueStyle),
    size: Number.isFinite(axis?.size) ? Number(axis?.size) : fallback.size,
    gap: Number.isFinite(axis?.gap) ? Number(axis?.gap) : fallback.gap,
    labelGap: Number.isFinite(axis?.labelGap) ? Number(axis?.labelGap) : fallback.labelGap,
    labelSize: Number.isFinite(axis?.labelSize) ? Number(axis?.labelSize) : fallback.labelSize,
    color: parseColor(axis?.color) ?? fallback.color,
    gridColor: parseColor(axis?.gridColor) ?? fallback.gridColor,
    tickColor: parseColor(axis?.tickColor) ?? fallback.tickColor,
  };
};

export const normalizePlotSpecForCommand = (spec: PlotSpec): PlotSpec => {
  const existingSeries = spec.series ?? [];
  const series = (
    existingSeries.length > 0 ? existingSeries : spec.y ? createPlotSeries([spec.y]) : []
  ).map(normalizeSeriesStyle);
  const xLabel = spec.axes?.x.label ?? spec.axisLabels?.x ?? spec.x;
  const yLabel =
    spec.axes?.y.label ?? spec.axisLabels?.y ?? series.map((item) => item.label).join(", ");
  return {
    ...spec,
    type: "line",
    plotType: plotTypes.has(spec.plotType) ? spec.plotType : "line",
    y: series[0]?.y ?? spec.y,
    series,
    zoomMode: spec.zoomMode ?? "xy",
    axes: {
      x: normalizeAxis(spec.axes?.x, xLabel),
      y: normalizeAxis(spec.axes?.y, yLabel),
    },
    grid: spec.grid ?? { x: true, y: true },
    border: spec.border ?? true,
    size: {
      width: parsePlotDimension(String(spec.size?.width)) ?? defaultPlotSize.width,
      height: parsePlotDimension(String(spec.size?.height)) ?? defaultPlotSize.height,
    },
    font: normalizeTextStyle(spec.font, defaultPlotFont),
    padding: spec.padding ?? defaultPlotPadding,
    annotations: spec.annotations ?? [],
    axisLabels: { x: xLabel, y: yLabel },
  };
};

export const findPlot = (plotSpecs: PlotSpec[] | undefined, plotId: string): PlotSpec | undefined =>
  plotSpecs?.find((plot) => plot.id === plotId);

export const parseRange = (value: string | undefined): PlotAxisSpec["range"] | undefined => {
  if (!value) return undefined;
  if (value === "auto") return { mode: "auto" };
  const [minText, maxText] = value.split(":");
  const min = Number(minText);
  const max = Number(maxText);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return undefined;
  return { mode: "manual", min, max };
};

export const parseTick = (
  value: string | undefined,
): Partial<PlotAxisSpec["ticks"]> | undefined => {
  if (!value) return undefined;
  if (value === "auto") return { mode: "auto", interval: undefined };
  const interval = Number(value);
  if (!Number.isFinite(interval) || interval <= 0) return undefined;
  return { mode: "manual", interval };
};

export const parsePlotDimension = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const dimension = Number(value);
  if (!Number.isFinite(dimension) || dimension < 120 || dimension > 4000) return undefined;
  return Math.round(dimension);
};

export const parsePadding = (value: string | undefined): PlotPaddingSpec | undefined => {
  if (value === undefined) return undefined;
  const parts = value.split(":").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return undefined;
  }
  const [top, right, bottom, left] = parts;
  return { top: top ?? 0, right: right ?? 0, bottom: bottom ?? 0, left: left ?? 0 };
};

export const normalizeTextStyle = (
  style: Partial<PlotTextStyle> | undefined,
  fallback: PlotTextStyle,
): PlotTextStyle => ({
  family: style?.family?.trim() || fallback.family,
  size:
    Number.isFinite(style?.size) && Number(style?.size) > 0 ? Number(style?.size) : fallback.size,
});

export const finitePlotValue = (value: DataValue | undefined): number | null => {
  if (value === undefined || (typeof value === "string" && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const axisDataHasNonPositiveValues = (
  axis: "x" | "y",
  dataset: Dataset | undefined,
  plot: PlotSpec,
  nextX = plot.x,
): boolean => {
  if (!dataset) return true;
  const columns = axis === "x" ? [nextX] : plot.series.map((series) => series.y);
  return dataset.rows.some((row) =>
    columns.some((column) => {
      const value = finitePlotValue(row[column]);
      return value !== null && value <= 0;
    }),
  );
};
