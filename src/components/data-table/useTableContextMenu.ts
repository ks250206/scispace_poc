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
  openContextMenu: OpenContextMenu;
  plotSelection: (selection: TablePlotSelection) => void;
  rangeBounds?: TableRangeBounds;
  selectedColumn?: string;
  title?: string;
  updateVisibleRows: (visibleRows: TableVisibleRows) => void;
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
  openContextMenu,
  plotSelection,
  rangeBounds,
  selectedColumn,
  title,
  updateVisibleRows,
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
        context?.column ?? selectedColumn,
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
          plotSelection,
          plotSelectionSpec,
          updateVisibleRows,
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
      openContextMenu,
      plotSelection,
      rangeBounds,
      selectedColumn,
      singleCellRange,
      title,
      updateVisibleRows,
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
  plotSelection,
  plotSelectionSpec,
  updateVisibleRows,
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
  plotSelection: (selection: TablePlotSelection) => void;
  plotSelectionSpec?: TablePlotSelection;
  updateVisibleRows: (visibleRows: TableVisibleRows) => void;
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
    disabled: !bounds,
    danger: true,
    onSelect: () => {
      if (bounds) clearRange(bounds);
    },
  },
  {
    label: "Fill down",
    disabled: fillDownDisabled,
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
    disabled: context?.cell?.rowIndex == null,
    danger: true,
    onSelect: () => {
      if (context?.cell) deleteRowAt(context.cell.rowIndex);
    },
  },
  {
    label: "Delete column",
    disabled: !column,
    danger: true,
    onSelect: () => {
      if (column) deleteColumn(column);
    },
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
