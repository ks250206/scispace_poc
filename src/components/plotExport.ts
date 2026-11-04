import type uPlot from "uplot";
import { normalizePlotSpecForCommand } from "../domain/scispace";
import type { PlotMarkerShape, PlotSpec } from "../domain/types";
import { sortedPlotSeries, type PlotAxisTicks } from "./plotRendering";

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const plotSchemaJson = (spec: PlotSpec): string =>
  JSON.stringify(normalizePlotSpecForCommand(spec), null, 2);

export const safePlotFileName = (title: string, extension: string): string =>
  `${title.replace(/[^\w.-]+/g, "_") || "plot"}.${extension}`;

const markerSvg = (
  shape: PlotMarkerShape,
  x: number,
  y: number,
  size: number,
  color: string,
): string => {
  const radius = Math.max(1, size / 2);
  if (shape === "square") {
    return `<rect x="${x - radius}" y="${y - radius}" width="${radius * 2}" height="${
      radius * 2
    }" fill="#fff" stroke="${color}"/>`;
  }
  if (shape === "triangle") {
    return `<polygon points="${x},${y - radius} ${x + radius},${y + radius} ${x - radius},${
      y + radius
    }" fill="#fff" stroke="${color}"/>`;
  }
  if (shape === "diamond") {
    return `<polygon points="${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${
      x - radius
    },${y}" fill="#fff" stroke="${color}"/>`;
  }
  if (shape === "cross" || shape === "plus") {
    const lines =
      shape === "plus"
        ? [
            [x - radius, y, x + radius, y],
            [x, y - radius, x, y + radius],
          ]
        : [
            [x - radius, y - radius, x + radius, y + radius],
            [x + radius, y - radius, x - radius, y + radius],
          ];
    return lines
      .map(
        ([x1, y1, x2, y2]) =>
          `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}"/>`,
      )
      .join("");
  }
  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="#fff" stroke="${color}"/>`;
};

export interface PlotExportLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  ticks: PlotAxisTicks;
  position: (value: number, axis: "x" | "y") => number;
}

export const plotExportLayout = (
  plot: uPlot,
  spec: PlotSpec,
  ticks: PlotAxisTicks,
): PlotExportLayout => {
  const ratio = plot.ctx.canvas.width / spec.size.width;
  return {
    left: plot.bbox.left / ratio,
    top: plot.bbox.top / ratio,
    width: plot.bbox.width / ratio,
    height: plot.bbox.height / ratio,
    ticks,
    position: (value, axis) => plot.valToPos(value, axis, true) / ratio,
  };
};

export const buildPlotSvg = (
  spec: PlotSpec,
  data: uPlot.AlignedData,
  layout: PlotExportLayout,
): string => {
  const { left, top, width, height, ticks, position } = layout;
  const right = left + width;
  const bottom = top + height;
  const midpoint = (left + right) / 2;
  const middle = (top + bottom) / 2;
  const line = (x1: number, y1: number, x2: number, y2: number, color: string) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}"/>`;
  const grid: string[] = [];
  const axes: string[] = [];
  for (const axis of ["x", "y"] as const) {
    const axisSpec = spec.axes[axis];
    const horizontal = axis === "x";
    const tickLength =
      axisSpec.ticks.orientation === "none"
        ? 0
        : axisSpec.ticks.length * (axisSpec.ticks.orientation === "in" ? -1 : 1);
    const anchor = horizontal ? "middle" : "end";
    const baseline = horizontal ? "hanging" : "central";
    const tickLabels: string[] = [];
    for (const tick of ticks[axis]) {
      const at = position(tick.value, axis);
      if (
        !Number.isFinite(at) ||
        at < (horizontal ? left : top) - 0.5 ||
        at > (horizontal ? right : bottom) + 0.5
      )
        continue;
      if (spec.grid[axis]) {
        grid.push(
          horizontal
            ? line(at, top, at, bottom, axisSpec.gridColor)
            : line(left, at, right, at, axisSpec.gridColor),
        );
      }
      if (tickLength !== 0) {
        axes.push(
          horizontal
            ? line(at, bottom, at, bottom + tickLength, axisSpec.tickColor)
            : line(left, at, left - tickLength, at, axisSpec.tickColor),
        );
      }
      if (tick.label) {
        const x = horizontal ? at : left - tickLength - axisSpec.gap;
        const y = horizontal ? bottom + tickLength + axisSpec.gap : at;
        tickLabels.push(`<text x="${x}" y="${y}">${escapeXml(tick.label)}</text>`);
      }
    }
    axes.push(
      `<g data-axis-ticks="${axis}" text-anchor="${anchor}" dominant-baseline="${baseline}" fill="${axisSpec.color}" font-family="${escapeXml(axisSpec.valueStyle.family)}" font-size="${axisSpec.valueStyle.size}">${tickLabels.join("")}</g>`,
    );
    if (!axisSpec.label) continue;
    const style = `fill="${axisSpec.color}" font-family="${escapeXml(axisSpec.labelStyle.family)}" font-size="${axisSpec.labelStyle.size}" text-anchor="middle"`;
    const labelArea = Math.max(axisSpec.labelSize, axisSpec.labelGap + axisSpec.labelStyle.size);
    const labelPosition = horizontal
      ? spec.size.height - spec.padding.bottom - labelArea + axisSpec.labelGap
      : left - axisSpec.size - axisSpec.labelGap;
    axes.push(
      horizontal
        ? `<text x="${midpoint}" y="${labelPosition}" dominant-baseline="hanging" ${style}>${escapeXml(axisSpec.label)}</text>`
        : `<text transform="translate(${labelPosition} ${middle}) rotate(-90)" ${style}>${escapeXml(axisSpec.label)}</text>`,
    );
  }
  const traces = sortedPlotSeries(spec.series)
    .map((item, seriesIndex) => {
      const polylines: string[] = [];
      const markers: string[] = [];
      let segment: string[] = [];
      const flushSegment = () => {
        if (segment.length > 1 && spec.plotType !== "marker") {
          polylines.push(
            `<polyline fill="none" stroke="${item.color}" stroke-width="${item.lineWidth}" points="${segment.join(" ")}"/>`,
          );
        }
        segment = [];
      };
      data[0].forEach((x, index) => {
        const y = data[seriesIndex + 1]?.[index];
        const px = position(x, "x");
        const py = y == null ? Number.NaN : position(y, "y");
        if (!Number.isFinite(px) || !Number.isFinite(py)) {
          flushSegment();
          return;
        }
        segment.push(`${px},${py}`);
        if (spec.plotType !== "line")
          markers.push(markerSvg(item.markerShape, px, py, item.markerSize, item.color));
      });
      flushSegment();
      return `<g data-series="${escapeXml(item.label)}">${polylines.join("")}${markers.join("")}</g>`;
    })
    .join("");
  const annotations = spec.annotations
    .map((annotation) => {
      const x = position(annotation.x, "x");
      const y = position(annotation.y, "y");
      if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
      const labelX = x + annotation.dx;
      const labelY = y + annotation.dy;
      return `<g fill="${annotation.color}" font-family="${escapeXml(annotation.font.family)}" font-size="${annotation.font.size}">${line(labelX, labelY, x, y, annotation.color)}<circle cx="${x}" cy="${y}" r="3"/><text x="${labelX + 4}" y="${labelY - 4}">${escapeXml(annotation.text)}</text></g>`;
    })
    .join("");
  const title = spec.title
    ? `<text x="${spec.size.width / 2}" y="${spec.padding.top + spec.font.size / 2}" text-anchor="middle" dominant-baseline="central" font-weight="600">${escapeXml(spec.title)}</text>`
    : "";
  const border = spec.border
    ? line(left, bottom, right, bottom, spec.axes.x.color) +
      line(left, top, left, bottom, spec.axes.y.color)
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.size.width}" height="${spec.size.height}" viewBox="0 0 ${spec.size.width} ${spec.size.height}" font-family="${escapeXml(spec.font.family)}" font-size="${spec.font.size}"><rect width="100%" height="100%" fill="#fff"/><defs><clipPath id="plot-area"><rect x="${left}" y="${top}" width="${width}" height="${height}"/></clipPath></defs>${title}<g clip-path="url(#plot-area)">${grid.join("")}${traces}${annotations}</g>${border}${axes.join("")}</svg>`;
};

export const svgDataUrl = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
