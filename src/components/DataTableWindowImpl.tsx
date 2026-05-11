import { useCallback, useMemo, useRef, useState } from "react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { datasetColumnIds } from "../domain/csv";
import { useScispaceStore } from "../store/scispaceStore";
import { useContextMenu } from "./context-menu/ContextMenuProvider";
import { DataTableSummary } from "./data-table/DataTableSummary";
import { DataTableGrid } from "./data-table/DataTableGrid";
import { useDialog } from "./dialog/DialogProvider";
import {
  deleteColumnCommand,
  deleteRowCommand,
  plotCommand,
  rangeCommand,
  setCellCommand,
} from "./data-table/tableCommands";
import {
  defaultColumnWidth,
  formatCellValue,
  minColumnWidth,
  plotSelectionFromTableSelection,
  positionInRange,
  rangeBoundsFromSelection,
  rowHeight,
  tableFallbackVisibleRows,
  tableScrollHeight,
  tableWindowHeightForRows,
  type TableRangeBounds,
  type TableVisibleRows,
} from "./data-table/tableModel";
import { useTableContextMenu } from "./data-table/useTableContextMenu";
import { useSelectedCellFocus } from "./data-table/useSelectedCellFocus";
import { useTableMenuRegistration } from "./data-table/useTableMenuRegistration";
import { useTableSelection } from "./data-table/useTableSelection";

interface DataTableWindowProps {
  datasetId: string;
  windowId: string;
  columnIds?: string[];
}

export { tableWindowHeightForRows };
export type { TableVisibleRows };

