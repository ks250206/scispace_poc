import {
  datasetColumnIds,
  datasetColumnNames,
  defaultImportParseOptions,
  normalizeDataValue,
  normalizeVirtualPath,
  parseDelimitedText,
  resolveDatasetColumnId,
} from "./csv";
import type {
  Dataset,
  PendingImport,
  PlotAnnotation,
  PlotAxisSpec,
  PlotMarkerShape,
  PlotPaddingSpec,
  PlotSeries,
  PlotSizeSpec,
  PlotSpec,
  PlotTextStyle,
  PlotTickDirection,
  PlotType,
  ScispaceCommandResult,
  VirtualFile,
} from "./types";

export interface CommandContext {
  datasets: Dataset[];
  files?: VirtualFile[];
  pendingImports?: PendingImport[];
  plotSpecs?: PlotSpec[];
}

const findDataset = (datasets: Dataset[], token: string): Dataset | undefined =>
  datasets.find(
    (dataset) =>
      dataset.id === token || dataset.name === token || dataset.sourcePath.endsWith(`/${token}`),
  );

const tokenizeCommand = (input: string): string[] => {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if ((char === "'" || char === '"') && !quote) {
      quote = char;
    } else if (char === quote) {
      quote = undefined;
    } else if (/\s/.test(char) && !quote) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return tokens;
};

const readOption = (tokens: string[], key: string): string | undefined => {
  const prefix = `${key}=`;
  return tokens.find((token) => token.startsWith(prefix))?.slice(prefix.length);
};

const isString = (value: string | undefined): value is string => Boolean(value);

const parseBooleanOption = (tokens: string[], key: string): boolean =>
  readOption(tokens, key) === "true";

const parseOptionalBoolean = (value: string | undefined): boolean | undefined => {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const plotColors = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];
const plotTypes = new Set<PlotType>(["line", "line-marker", "marker"]);
const importDelimiters = new Set(["auto", "comma", "tab", "space", "semicolon"]);
const tickDirections = new Set<PlotTickDirection>(["out", "in", "none"]);
const markerShapes = new Set<PlotMarkerShape>([
  "circle",
  "square",
  "triangle",
  "diamond",
  "cross",
  "plus",
]);
const defaultPlotSize: PlotSizeSpec = { width: 640, height: 360 };
const defaultPlotFont: PlotTextStyle = { family: "Inter, system-ui, sans-serif", size: 12 };
const defaultAxisLabelFont: PlotTextStyle = { family: "Inter, system-ui, sans-serif", size: 12 };
const defaultAxisValueFont: PlotTextStyle = { family: "Inter, system-ui, sans-serif", size: 11 };
const defaultPlotPadding: PlotPaddingSpec = { top: 12, right: 12, bottom: 12, left: 12 };
const isVirtualRawPath = (path: string | undefined): path is string =>
  path === "~/raw" || Boolean(path?.startsWith("~/raw/"));
const isSafeFileName = (name: string | undefined): name is string => {
  if (!name?.trim()) return false;
  return !name.includes("/") && !name.includes("\\") && name !== "." && name !== "..";
};

const formatVirtualFileList = (
  path: string,
  files: VirtualFile[] | undefined,
  datasets: Dataset[],
): string => {
  const listedFiles = (files ?? [])
    .filter((file) => file.path === path || file.path.startsWith(`${path}/`))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (listedFiles.length === 0) return `No files under ${path}`;
  return listedFiles
    .map((file) => {
      if (file.kind === "directory") return `[dir] ${file.path}`;
      const dataset = datasets.find((item) => item.id === file.datasetId);
      if (dataset) {
        return `[dataset] ${file.path} -> ${dataset.name} (${dataset.rows.length} rows, ${dataset.columns.length} cols)`;
      }
      return `[raw] ${file.path}${file.parseError ? ` (${file.parseError})` : ""}`;
    })
    .join("\n");
};

const plotSpecSchema = {
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
        '{ mode: "auto", orientation: "out" | "in" | "none", length: number, minor: boolean } | { mode: "manual", interval: number, orientation: "out" | "in" | "none", length: number, minor: boolean }',
    },
    y: {
      label: "string",
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
        '{ mode: "auto", orientation: "out" | "in" | "none", length: number, minor: boolean } | { mode: "manual", interval: number, orientation: "out" | "in" | "none", length: number, minor: boolean }',
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
  range: { mode: "auto" },
  ticks: { mode: "auto", orientation: "out", length: 6, minor: false },
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

const createPlotSeries = (columns: string[]): PlotSeries[] =>
  columns.map((column, index) => ({
    y: column,
    label: column,
    color: plotColors[index % plotColors.length] ?? "#2563eb",
    lineWidth: 2,
    markerSize: 6,
    markerShape: "circle",
    drawOrder: index,
  }));

const normalizeSeriesStyle = (series: PlotSeries, index: number): PlotSeries => ({
  y: series.y,
  label: series.label || series.y,
  color: series.color || plotColors[index % plotColors.length] || "#2563eb",
  lineWidth: Number.isFinite(series.lineWidth) ? series.lineWidth : 2,
  markerSize: Number.isFinite(series.markerSize) ? series.markerSize : 6,
  markerShape: markerShapes.has(series.markerShape) ? series.markerShape : "circle",
  drawOrder: Number.isFinite(series.drawOrder) ? series.drawOrder : index,
});

const normalizeAxis = (axis: PlotAxisSpec | undefined, label: string): PlotAxisSpec => {
  const fallback = defaultPlotAxis(label);
  return {
    ...fallback,
    ...axis,
    label: axis?.label ?? label,
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

const findPlot = (plotSpecs: PlotSpec[] | undefined, plotId: string): PlotSpec | undefined =>
  plotSpecs?.find((plot) => plot.id === plotId);

const parseRange = (value: string | undefined): PlotAxisSpec["range"] | undefined => {
  if (!value) return undefined;
  if (value === "auto") return { mode: "auto" };
  const [minText, maxText] = value.split(":");
  const min = Number(minText);
  const max = Number(maxText);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return undefined;
  return { mode: "manual", min, max };
};

const parseTick = (value: string | undefined): Partial<PlotAxisSpec["ticks"]> | undefined => {
  if (!value) return undefined;
  if (value === "auto") return { mode: "auto", interval: undefined };
  const interval = Number(value);
  if (!Number.isFinite(interval) || interval <= 0) return undefined;
  return { mode: "manual", interval };
};

const parsePlotDimension = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const dimension = Number(value);
  if (!Number.isFinite(dimension) || dimension < 120 || dimension > 4000) return undefined;
  return Math.round(dimension);
};

const parsePositiveNumber = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const parseNonNegativeNumber = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};

const parseInteger = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
};

