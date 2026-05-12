import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  insertColumnCommand,
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
  const openDatasetCalcWindow = useScispaceStore((state) => state.openDatasetCalcWindow);
  const tableWindow = useScispaceStore((state) =>
    state.windows.find((window) => window.id === windowId),
  );
  const [visibleRows, setVisibleRows] = useState<TableVisibleRows>("auto");
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [tableViewportHeight, setTableViewportHeight] = useState(
    tableScrollHeight(tableFallbackVisibleRows(visibleRows)),
  );
  const parentRef = useRef<HTMLDivElement>(null);
  const isLocked = Boolean(tableWindow?.locked);

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

  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;
    if (typeof ResizeObserver === "undefined") {
      if (element.clientHeight > 0) setTableViewportHeight(element.clientHeight);
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const nextHeight = entry?.contentRect.height ?? 0;
      if (nextHeight > 0) setTableViewportHeight(nextHeight);
    });
    observer.observe(element);
    if (element.clientHeight > 0) setTableViewportHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);
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
