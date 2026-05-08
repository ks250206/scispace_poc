import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { datasetColumnIds } from "../domain/csv";
import { useScispaceStore } from "../store/scispaceStore";
import { DataTableGrid } from "./data-table/DataTableGrid";
import { DataTableToolbar } from "./data-table/DataTableToolbar";
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
  type TableCellPosition,
  type TableCellRange,
  type TableEditingCell,
  type TableVisibleRows,
} from "./data-table/tableModel";

interface DataTableWindowProps {
  datasetId: string;
  windowId: string;
  columnIds?: string[];
}

export { tableWindowHeightForRows };
export type { TableVisibleRows };

export function DataTableWindow({ datasetId, windowId, columnIds }: DataTableWindowProps) {
  const dataset = useScispaceStore((state) => state.datasets.find((item) => item.id === datasetId));
  const updateWindow = useScispaceStore((state) => state.updateWindow);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const [visibleRows, setVisibleRows] = useState<TableVisibleRows>(10);
  const [selectedColumn, setSelectedColumn] = useState<string>();
  const [selectedCell, setSelectedCell] = useState<TableCellPosition>();
  const [selectedRange, setSelectedRange] = useState<TableCellRange>();
  const [isRangeDragging, setIsRangeDragging] = useState(false);
  const [editingCell, setEditingCell] = useState<TableEditingCell>();
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

  const selectSingleCell = (position: TableCellPosition) => {
    setSelectedColumn(undefined);
    setSelectedCell(position);
    setSelectedRange(undefined);
  };

  const extendRangeSelection = (position: TableCellPosition) => {
    const anchor = selectedRange?.anchor ?? selectedCell ?? position;
    setSelectedColumn(undefined);
    setSelectedCell(position);
    setSelectedRange({ anchor, focus: position });
    setEditingCell(undefined);
  };

  const startRangeSelection = (position: TableCellPosition) => {
    setSelectedColumn(undefined);
    setSelectedCell(position);
    setSelectedRange({ anchor: position, focus: position });
    setEditingCell(undefined);
  };

  const cellColumnIndex = useCallback(
    (column: string): number => visibleDatasetColumns.findIndex((item) => item.id === column),
    [visibleDatasetColumns],
  );

  const startEdit = (rowIndex: number, column: string, value: unknown) => {
    setSelectedColumn(undefined);
    setSelectedCell({ rowIndex, column });
    setSelectedRange(undefined);
    setEditingCell({ rowIndex, column, value: formatCellValue(value) });
  };

  const commitEdit = (nextValue?: string) => {
    if (!dataset || !editingCell) return;
    const { rowIndex, column, value } = editingCell;
    setEditingCell(undefined);
    void runScispace(setCellCommand(dataset.name, rowIndex, column, nextValue ?? value), {
      source: "gui",
    });
  };

  const cancelEdit = () => {
    setEditingCell(undefined);
  };

  const deleteSelectedRow = () => {
    if (!dataset || !selectedCell) return;
    const rowNumber = selectedCell.rowIndex + 1;
    if (!window.confirm(`Delete row ${rowNumber} from ${dataset.name}?`)) return;
    setSelectedCell(undefined);
    setSelectedColumn(undefined);
    setSelectedRange(undefined);
    setEditingCell(undefined);
    void runScispace(deleteRowCommand(dataset.name, selectedCell.rowIndex), { source: "gui" });
  };

  const deleteSelectedColumn = () => {
    if (!dataset || !selectedColumn) return;
    if (!window.confirm(`Delete column ${selectedColumn} from ${dataset.name}?`)) return;
    setSelectedCell(undefined);
    setSelectedColumn(undefined);
    setSelectedRange(undefined);
    setEditingCell(undefined);
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

  const clearSelectedRange = () => {
    if (!dataset || !rangeBounds) return;
    if (
      !window.confirm(
        `Delete selected cells from rows ${rangeBounds.minRow + 1}-${rangeBounds.maxRow + 1} in ${dataset.name}?`,
      )
    ) {
      return;
    }
    setSelectedCell(undefined);
    setSelectedColumn(undefined);
    setSelectedRange(undefined);
    setEditingCell(undefined);
    void runScispace(rangeCommand(dataset.name, "clear", rangeBounds), { source: "gui" });
  };

  const fillDownSelectedRange = () => {
    if (!dataset || !rangeBounds || rangeBounds.maxRow <= rangeBounds.minRow) return;
    if (
      !window.confirm(
        `Fill down rows ${rangeBounds.minRow + 1}-${rangeBounds.maxRow + 1} in ${dataset.name}?`,
      )
    ) {
      return;
    }
    setSelectedCell(undefined);
    setSelectedColumn(undefined);
    setSelectedRange(undefined);
    setEditingCell(undefined);
    void runScispace(rangeCommand(dataset.name, "fill-down", rangeBounds), { source: "gui" });
  };

  const plotSelectedColumns = () => {
    if (!dataset || !selectionPlotSpec) return;
    void runScispace(plotCommand(dataset.name, selectionPlotSpec), { source: "gui" });
  };

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLTableCellElement>,
    rowIndex: number,
    column: string,
    value: unknown,
  ) => {
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      startEdit(rowIndex, column, value);
      return;
    }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;

    event.preventDefault();
    const currentPosition = selectedCell ?? { rowIndex, column };
    const currentColumnIndex = visibleDatasetColumns.findIndex(
      (item) => item.id === currentPosition.column,
    );
    if (currentColumnIndex < 0) return;
    const jumpToEdge = event.metaKey || event.ctrlKey;
    const nextRowIndex =
      event.key === "ArrowUp"
        ? jumpToEdge
          ? 0
          : Math.max(0, currentPosition.rowIndex - 1)
        : event.key === "ArrowDown"
          ? jumpToEdge
            ? rows.length - 1
            : Math.min(rows.length - 1, currentPosition.rowIndex + 1)
          : currentPosition.rowIndex;
    const nextColumnIndex =
      event.key === "ArrowLeft"
        ? jumpToEdge
          ? 0
          : Math.max(0, currentColumnIndex - 1)
        : event.key === "ArrowRight"
          ? jumpToEdge
            ? visibleDatasetColumns.length - 1
            : Math.min(visibleDatasetColumns.length - 1, currentColumnIndex + 1)
          : currentColumnIndex;
    const nextColumn = visibleDatasetColumns[nextColumnIndex]?.id;
    if (!nextColumn) return;

    const nextPosition = { rowIndex: nextRowIndex, column: nextColumn };
    if (event.shiftKey) extendRangeSelection(nextPosition);
    else {
      selectSingleCell(nextPosition);
      setEditingCell(undefined);
    }
  };

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

  if (!dataset) return <div className="empty-state">Dataset not found.</div>;

  return (
    <div className="table-window">
      <DataTableToolbar
        rowCount={dataset.rows.length}
        visibleRows={visibleRows}
        hasSelectedRange={hasSelectedRange}
        canFillDownRange={canFillDownRange}
        canPlotSelection={Boolean(selectionPlotSpec)}
        hasSelectedCell={Boolean(selectedCell)}
        hasSelectedColumn={Boolean(selectedColumn)}
        onCopySelectedRange={copySelectedRange}
        onClearSelectedRange={clearSelectedRange}
        onFillDownSelectedRange={fillDownSelectedRange}
        onPlotSelectedColumns={plotSelectedColumns}
        onDeleteSelectedRow={deleteSelectedRow}
        onDeleteSelectedColumn={deleteSelectedColumn}
        onVisibleRowsChange={(nextVisibleRows, height) => {
          setVisibleRows(nextVisibleRows);
          updateWindow(windowId, { height });
        }}
      />
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
        onSelectColumn={(columnId) => {
          setSelectedColumn(columnId);
          setSelectedCell(undefined);
          setSelectedRange(undefined);
          setEditingCell(undefined);
        }}
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
