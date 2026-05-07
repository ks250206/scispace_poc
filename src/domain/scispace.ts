import { normalizeVirtualPath, parseDelimitedText } from "./csv";
import type {
  Dataset,
  PendingImport,
  PlotAxisSpec,
  PlotMarkerShape,
  PlotSeries,
  PlotSizeSpec,
  PlotSpec,
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

const parseBooleanOption = (tokens: string[], key: string): boolean =>
  readOption(tokens, key) === "true";

const parseOptionalBoolean = (value: string | undefined): boolean | undefined => {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const plotColors = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];
const plotTypes = new Set<PlotType>(["line", "line-marker", "marker"]);
const tickDirections = new Set<PlotTickDirection>(["out", "in", "none"]);
const markerShapes = new Set<PlotMarkerShape>(["circle", "square"]);
const defaultPlotSize: PlotSizeSpec = { width: 640, height: 360 };
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
        return `[dataset] ${file.path} -> ${dataset.name} (${dataset.rows.length} rows)`;
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
  zoomMode: '"x" | "y" | "xy"',
  axes: {
    x: {
      label: "string",
      range: '{ mode: "auto" } | { mode: "manual", min: number, max: number }',
      ticks:
        '{ mode: "auto", orientation: "out" | "in" | "none" } | { mode: "manual", interval: number, orientation: "out" | "in" | "none" }',
    },
    y: {
      label: "string",
      range: '{ mode: "auto" } | { mode: "manual", min: number, max: number }',
      ticks:
        '{ mode: "auto", orientation: "out" | "in" | "none" } | { mode: "manual", interval: number, orientation: "out" | "in" | "none" }',
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
      markerShape: '"circle" | "square"',
    },
  ],
} as const;

export const defaultPlotAxis = (label: string): PlotAxisSpec => ({
  label,
  range: { mode: "auto" },
  ticks: { mode: "auto", orientation: "out" },
});

const createPlotSeries = (columns: string[]): PlotSeries[] =>
  columns.map((column, index) => ({
    y: column,
    label: column,
    color: plotColors[index % plotColors.length] ?? "#2563eb",
    lineWidth: 2,
    markerSize: 6,
    markerShape: "circle",
  }));

const normalizeSeriesStyle = (series: PlotSeries, index: number): PlotSeries => ({
  y: series.y,
  label: series.label || series.y,
  color: series.color || plotColors[index % plotColors.length] || "#2563eb",
  lineWidth: Number.isFinite(series.lineWidth) ? series.lineWidth : 2,
  markerSize: Number.isFinite(series.markerSize) ? series.markerSize : 6,
  markerShape: markerShapes.has(series.markerShape) ? series.markerShape : "circle",
});

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
      x: spec.axes?.x ?? defaultPlotAxis(xLabel),
      y: spec.axes?.y ?? defaultPlotAxis(yLabel),
    },
    grid: spec.grid ?? { x: true, y: true },
    border: spec.border ?? true,
    size: {
      width: parsePlotDimension(String(spec.size?.width)) ?? defaultPlotSize.width,
      height: parsePlotDimension(String(spec.size?.height)) ?? defaultPlotSize.height,
    },
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
        "  table <dataset>",
        "  plot <dataset> x=<column> y=<column[,column...]> type=<line|line-marker|marker>",
        "  plot-set <plotId> title=<title> type=<line|line-marker|marker> border=<true|false> width=<n> height=<n>",
        "  plot-axis <plotId> axis=<x|y> range=<auto|min:max> tick=<auto|interval> tickDir=<out|in|none>",
        "  plot-grid <plotId> x=<true|false> y=<true|false>",
        "  plot-series <plotId> y=<column> action=<add|remove>",
        "  plot-schema [plotId]",
        "  file-list [path]",
        "  file-mkdir <path>",
        "  file-rename <path> name=<newName>",
        "  file-move <path> to=<directory>",
        "  file-delete <path>",
        "  import-preview <importId>",
        "  import-confirm <importId> path=<virtualPath>",
        "  elt <dataset> as <newName>",
      ].join("\n"),
    };
  }

  if (command === "lsdata") {
    const output = context.datasets
      .map(
        (dataset) =>
          `${dataset.name}\t${dataset.rows.length} rows\tcolumns: ${dataset.columns.join(", ")}`,
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
    return {
      kind: "open-table",
      datasetId: dataset.id,
      output: `Table opened: ${dataset.name} (${dataset.rows.length} rows)`,
    };
  }

  if (command === "plot") {
    const dataset = findDataset(context.datasets, args[0] ?? "");
    if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };

    const x = readOption(args, "x") ?? dataset.columns[0];
    const yColumns = (readOption(args, "y") ?? dataset.columns[1] ?? "")
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean);
    const unknownColumns = [x, ...yColumns].filter((column) => !dataset.columns.includes(column));
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
      x,
      y: series[0]?.y,
      title: `${dataset.name}: ${series.map((item) => item.y).join(", ")} vs ${x}`,
      series,
      zoomMode: "xy",
      axisLabels: { x, y: series.map((item) => item.label).join(", ") },
      axes: {
        x: defaultPlotAxis(x),
        y: defaultPlotAxis(series.map((item) => item.label).join(", ")),
      },
      grid: { x: true, y: true },
      border: true,
      size: {
        width: width ?? defaultPlotSize.width,
        height: height ?? defaultPlotSize.height,
      },
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
      if (!dataset?.columns.includes(x)) return { kind: "error", output: `Unknown x column: ${x}` };
      patch.x = x;
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
    if (width !== undefined || height !== undefined) {
      const currentSize = normalizePlotSpecForCommand(plot).size;
      patch.size = {
        width: width ?? currentSize.width,
        height: height ?? currentSize.height,
      };
    }
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
    const label = readOption(args, "label");
    const axis = {
      ...current.axes[axisKey],
      ...(label !== undefined ? { label } : {}),
      ...(range ? { range } : {}),
      ticks: {
        ...current.axes[axisKey].ticks,
        ...tick,
        ...(tickDir ? { orientation: tickDir as PlotTickDirection } : {}),
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
    const y = readOption(args, "y");
    if (!y || !dataset?.columns.includes(y))
      return { kind: "error", output: `Unknown series column: ${y ?? ""}` };
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
          },
          series.findIndex((candidate) => candidate.y === y),
        );
      });
    }
    const spec = normalizePlotSpecForCommand({ ...current, series });
    return { kind: "plot-series-updated", spec, output: `Plot series updated: ${spec.title}` };
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

  if (command === "import-confirm") {
    const importId = args[0] ?? "";
    const pathOption = readOption(args, "path");
    const path = pathOption ? decodeURIComponent(pathOption) : undefined;
    const rawOnly = parseBooleanOption(args, "raw");
    const pendingImport = context.pendingImports?.find((item) => item.id === importId);
    if (!pendingImport) return { kind: "error", output: `Pending import not found: ${importId}` };
    if (!path)
      return { kind: "error", output: "Usage: import-confirm <importId> path=<virtualPath>" };
    if (rawOnly) {
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
