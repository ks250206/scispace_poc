import { normalizePlotSpecForCommand } from "../domain/scispace";
import type { Dataset, PlotMarkerShape, PlotSpec } from "../domain/types";
import { sortedPlotSeries } from "./plotRendering";

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

const finiteValues = (values: number[]): number[] =>
  values.filter((value) => Number.isFinite(value));

const dataRange = (
  values: number[],
  axisRange: PlotSpec["axes"]["x"]["range"],
): { min: number; max: number } => {
  if (
    axisRange.mode === "manual" &&
    axisRange.min !== undefined &&
    axisRange.max !== undefined &&
    axisRange.min !== axisRange.max
  ) {
    return { min: axisRange.min, max: axisRange.max };
  }
  const finite = finiteValues(values);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  return min === max ? { min: min - 1, max: max + 1 } : { min, max };
};

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

export const buildPlotSvg = (spec: PlotSpec, dataset: Dataset): string => {
  const normalized = normalizePlotSpecForCommand(spec);
  const series = sortedPlotSeries(normalized.series);
  const width = normalized.size.width;
  const height = normalized.size.height;
  const plotLeft = normalized.padding.left + normalized.axes.y.size;
  const plotTop = normalized.padding.top + normalized.font.size + 12;
  const plotRight = width - normalized.padding.right;
  const plotBottom = height - normalized.padding.bottom - normalized.axes.x.size;
  const plotWidth = Math.max(1, plotRight - plotLeft);
  const plotHeight = Math.max(1, plotBottom - plotTop);
  const xValues = dataset.rows.map((row, index) => Number(row[normalized.x] ?? index));
  const yValues = series.flatMap((item) =>
    dataset.rows.map((row) => Number(row[item.y] ?? Number.NaN)),
  );
  const xRange = dataRange(xValues, normalized.axes.x.range);
  const yRange = dataRange(yValues, normalized.axes.y.range);
  const xToSvg = (value: number) =>
    plotLeft + ((value - xRange.min) / (xRange.max - xRange.min)) * plotWidth;
  const yToSvg = (value: number) =>
    plotBottom - ((value - yRange.min) / (yRange.max - yRange.min)) * plotHeight;

  const grid = [
    normalized.grid.x
      ? `<g stroke="${normalized.axes.x.gridColor}" opacity="0.8">${[0, 0.25, 0.5, 0.75, 1]
          .map((ratio) => {
            const x = plotLeft + ratio * plotWidth;
            return `<line x1="${x}" y1="${plotTop}" x2="${x}" y2="${plotBottom}"/>`;
          })
          .join("")}</g>`
      : "",
    normalized.grid.y
      ? `<g stroke="${normalized.axes.y.gridColor}" opacity="0.8">${[0, 0.25, 0.5, 0.75, 1]
          .map((ratio) => {
            const y = plotTop + ratio * plotHeight;
            return `<line x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}"/>`;
          })
          .join("")}</g>`
      : "",
  ].join("");

  const traces = series
    .map((item) => {
      const points = dataset.rows
        .map((row, index) => {
          const x = xToSvg(Number(row[normalized.x] ?? index));
          const y = yToSvg(Number(row[item.y] ?? Number.NaN));
          return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
        })
        .filter((point): point is { x: number; y: number } => Boolean(point));
      const path = points.map((point) => `${point.x},${point.y}`).join(" ");
      const line =
        normalized.plotType === "marker"
          ? ""
          : `<polyline fill="none" stroke="${item.color}" stroke-width="${item.lineWidth}" points="${path}"/>`;
      const markers =
        normalized.plotType === "line"
          ? ""
          : points
              .map((point) =>
                markerSvg(item.markerShape, point.x, point.y, item.markerSize, item.color),
              )
              .join("");
      return `<g data-series="${escapeXml(item.label)}">${line}${markers}</g>`;
    })
    .join("");

  const annotations = normalized.annotations
    .map((annotation) => {
      const x = xToSvg(annotation.x);
      const y = yToSvg(annotation.y);
      const labelX = x + annotation.dx;
      const labelY = y + annotation.dy;
      return `<g stroke="${annotation.color}" fill="${annotation.color}" font-family="${escapeXml(
        annotation.font.family,
      )}" font-size="${annotation.font.size}"><line x1="${labelX}" y1="${labelY}" x2="${x}" y2="${y}"/><circle cx="${x}" cy="${y}" r="3"/><text x="${
        labelX + 4
      }" y="${labelY - 4}">${escapeXml(annotation.text)}</text></g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${escapeXml(
    normalized.font.family,
  )}" font-size="${normalized.font.size}"><rect width="100%" height="100%" fill="#fff"/>${
    normalized.border
      ? `<rect x="${plotLeft}" y="${plotTop}" width="${plotWidth}" height="${plotHeight}" fill="none" stroke="${normalized.axes.x.color}"/>`
      : ""
  }<text x="${width / 2}" y="${normalized.padding.top + normalized.font.size}" text-anchor="middle" font-weight="700">${escapeXml(
    normalized.title,
  )}</text>${grid}${traces}${annotations}<line x1="${plotLeft}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" stroke="${
    normalized.axes.x.color
  }"/><line x1="${plotLeft}" y1="${plotTop}" x2="${plotLeft}" y2="${plotBottom}" stroke="${
    normalized.axes.y.color
  }"/><text x="${(plotLeft + plotRight) / 2}" y="${height - normalized.padding.bottom}" text-anchor="middle">${escapeXml(
    normalized.axes.x.label,
  )}</text><text x="${normalized.padding.left}" y="${(plotTop + plotBottom) / 2}" transform="rotate(-90 ${normalized.padding.left} ${
    (plotTop + plotBottom) / 2
  })" text-anchor="middle">${escapeXml(normalized.axes.y.label)}</text></svg>`;
};

export const svgDataUrl = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
