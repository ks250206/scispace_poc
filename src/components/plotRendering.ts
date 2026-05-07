import uPlot from "uplot";
import type { PlotAxisSpec, PlotMarkerShape, PlotSeries, PlotSpec } from "../domain/types";

export const sortedPlotSeries = (series: PlotSeries[]): PlotSeries[] =>
  [...series].sort(
    (left, right) => left.drawOrder - right.drawOrder || left.y.localeCompare(right.y),
  );

const font = (size: number, family: string): string => `${size}px ${family}`;

const axisOptions = (axis: PlotAxisSpec, grid: boolean, border: boolean): uPlot.Axis => ({
  label: axis.label,
  size: axis.size,
  gap: axis.gap,
  labelGap: axis.labelGap,
  labelSize: axis.labelSize,
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
  incrs: axis.ticks.mode === "manual" && axis.ticks.interval ? [axis.ticks.interval] : undefined,
});

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
      if (xValue === undefined || yValue === undefined || xValue === null || yValue === null)
        continue;
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
        if (scale.min === undefined || scale.max === undefined) continue;
        const minorStep = axis.ticks.interval / 2;
        context.strokeStyle = axis.gridColor;
        for (
          let value = Math.ceil(Number(scale.min) / minorStep) * minorStep;
          value < Number(scale.max);
          value += minorStep
        ) {
          if (
            Math.abs(value / axis.ticks.interval - Math.round(value / axis.ticks.interval)) < 1e-6
          ) {
            continue;
          }
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

export const buildPlotOptions = (spec: PlotSpec): uPlot.Options => {
  const xRange = spec.axes.x.range;
  const yRange = spec.axes.y.range;
  const series = sortedPlotSeries(spec.series);
  return {
    width: spec.size.width,
    height: spec.size.height,
    title: spec.title,
    padding: [spec.padding.top, spec.padding.right, spec.padding.bottom, spec.padding.left],
    cursor: { drag: { x: false, y: false, setScale: false } },
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
    axes: [
      axisOptions(spec.axes.x, spec.grid.x, spec.border),
      axisOptions(spec.axes.y, spec.grid.y, spec.border),
    ],
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
    plugins: [minorTickPlugin(spec), annotationPlugin(spec)],
  };
};
