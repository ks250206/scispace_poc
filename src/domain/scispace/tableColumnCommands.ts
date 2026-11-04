import {
  inspectColumnConversion,
  isBlankColumnValue,
  isColumnDateFormat,
  isConversionType,
} from "../columnConversion";
import { resolveDatasetColumnId } from "../csv";
import type { Dataset, ScispaceCommandResult } from "../types";
import { readOption } from "./commandUtils";

export const executeTableColumnCommand = (
  dataset: Dataset,
  args: string[],
  action: "convert-column" | "preview-conversion" | "sort-dates",
): ScispaceCommandResult => {
  const columnToken = readOption(args, "column") ?? "";
  const columnId = resolveDatasetColumnId(dataset, columnToken);
  if (!columnId)
    return { kind: "error", output: `Unknown column for ${dataset.name}: ${columnToken}` };
  const column = dataset.columns.find(({ id }) => id === columnId);

  if (action === "sort-dates") {
    if (
      column?.dataType !== "date" &&
      column?.dataType !== "datetime" &&
      column?.dataType !== "time"
    )
      return { kind: "error", output: "Sorting requires a date, datetime, or time column" };
    const order = readOption(args, "order") ?? "asc";
    if (order !== "asc" && order !== "desc")
      return { kind: "error", output: "order must be asc or desc" };
    const rows = dataset.rows.toSorted((a, b) => {
      const left = a[columnId];
      const right = b[columnId];
      const leftBlank = isBlankColumnValue(left);
      const rightBlank = isBlankColumnValue(right);
      if (leftBlank || rightBlank) return Number(leftBlank) - Number(rightBlank);
      // Canonical date and time values sort in chronological order as strings.
      const comparison = left < right ? -1 : left > right ? 1 : 0;
      return order === "asc" ? comparison : -comparison;
    });
    return {
      kind: "dataset-updated",
      datasetId: dataset.id,
      dataset: { ...dataset, rows },
      output: `Sorted ${dataset.name} by ${columnId} (${order})`,
    };
  }

  const type = readOption(args, "type");
  if (!isConversionType(type))
    return { kind: "error", output: "type must be number, string, date, datetime, or time" };
  const format = readOption(args, "format") ?? "iso";
  if (!isColumnDateFormat(format) || (type !== "date" && format !== "iso"))
    return { kind: "error", output: "format must be iso, or dmy or mdy for date columns" };
  const invalid = readOption(args, "invalid") ?? "abort";
  if (invalid !== "abort" && invalid !== "missing")
    return { kind: "error", output: "invalid must be abort or missing" };

  const preview = inspectColumnConversion(dataset, columnId, type, format);
  const summary = `${preview.converted} convertible, ${preview.blank} blank, ${preview.invalidRows.length} invalid`;
  const invalidSummary = preview.invalidRows.length
    ? `\nInvalid rows: ${preview.invalidRows.slice(0, 20).join(", ")}${preview.invalidRows.length > 20 ? " …" : ""}`
    : "";
  if (action === "preview-conversion") {
    const examples = preview.samples.map(
      ({ row, before, after }) =>
        `\nRow ${row}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`,
    );
    return { kind: "text", output: summary + invalidSummary + examples.join("") };
  }
  if (preview.invalidRows.length && invalid === "abort") {
    return { kind: "error", output: `Conversion cancelled. ${summary}.${invalidSummary}` };
  }

  return {
    kind: "dataset-updated",
    datasetId: dataset.id,
    dataset: {
      ...dataset,
      columns: dataset.columns.map((item) =>
        item.id === columnId ? { ...item, dataType: type, explicitType: true } : item,
      ),
      rows: dataset.rows.map((row, index) => {
        const value = preview.values[index];
        return value === undefined || value === row[columnId] ? row : { ...row, [columnId]: value };
      }),
    },
    output: `Converted ${columnId} to ${type} in ${dataset.name}. ${summary}.${invalidSummary}`,
  };
};
