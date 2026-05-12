import {
  createDatasetColumns,
  datasetColumnIds,
  normalizeDataValue,
  resolveDatasetColumnId,
} from "../csv";
import type { Dataset, DatasetColumn, ScispaceCommandResult } from "../types";
import { findDataset, parseInteger, readOption, type CommandContext } from "./commandUtils";
import { evaluateDatasetExpression } from "./datasetExpression";

export const executeDatasetCommand = (
  command: string | undefined,
  args: string[],
  context: CommandContext,
): ScispaceCommandResult | undefined => {
  if (command === "dataset-new") return executeDatasetNew(args, context);
  if (command === "dataset-calc") return executeDatasetCalc(args, context);
  return undefined;
};

const executeDatasetNew = (args: string[], context: CommandContext): ScispaceCommandResult => {
  const name = args[0]?.trim();
  const columnsText = readOption(args, "columns") ?? "";
  const rowCount = parseInteger(readOption(args, "rows"));
  const columnNames = columnsText
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);

  if (!name)
    return { kind: "error", output: "Usage: dataset-new <name> columns=<col[,col...]> rows=<n>" };
  if (context.datasets.some((dataset) => dataset.name === name)) {
    return { kind: "error", output: `Dataset already exists: ${name}` };
  }
  if (columnNames.length === 0) return { kind: "error", output: "dataset-new requires columns" };
  if (rowCount === undefined || rowCount < 0) {
    return { kind: "error", output: `Invalid row count: ${readOption(args, "rows") ?? "missing"}` };
  }

  const columns = createDatasetColumns(columnNames);
  const rows = Array.from({ length: rowCount }, () =>
    Object.fromEntries(columns.map((column) => [column.id, ""])),
  );
  const dataset: Dataset = {
    id: `dataset-${crypto.randomUUID()}`,
    name,
    sourcePath: datasetSourcePath(name),
    columns,
    rows,
    createdBy: "elt",
    createdAt: Date.now(),
  };

  return {
    kind: "dataset-created",
    dataset,
    output: `Created dataset ${name} (${rowCount} rows, ${columns.length} cols)`,
  };
};

const executeDatasetCalc = (args: string[], context: CommandContext): ScispaceCommandResult => {
  const dataset = findDataset(context.datasets, args[0] ?? "");
  if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };
  const targetColumn = readOption(args, "column")?.trim();
  const expression = readOption(args, "expr")?.trim();
  if (!targetColumn || !expression) {
    return {
      kind: "error",
      output: "Usage: dataset-calc <dataset> column=<newOrExistingCol> expr=<expression>",
    };
  }

  const evaluated = evaluateDatasetExpression(dataset, expression);
  if (!evaluated.ok) return { kind: "error", output: evaluated.error };

  const existingColumnId = resolveDatasetColumnId(dataset, targetColumn);
  const columnId = existingColumnId ?? uniqueCalculatedColumnId(dataset, targetColumn);
  const columns = existingColumnId
    ? updateColumnType(dataset.columns, existingColumnId)
    : [...dataset.columns, newCalculatedColumn(columnId, targetColumn)];
  const rows = dataset.rows.map((row, index) => ({
    ...row,
    [columnId]: normalizeDataValue(String(evaluated.values[index] ?? "")),
  }));
  const updatedDataset: Dataset = { ...dataset, columns, rows };

  return {
    kind: "dataset-updated",
    datasetId: dataset.id,
    dataset: updatedDataset,
    output: `Calculated column ${columnId} in ${dataset.name}`,
  };
};

const datasetSourcePath = (name: string): string => {
  const fileName = name.endsWith(".csv") ? name : `${name}.csv`;
  return `~/raw/${fileName}`;
};

const uniqueCalculatedColumnId = (dataset: Dataset, targetColumn: string): string => {
  const base =
    targetColumn
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^\w.-]/g, "_") || "calculated";
  const usedIds = new Set(datasetColumnIds(dataset));
  let candidate = base;
  let suffix = 1;
  while (usedIds.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
};

const newCalculatedColumn = (columnId: string, name: string): DatasetColumn => ({
  id: columnId,
  name,
  sourceName: name,
  dataType: "number",
});

const updateColumnType = (columns: DatasetColumn[], columnId: string): DatasetColumn[] =>
  columns.map((column) => (column.id === columnId ? { ...column, dataType: "number" } : column));
