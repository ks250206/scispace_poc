import { datasetColumnIds, resolveDatasetColumnId } from "../csv";
import type { PlotType, ScispaceCommandResult } from "../types";
import { findDataset, isString, readOption, type CommandContext } from "./commandUtils";
import {
  createPlotSeries,
  defaultPlotAxis,
  defaultPlotFont,
  defaultPlotPadding,
  defaultPlotSize,
  normalizePlotSpecForCommand,
  parsePlotDimension,
  plotTypes,
} from "./plotSpec";

export const executePlotCreateCommand = (
  args: string[],
  context: CommandContext,
): ScispaceCommandResult => {
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

  const widthValue = readOption(args, "width");
  const heightValue = readOption(args, "height");
  const width = parsePlotDimension(widthValue);
  const height = parsePlotDimension(heightValue);
  if (widthValue !== undefined && width === undefined) {
    return { kind: "error", output: `Invalid plot width: ${widthValue}` };
  }
  if (heightValue !== undefined && height === undefined) {
    return { kind: "error", output: `Invalid plot height: ${heightValue}` };
  }

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
};
