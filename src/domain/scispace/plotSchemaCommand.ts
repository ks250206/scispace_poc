import type { ScispaceCommandResult } from "../types";
import { type CommandContext } from "./commandUtils";
import { findPlot, normalizePlotSpecForCommand, plotSpecSchema } from "./plotSpec";

export const executePlotSchemaCommand = (
  args: string[],
  context: CommandContext,
): ScispaceCommandResult => {
  const plotId = args[0];
  if (!plotId) {
    return { kind: "text", output: JSON.stringify(plotSpecSchema, null, 2) };
  }
  const plot = findPlot(context.plotSpecs, plotId);
  if (!plot) return { kind: "error", output: `Plot not found: ${plotId}` };
  return { kind: "text", output: JSON.stringify(normalizePlotSpecForCommand(plot), null, 2) };
};
