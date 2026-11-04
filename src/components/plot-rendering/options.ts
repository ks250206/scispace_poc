import uPlot from "uplot";
import type { PlotAxisSpec, PlotMarkerShape, PlotSeries, PlotSpec } from "../../domain/types";
import { sortedPlotSeries } from "./data";

const maxMinorTickSteps = 1000;

const font = (size: number, family: string): string => `${size}px ${family}`;

const manualTickValues = (min: number, max: number, step: number): number[] => {
  const first = Math.ceil(min / step - 1e-10);
  const last = Math.floor(max / step + 1e-10);
  const count = last - first + 1;
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    count <= 0 ||
    count > maxMinorTickSteps
  )
    return [];
  return Array.from({ length: count }, (_, index) =>
    Number(((first + index) * step).toPrecision(16)),
  );
};

export interface PlotAxisTick {
  value: number;
  label: string;
}

export type PlotAxisTicks = Record<"x" | "y", PlotAxisTick[]>;

const captureAxisTicks = (plot: uPlot, ticks: PlotAxisTicks) => {
  (["x", "y"] as const).forEach((key, index) => {
    const axis = plot.axes[index];
    const splits = axis.splits;
    const values = axis.values;
    if (typeof splits !== "function" || typeof values !== "function") return;
    let positions: number[] = [];
    axis.splits = (...args) => {
      positions = splits(...args);
      return positions;
    };
    axis.values = (...args) => {
      const labels = values(...args);
      ticks[key] = positions.map((value, index) => ({ value, label: String(labels[index] ?? "") }));
      return labels;
    };
  });
};

const plotTitlePlugin = (spec: PlotSpec): uPlot.Plugin => ({
  hooks: {
    draw: (plot) => {
      if (!spec.title) return;
      const { ctx } = plot;
      const ratio = ctx.canvas.width / spec.size.width;
      ctx.save();
      ctx.fillStyle = "#0f172a";
      ctx.font = "600 " + font(spec.font.size * ratio, spec.font.family);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        spec.title,
        ctx.canvas.width / 2,
        (spec.padding.top + spec.font.size / 2) * ratio,
        ctx.canvas.width,
      );
      ctx.restore();
    },
  },
});

const axisOptions = (axis: PlotAxisSpec, grid: boolean, border: boolean): uPlot.Axis => {
  const interval = axis.ticks.mode === "manual" ? axis.ticks.interval : undefined;
  return {
    label: axis.label || undefined,
    size: axis.size,
    gap: axis.gap,
    labelGap: axis.labelGap,
    labelSize: Math.max(axis.labelSize, axis.labelGap + axis.labelStyle.size),
    font: font(axis.valueStyle.size, axis.valueStyle.family),
    labelFont: font(axis.labelStyle.size, axis.labelStyle.family),
    stroke: axis.color,
    grid: { show: grid, stroke: axis.gridColor },
    border: { show: border, stroke: axis.color },
    ticks: {
      show: axis.ticks.orientation !== "none",
      size: axis.ticks.orientation === "in" ? -axis.ticks.length : axis.ticks.length,
      stroke: axis.tickColor,
    },
    splits: interval ? (_plot, _axis, min, max) => manualTickValues(min, max, interval) : undefined,
    filter: interval ? (_plot, splits) => splits : undefined,
  };
};

const drawMarker = (
  context: CanvasRenderingContext2D,
  shape: PlotMarkerShape,
  left: number,
  top: number,
  radius: number,
) => {
  context.beginPath();
  if (shape === "square") {
    context.rect(left - radius, top - radius, radius * 2, radius * 2);
  } else if (shape === "triangle") {
    context.moveTo(left, top - radius);
    context.lineTo(left + radius, top + radius);
    context.lineTo(left - radius, top + radius);
    context.closePath();
  } else if (shape === "diamond") {
    context.moveTo(left, top - radius);
    context.lineTo(left + radius, top);
    context.lineTo(left, top + radius);
    context.lineTo(left - radius, top);
    context.closePath();
  } else if (shape === "cross") {
    context.moveTo(left - radius, top - radius);
    context.lineTo(left + radius, top + radius);
    context.moveTo(left + radius, top - radius);
    context.lineTo(left - radius, top + radius);
  } else if (shape === "plus") {
    context.moveTo(left - radius, top);
    context.lineTo(left + radius, top);
    context.moveTo(left, top - radius);
    context.lineTo(left, top + radius);
  } else {
    context.arc(left, top, radius, 0, Math.PI * 2);
  }
};

const pointPaths = (series: PlotSeries): uPlot.Series.Points.PathBuilder => {
  return (self, seriesIndex, indexStart, indexEnd, filteredIndexes) => {
    const indexes =
      filteredIndexes ??
      Array.from({ length: indexEnd - indexStart + 1 }, (_, index) => indexStart + index);
    const context = self.ctx;
    context.save();
    context.strokeStyle = series.color;
    context.fillStyle = "#ffffff";
    context.lineWidth = Math.max(1, series.lineWidth);
    const radius = Math.max(1, series.markerSize / 2);
    for (const dataIndex of indexes) {
      const xValue = self.data[0]?.[dataIndex];
      const yValue = self.data[seriesIndex]?.[dataIndex];
      if (xValue === undefined || yValue === undefined || xValue === null || yValue === null) {
        continue;
      }
      const left = self.valToPos(Number(xValue), "x", true);
      const top = self.valToPos(Number(yValue), "y", true);
      drawMarker(context, series.markerShape, left, top, radius);
      context.fill();
      context.stroke();
    }
    context.restore();
    return null;
  };
};

