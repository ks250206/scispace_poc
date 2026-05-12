import uPlot from "uplot";
import type { Dataset, PlotAxisSpec, PlotMarkerShape, PlotSeries, PlotSpec } from "../domain/types";

export const xAxisLabelHeight = 24;
const minRenderScale = 0.1;
const maxRenderScale = 4;

const scaleNumber = (value: number, scale: number): number => Number((value * scale).toFixed(3));

const font = (size: number, family: string): string => `${size}px ${family}`;

export const plotRenderScale = (workspaceScale: number): number =>
  Math.min(maxRenderScale, Math.max(1, workspaceScale || 1));

const plotCoordinateScale = (workspaceScale: number, renderScale: number): number => {
  const safeWorkspaceScale = Math.max(minRenderScale, workspaceScale || 1);
  return renderScale / safeWorkspaceScale;
};

export const normalizePlotClientPoint = (
  client: { x: number; y: number },
  rect: Pick<DOMRect, "left" | "top">,
  workspaceScale: number,
  renderScale: number,
): { left: number; top: number } => {
  const coordinateScale = plotCoordinateScale(workspaceScale, renderScale);
  return {
    left: (client.x - rect.left) * coordinateScale,
    top: (client.y - rect.top) * coordinateScale,
  };
};

export const plotPositionFromClient = normalizePlotClientPoint;

export const plotSizeFromRenderedRect = (
  rect: Pick<DOMRect, "width" | "height">,
  workspaceScale: number,
  renderScale: number,
): { width: number; height: number } => {
  const coordinateScale = plotCoordinateScale(workspaceScale, renderScale);
  return {
    width: rect.width * coordinateScale,
    height: rect.height * coordinateScale,
  };
};

export const scaledPlotClientPoint = (
  client: { x: number; y: number },
  rect: Pick<DOMRect, "left" | "top">,
  workspaceScale: number,
  renderScale: number,
): { x: number; y: number } => {
  const position = normalizePlotClientPoint(client, rect, workspaceScale, renderScale);
  return {
    x: rect.left + position.left,
    y: rect.top + position.top,
  };
};

const plotMouseEventInit = (
  event: MouseEvent,
  client: { x: number; y: number },
  coordinateScale: number,
): MouseEventInit =>
  ({
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    view: event.view,
    detail: event.detail,
    screenX: event.screenX,
    screenY: event.screenY,
    clientX: client.x,
    clientY: client.y,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    button: event.button,
    buttons: event.buttons,
    relatedTarget: event.relatedTarget,
    movementX: event.movementX * coordinateScale,
    movementY: event.movementY * coordinateScale,
  }) as MouseEventInit;

export const createScaledPlotMouseEvent = (
  event: MouseEvent,
  target: HTMLElement,
  workspaceScale: number,
  renderScale: number,
): MouseEvent => {
  const rect = target.getBoundingClientRect();
  const client = scaledPlotClientPoint(
    { x: event.clientX, y: event.clientY },
    rect,
    workspaceScale,
    renderScale,
  );
  return new MouseEvent(
    event.type,
    plotMouseEventInit(event, client, plotCoordinateScale(workspaceScale, renderScale)),
  );
};

const bindScaledPlotMouse =
  (workspaceScale: number, renderScale: number): uPlot.Cursor.MouseListenerFactory =>
  (_, target, handler) =>
  (event) => {
    if (!target.classList.contains("u-over")) {
      handler(event);
      return null;
    }
    const scaledEvent = createScaledPlotMouseEvent(event, target, workspaceScale, renderScale);
    handler(scaledEvent);
    if (scaledEvent.defaultPrevented) event.preventDefault();
    return null;
  };

export const scaledPlotCursorBind = (
  workspaceScale: number,
  renderScale: number,
): uPlot.Cursor.Bind => {
  const bind = bindScaledPlotMouse(workspaceScale, renderScale);
  return {
    mousedown: bind,
    mouseup: bind,
    click: bind,
    dblclick: bind,
    mousemove: bind,
    mouseleave: bind,
    mouseenter: bind,
  };
};

