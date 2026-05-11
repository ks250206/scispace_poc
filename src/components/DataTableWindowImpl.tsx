import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { datasetColumnIds } from "../domain/csv";
import { useScispaceStore } from "../store/scispaceStore";
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
  tableScrollHeight,
  tableWindowHeightForRows,
  type TableVisibleRows,
} from "./data-table/tableModel";
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
  const dataset = useScispaceStore((state) => state.datasets.find((item) => item.id === datasetId));
  const updateWindow = useScispaceStore((state) => state.updateWindow);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const setTableMenuState = useScispaceStore((state) => state.setTableMenuState);
  const clearTableMenuState = useScispaceStore((state) => state.clearTableMenuState);
  const [visibleRows, setVisibleRows] = useState<TableVisibleRows>(10);
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
    initialRect: { width: 650, height: tableScrollHeight(visibleRows) },
    overscan: 6,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const visibleVirtualRows =
    virtualRows.length > 0
      ? virtualRows
      : rows.slice(0, visibleRows + 6).map((_, index) => ({
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

  const deleteSelectedRow = async () => {
    if (!dataset || !selectedCell) return;
    const rowNumber = selectedCell.rowIndex + 1;
    const confirmed = await dialog.confirm({
      title: "Delete row",
      message: `Delete row ${rowNumber} from ${dataset.name}?`,
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (!confirmed) return;
    clearSelection();
    void runScispace(deleteRowCommand(dataset.name, selectedCell.rowIndex), { source: "gui" });
  };

  const deleteSelectedColumn = async () => {
    if (!dataset || !selectedColumn) return;
    const confirmed = await dialog.confirm({
      title: "Delete column",
      message: `Delete column ${selectedColumn} from ${dataset.name}?`,
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (!confirmed) return;
    clearSelection();
    void runScispace(deleteColumnCommand(dataset.name, selectedColumn), { source: "gui" });
  };

  const rangeBounds = rangeBoundsFromSelection(selectedRange, visibleDatasetColumns);
  const hasSelectedRange = Boolean(rangeBounds);
  const canFillDownRange = Boolean(rangeBounds && rangeBounds.maxRow > rangeBounds.minRow);

  const selectionPlotSpec = useMemo(() => {
    if (!dataset) return undefined;
    return plotSelectionFromTableSelection(rangeBounds, selectedColumn, visibleDatasetColumns);
  }, [dataset, rangeBounds, selectedColumn, visibleDatasetColumns]);

  const copySelectedRange = () => {
    if (!dataset || !rangeBounds) return;
    const tsv = dataset.rows
      .slice(rangeBounds.minRow, rangeBounds.maxRow + 1)
      .map((row) =>
        rangeBounds.rangeColumns.map((column) => formatCellValue(row[column])).join("\t"),
      )
      .join("\n");
    void navigator.clipboard?.writeText(tsv);
  };

  const clearSelectedRange = async () => {
    if (!dataset || !rangeBounds) return;
    const confirmed = await dialog.confirm({
      title: "Delete selected cells",
      message: `Delete selected cells from rows ${rangeBounds.minRow + 1}-${rangeBounds.maxRow + 1} in ${dataset.name}?`,
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (!confirmed) return;
    clearSelection();
    void runScispace(rangeCommand(dataset.name, "clear", rangeBounds), { source: "gui" });
  };

  const fillDownSelectedRange = async () => {
    if (!dataset || !rangeBounds || rangeBounds.maxRow <= rangeBounds.minRow) return;
    const confirmed = await dialog.confirm({
      title: "Fill down",
      message: `Fill down rows ${rangeBounds.minRow + 1}-${rangeBounds.maxRow + 1} in ${dataset.name}?`,
      confirmLabel: "Fill down",
    });
    if (!confirmed) return;
    clearSelection();
    void runScispace(rangeCommand(dataset.name, "fill-down", rangeBounds), { source: "gui" });
  };

  const plotSelectedColumns = () => {
    if (!dataset || !selectionPlotSpec) return;
    void runScispace(plotCommand(dataset.name, selectionPlotSpec), { source: "gui" });
  };

  const updateVisibleRows = useCallback(
    (nextVisibleRows: TableVisibleRows) => {
      setVisibleRows(nextVisibleRows);
      updateWindow(windowId, { height: tableWindowHeightForRows(nextVisibleRows) });
    },
    [updateWindow, windowId],
  );

  const isCellInRange = (rowIndex: number, column: string): boolean => {
    return positionInRange(rowIndex, column, rangeBounds, visibleDatasetColumns);
  };

  useEffect(() => {
    if (!selectedCell || !parentRef.current) return;
    if (
      editingCell?.rowIndex === selectedCell.rowIndex &&
      editingCell.column === selectedCell.column
    ) {
      return;
    }
    rowVirtualizer.scrollToIndex(selectedCell.rowIndex, { align: "auto" });
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
    rowVirtualizer,
    selectedCell,
    visibleDatasetColumns,
  ]);

  useEffect(() => {
    if (!dataset) {
      clearTableMenuState(windowId);
      return;
    }
    setTableMenuState({
      windowId,
      datasetId,
      rowCount: dataset.rows.length,
      visibleRows,
      hasSelectedRange,
      canFillDownRange,
      canPlotSelection: Boolean(selectionPlotSpec),
      hasSelectedCell: Boolean(selectedCell),
      hasSelectedColumn: Boolean(selectedColumn),
      actions: {
        copySelectedRange,
        clearSelectedRange,
        fillDownSelectedRange,
        plotSelectedColumns,
        deleteSelectedRow,
        deleteSelectedColumn,
        setVisibleRows: updateVisibleRows,
      },
    });
  }, [
    canFillDownRange,
    clearTableMenuState,
    dataset,
    datasetId,
    hasSelectedRange,
    selectedCell,
    selectedColumn,
    selectionPlotSpec,
    setTableMenuState,
    updateVisibleRows,
    visibleRows,
    windowId,
  ]);

  useEffect(() => () => clearTableMenuState(windowId), [clearTableMenuState, windowId]);

  if (!dataset) return <div className="empty-state">Dataset not found.</div>;

  return (
    <div className="table-window">
      <div className="window-controls table-window-summary">
        <span>
          {dataset.rows.length} rows · virtualized · rows {visibleRows}
        </span>
      </div>
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
      />
    </div>
  );
}
