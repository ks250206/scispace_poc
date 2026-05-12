import { useState, type KeyboardEvent } from "react";
import type { DatasetColumn } from "../../domain/types";
import {
  formatCellValue,
  type TableCellPosition,
  type TableCellRange,
  type TableEditingCell,
} from "./tableModel";

interface UseTableSelectionArgs {
  rowsLength: number;
  columns: DatasetColumn[];
}

export const useTableSelection = ({ rowsLength, columns }: UseTableSelectionArgs) => {
  const [selectedColumn, setSelectedColumn] = useState<string>();
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [selectedCell, setSelectedCell] = useState<TableCellPosition>();
  const [selectedRange, setSelectedRange] = useState<TableCellRange>();
  const [isRangeDragging, setIsRangeDragging] = useState(false);
  const [editingCell, setEditingCell] = useState<TableEditingCell>();

  const clearSelection = () => {
    setSelectedCell(undefined);
    setSelectedColumn(undefined);
    setSelectedColumns([]);
    setSelectedRange(undefined);
    setEditingCell(undefined);
  };

  const selectColumn = (columnId: string, additive = false) => {
    if (additive) {
      setSelectedColumns((current) => {
        const withoutColumn = current.filter((item) => item !== columnId);
        const nextColumns = current.includes(columnId)
          ? withoutColumn
          : [...withoutColumn, columnId];
        setSelectedColumn(nextColumns.at(-1));
        return nextColumns;
      });
    } else {
      setSelectedColumns([columnId]);
      setSelectedColumn(columnId);
    }
    setSelectedCell(undefined);
    setSelectedRange(undefined);
    setEditingCell(undefined);
  };

  const selectSingleCell = (position: TableCellPosition) => {
    setSelectedColumn(undefined);
    setSelectedColumns([]);
    setSelectedCell(position);
    setSelectedRange(undefined);
  };

  const extendRangeSelection = (position: TableCellPosition) => {
    const anchor = selectedRange?.anchor ?? selectedCell ?? position;
    setSelectedColumn(undefined);
    setSelectedColumns([]);
    setSelectedCell(position);
    setSelectedRange({ anchor, focus: position });
    setEditingCell(undefined);
  };

  const startRangeSelection = (position: TableCellPosition) => {
    setSelectedColumn(undefined);
    setSelectedColumns([]);
    setSelectedCell(position);
    setSelectedRange({ anchor: position, focus: position });
    setEditingCell(undefined);
  };

  const startEdit = (rowIndex: number, column: string, value: unknown) => {
    setSelectedColumn(undefined);
    setSelectedColumns([]);
    setSelectedCell({ rowIndex, column });
    setSelectedRange(undefined);
    setEditingCell({ rowIndex, column, value: formatCellValue(value) });
  };

  const cancelEdit = () => {
    setEditingCell(undefined);
  };

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLTableCellElement>,
    rowIndex: number,
    column: string,
    value: unknown,
  ) => {
    const isPrintableKey =
      event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (isPrintableKey) {
      event.preventDefault();
      setSelectedColumn(undefined);
      setSelectedColumns([]);
      setSelectedCell({ rowIndex, column });
      setSelectedRange(undefined);
      setEditingCell({ rowIndex, column, value: event.key });
      return;
    }

    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      startEdit(rowIndex, column, value);
      return;
    }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;

    event.preventDefault();
    const currentPosition = selectedCell ?? { rowIndex, column };
    const currentColumnIndex = columns.findIndex((item) => item.id === currentPosition.column);
    if (currentColumnIndex < 0) return;
    const jumpToEdge = event.metaKey || event.ctrlKey;
    const nextRowIndex =
      event.key === "ArrowUp"
        ? jumpToEdge
          ? 0
          : Math.max(0, currentPosition.rowIndex - 1)
        : event.key === "ArrowDown"
          ? jumpToEdge
            ? rowsLength - 1
            : Math.min(rowsLength - 1, currentPosition.rowIndex + 1)
          : currentPosition.rowIndex;
    const nextColumnIndex =
      event.key === "ArrowLeft"
        ? jumpToEdge
          ? 0
          : Math.max(0, currentColumnIndex - 1)
        : event.key === "ArrowRight"
          ? jumpToEdge
            ? columns.length - 1
            : Math.min(columns.length - 1, currentColumnIndex + 1)
          : currentColumnIndex;
    const nextColumn = columns[nextColumnIndex]?.id;
    if (!nextColumn) return;

    const nextPosition = { rowIndex: nextRowIndex, column: nextColumn };
    if (event.shiftKey) extendRangeSelection(nextPosition);
    else {
      selectSingleCell(nextPosition);
      setEditingCell(undefined);
    }
  };

  return {
    selectedColumn,
    selectedColumns,
    selectedCell,
    selectedRange,
    isRangeDragging,
    editingCell,
    setIsRangeDragging,
    setEditingCell,
    clearSelection,
    selectColumn,
    selectSingleCell,
    extendRangeSelection,
    startRangeSelection,
    startEdit,
    cancelEdit,
    handleCellKeyDown,
  };
};
