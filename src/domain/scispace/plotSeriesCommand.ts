import { resolveDatasetColumnId } from "../csv";
import type { PlotMarkerShape, PlotSeries, ScispaceCommandResult } from "../types";
import { findDataset, parseInteger, readOption, type CommandContext } from "./commandUtils";
import {
  createPlotSeries,
  findPlot,
  markerShapes,
  normalizePlotSpecForCommand,
  normalizeSeriesStyle,
} from "./plotSpec";

export const executePlotSeriesCommand = (
  args: string[],
  context: CommandContext,
): ScispaceCommandResult => {
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
};
