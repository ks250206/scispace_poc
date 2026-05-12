import { createDatasetColumns, normalizeDataValue, resolveDatasetColumnId } from "../csv";
import type { Dataset, DatasetColumn, ScispaceCommandResult } from "../types";
import { findDataset, readOption, type CommandContext } from "./commandUtils";

export const executeTableCommand = (
  command: string,
  args: string[],
  context: CommandContext,
): ScispaceCommandResult | undefined => {
  if (command === "table") {
    const dataset = findDataset(context.datasets, args[0] ?? "");
    if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };
    const requestedColumns = readOption(args, "columns")
      ?.split(",")
      .map((column) => column.trim())
      .filter(Boolean);
    const columnIds = requestedColumns?.map((column) => resolveDatasetColumnId(dataset, column));
    const unknownColumns = requestedColumns?.filter((_, index) => !columnIds?.[index]) ?? [];
    if (unknownColumns.length > 0) {
      return {
        kind: "error",
        output: `Unknown table columns for ${dataset.name}: ${unknownColumns.join(", ")}`,
      };
    }
    const resolvedColumnIds = columnIds?.filter((column): column is string => Boolean(column));
    return {
      kind: "open-table",
      datasetId: dataset.id,
      columnIds: resolvedColumnIds && resolvedColumnIds.length > 0 ? resolvedColumnIds : undefined,
      output: `Table opened: ${dataset.name} (${dataset.rows.length} rows)`,
    };
  }

  if (command === "table-edit") {
    const dataset = findDataset(context.datasets, args[0] ?? "");
    if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };

    const action = readOption(args, "action");
    if (action === "delete-row") {
      const indexText = readOption(args, "index") ?? "";
      const rowIndex = Number(indexText);
      if (!Number.isInteger(rowIndex) || rowIndex < 1 || rowIndex > dataset.rows.length) {
        return {
          kind: "error",
          output: `Invalid row index for ${dataset.name}: ${indexText || "missing"}`,
        };
      }
      const updatedDataset: Dataset = {
        ...dataset,
        rows: dataset.rows.filter((_, index) => index !== rowIndex - 1),
      };
      return {
        kind: "dataset-updated",
        datasetId: dataset.id,
        dataset: updatedDataset,
        output: `Deleted row ${rowIndex} from ${dataset.name}`,
      };
    }

    if (action === "delete-column") {
      const columnToken = readOption(args, "column") ?? "";
      const columnId = resolveDatasetColumnId(dataset, columnToken);
      if (!columnId) {
        return { kind: "error", output: `Unknown column for ${dataset.name}: ${columnToken}` };
      }
      if (dataset.columns.length <= 1) {
        return { kind: "error", output: `Cannot delete the last column from ${dataset.name}` };
      }
      const updatedDataset: Dataset = {
        ...dataset,
        columns: dataset.columns.filter((column) => column.id !== columnId),
        rows: dataset.rows.map((row) =>
          Object.fromEntries(Object.entries(row).filter(([key]) => key !== columnId)),
        ),
      };
      return {
        kind: "dataset-updated",
        datasetId: dataset.id,
        dataset: updatedDataset,
        output: `Deleted column ${columnId} from ${dataset.name}`,
      };
    }

    if (action === "set-cell") {
      const rowText = readOption(args, "row") ?? "";
      const rowNumber = Number(rowText);
      if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > dataset.rows.length) {
        return {
          kind: "error",
          output: `Invalid row index for ${dataset.name}: ${rowText || "missing"}`,
        };
      }
      const columnToken = readOption(args, "column") ?? "";
      const columnId = resolveDatasetColumnId(dataset, columnToken);
      if (!columnId) {
        return { kind: "error", output: `Unknown column for ${dataset.name}: ${columnToken}` };
      }
      const value = readOption(args, "value");
      if (value === undefined) return { kind: "error", output: "value is required" };
      const updatedDataset: Dataset = {
        ...dataset,
        rows: dataset.rows.map((row, index) =>
          index === rowNumber - 1 ? { ...row, [columnId]: normalizeDataValue(value) } : row,
        ),
      };
      return {
        kind: "dataset-updated",
        datasetId: dataset.id,
        dataset: updatedDataset,
        output: `Updated cell row ${rowNumber} column ${columnId} in ${dataset.name}`,
      };
    }

    if (action === "insert-column") {
      const columnName = readOption(args, "column")?.trim() ?? "";
      if (!columnName) return { kind: "error", output: "column is required" };
      if (resolveDatasetColumnId(dataset, columnName)) {
        return { kind: "error", output: `Column already exists in ${dataset.name}: ${columnName}` };
      }
      const beforeToken = readOption(args, "before");
      const beforeColumnId = beforeToken ? resolveDatasetColumnId(dataset, beforeToken) : undefined;
      if (beforeToken && !beforeColumnId) {
        return { kind: "error", output: `Unknown column for ${dataset.name}: ${beforeToken}` };
      }

      const column = createDatasetColumns([columnName])[0] as DatasetColumn | undefined;
      if (!column) return { kind: "error", output: "column is required" };
      const beforeIndex = beforeColumnId
        ? dataset.columns.findIndex((item) => item.id === beforeColumnId)
        : dataset.columns.length;
      const columns = [
        ...dataset.columns.slice(0, beforeIndex),
        { ...column, dataType: "string" as const },
        ...dataset.columns.slice(beforeIndex),
      ];
      const updatedDataset: Dataset = {
        ...dataset,
        columns,
        rows: dataset.rows.map((row) => ({ ...row, [column.id]: "" })),
      };
      return {
        kind: "dataset-updated",
        datasetId: dataset.id,
        dataset: updatedDataset,
        output: `Inserted column ${column.id} into ${dataset.name}`,
      };
    }

    return {
      kind: "error",
      output:
        "Usage: table-edit <dataset> action=<delete-row|delete-column|set-cell|insert-column> index=<n> row=<n> column=<col> value=<value> before=<col>",
    };
  }

  if (command === "table-range") {
    const dataset = findDataset(context.datasets, args[0] ?? "");
    if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };

    const action = readOption(args, "action");
    const r1Text = readOption(args, "r1") ?? "";
    const r2Text = readOption(args, "r2") ?? "";
    const r1 = Number(r1Text);
    const r2 = Number(r2Text);
    if (
      !Number.isInteger(r1) ||
      !Number.isInteger(r2) ||
      r1 < 1 ||
      r2 < 1 ||
      r1 > dataset.rows.length ||
      r2 > dataset.rows.length
    ) {
      return {
        kind: "error",
        output: `Invalid row range for ${dataset.name}: ${r1Text || "missing"}-${r2Text || "missing"}`,
      };
    }

    const c1Token = readOption(args, "c1") ?? "";
    const c2Token = readOption(args, "c2") ?? "";
    const c1 = resolveDatasetColumnId(dataset, c1Token);
    const c2 = resolveDatasetColumnId(dataset, c2Token);
    if (!c1 || !c2) {
      return {
        kind: "error",
        output: `Unknown column range for ${dataset.name}: ${c1Token || "missing"}-${c2Token || "missing"}`,
      };
    }

    const c1Index = dataset.columns.findIndex((column) => column.id === c1);
    const c2Index = dataset.columns.findIndex((column) => column.id === c2);
    const minRow = Math.min(r1, r2) - 1;
    const maxRow = Math.max(r1, r2) - 1;
    const minColumn = Math.min(c1Index, c2Index);
    const maxColumn = Math.max(c1Index, c2Index);
    const rangeColumns = dataset.columns.slice(minColumn, maxColumn + 1).map((column) => column.id);
    const rangeLabel = `rows ${minRow + 1}-${maxRow + 1} columns ${rangeColumns[0]}-${rangeColumns.at(
      -1,
    )}`;

    if (action === "clear") {
      const updatedDataset: Dataset = {
        ...dataset,
        rows: dataset.rows.map((row, index) =>
          index < minRow || index > maxRow
            ? row
            : { ...row, ...Object.fromEntries(rangeColumns.map((column) => [column, ""])) },
        ),
      };
      return {
        kind: "dataset-updated",
        datasetId: dataset.id,
        dataset: updatedDataset,
        output: `Cleared range ${rangeLabel} in ${dataset.name}`,
      };
    }

    if (action === "fill-down") {
      if (minRow === maxRow) {
        return { kind: "error", output: "fill-down requires at least two rows" };
      }
      const anchorRow = dataset.rows[minRow] ?? {};
      const updatedDataset: Dataset = {
        ...dataset,
        rows: dataset.rows.map((row, index) =>
          index <= minRow || index > maxRow
            ? row
            : {
                ...row,
                ...Object.fromEntries(
                  rangeColumns.map((column) => [column, anchorRow[column] ?? ""]),
                ),
              },
        ),
      };
      return {
        kind: "dataset-updated",
        datasetId: dataset.id,
        dataset: updatedDataset,
        output: `Filled down range ${rangeLabel} in ${dataset.name}`,
      };
    }

    return {
      kind: "error",
      output:
        "Usage: table-range <dataset> action=<clear|fill-down> r1=<n> c1=<col> r2=<n> c2=<col>",
    };
  }

  return undefined;
};
