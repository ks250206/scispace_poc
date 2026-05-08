import type { ScispaceCommandResult } from "../types";
import { parseOptionalBoolean, readOption, type CommandContext } from "./commandUtils";
import { findPlot, normalizePlotSpecForCommand } from "./plotSpec";

export const executePlotGridCommand = (
  args: string[],
  context: CommandContext,
): ScispaceCommandResult => {
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
};