export const inferPlotDragZoomMode = (
  width: number,
  height: number,
): "x" | "y" | "xy" | undefined => {
  const minDrag = 8;
  const dominanceRatio = 2.5;
  const absWidth = Math.abs(width);
  const absHeight = Math.abs(height);
  const hasWidth = absWidth >= minDrag;
  const hasHeight = absHeight >= minDrag;
  if (!hasWidth && !hasHeight) return undefined;
  if (hasWidth && !hasHeight) return "x";
  if (hasHeight && !hasWidth) return "y";
  if (absWidth / Math.max(absHeight, 1) >= dominanceRatio) return "x";
  if (absHeight / Math.max(absWidth, 1) >= dominanceRatio) return "y";
  return "xy";
};

export const plotSelectionRectForZoomMode = (
  start: { left: number; top: number },
  end: { left: number; top: number },
  plotSize: { width: number; height: number },
): { left: number; top: number; width: number; height: number } => {
  const width = Math.abs(end.left - start.left);
  const height = Math.abs(end.top - start.top);
  const mode = inferPlotDragZoomMode(width, height);
  const horizontal = {
    left: Math.min(start.left, end.left),
    width,
  };
  const vertical = {
    top: Math.min(start.top, end.top),
    height,
  };
  if (mode === "x") return { ...horizontal, top: 0, height: plotSize.height };
  if (mode === "y") return { left: 0, width: plotSize.width, ...vertical };
  return { ...horizontal, ...vertical };
};

export const plotScaleRange = (
  scale: Pick<uPlot.Scale, "min" | "max"> | undefined,
): { min: number; max: number } | undefined => {
  const min = Number(scale?.min);
  const max = Number(scale?.max);
  return Number.isFinite(min) && Number.isFinite(max) && min < max ? { min, max } : undefined;
};

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

const scaleAxisForRender = (axis: PlotAxisSpec, renderScale: number): PlotAxisSpec => ({
  ...axis,
  size: scaleNumber(axis.size, renderScale),
  gap: scaleNumber(axis.gap, renderScale),
  labelGap: scaleNumber(axis.labelGap, renderScale),
  labelSize: scaleNumber(axis.labelSize, renderScale),
  ticks: {
    ...axis.ticks,
    length: scaleNumber(axis.ticks.length, renderScale),
  },
  labelStyle: {
    ...axis.labelStyle,
    size: scaleNumber(axis.labelStyle.size, renderScale),
  },
  valueStyle: {
    ...axis.valueStyle,
    size: scaleNumber(axis.valueStyle.size, renderScale),
  },
});

export const scalePlotSpecForRender = (spec: PlotSpec, renderScale: number): PlotSpec => {
  if (renderScale === 1) return spec;
  return {
    ...spec,
    size: {
      width: scaleNumber(spec.size.width, renderScale),
      height: scaleNumber(spec.size.height, renderScale),
    },
    font: { ...spec.font, size: scaleNumber(spec.font.size, renderScale) },
    padding: {
      top: scaleNumber(spec.padding.top, renderScale),
      right: scaleNumber(spec.padding.right, renderScale),
      bottom: scaleNumber(spec.padding.bottom, renderScale),
      left: scaleNumber(spec.padding.left, renderScale),
    },
    axes: {
      x: scaleAxisForRender(spec.axes.x, renderScale),
      y: scaleAxisForRender(spec.axes.y, renderScale),
    },
    series: spec.series.map((series) => ({
      ...series,
      lineWidth: scaleNumber(series.lineWidth, renderScale),
      markerSize: scaleNumber(series.markerSize, renderScale),
    })),
    annotations: spec.annotations.map((annotation) => ({
      ...annotation,
      dx: scaleNumber(annotation.dx, renderScale),
      dy: scaleNumber(annotation.dy, renderScale),
      font: {
        ...annotation.font,
        size: scaleNumber(annotation.font.size, renderScale),
      },
    })),
  };
};

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

export const buildPlotOptions = (
  spec: PlotSpec,
  height = spec.size.height,
  cursorBind?: uPlot.Cursor.Bind,
): uPlot.Options => {
  const xRange = spec.axes.x.range;
  const yRange = spec.axes.y.range;
  const series = sortedPlotSeries(spec.series);
  return {
    width: spec.size.width,
    height,
    title: spec.title,
    padding: [spec.padding.top, spec.padding.right, spec.padding.bottom, spec.padding.left],
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
    axes: [
      { ...axisOptions(spec.axes.x, spec.grid.x, spec.border), label: undefined },
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
