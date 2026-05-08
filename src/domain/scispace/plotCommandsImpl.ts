import type { ScispaceCommandResult } from "../types";
import type { CommandContext } from "./commandUtils";
import { executePlotAnnotationCommand } from "./plotAnnotationCommand";
import { executePlotAxisCommand } from "./plotAxisCommand";
import { executePlotCreateCommand } from "./plotCreateCommand";
import { executePlotGridCommand } from "./plotGridCommand";
import { executePlotSchemaCommand } from "./plotSchemaCommand";
import { executePlotSeriesCommand } from "./plotSeriesCommand";
import { executePlotSetCommand } from "./plotSetCommand";

export const executePlotCommand = (
  command: string,
  args: string[],
  context: CommandContext,
): ScispaceCommandResult | undefined => {
  if (command === "plot") return executePlotCreateCommand(args, context);
  if (command === "plot-set") return executePlotSetCommand(args, context);
  if (command === "plot-schema") return executePlotSchemaCommand(args, context);
  if (command === "plot-axis") return executePlotAxisCommand(args, context);
  if (command === "plot-grid") return executePlotGridCommand(args, context);
  if (command === "plot-series") return executePlotSeriesCommand(args, context);
  if (command === "plot-annotation") return executePlotAnnotationCommand(args, context);

  return undefined;
};
