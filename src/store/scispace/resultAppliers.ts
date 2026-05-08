import type { ScispaceCommandResult } from "../../domain/types";
import { applyDatasetResult } from "./datasetResult";
import { applyFileResult } from "./fileResult";
import { applyImportOpenResult } from "./importOpenResult";
import { applyImportResult } from "./importResult";
import { applyPlotResult } from "./plotResult";
import type { ResultApplyContext } from "./resultApplyContext";

export const applyScispaceResult = async (
  initialResult: ScispaceCommandResult,
  context: ResultApplyContext,
): Promise<ScispaceCommandResult> => {
  let result = initialResult;
  result = await applyPlotResult(result, context);
  result = await applyImportOpenResult(result, context);
  result = await applyDatasetResult(result, context);
  result = await applyImportResult(result, context);
  result = await applyFileResult(result, context);
  return result;
};