const parseColor = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  return /^#[\da-f]{6}$/i.test(value) ? value : undefined;
};

const parsePadding = (value: string | undefined): PlotPaddingSpec | undefined => {
  if (value === undefined) return undefined;
  const parts = value.split(":").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return undefined;
  }
  const [top, right, bottom, left] = parts;
  return { top: top ?? 0, right: right ?? 0, bottom: bottom ?? 0, left: left ?? 0 };
};

const normalizeTextStyle = (
  style: Partial<PlotTextStyle> | undefined,
  fallback: PlotTextStyle,
): PlotTextStyle => ({
  family: style?.family?.trim() || fallback.family,
  size:
    Number.isFinite(style?.size) && Number(style?.size) > 0 ? Number(style?.size) : fallback.size,
});

const axisDataHasNonPositiveValues = (
  axis: "x" | "y",
  dataset: Dataset | undefined,
  plot: PlotSpec,
  nextX = plot.x,
): boolean => {
  if (!dataset) return true;
  if (axis === "x") {
    return dataset.rows.some((row, index) => Number(row[nextX] ?? index) <= 0);
  }
  return plot.series.some((series) => dataset.rows.some((row) => Number(row[series.y] ?? 0) <= 0));
};

export const executeScispaceCommand = (
  input: string,
  context: CommandContext,
): ScispaceCommandResult => {
  const tokens = tokenizeCommand(input);
  const [command, ...args] = tokens;

  if (!command || command === "help") {
    return {
      kind: "text",
      output: [
        "scispace commands:",
        "  lsdata",
        "  table <dataset> columns=<column[,column...]>",
        "  table-edit <dataset> action=<delete-row|delete-column|set-cell> index=<n> row=<n> column=<col> value=<value>",
        "  plot <dataset> x=<column> y=<column[,column...]> type=<line|line-marker|marker>",
        "  plot-set <plotId> title=<title> type=<line|line-marker|marker> border=<true|false> width=<n> height=<n> fontFamily=<name> fontSize=<n> padding=<t:r:b:l>",
        "  plot-axis <plotId> axis=<x|y> range=<auto|min:max> tick=<auto|interval> tickDir=<out|in|none> scale=<linear|log>",
        "  plot-grid <plotId> x=<true|false> y=<true|false>",
        "  plot-series <plotId> y=<column> action=<add|remove> markerShape=<circle|square|triangle|diamond|cross|plus> order=<n>",
        "  plot-annotation <plotId> action=<add|update|remove>",
        "  plot-schema [plotId]",
        "  file-list [path]",
        "  file-mkdir <path>",
        "  file-rename <path> name=<newName>",
        "  file-move <path> to=<directory>",
        "  file-delete <path>",
        "  import-open <importId> name=<fileName> text=<encodedText>",
        "  import-preview <importId>",
        "  import-set <importId> skipRows=<n> delimiter=<auto|comma|tab|space|semicolon> hasHeader=<true|false> mode=<tabular|raw>",
        "  import-column <importId> column=<col> action=<include|exclude>",
        "  import-line <importId> line=<n> value=<text>",
        "  import-cancel <importId>",
        "  import-confirm <importId> mode=<tabular|raw> path=<virtualPath>",
        "  elt <dataset> as <newName>",
      ].join("\n"),
    };
  }

  if (command === "lsdata") {
    const output = context.datasets
      .map(
        (dataset) =>
          `${dataset.name}\t${dataset.rows.length} rows\tcolumns: ${datasetColumnNames(dataset).join(", ")}`,
      )
      .join("\n");
    return { kind: "text", output: output || "No datasets loaded" };
  }

  if (command === "file-mkdir") {
    const path = args[0];
    if (!isVirtualRawPath(path)) return { kind: "error", output: "Usage: file-mkdir ~/raw/<path>" };
    return { kind: "file-command", action: "mkdir", path, output: `Directory created: ${path}` };
  }

  if (command === "file-rename") {
    const path = args[0];
    const name = readOption(args, "name");
    if (!isVirtualRawPath(path) || !isSafeFileName(name)) {
      return { kind: "error", output: "Usage: file-rename ~/raw/<path> name=<newName>" };
    }
    return { kind: "file-command", action: "rename", path, name, output: `Renamed: ${path}` };
  }

  if (command === "file-move") {
    const path = args[0];
    const targetDirectory = readOption(args, "to");
    if (!isVirtualRawPath(path) || !isVirtualRawPath(targetDirectory)) {
      return { kind: "error", output: "Usage: file-move ~/raw/<path> to=~/raw/<directory>" };
    }
    return {
      kind: "file-command",
      action: "move",
      path,
      targetDirectory,
      output: `Moved: ${path}`,
    };
  }

  if (command === "file-delete") {
    const path = args[0];
    if (!isVirtualRawPath(path))
      return { kind: "error", output: "Usage: file-delete ~/raw/<path>" };
    return { kind: "file-command", action: "delete", path, output: `Deleted: ${path}` };
  }

  if (command === "file-list") {
    const path = args[0] ?? "~/raw";
    if (!isVirtualRawPath(path))
      return { kind: "error", output: "Usage: file-list [~/raw/<path>]" };
    return {
      kind: "file-command",
      action: "list",
      path,
      output: formatVirtualFileList(path, context.files, context.datasets),
    };
  }

  if (command === "table") {
    const dataset = findDataset(context.datasets, args[0] ?? "");
    if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };
    const requestedColumns = readOption(args, "columns")
      ?.split(",")
      .map((column) => column.trim())
      .filter(Boolean);
    const columnIds = requestedColumns?.map((column) => resolveDatasetColumnId(dataset, column));
    const unknownColumns = requestedColumns?.filter((_, index) => !columnIds?.[index]) ?? [];
    if (unknownColumns.length > 0) {
      return {
        kind: "error",
        output: `Unknown table columns for ${dataset.name}: ${unknownColumns.join(", ")}`,
      };
    }
    const resolvedColumnIds = columnIds?.filter((column): column is string => Boolean(column));
    return {
      kind: "open-table",
      datasetId: dataset.id,
      columnIds: resolvedColumnIds && resolvedColumnIds.length > 0 ? resolvedColumnIds : undefined,
      output: `Table opened: ${dataset.name} (${dataset.rows.length} rows)`,
    };
  }

  if (command === "table-edit") {
    const dataset = findDataset(context.datasets, args[0] ?? "");
    if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };

    const action = readOption(args, "action");
    if (action === "delete-row") {
      const indexText = readOption(args, "index") ?? "";
      const rowIndex = Number(indexText);
      if (!Number.isInteger(rowIndex) || rowIndex < 1 || rowIndex > dataset.rows.length) {
        return {
          kind: "error",
          output: `Invalid row index for ${dataset.name}: ${indexText || "missing"}`,
        };
      }
      const updatedDataset: Dataset = {
        ...dataset,
        rows: dataset.rows.filter((_, index) => index !== rowIndex - 1),
      };
      return {
        kind: "dataset-updated",
        datasetId: dataset.id,
        dataset: updatedDataset,
        output: `Deleted row ${rowIndex} from ${dataset.name}`,
      };
    }

    if (action === "delete-column") {
      const columnToken = readOption(args, "column") ?? "";
      const columnId = resolveDatasetColumnId(dataset, columnToken);
      if (!columnId) {
        return { kind: "error", output: `Unknown column for ${dataset.name}: ${columnToken}` };
      }
      if (dataset.columns.length <= 1) {
        return { kind: "error", output: `Cannot delete the last column from ${dataset.name}` };
      }
      const updatedDataset: Dataset = {
        ...dataset,
        columns: dataset.columns.filter((column) => column.id !== columnId),
        rows: dataset.rows.map((row) =>
          Object.fromEntries(Object.entries(row).filter(([key]) => key !== columnId)),
        ),
      };
      return {
        kind: "dataset-updated",
        datasetId: dataset.id,
        dataset: updatedDataset,
        output: `Deleted column ${columnId} from ${dataset.name}`,
      };
    }

    if (action === "set-cell") {
      const rowText = readOption(args, "row") ?? "";
      const rowNumber = Number(rowText);
      if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > dataset.rows.length) {
        return {
          kind: "error",
          output: `Invalid row index for ${dataset.name}: ${rowText || "missing"}`,
        };
      }
      const columnToken = readOption(args, "column") ?? "";
      const columnId = resolveDatasetColumnId(dataset, columnToken);
      if (!columnId) {
        return { kind: "error", output: `Unknown column for ${dataset.name}: ${columnToken}` };
      }
      const value = readOption(args, "value");
      if (value === undefined) return { kind: "error", output: "value is required" };
      const updatedDataset: Dataset = {
        ...dataset,
        rows: dataset.rows.map((row, index) =>
          index === rowNumber - 1 ? { ...row, [columnId]: normalizeDataValue(value) } : row,
        ),
      };
      return {
        kind: "dataset-updated",
        datasetId: dataset.id,
        dataset: updatedDataset,
        output: `Updated cell row ${rowNumber} column ${columnId} in ${dataset.name}`,
      };
    }

    return {
      kind: "error",
      output:
        "Usage: table-edit <dataset> action=<delete-row|delete-column|set-cell> index=<n> row=<n> column=<col> value=<value>",
    };
  }

  if (command === "plot") {
    const dataset = findDataset(context.datasets, args[0] ?? "");
    if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };

    const columnIds = datasetColumnIds(dataset);
    const requestedX = readOption(args, "x");
    const x = requestedX ? resolveDatasetColumnId(dataset, requestedX) : columnIds[0];
    const yColumns = (readOption(args, "y") ?? columnIds[1] ?? "")
      .split(",")
      .map((column) => column.trim())
      .map((column) => resolveDatasetColumnId(dataset, column))
      .filter(isString);
    const requestedPlotColumns = [
      requestedX ?? columnIds[0],
      ...(readOption(args, "y") ?? columnIds[1] ?? "").split(",").map((column) => column.trim()),
    ].filter(Boolean);
    const resolvedPlotColumns = [x, ...yColumns].filter(Boolean);
    const unknownColumns =
      requestedPlotColumns.length === resolvedPlotColumns.length
        ? []
        : requestedPlotColumns.filter((column) => !resolveDatasetColumnId(dataset, column));
    if (yColumns.length === 0 || unknownColumns.length > 0) {
      return {
        kind: "error",
        output: `Unknown plot columns for ${dataset.name}: ${unknownColumns.join(", ")}`,
      };
    }
    const series = createPlotSeries(yColumns);
    const plotType = readOption(args, "type") ?? "line";
    if (!plotTypes.has(plotType as PlotType)) {
      return { kind: "error", output: `Unknown plot type: ${plotType}` };
    }
    const width = parsePlotDimension(readOption(args, "width"));
    const height = parsePlotDimension(readOption(args, "height"));
    if (readOption(args, "width") !== undefined && width === undefined)
      return { kind: "error", output: `Invalid plot width: ${readOption(args, "width")}` };
    if (readOption(args, "height") !== undefined && height === undefined)
      return { kind: "error", output: `Invalid plot height: ${readOption(args, "height")}` };

    const spec = normalizePlotSpecForCommand({
      id: crypto.randomUUID(),
      type: "line",
      plotType: plotType as PlotType,
      source: dataset.id,
      x: x ?? "",
      y: series[0]?.y,
      title: `${dataset.name}: ${series.map((item) => item.y).join(", ")} vs ${x}`,
      series,
      zoomMode: "xy",
      axisLabels: { x: x ?? "", y: series.map((item) => item.label).join(", ") },
      axes: {
        x: defaultPlotAxis(x ?? ""),
        y: defaultPlotAxis(series.map((item) => item.label).join(", ")),
      },
      grid: { x: true, y: true },
      border: true,
      size: {
        width: width ?? defaultPlotSize.width,
        height: height ?? defaultPlotSize.height,
      },
      font: defaultPlotFont,
      padding: defaultPlotPadding,
      annotations: [],
    });

    return { kind: "plot-created", spec, output: `Plot opened: ${spec.title}` };
  }

  if (command === "plot-set") {
    const plot = findPlot(context.plotSpecs, args[0] ?? "");
    if (!plot) return { kind: "error", output: `Plot not found: ${args[0] ?? ""}` };
    const patch: Partial<PlotSpec> = {};
    const title = readOption(args, "title");
    const type = readOption(args, "type");
    const x = readOption(args, "x");
    const zoom = readOption(args, "zoom");
    const axisX = readOption(args, "axisX");
    const borderValue = readOption(args, "border");
    const border = parseOptionalBoolean(borderValue);
    const widthValue = readOption(args, "width");
    const heightValue = readOption(args, "height");
    const width = parsePlotDimension(widthValue);
    const height = parsePlotDimension(heightValue);
    const fontFamily = readOption(args, "fontFamily");
    const fontSizeValue = readOption(args, "fontSize");
    const fontSize = parsePositiveNumber(fontSizeValue);
    const paddingValue = readOption(args, "padding");
    const padding = parsePadding(paddingValue);
    const dataset = findDataset(context.datasets, plot.source);
    if (title !== undefined) {
      patch.title = title;
      patch.titleEdited = true;
    }
    if (type !== undefined) {
      if (!plotTypes.has(type as PlotType))
        return { kind: "error", output: `Unknown plot type: ${type}` };
      patch.plotType = type as PlotType;
    }
    if (x !== undefined) {
      const resolvedX = dataset ? resolveDatasetColumnId(dataset, x) : undefined;
      if (!resolvedX) return { kind: "error", output: `Unknown x column: ${x}` };
      patch.x = resolvedX;
    }
    if (zoom !== undefined) {
      if (zoom !== "x" && zoom !== "y" && zoom !== "xy")
        return { kind: "error", output: `Invalid zoom: ${zoom}` };
      patch.zoomMode = zoom;
    }
    if (borderValue !== undefined && border === undefined)
      return { kind: "error", output: `Invalid border value: ${borderValue}` };
    if (border !== undefined) patch.border = border;
    if (widthValue !== undefined && width === undefined)
      return { kind: "error", output: `Invalid plot width: ${widthValue}` };
    if (heightValue !== undefined && height === undefined)
      return { kind: "error", output: `Invalid plot height: ${heightValue}` };
    if (fontSizeValue !== undefined && fontSize === undefined)
      return { kind: "error", output: `Invalid font size: ${fontSizeValue}` };
    if (paddingValue !== undefined && padding === undefined)
      return { kind: "error", output: `Invalid padding: ${paddingValue}` };
    if (width !== undefined || height !== undefined) {
      const currentSize = normalizePlotSpecForCommand(plot).size;
      patch.size = {
        width: width ?? currentSize.width,
        height: height ?? currentSize.height,
      };
    }
    if (fontFamily !== undefined || fontSize !== undefined) {
      const currentFont = normalizePlotSpecForCommand(plot).font;
      patch.font = {
        family: fontFamily ?? currentFont.family,
        size: fontSize ?? currentFont.size,
      };
    }
    if (padding) patch.padding = padding;
    const current = normalizePlotSpecForCommand({ ...plot, ...patch });
    const spec = normalizePlotSpecForCommand({
      ...current,
      axes:
        axisX !== undefined
          ? { ...current.axes, x: { ...current.axes.x, label: axisX } }
          : current.axes,
      axisLabels: axisX !== undefined ? { ...current.axisLabels, x: axisX } : current.axisLabels,
    });
    return { kind: "plot-updated", spec, output: `Plot updated: ${spec.title}` };
  }

  if (command === "plot-schema") {
    const plotId = args[0];
    if (!plotId) {
      return { kind: "text", output: JSON.stringify(plotSpecSchema, null, 2) };
    }
    const plot = findPlot(context.plotSpecs, plotId);
    if (!plot) return { kind: "error", output: `Plot not found: ${plotId}` };
    return { kind: "text", output: JSON.stringify(normalizePlotSpecForCommand(plot), null, 2) };
  }

  if (command === "plot-axis") {
    const plot = findPlot(context.plotSpecs, args[0] ?? "");
    if (!plot) return { kind: "error", output: `Plot not found: ${args[0] ?? ""}` };
    const axisKey = readOption(args, "axis");
    if (axisKey !== "x" && axisKey !== "y") return { kind: "error", output: "axis must be x or y" };
    const current = normalizePlotSpecForCommand(plot);
    const range = parseRange(readOption(args, "range"));
    if (readOption(args, "range") && !range) return { kind: "error", output: "Invalid range" };
    const tick = parseTick(readOption(args, "tick"));
    if (readOption(args, "tick") && !tick)
      return { kind: "error", output: "Invalid tick interval" };
    const tickDir = readOption(args, "tickDir");
    if (tickDir && !tickDirections.has(tickDir as PlotTickDirection)) {
      return { kind: "error", output: `Invalid tick direction: ${tickDir}` };
    }
    const scale = readOption(args, "scale");
    if (scale !== undefined && scale !== "linear" && scale !== "log") {
      return { kind: "error", output: `Invalid axis scale: ${scale}` };
    }
    const dataset = findDataset(context.datasets, current.source);
    if (scale === "log" && axisDataHasNonPositiveValues(axisKey, dataset, current)) {
      return { kind: "error", output: `Log scale requires positive ${axisKey} values` };
    }
    const label = readOption(args, "label");
    const labelFontFamily = readOption(args, "labelFontFamily");
    const labelFontSizeValue = readOption(args, "labelFontSize");
    const labelFontSize = parsePositiveNumber(labelFontSizeValue);
    const valueFontFamily = readOption(args, "valueFontFamily");
    const valueFontSizeValue = readOption(args, "valueFontSize");
    const valueFontSize = parsePositiveNumber(valueFontSizeValue);
    const sizeValue = readOption(args, "size");
    const size = parsePositiveNumber(sizeValue);
    const gapValue = readOption(args, "gap");
    const gap = parseNonNegativeNumber(gapValue);
    const labelGapValue = readOption(args, "labelGap");
    const labelGap = parseNonNegativeNumber(labelGapValue);
    const labelSizeValue = readOption(args, "labelSize");
    const labelSize = parsePositiveNumber(labelSizeValue);
    const colorValue = readOption(args, "color");
    const color = parseColor(colorValue);
    const gridColorValue = readOption(args, "gridColor");
    const gridColor = parseColor(gridColorValue);
    const tickColorValue = readOption(args, "tickColor");
    const tickColor = parseColor(tickColorValue);
    const tickLengthValue = readOption(args, "tickLength");
    const tickLength = parseNonNegativeNumber(tickLengthValue);
    const minorTickValue = readOption(args, "minorTick");
    const minorTick = parseOptionalBoolean(minorTickValue);
    if (labelFontSizeValue !== undefined && labelFontSize === undefined)
      return { kind: "error", output: `Invalid label font size: ${labelFontSizeValue}` };
    if (valueFontSizeValue !== undefined && valueFontSize === undefined)
      return { kind: "error", output: `Invalid value font size: ${valueFontSizeValue}` };
    if (sizeValue !== undefined && size === undefined)
      return { kind: "error", output: `Invalid axis size: ${sizeValue}` };
    if (gapValue !== undefined && gap === undefined)
      return { kind: "error", output: `Invalid axis gap: ${gapValue}` };
    if (labelGapValue !== undefined && labelGap === undefined)
      return { kind: "error", output: `Invalid label gap: ${labelGapValue}` };
    if (labelSizeValue !== undefined && labelSize === undefined)
      return { kind: "error", output: `Invalid label size: ${labelSizeValue}` };
    if (colorValue !== undefined && color === undefined)
      return { kind: "error", output: `Invalid axis color: ${colorValue}` };
    if (gridColorValue !== undefined && gridColor === undefined)
      return { kind: "error", output: `Invalid grid color: ${gridColorValue}` };
    if (tickColorValue !== undefined && tickColor === undefined)
      return { kind: "error", output: `Invalid tick color: ${tickColorValue}` };
    if (tickLengthValue !== undefined && tickLength === undefined)
      return { kind: "error", output: `Invalid tick length: ${tickLengthValue}` };
    if (minorTickValue !== undefined && minorTick === undefined)
      return { kind: "error", output: `Invalid minor tick: ${minorTickValue}` };
    const axis = {
      ...current.axes[axisKey],
      ...(label !== undefined ? { label } : {}),
      ...(range ? { range } : {}),
      ...(scale !== undefined ? { scale } : {}),
      ...(size !== undefined ? { size } : {}),
      ...(gap !== undefined ? { gap } : {}),
      ...(labelGap !== undefined ? { labelGap } : {}),
      ...(labelSize !== undefined ? { labelSize } : {}),
      ...(color !== undefined ? { color } : {}),
      ...(gridColor !== undefined ? { gridColor } : {}),
      ...(tickColor !== undefined ? { tickColor } : {}),
      labelStyle: {
        ...current.axes[axisKey].labelStyle,
        ...(labelFontFamily !== undefined ? { family: labelFontFamily } : {}),
        ...(labelFontSize !== undefined ? { size: labelFontSize } : {}),
      },
      valueStyle: {
        ...current.axes[axisKey].valueStyle,
        ...(valueFontFamily !== undefined ? { family: valueFontFamily } : {}),
        ...(valueFontSize !== undefined ? { size: valueFontSize } : {}),
      },
      ticks: {
        ...current.axes[axisKey].ticks,
        ...tick,
        ...(tickDir ? { orientation: tickDir as PlotTickDirection } : {}),
        ...(tickLength !== undefined ? { length: tickLength } : {}),
        ...(minorTick !== undefined ? { minor: minorTick } : {}),
      },
    };
    const spec = normalizePlotSpecForCommand({
      ...current,
      axes: { ...current.axes, [axisKey]: axis },
      axisLabels: { ...current.axisLabels, [axisKey]: axis.label },
    });
    return {
      kind: "plot-axis-updated",
      spec,
      output: `Plot ${axisKey} axis updated: ${spec.title}`,
    };
  }

  if (command === "plot-grid") {
    const plot = findPlot(context.plotSpecs, args[0] ?? "");
    if (!plot) return { kind: "error", output: `Plot not found: ${args[0] ?? ""}` };
    const current = normalizePlotSpecForCommand(plot);
    const xValue = readOption(args, "x");
    const yValue = readOption(args, "y");
    const x = parseOptionalBoolean(xValue);
    const y = parseOptionalBoolean(yValue);
    if (xValue !== undefined && x === undefined)
      return { kind: "error", output: `Invalid grid x value: ${xValue}` };
    if (yValue !== undefined && y === undefined)
      return { kind: "error", output: `Invalid grid y value: ${yValue}` };
    const spec = normalizePlotSpecForCommand({
      ...current,
      grid: { x: x ?? current.grid.x, y: y ?? current.grid.y },
    });
    return { kind: "plot-updated", spec, output: `Plot grid updated: ${spec.title}` };
  }

  if (command === "plot-series") {
    const plot = findPlot(context.plotSpecs, args[0] ?? "");
    if (!plot) return { kind: "error", output: `Plot not found: ${args[0] ?? ""}` };
    const current = normalizePlotSpecForCommand(plot);
    const dataset = findDataset(context.datasets, current.source);
    const requestedY = readOption(args, "y");
    const y = dataset ? resolveDatasetColumnId(dataset, requestedY) : undefined;
    if (!y) return { kind: "error", output: `Unknown series column: ${requestedY ?? ""}` };
    const action = readOption(args, "action");
    let series = current.series;
    if (action === "add") {
      if (!series.some((item) => item.y === y)) {
        series = [...series, createPlotSeries([y])[0] as PlotSeries];
      }
    } else if (action === "remove") {
      if (series.length <= 1) return { kind: "error", output: "Cannot remove the last series" };
      series = series.filter((item) => item.y !== y);
    } else {
      const markerShape = readOption(args, "markerShape");
      if (markerShape && !markerShapes.has(markerShape as PlotMarkerShape))
        return { kind: "error", output: `Invalid marker shape: ${markerShape}` };
      const lineWidth = readOption(args, "lineWidth");
      if (lineWidth !== undefined && !Number.isFinite(Number(lineWidth)))
        return { kind: "error", output: `Invalid line width: ${lineWidth}` };
      const markerSize = readOption(args, "markerSize");
      if (markerSize !== undefined && !Number.isFinite(Number(markerSize)))
        return { kind: "error", output: `Invalid marker size: ${markerSize}` };
      const orderValue = readOption(args, "order");
      const drawOrder = parseInteger(orderValue);
      if (orderValue !== undefined && drawOrder === undefined)
        return { kind: "error", output: `Invalid draw order: ${orderValue}` };
      series = series.map((item) => {
        if (item.y !== y) return item;
        return normalizeSeriesStyle(
          {
            ...item,
            label: readOption(args, "label") ?? item.label,
            color: readOption(args, "color") ?? item.color,
            lineWidth: Number(lineWidth ?? item.lineWidth),
            markerSize: Number(markerSize ?? item.markerSize),
            markerShape: (markerShape as PlotMarkerShape | undefined) ?? item.markerShape,
            drawOrder: drawOrder ?? item.drawOrder,
          },
          series.findIndex((candidate) => candidate.y === y),
        );
      });
    }
    const spec = normalizePlotSpecForCommand({ ...current, series });
    return { kind: "plot-series-updated", spec, output: `Plot series updated: ${spec.title}` };
  }

  if (command === "plot-annotation") {
    const plot = findPlot(context.plotSpecs, args[0] ?? "");
    if (!plot) return { kind: "error", output: `Plot not found: ${args[0] ?? ""}` };
    const current = normalizePlotSpecForCommand(plot);
    const action = readOption(args, "action");
    const id = readOption(args, "id");
    if (action !== "add" && action !== "update" && action !== "remove") {
      return {
        kind: "error",
        output: "Usage: plot-annotation <plotId> action=<add|update|remove>",
      };
    }

    if (action === "remove") {
      if (!id || !current.annotations.some((annotation) => annotation.id === id)) {
        return { kind: "error", output: `Annotation not found: ${id ?? ""}` };
      }
      const spec = normalizePlotSpecForCommand({
        ...current,
        annotations: current.annotations.filter((annotation) => annotation.id !== id),
      });
      return {
        kind: "plot-annotation-updated",
        spec,
        output: `Plot annotation removed: ${spec.title}`,
      };
    }

    const xValue = readOption(args, "x");
    const yValue = readOption(args, "y");
    const dxValue = readOption(args, "dx");
    const dyValue = readOption(args, "dy");
    const fontSizeValue = readOption(args, "fontSize");
    const x = xValue === undefined ? undefined : Number(xValue);
    const y = yValue === undefined ? undefined : Number(yValue);
    const dx = dxValue === undefined ? undefined : Number(dxValue);
    const dy = dyValue === undefined ? undefined : Number(dyValue);
    const fontSize = parsePositiveNumber(fontSizeValue);
    const colorValue = readOption(args, "color");
    const color = parseColor(colorValue);
    if (xValue !== undefined && !Number.isFinite(x))
      return { kind: "error", output: `Invalid annotation x: ${xValue}` };
    if (yValue !== undefined && !Number.isFinite(y))
      return { kind: "error", output: `Invalid annotation y: ${yValue}` };
    if (dxValue !== undefined && !Number.isFinite(dx))
      return { kind: "error", output: `Invalid annotation dx: ${dxValue}` };
    if (dyValue !== undefined && !Number.isFinite(dy))
      return { kind: "error", output: `Invalid annotation dy: ${dyValue}` };
    if (fontSizeValue !== undefined && fontSize === undefined)
      return { kind: "error", output: `Invalid annotation font size: ${fontSizeValue}` };
    if (colorValue !== undefined && color === undefined)
      return { kind: "error", output: `Invalid annotation color: ${colorValue}` };

    if (action === "add") {
      if (readOption(args, "type") !== "text-arrow" || x === undefined || y === undefined) {
        return {
          kind: "error",
          output: "Usage: plot-annotation <plotId> action=add type=text-arrow x=<n> y=<n>",
        };
      }
      const annotation: PlotAnnotation = {
        id: crypto.randomUUID(),
        type: "text-arrow",
        text: readOption(args, "text") ?? "Annotation",
        x,
        y,
        dx: dx ?? 24,
        dy: dy ?? -24,
        color: color ?? "#111827",
        font: {
          family: readOption(args, "fontFamily") ?? current.font.family,
          size: fontSize ?? current.font.size,
        },
      };
      const spec = normalizePlotSpecForCommand({
        ...current,
        annotations: [...current.annotations, annotation],
      });
      return {
        kind: "plot-annotation-updated",
        spec,
        output: `Plot annotation added: ${spec.title}`,
      };
    }

    if (!id) return { kind: "error", output: "Annotation id is required" };
    let found = false;
    const annotations = current.annotations.map((annotation) => {
      if (annotation.id !== id) return annotation;
      found = true;
      return {
        ...annotation,
        text: readOption(args, "text") ?? annotation.text,
        x: x ?? annotation.x,
        y: y ?? annotation.y,
        dx: dx ?? annotation.dx,
        dy: dy ?? annotation.dy,
        color: color ?? annotation.color,
        font: {
          family: readOption(args, "fontFamily") ?? annotation.font.family,
          size: fontSize ?? annotation.font.size,
        },
      };
    });
    if (!found) return { kind: "error", output: `Annotation not found: ${id}` };
    const spec = normalizePlotSpecForCommand({ ...current, annotations });
    return {
      kind: "plot-annotation-updated",
      spec,
      output: `Plot annotation updated: ${spec.title}`,
    };
  }

  if (command === "import-open") {
    const importId = args[0] ?? "";
    const fileName = readOption(args, "name");
    const text = readOption(args, "text");
    const mode = readOption(args, "mode") ?? "tabular";
    if (!importId) return { kind: "error", output: "importId is required" };
    if (!fileName) return { kind: "error", output: "name is required" };
    if (text === undefined) return { kind: "error", output: "text is required" };
    if (mode !== "tabular" && mode !== "raw") {
      return { kind: "error", output: "mode must be tabular or raw" };
    }
    const pendingImport: PendingImport = {
      id: importId,
      fileName,
      text: decodeURIComponent(text),
      mode,
      options: defaultImportParseOptions,
    };
    return {
      kind: "import-open",
      importId,
      pendingImport,
      output: `Import opened: ${fileName}`,
    };
  }

  if (command === "import-preview") {
    const importId = args[0] ?? "";
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };

    try {
      const preview = parseDelimitedText(
        pendingImport.text,
        pendingImport.fileName,
        normalizeVirtualPath(pendingImport.fileName),
        Date.now(),
        pendingImport.options,
      );
      return {
        kind: "import-preview",
        importId,
        preview: parseBooleanOption(args, "full")
          ? preview
          : { ...preview, rows: preview.rows.slice(0, 500) },
        output: `Import preview parsed: ${pendingImport.fileName}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse tabular file";
      return { kind: "import-preview", importId, error: message, output: message };
    }
  }

  if (command === "import-set") {
    const importId = args[0] ?? "";
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };

    const skipRowsValue = readOption(args, "skipRows");
    const skipRows = skipRowsValue === undefined ? undefined : parseInteger(skipRowsValue);
    if (skipRowsValue !== undefined && (skipRows === undefined || skipRows < 0)) {
      return { kind: "error", output: `Invalid skipRows: ${skipRowsValue}` };
    }

    const delimiter = readOption(args, "delimiter");
    if (delimiter !== undefined && !importDelimiters.has(delimiter)) {
      return { kind: "error", output: `Invalid delimiter: ${delimiter}` };
    }

    const hasHeader = parseOptionalBoolean(readOption(args, "hasHeader"));
    if (readOption(args, "hasHeader") !== undefined && hasHeader === undefined) {
      return { kind: "error", output: "hasHeader must be true or false" };
    }

    const mode = readOption(args, "mode");
    if (mode !== undefined && mode !== "tabular" && mode !== "raw") {
      return { kind: "error", output: "mode must be tabular or raw" };
    }

    const columnNames = readOption(args, "columnNames")
      ?.split(",")
      .map((column) => column.trim());
    const pendingImportUpdate: PendingImport = {
      ...pendingImport,
      mode: mode ?? pendingImport.mode,
      options: {
        ...pendingImport.options,
        skipRows: skipRows ?? pendingImport.options.skipRows,
        delimiter: (delimiter ??
          pendingImport.options.delimiter) as PendingImport["options"]["delimiter"],
        commentPrefix: readOption(args, "commentPrefix") ?? pendingImport.options.commentPrefix,
        hasHeader: hasHeader ?? pendingImport.options.hasHeader,
        columnNames: columnNames ?? pendingImport.options.columnNames,
      },
    };
    return {
      kind: "import-updated",
      importId,
      pendingImport: pendingImportUpdate,
      output: `Import settings updated: ${pendingImport.fileName}`,
    };
  }

  if (command === "import-column") {
    const importId = args[0] ?? "";
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };
    const column = readOption(args, "column");
    const action = readOption(args, "action");
    if (!column) return { kind: "error", output: "column is required" };
    if (action !== "include" && action !== "exclude") {
      return { kind: "error", output: "action must be include or exclude" };
    }

    const excluded = new Set(pendingImport.options.excludedColumnIds);
    if (action === "exclude") excluded.add(column);
    else excluded.delete(column);
    const pendingImportUpdate: PendingImport = {
      ...pendingImport,
      options: { ...pendingImport.options, excludedColumnIds: [...excluded] },
    };
    return {
      kind: "import-updated",
      importId,
      pendingImport: pendingImportUpdate,
      output: `Import column ${action}: ${column}`,
    };
  }

  if (command === "import-line") {
    const importId = args[0] ?? "";
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };
    const lineValue = readOption(args, "line");
    const lineNumber = lineValue === undefined ? undefined : parseInteger(lineValue);
    if (lineNumber === undefined || lineNumber < 1) {
      return { kind: "error", output: `Invalid import line: ${lineValue ?? "missing"}` };
    }
    const value = readOption(args, "value");
    if (value === undefined) return { kind: "error", output: "value is required" };
    const lines = pendingImport.text.split(/\r?\n/);
    if (lineNumber > lines.length) {
      return { kind: "error", output: `Import line out of range: ${lineNumber}` };
    }
    lines[lineNumber - 1] = decodeURIComponent(value);
    const pendingImportUpdate: PendingImport = {
      ...pendingImport,
      text: lines.join("\n"),
    };
    return {
      kind: "import-updated",
      importId,
      pendingImport: pendingImportUpdate,
      output: `Import line updated: ${lineNumber}`,
    };
  }

  if (command === "import-cancel") {
    const importId = args[0] ?? "";
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };
    return {
      kind: "import-cancel",
      importId,
      output: `Import cancelled: ${pendingImport.fileName}`,
    };
  }

  if (command === "import-confirm") {
    const importId = args[0] ?? "";
    const pathOption = readOption(args, "path");
    const path = pathOption ? decodeURIComponent(pathOption) : undefined;
    const mode = readOption(args, "mode") ?? (parseBooleanOption(args, "raw") ? "raw" : "tabular");
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };
    if (!path)
      return { kind: "error", output: "Usage: import-confirm <importId> path=<virtualPath>" };
    if (mode !== "tabular" && mode !== "raw") {
      return { kind: "error", output: "mode must be tabular or raw" };
    }
    if (mode === "raw") {
      return {
        kind: "import-confirm",
        importId,
        parseError: "Raw file stored without tabular parsing",
        output: `Raw import confirmed: ${path}`,
      };
    }

    try {
      const dataset = parseDelimitedText(
        pendingImport.text,
        path.split("/").at(-1) ?? pendingImport.fileName,
        path,
        Date.now(),
        pendingImport.options,
      );
      return { kind: "import-confirm", importId, dataset, output: `Import confirmed: ${path}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse tabular file";
      return { kind: "import-confirm", importId, parseError: message, output: message };
    }
  }

  if (command === "elt") {
    const dataset = findDataset(context.datasets, args[0] ?? "");
    const asIndex = args.indexOf("as");
    const name = asIndex >= 0 ? args[asIndex + 1] : undefined;
    if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };
    if (!name) return { kind: "error", output: "Usage: elt <dataset> as <newName>" };

    const derived: Dataset = {
      ...dataset,
      id: crypto.randomUUID(),
      name,
      sourcePath: `~/raw/${name}`,
      createdBy: "elt",
      createdAt: Date.now(),
      rows: dataset.rows.map((row) => ({ ...row })),
    };

    return { kind: "dataset-created", dataset: derived, output: `Created dataset ${name}` };
  }

  return { kind: "error", output: `Unknown scispace command: ${command}` };
};
