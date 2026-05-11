import { useEffect, type RefObject } from "react";
import type { DatasetColumn } from "../../domain/types";
import type { TableCellPosition, TableEditingCell } from "./tableModel";

type SelectedCellFocusOptions = {
  cellColumnIndex: (column: string) => number;
  editingCell?: TableEditingCell;
  getColumnWidth: (columnId: string) => number;
  parentRef: RefObject<HTMLDivElement | null>;
  scrollToIndex: (index: number, options: { align: "auto" }) => void;
  selectedCell?: TableCellPosition;
  visibleDatasetColumns: DatasetColumn[];
};

export function useSelectedCellFocus({
  cellColumnIndex,
  editingCell,
  getColumnWidth,
  parentRef,
  scrollToIndex,
  selectedCell,
  visibleDatasetColumns,
}: SelectedCellFocusOptions) {
  useEffect(() => {
    if (!selectedCell || !parentRef.current) return;
    if (
      editingCell?.rowIndex === selectedCell.rowIndex &&
      editingCell.column === selectedCell.column
    ) {
      return;
    }
    scrollToIndex(selectedCell.rowIndex, { align: "auto" });
    const selectedCellColumnIndex = cellColumnIndex(selectedCell.column);
    if (selectedCellColumnIndex >= 0) {
      const left = visibleDatasetColumns
        .slice(0, selectedCellColumnIndex)
        .reduce((total, column) => total + getColumnWidth(column.id), 0);
      const width = getColumnWidth(selectedCell.column);
      const scroll = parentRef.current;
      if (left < scroll.scrollLeft) scroll.scrollLeft = left;
      if (left + width > scroll.scrollLeft + scroll.clientWidth) {
        scroll.scrollLeft = left + width - scroll.clientWidth;
      }
    }
    const frame = requestAnimationFrame(() => {
      parentRef.current
        ?.querySelector<HTMLElement>(
          `[data-row-index="${selectedCell.rowIndex}"][data-column-index="${selectedCellColumnIndex}"]`,
        )
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    cellColumnIndex,
    editingCell,
    getColumnWidth,
    parentRef,
    scrollToIndex,
    selectedCell,
    visibleDatasetColumns,
  ]);
}
