import { resolveDatasetColumnId } from "../csv";
import type { PlotSpec, ScispaceCommandResult } from "../types";
import { findDataset, readOption, type CommandContext } from "./commandUtils";
import { findPlot, normalizePlotSpecForCommand } from "./plotSpec";

const decodeSchemaJson = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parsePlotSchemaJson = (value: string): Partial<PlotSpec> | undefined => {
  try {
    const parsed = JSON.parse(decodeSchemaJson(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Partial<PlotSpec>)
      : undefined;
  } catch {
    return undefined;
  }
};

export const executePlotApplySchemaCommand = (
  args: string[],
  context: CommandContext,
): ScispaceCommandResult => {
  const plotId = args[0];
  const plot = findPlot(context.plotSpecs, plotId ?? "");
  if (!plot) return { kind: "error", output: `Plot not found: ${plotId ?? ""}` };

  const json = readOption(args, "json");
  if (!json) {
    return { kind: "error", output: "Usage: plot-apply-schema <plotId> json=<encodedJson>" };
  }

  const patch = parsePlotSchemaJson(json);
  if (!patch) return { kind: "error", output: "Invalid plot schema JSON" };

  const source = typeof patch.source === "string" ? patch.source : plot.source;
  const dataset = findDataset(context.datasets, source);
  if (!dataset) return { kind: "error", output: `Dataset not found: ${source}` };

  const x = typeof patch.x === "string" ? patch.x : plot.x;
  const resolvedX = resolveDatasetColumnId(dataset, x);
  if (!resolvedX) return { kind: "error", output: `Unknown x column: ${x}` };

  const series =
    Array.isArray(patch.series) && patch.series.length > 0 ? patch.series : plot.series;
  const unknownSeries = series.filter((item) => !resolveDatasetColumnId(dataset, item.y));
  if (unknownSeries.length > 0) {
    return {
      kind: "error",
      output: `Unknown plot columns for ${dataset.name}: ${unknownSeries
        .map((item) => item.y)
        .join(", ")}`,
    };
  }

  const spec = normalizePlotSpecForCommand({
    ...plot,
    ...patch,
    id: plot.id,
    source: dataset.id,
    x: resolvedX,
    series: series.map((item) => ({
      ...item,
      y: resolveDatasetColumnId(dataset, item.y) ?? item.y,
    })),
  });

  return { kind: "plot-updated", spec, output: `Plot schema applied: ${spec.title}` };
};
