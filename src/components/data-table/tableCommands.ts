import type { TablePlotSelection, TableRangeBounds } from "./tableModel";

const quoteCommandArg = (value: string): string =>
  /[\s"']/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;

export const setCellCommand = (
  datasetName: string,
  rowIndex: number,
  columnId: string,
  value: string,
): string =>
  `table-edit ${quoteCommandArg(datasetName)} action=set-cell row=${rowIndex + 1} column=${quoteCommandArg(
    columnId,
  )} value=${quoteCommandArg(value)}`;

export const deleteRowCommand = (datasetName: string, rowIndex: number): string =>
  `table-edit ${quoteCommandArg(datasetName)} action=delete-row index=${rowIndex + 1}`;

export const deleteColumnCommand = (datasetName: string, columnId: string): string =>
  `table-edit ${quoteCommandArg(datasetName)} action=delete-column column=${quoteCommandArg(columnId)}`;

export const insertColumnCommand = (
  datasetName: string,
  columnId: string,
  beforeColumnId?: string,
): string =>
  [
    `table-edit ${quoteCommandArg(datasetName)} action=insert-column column=${quoteCommandArg(columnId)}`,
    beforeColumnId ? `before=${quoteCommandArg(beforeColumnId)}` : "",
  ]
    .filter(Boolean)
    .join(" ");

export const rangeCommand = (
  datasetName: string,
  action: "clear" | "fill-down",
  range: TableRangeBounds,
): string =>
  `table-range ${quoteCommandArg(datasetName)} action=${action} r1=${range.minRow + 1} c1=${quoteCommandArg(
    range.firstColumn,
  )} r2=${range.maxRow + 1} c2=${quoteCommandArg(range.lastColumn)}`;

export const plotCommand = (datasetName: string, selection: TablePlotSelection): string =>
  `plot ${quoteCommandArg(datasetName)} x=${quoteCommandArg(selection.x)} y=${selection.yColumns
    .map(quoteCommandArg)
    .join(",")}`;
