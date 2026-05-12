import type { ScispaceCommandResult } from "../types";
import { tokenizeCommand, type CommandContext } from "./commandUtils";
import { executeDatasetCommand } from "./datasetCommands";
import { executeVirtualFileCommand } from "./fileCommands";
import { executeImportCommand } from "./importCommands";
import { executePlotCommand } from "./plotCommands";
import { executeTableCommand } from "./tableCommands";
import { executeUtilityCommand } from "./utilityCommands";

export const executeScispaceCommand = (
  input: string,
  context: CommandContext,
): ScispaceCommandResult => {
  const tokens = tokenizeCommand(input);
  const [command, ...args] = tokens;

  const utilityResult = executeUtilityCommand(command, args, context);
  if (utilityResult) return utilityResult;

  const virtualFileResult = executeVirtualFileCommand(command, args, context);
  if (virtualFileResult) return virtualFileResult;

  const datasetResult = executeDatasetCommand(command, args, context);
  if (datasetResult) return datasetResult;

  const tableResult = executeTableCommand(command, args, context);
  if (tableResult) return tableResult;

  const plotResult = executePlotCommand(command, args, context);
  if (plotResult) return plotResult;

  const importResult = executeImportCommand(command, args, context);
  if (importResult) return importResult;

  return { kind: "error", output: `Unknown scispace command: ${command}` };
};
