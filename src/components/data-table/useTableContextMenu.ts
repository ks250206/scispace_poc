import { useCallback } from "react";
import type { DatasetColumn } from "../../domain/types";
import type { ContextMenuItem } from "../context-menu/ContextMenuProvider";
import {
  plotSelectionFromTableSelection,
  rangeBoundsFromSelection,
  type TableCellPosition,
  type TablePlotSelection,
  type TableRangeBounds,
  type TableVisibleRows,
} from "./tableModel";

type OpenContextMenu = (options: {
  x: number;
  y: number;
  title?: string;
  items: ContextMenuItem[];
}) => void;

type TableContextMenuOptions = {
  clearRange: (bounds: TableRangeBounds) => void;
  copyRange: (bounds: TableRangeBounds) => void;
  deleteColumn: (columnId: string) => void;
  deleteRowAt: (rowIndex: number) => void;
  fillDownRange: (bounds: TableRangeBounds) => void;
  focusWindow: (windowId: string) => void;
  insertColumn: () => void;
  isLocked: boolean;
  openContextMenu: OpenContextMenu;
  plotSelection: (selection: TablePlotSelection) => void;
  rangeBounds?: TableRangeBounds;
  selectedColumn?: string;
  selectedColumns: string[];
  title?: string;
  updateVisibleRows: (visibleRows: TableVisibleRows) => void;
  toggleLock: () => void;
  visibleDatasetColumns: DatasetColumn[];
  visibleRows: TableVisibleRows;
  windowId: string;
};

export function useTableContextMenu({
  clearRange,
  copyRange,
  deleteColumn,
  deleteRowAt,
  fillDownRange,
  focusWindow,
  insertColumn,
  isLocked,
  openContextMenu,
  plotSelection,
  rangeBounds,
  selectedColumn,
  selectedColumns,
  title,
  updateVisibleRows,
  toggleLock,
  visibleDatasetColumns,
  visibleRows,
  windowId,
}: TableContextMenuOptions) {
  const singleCellRange = useCallback(
    (position: TableCellPosition): TableRangeBounds | undefined =>
      rangeBoundsFromSelection({ anchor: position, focus: position }, visibleDatasetColumns),
    [visibleDatasetColumns],
  );

  return useCallback(
    (
      position: { x: number; y: number },
      context?: { cell?: TableCellPosition; column?: string },
    ) => {
      focusWindow(windowId);
      const bounds = context?.cell ? singleCellRange(context.cell) : rangeBounds;
      const column = context?.column ?? context?.cell?.column ?? selectedColumn;
      const plotSelectionSpec = plotSelectionFromTableSelection(
        bounds,
        context?.column ? [context.column] : selectedColumns,
        visibleDatasetColumns,
      );
      openContextMenu({
        x: position.x,
        y: position.y,
        title,
        items: tableContextItems({
          bounds,
          clearRange,
          column,
          context,
          copyRange,
          deleteColumn,
          deleteRowAt,
          fillDownRange,
          fillDownDisabled: !bounds || bounds.maxRow <= bounds.minRow,
          insertColumn,
          isLocked,
          plotSelection,
          plotSelectionSpec,
          updateVisibleRows,
          toggleLock,
          visibleRows,
        }),
      });
    },
    [
      clearRange,
      copyRange,
      deleteColumn,
      deleteRowAt,
      fillDownRange,
      focusWindow,
      insertColumn,
      isLocked,
      openContextMenu,
      plotSelection,
      rangeBounds,
      selectedColumn,
      selectedColumns,
      singleCellRange,
      title,
      updateVisibleRows,
      toggleLock,
      visibleDatasetColumns,
      visibleRows,
      windowId,
    ],
  );
}

const tableContextItems = ({
  bounds,
  clearRange,
  column,
  context,
  copyRange,
  deleteColumn,
  deleteRowAt,
  fillDownRange,
  fillDownDisabled,
  insertColumn,
  isLocked,
  plotSelection,
  plotSelectionSpec,
  updateVisibleRows,
  toggleLock,
  visibleRows,
}: {
  bounds?: TableRangeBounds;
  clearRange: (bounds: TableRangeBounds) => void;
  column?: string;
  context?: { cell?: TableCellPosition; column?: string };
  copyRange: (bounds: TableRangeBounds) => void;
  deleteColumn: (columnId: string) => void;
  deleteRowAt: (rowIndex: number) => void;
  fillDownRange: (bounds: TableRangeBounds) => void;
  fillDownDisabled: boolean;
  insertColumn: () => void;
  isLocked: boolean;
  plotSelection: (selection: TablePlotSelection) => void;
  plotSelectionSpec?: TablePlotSelection;
  updateVisibleRows: (visibleRows: TableVisibleRows) => void;
  toggleLock: () => void;
  visibleRows: TableVisibleRows;
}): ContextMenuItem[] => [
  {
    label: "Copy TSV",
    disabled: !bounds,
    onSelect: () => {
      if (bounds) copyRange(bounds);
    },
  },
  {
    label: "Delete selected cells",
    disabled: !bounds || isLocked,
    danger: true,
    onSelect: () => {
      if (bounds) clearRange(bounds);
    },
  },
  {
    label: "Fill down",
    disabled: fillDownDisabled || isLocked,
    onSelect: () => {
      if (bounds) fillDownRange(bounds);
    },
  },
  {
    label: "Plot selection",
    disabled: !plotSelectionSpec,
    onSelect: () => {
      if (plotSelectionSpec) plotSelection(plotSelectionSpec);
    },
  },
  {
    label: "Delete row",
    disabled: context?.cell?.rowIndex == null || isLocked,
    danger: true,
    onSelect: () => {
      if (context?.cell) deleteRowAt(context.cell.rowIndex);
    },
  },
  {
    label: "Delete column",
    disabled: !column || isLocked,
    danger: true,
    onSelect: () => {
      if (column) deleteColumn(column);
    },
  },
  {
    label: "Insert column",
    disabled: isLocked,
    onSelect: insertColumn,
  },
  {
    label: isLocked ? "Unlock table" : "Lock table",
    onSelect: toggleLock,
  },
  {
    kind: "submenu",
    label: "Rows",
    items: [
      {
        label: "Rows Auto",
        disabled: visibleRows === "auto",
        onSelect: () => updateVisibleRows("auto"),
      },
      {
        label: "Rows 10",
        disabled: visibleRows === 10,
        onSelect: () => updateVisibleRows(10),
      },
      {
        label: "Rows 20",
        disabled: visibleRows === 20,
        onSelect: () => updateVisibleRows(20),
      },
      {
        label: "Rows 50",
        disabled: visibleRows === 50,
        onSelect: () => updateVisibleRows(50),
      },
    ],
  },
];
