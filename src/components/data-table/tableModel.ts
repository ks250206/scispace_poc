import type { DatasetColumn } from "../../domain/types";

export type FixedTableVisibleRows = 10 | 20 | 50;
export type TableVisibleRows = "auto" | FixedTableVisibleRows;

export interface TableCellPosition {
  rowIndex: number;
  column: string;
}

export interface TableCellRange {
  anchor: TableCellPosition;
  focus: TableCellPosition;
}

export interface TableEditingCell extends TableCellPosition {
  value: string;
}

export interface TableRangeBounds {
  minRow: number;
  maxRow: number;
  firstColumn: string;
  lastColumn: string;
  rangeColumns: string[];
}

export interface TablePlotSelection {
  x: string;
  yColumns: string[];
}

export const tableTitlebarHeight = 34;
export const tableControlsHeight = 38;
export const tableHeaderHeight = 32;
export const rowHeight = 32;
export const defaultColumnWidth = 140;
export const minColumnWidth = 96;

export const formatCellValue = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
};

export const tableFallbackVisibleRows = (visibleRows: TableVisibleRows): FixedTableVisibleRows =>
  visibleRows === "auto" ? 10 : visibleRows;

export const tableScrollHeight = (visibleRows: FixedTableVisibleRows): number =>
  tableHeaderHeight + visibleRows * rowHeight;

export const tableWindowHeightForRows = (visibleRows: FixedTableVisibleRows): number =>
  tableTitlebarHeight + tableControlsHeight + tableScrollHeight(visibleRows);

export const rangeBoundsFromSelection = (
  selectedRange: TableCellRange | undefined,
  columns: DatasetColumn[],
): TableRangeBounds | undefined => {
  if (!selectedRange) return undefined;
  const anchorColumnIndex = columns.findIndex((item) => item.id === selectedRange.anchor.column);
  const focusColumnIndex = columns.findIndex((item) => item.id === selectedRange.focus.column);
  if (anchorColumnIndex < 0 || focusColumnIndex < 0) return undefined;
  const minRow = Math.min(selectedRange.anchor.rowIndex, selectedRange.focus.rowIndex);
  const maxRow = Math.max(selectedRange.anchor.rowIndex, selectedRange.focus.rowIndex);
  const minColumn = Math.min(anchorColumnIndex, focusColumnIndex);
  const maxColumn = Math.max(anchorColumnIndex, focusColumnIndex);
  const rangeColumns = columns.slice(minColumn, maxColumn + 1).map((column) => column.id);
  const firstColumn = rangeColumns[0];
  const lastColumn = rangeColumns.at(-1);
  if (!firstColumn || !lastColumn) return undefined;
  return { minRow, maxRow, firstColumn, lastColumn, rangeColumns };
};

export const plotSelectionFromTableSelection = (
  rangeBounds: TableRangeBounds | undefined,
  selectedColumn: string | undefined,
  columns: DatasetColumn[],
): TablePlotSelection | undefined => {
  const selectedColumns = rangeBounds?.rangeColumns ?? (selectedColumn ? [selectedColumn] : []);
  if (selectedColumns.length === 0) return undefined;
  const visibleColumnIds = columns.map((column) => column.id);
  const [rangeX, ...rangeY] = selectedColumns;
  const fallbackX = visibleColumnIds.find((columnId) => columnId !== selectedColumns[0]);
  const x = selectedColumns.length > 1 ? rangeX : fallbackX;
  const yColumns = selectedColumns.length > 1 ? rangeY : selectedColumns;
  const validYColumns = yColumns.filter((columnId) => columnId !== x);
  if (!x || validYColumns.length === 0) return undefined;
  return { x, yColumns: validYColumns };
};

export const positionInRange = (
  rowIndex: number,
  columnId: string,
  range: TableRangeBounds | undefined,
  columns: DatasetColumn[],
): boolean => {
  if (!range) return false;
  const currentColumnIndex = columns.findIndex((column) => column.id === columnId);
  const firstColumnIndex = columns.findIndex((column) => column.id === range.firstColumn);
  const lastColumnIndex = columns.findIndex((column) => column.id === range.lastColumn);
  if (currentColumnIndex < 0 || firstColumnIndex < 0 || lastColumnIndex < 0) return false;
  return (
    rowIndex >= range.minRow &&
    rowIndex <= range.maxRow &&
    currentColumnIndex >= firstColumnIndex &&
    currentColumnIndex <= lastColumnIndex
  );
};
