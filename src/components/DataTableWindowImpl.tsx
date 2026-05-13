import { useCallback, useMemo, useState } from "react";
import { useScispaceStore } from "../store/scispaceStore";
import { useContextMenu } from "./context-menu/ContextMenuProvider";
import { DataTableSummary } from "./data-table/DataTableSummary";
import { DataTableGrid } from "./data-table/DataTableGrid";
import { useDialog } from "./dialog/DialogProvider";
import {
  deleteColumnCommand,
  deleteRowCommand,
  insertColumnCommand,
  plotCommand,
  rangeCommand,
  setCellCommand,
} from "./data-table/tableCommands";
import {
  formatCellValue,
  plotSelectionFromTableSelection,
  positionInRange,
  rangeBoundsFromSelection,
  tableWindowHeightForRows,
  type TableRangeBounds,
  type TableVisibleRows,
} from "./data-table/tableModel";
import { useTableContextMenu } from "./data-table/useTableContextMenu";
import { useDataTableModel } from "./data-table/useDataTableModel";
import { useDataTableViewport } from "./data-table/useDataTableViewport";
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
  const updateWindow = useScispaceStore((state) => state.updateWindow);
  const focusWindow = useScispaceStore((state) => state.focusWindow);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const setTableMenuState = useScispaceStore((state) => state.setTableMenuState);
  const clearTableMenuState = useScispaceStore((state) => state.clearTableMenuState);
  const openDatasetCalcWindow = useScispaceStore((state) => state.openDatasetCalcWindow);
  const tableWindow = useScispaceStore((state) =>
    state.windows.find((window) => window.id === windowId),
  );
  const [visibleRows, setVisibleRows] = useState<TableVisibleRows>("auto");
  const isLocked = Boolean(tableWindow?.locked);
  const { dataset, rows, table, visibleDatasetColumns } = useDataTableModel({
    columnIds,
    datasetId,
  });
  const {
    getColumnWidth,
    parentRef,
    rowVirtualizer,
    startColumnResize,
    tableViewportHeight,
    tableWidth,
    visibleVirtualRows,
  } = useDataTableViewport({
    rowsLength: rows.length,
    visibleDatasetColumns,
    visibleRows,
  });
  const {
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
  } = useTableSelection({ rowsLength: rows.length, columns: visibleDatasetColumns });

  const cellColumnIndex = useCallback(
    (column: string): number => visibleDatasetColumns.findIndex((item) => item.id === column),
    [visibleDatasetColumns],
  );

  const commitEdit = (nextValue?: string) => {
    if (!dataset || !editingCell || isLocked) {
      setEditingCell(undefined);
      return;
    }
    const { rowIndex, column, value } = editingCell;
    setEditingCell(undefined);
    void runScispace(setCellCommand(dataset.name, rowIndex, column, nextValue ?? value), {
      source: "gui",
    });
  };

  const deleteRowAt = async (rowIndex: number) => {
    if (!dataset || isLocked) return;
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
    if (!dataset || isLocked) return;
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

  const insertColumn = async () => {
    if (!dataset || isLocked) return;
    const name = await dialog.prompt({
      title: "Insert column",
      defaultValue: "new_column",
      confirmLabel: "Insert",
    });
    if (!name) return;
    void runScispace(insertColumnCommand(dataset.name, name, selectedColumn), { source: "gui" });
  };

  const toggleLock = () => {
    updateWindow(windowId, { locked: !isLocked });
  };

  const calculateColumn = () => {
    if (!dataset || isLocked) return;
    openDatasetCalcWindow(dataset.id);
  };

  const rangeBounds = rangeBoundsFromSelection(selectedRange, visibleDatasetColumns);
  const hasSelectedRange = Boolean(rangeBounds);
  const canFillDownRange = Boolean(rangeBounds && rangeBounds.maxRow > rangeBounds.minRow);

  const selectionPlotSpec = useMemo(() => {
    if (!dataset) return undefined;
    return plotSelectionFromTableSelection(rangeBounds, selectedColumns, visibleDatasetColumns);
  }, [dataset, rangeBounds, selectedColumns, visibleDatasetColumns]);

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
    if (!dataset || isLocked) return;
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
    if (!dataset || isLocked || bounds.maxRow <= bounds.minRow) return;
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
    calculateColumn,
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
    title: dataset?.name,
    updateVisibleRows,
    toggleLock,
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
      insertColumn,
      calculateColumn,
      toggleLock,
      setVisibleRows: updateVisibleRows,
    }),
    [
      updateVisibleRows,
      rangeBounds,
      selectedCell,
      selectedColumn,
      selectionPlotSpec,
      isLocked,
      insertColumn,
      calculateColumn,
      toggleLock,
    ],
  );

  const selectionKey = [
    selectedColumn ?? "",
    selectedColumns.join(","),
    selectedCell ? `${selectedCell.rowIndex}:${selectedCell.column}` : "",
    rangeBounds
      ? `${rangeBounds.minRow}:${rangeBounds.maxRow}:${rangeBounds.rangeColumns.join(",")}`
      : "",
  ].join("|");

  useTableMenuRegistration({
    actions: tableMenuActions,
    canFillDownRange,
    canPlotSelection: Boolean(selectionPlotSpec),
    clearTableMenuState,
    dataset,
    datasetId,
    hasSelectedRange,
    hasSelectedCell: Boolean(selectedCell),
    hasSelectedColumn: selectedColumns.length > 0,
    isLocked,
    selectionKey,
    setTableMenuState,
    visibleRows,
    windowId,
  });

  if (!dataset) return <div className="empty-state">Dataset not found.</div>;

  return (
    <div className={`table-window ${isLocked ? "is-locked" : ""}`}>
      <DataTableSummary
        isLocked={isLocked}
        rowCount={dataset.rows.length}
        visibleRows={visibleRows}
      />
      <DataTableGrid
        parentRef={parentRef}
        table={table}
        rows={rows}
        visibleVirtualRows={visibleVirtualRows}
        visibleRows={visibleRows}
        totalSize={rowVirtualizer.getTotalSize()}
        viewportHeight={tableViewportHeight}
        tableWidth={tableWidth}
        selectedColumns={selectedColumns}
        selectedCell={selectedCell}
        editingCell={editingCell}
        isRangeDragging={isRangeDragging}
        isLocked={isLocked}
        getColumnWidth={getColumnWidth}
        isCellInRange={isCellInRange}
        onSelectColumn={selectColumn}
        onStartColumnResize={startColumnResize}
        onSelectSingleCell={selectSingleCell}
        onExtendRangeSelection={extendRangeSelection}
        onStartRangeSelection={startRangeSelection}
        onRangeDraggingChange={setIsRangeDragging}
        onStartEdit={(rowIndex, column, value) => {
          if (!isLocked) startEdit(rowIndex, column, value);
        }}
        onCellKeyDown={(event, rowIndex, column, value) => {
          if (!isLocked) handleCellKeyDown(event, rowIndex, column, value);
        }}
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