export function DataTableWindow({ datasetId, windowId, columnIds }: DataTableWindowProps) {
  const dialog = useDialog();
  const { openContextMenu } = useContextMenu();
  const dataset = useScispaceStore((state) => state.datasets.find((item) => item.id === datasetId));
  const updateWindow = useScispaceStore((state) => state.updateWindow);
  const focusWindow = useScispaceStore((state) => state.focusWindow);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const setTableMenuState = useScispaceStore((state) => state.setTableMenuState);
  const clearTableMenuState = useScispaceStore((state) => state.clearTableMenuState);
  const [visibleRows, setVisibleRows] = useState<TableVisibleRows>("auto");
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const parentRef = useRef<HTMLDivElement>(null);

  const requestedColumnIds = useMemo(() => {
    if (!dataset) return [];
    return columnIds && columnIds.length > 0 ? columnIds : datasetColumnIds(dataset);
  }, [columnIds, dataset]);

  const visibleDatasetColumns = useMemo(() => {
    if (!dataset) return [];
    return dataset.columns.filter((column) => requestedColumnIds.includes(column.id));
  }, [dataset, requestedColumnIds]);

  const columns = useMemo(() => {
    return visibleDatasetColumns.map((column) => ({
      accessorKey: column.id,
      header: column.name,
      cell: (info: { getValue: () => unknown }) => formatCellValue(info.getValue()),
    }));
  }, [visibleDatasetColumns]);

  const data = useMemo(() => dataset?.rows ?? [], [dataset]);
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  const rows = table.getRowModel().rows;
  const {
    selectedColumn,
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
  } = useTableSelection({ rowsLength: rows.length, columns: visibleDatasetColumns });
  const getColumnWidth = useCallback(
    (columnId: string) => columnWidths[columnId] ?? defaultColumnWidth,
    [columnWidths],
  );
  const tableWidth = useMemo(
    () => visibleDatasetColumns.reduce((total, column) => total + getColumnWidth(column.id), 0),
    [getColumnWidth, visibleDatasetColumns],
  );
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    initialRect: { width: 650, height: tableScrollHeight(tableFallbackVisibleRows(visibleRows)) },
    overscan: 6,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const visibleVirtualRows =
    virtualRows.length > 0
      ? virtualRows
      : rows.slice(0, tableFallbackVisibleRows(visibleRows) + 6).map((_, index) => ({
          index,
          start: index * rowHeight,
        }));

  const startColumnResize = (columnId: string, startX: number) => {
    const startWidth = getColumnWidth(columnId);
    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = Math.max(minColumnWidth, startWidth + event.clientX - startX);
      setColumnWidths((current) => ({ ...current, [columnId]: nextWidth }));
    };
    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  const cellColumnIndex = useCallback(
    (column: string): number => visibleDatasetColumns.findIndex((item) => item.id === column),
    [visibleDatasetColumns],
  );

  const commitEdit = (nextValue?: string) => {
    if (!dataset || !editingCell) return;
    const { rowIndex, column, value } = editingCell;
    setEditingCell(undefined);
    void runScispace(setCellCommand(dataset.name, rowIndex, column, nextValue ?? value), {
      source: "gui",
    });
  };

  const deleteRowAt = async (rowIndex: number) => {
    if (!dataset) return;
    const rowNumber = rowIndex + 1;
    const confirmed = await dialog.confirm({
      title: "Delete row",
      message: `Delete row ${rowNumber} from ${dataset.name}?`,
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (!confirmed) return;
    clearSelection();
    void runScispace(deleteRowCommand(dataset.name, rowIndex), { source: "gui" });
  };

  const deleteSelectedRow = async () => {
    if (!selectedCell) return;
    await deleteRowAt(selectedCell.rowIndex);
  };

  const deleteColumn = async (columnId: string) => {
    if (!dataset) return;
    const confirmed = await dialog.confirm({
      title: "Delete column",
      message: `Delete column ${columnId} from ${dataset.name}?`,
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (!confirmed) return;
    clearSelection();
    void runScispace(deleteColumnCommand(dataset.name, columnId), { source: "gui" });
  };

  const deleteSelectedColumn = async () => {
    if (!selectedColumn) return;
    await deleteColumn(selectedColumn);
  };

  const rangeBounds = rangeBoundsFromSelection(selectedRange, visibleDatasetColumns);
  const hasSelectedRange = Boolean(rangeBounds);
  const canFillDownRange = Boolean(rangeBounds && rangeBounds.maxRow > rangeBounds.minRow);

  const selectionPlotSpec = useMemo(() => {
    if (!dataset) return undefined;
    return plotSelectionFromTableSelection(rangeBounds, selectedColumn, visibleDatasetColumns);
  }, [dataset, rangeBounds, selectedColumn, visibleDatasetColumns]);

  const copyRange = (bounds: TableRangeBounds) => {
    if (!dataset) return;
    const tsv = dataset.rows
      .slice(bounds.minRow, bounds.maxRow + 1)
      .map((row) => bounds.rangeColumns.map((column) => formatCellValue(row[column])).join("\t"))
      .join("\n");
    void navigator.clipboard?.writeText(tsv);
  };

  const copySelectedRange = () => {
    if (!rangeBounds) return;
    copyRange(rangeBounds);
  };

  const clearRange = async (bounds: TableRangeBounds) => {
    if (!dataset) return;
    const confirmed = await dialog.confirm({
      title: "Delete selected cells",
      message: `Delete selected cells from rows ${bounds.minRow + 1}-${bounds.maxRow + 1} in ${dataset.name}?`,
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (!confirmed) return;
    clearSelection();
    void runScispace(rangeCommand(dataset.name, "clear", bounds), { source: "gui" });
  };

  const clearSelectedRange = async () => {
    if (!rangeBounds) return;
    await clearRange(rangeBounds);
  };

  const fillDownRange = async (bounds: TableRangeBounds) => {
    if (!dataset || bounds.maxRow <= bounds.minRow) return;
    const confirmed = await dialog.confirm({
      title: "Fill down",
      message: `Fill down rows ${bounds.minRow + 1}-${bounds.maxRow + 1} in ${dataset.name}?`,
      confirmLabel: "Fill down",
    });
    if (!confirmed) return;
    clearSelection();
    void runScispace(rangeCommand(dataset.name, "fill-down", bounds), { source: "gui" });
  };

  const fillDownSelectedRange = async () => {
    if (!rangeBounds) return;
    await fillDownRange(rangeBounds);
  };

  const plotSelection = (selection: NonNullable<typeof selectionPlotSpec>) => {
    if (!dataset) return;
    void runScispace(plotCommand(dataset.name, selection), { source: "gui" });
  };

  const plotSelectedColumns = () => {
    if (!selectionPlotSpec) return;
    plotSelection(selectionPlotSpec);
  };

  const updateVisibleRows = useCallback(
    (nextVisibleRows: TableVisibleRows) => {
      setVisibleRows(nextVisibleRows);
      if (nextVisibleRows !== "auto") {
        updateWindow(windowId, { height: tableWindowHeightForRows(nextVisibleRows) });
      }
    },
    [updateWindow, windowId],
  );

  const isCellInRange = (rowIndex: number, column: string): boolean => {
    return positionInRange(rowIndex, column, rangeBounds, visibleDatasetColumns);
  };

  const openTableContextMenu = useTableContextMenu({
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
    title: dataset?.name,
    updateVisibleRows,
    visibleDatasetColumns,
    visibleRows,
    windowId,
  });

  useSelectedCellFocus({
    cellColumnIndex,
    editingCell,
    getColumnWidth,
    parentRef,
    scrollToIndex: rowVirtualizer.scrollToIndex,
    selectedCell,
    visibleDatasetColumns,
  });

  const tableMenuActions = useMemo(
    () => ({
      copySelectedRange,
      clearSelectedRange,
      fillDownSelectedRange,
      plotSelectedColumns,
      deleteSelectedRow,
      deleteSelectedColumn,
      setVisibleRows: updateVisibleRows,
    }),
    [updateVisibleRows, rangeBounds, selectedCell, selectedColumn, selectionPlotSpec],
  );

  useTableMenuRegistration({
    actions: tableMenuActions,
    canFillDownRange,
    canPlotSelection: Boolean(selectionPlotSpec),
    clearTableMenuState,
    dataset,
    datasetId,
    hasSelectedRange,
    hasSelectedCell: Boolean(selectedCell),
    hasSelectedColumn: Boolean(selectedColumn),
    setTableMenuState,
    visibleRows,
    windowId,
  });

  if (!dataset) return <div className="empty-state">Dataset not found.</div>;

  return (
    <div className="table-window">
      <DataTableSummary rowCount={dataset.rows.length} visibleRows={visibleRows} />
      <DataTableGrid
        parentRef={parentRef}
        table={table}
        rows={rows}
        visibleVirtualRows={visibleVirtualRows}
        visibleRows={visibleRows}
        totalSize={rowVirtualizer.getTotalSize()}
        tableWidth={tableWidth}
        selectedColumn={selectedColumn}
        selectedCell={selectedCell}
        editingCell={editingCell}
        isRangeDragging={isRangeDragging}
        getColumnWidth={getColumnWidth}
        isCellInRange={isCellInRange}
        onSelectColumn={selectColumn}
        onStartColumnResize={startColumnResize}
        onSelectSingleCell={selectSingleCell}
        onExtendRangeSelection={extendRangeSelection}
        onStartRangeSelection={startRangeSelection}
        onRangeDraggingChange={setIsRangeDragging}
        onStartEdit={startEdit}
        onCellKeyDown={handleCellKeyDown}
        onEditingCellChange={setEditingCell}
        onCommitEdit={commitEdit}
        onCancelEdit={cancelEdit}
        onOpenTableContextMenu={(position) => openTableContextMenu(position)}
        onOpenCellContextMenu={(position, cell) => {
          startRangeSelection(cell);
          openTableContextMenu(position, { cell });
        }}
        onOpenColumnContextMenu={(position, column) => {
          selectColumn(column);
          openTableContextMenu(position, { column });
        }}
      />
    </div>
  );
}