const minorTickPlugin = (spec: PlotSpec): uPlot.Plugin => ({
  hooks: {
    draw: (self) => {
      const context = self.ctx;
      context.save();
      context.lineWidth = 1;
      context.setLineDash([2, 3]);
      const axes: Array<["x" | "y", PlotAxisSpec]> = [
        ["x", spec.axes.x],
        ["y", spec.axes.y],
      ];
      for (const [axisKey, axis] of axes) {
        if (!axis.ticks.minor || axis.ticks.mode !== "manual" || !axis.ticks.interval) continue;
        const scale = self.scales[axisKey];
        if (scale.min == null || scale.max == null) continue;
        const minorStep = axis.ticks.interval / 2;
        const firstIndex = Math.ceil(scale.min / minorStep);
        const endIndex = Math.ceil(scale.max / minorStep);
        if (
          !Number.isSafeInteger(firstIndex) ||
          !Number.isSafeInteger(endIndex) ||
          endIndex - firstIndex > maxMinorTickSteps
        ) {
          continue;
        }
        context.strokeStyle = axis.gridColor;
        for (let index = firstIndex; index < endIndex; index += 1) {
          if (index % 2 === 0) continue;
          const value = index * minorStep;
          context.beginPath();
          if (axisKey === "x") {
            const left = self.valToPos(value, "x", true);
            context.moveTo(left, self.bbox.top);
            context.lineTo(left, self.bbox.top + self.bbox.height);
          } else {
            const top = self.valToPos(value, "y", true);
            context.moveTo(self.bbox.left, top);
            context.lineTo(self.bbox.left + self.bbox.width, top);
          }
          context.stroke();
        }
      }
      context.restore();
    },
  },
});

const annotationPlugin = (spec: PlotSpec): uPlot.Plugin => ({
  hooks: {
    draw: (self) => {
      const context = self.ctx;
      context.save();
      for (const annotation of spec.annotations) {
        const anchorLeft = self.valToPos(annotation.x, "x", true);
        const anchorTop = self.valToPos(annotation.y, "y", true);
        const labelLeft = anchorLeft + annotation.dx;
        const labelTop = anchorTop + annotation.dy;
        context.strokeStyle = annotation.color;
        context.fillStyle = annotation.color;
        context.font = font(annotation.font.size, annotation.font.family);
        context.beginPath();
        context.moveTo(labelLeft, labelTop);
        context.lineTo(anchorLeft, anchorTop);
        context.stroke();
        context.beginPath();
        context.arc(anchorLeft, anchorTop, 3, 0, Math.PI * 2);
        context.fill();
        context.fillText(annotation.text, labelLeft + 4, labelTop - 4);
      }
      context.restore();
    },
  },
});

export const buildPlotOptions = (
  spec: PlotSpec,
  height = spec.size.height,
  cursorBind?: uPlot.Cursor.Bind,
  exportTicks?: PlotAxisTicks,
): uPlot.Options => {
  const xRange = spec.axes.x.range;
  const yRange = spec.axes.y.range;
  const series = sortedPlotSeries(spec.series);
  const titleHeight = spec.title ? spec.font.size * 1.65 : 0;
  const xAxis = axisOptions(spec.axes.x, spec.grid.x, spec.border);
  const reservedLabel = spec.axes.x.label ? (xAxis.labelSize ?? 0) : 0;
  const tickArea = spec.axes.x.valueStyle.size + spec.axes.x.gap + (xAxis.ticks?.size ?? 0);
  xAxis.size = Math.min(
    spec.axes.x.size,
    Math.max(
      tickArea,
      height * 0.75 - spec.padding.top - spec.padding.bottom - titleHeight - reservedLabel,
    ),
  );
  return {
    width: spec.size.width,
    height,
    padding: [
      spec.padding.top + titleHeight,
      spec.padding.right,
      spec.padding.bottom,
      spec.padding.left,
    ],
    hooks: exportTicks ? { init: [(plot) => captureAxisTicks(plot, exportTicks)] } : undefined,
    cursor: { bind: cursorBind, drag: { x: false, y: false, setScale: false } },
    scales: {
      x: {
        time: false,
        distr: spec.axes.x.scale === "log" ? 3 : 1,
        log: spec.axes.x.scale === "log" ? 10 : undefined,
        min: xRange.mode === "manual" ? xRange.min : undefined,
        max: xRange.mode === "manual" ? xRange.max : undefined,
      },
      y: {
        distr: spec.axes.y.scale === "log" ? 3 : 1,
        log: spec.axes.y.scale === "log" ? 10 : undefined,
        min: yRange.mode === "manual" ? yRange.min : undefined,
        max: yRange.mode === "manual" ? yRange.max : undefined,
      },
    },
    axes: [xAxis, axisOptions(spec.axes.y, spec.grid.y, spec.border)],
    series: [
      { label: spec.x },
      ...series.map((item) => ({
        label: item.label,
        stroke: item.color,
        width: spec.plotType === "marker" ? 0 : item.lineWidth,
        points: {
          show: spec.plotType !== "line",
          size: item.markerSize,
          paths: pointPaths(item),
        },
      })),
    ],
    plugins: [minorTickPlugin(spec), annotationPlugin(spec), plotTitlePlugin(spec)],
  };
};
