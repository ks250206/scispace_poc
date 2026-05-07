import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { datasetColumnIds } from "../domain/csv";
import { useScispaceStore } from "../store/scispaceStore";

interface DataTableWindowProps {
  datasetId: string;
  windowId: string;
  columnIds?: string[];
}

export type TableVisibleRows = 10 | 20 | 50;

interface TableCellPosition {
  rowIndex: number;
  column: string;
}

interface TableCellRange {
  anchor: TableCellPosition;
  focus: TableCellPosition;
}

const formatCellValue = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
};

const tableTitlebarHeight = 34;
const tableControlsHeight = 38;
const tableHeaderHeight = 32;
const rowHeight = 32;
const defaultColumnWidth = 140;
const minColumnWidth = 96;

const tableScrollHeight = (visibleRows: TableVisibleRows): number =>
  tableHeaderHeight + visibleRows * rowHeight;

export const tableWindowHeightForRows = (visibleRows: TableVisibleRows): number =>
  tableTitlebarHeight + tableControlsHeight + tableScrollHeight(visibleRows);

const quoteCommandArg = (value: string): string =>
  /[\s"']/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;

export function DataTableWindow({ datasetId, windowId, columnIds }: DataTableWindowProps) {
  const dataset = useScispaceStore((state) => state.datasets.find((item) => item.id === datasetId));
  const updateWindow = useScispaceStore((state) => state.updateWindow);
  const updateDatasetCell = useScispaceStore((state) => state.updateDatasetCell);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const [visibleRows, setVisibleRows] = useState<TableVisibleRows>(10);
  const [selectedColumn, setSelectedColumn] = useState<string>();
  const [selectedCell, setSelectedCell] = useState<TableCellPosition>();
  const [selectedRange, setSelectedRange] = useState<TableCellRange>();
  const [isRangeDragging, setIsRangeDragging] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    column: string;
    value: string;
  }>();
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
    void updateDatasetCell(dataset.id, rowIndex, column, nextValue ?? value);
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
    void runScispace(
      `table-edit ${quoteCommandArg(dataset.name)} action=delete-row index=${rowNumber}`,
      { source: "gui" },
    );
  };

  const deleteSelectedColumn = () => {
    if (!dataset || !selectedColumn) return;
    if (!window.confirm(`Delete column ${selectedColumn} from ${dataset.name}?`)) return;
    setSelectedCell(undefined);
    setSelectedColumn(undefined);
    setSelectedRange(undefined);
    setEditingCell(undefined);
    void runScispace(
      `table-edit ${quoteCommandArg(dataset.name)} action=delete-column column=${quoteCommandArg(
        selectedColumn,
      )}`,
      { source: "gui" },
    );
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

  const cellColumnIndex = useCallback(
    (column: string): number => visibleDatasetColumns.findIndex((item) => item.id === column),
    [visibleDatasetColumns],
  );

  const isCellInRange = (rowIndex: number, column: string): boolean => {
    if (!selectedRange) return false;
    const anchorColumnIndex = cellColumnIndex(selectedRange.anchor.column);
    const focusColumnIndex = cellColumnIndex(selectedRange.focus.column);
    const currentColumnIndex = cellColumnIndex(column);
    if (anchorColumnIndex < 0 || focusColumnIndex < 0 || currentColumnIndex < 0) return false;
    const minRow = Math.min(selectedRange.anchor.rowIndex, selectedRange.focus.rowIndex);
    const maxRow = Math.max(selectedRange.anchor.rowIndex, selectedRange.focus.rowIndex);
    const minColumn = Math.min(anchorColumnIndex, focusColumnIndex);
    const maxColumn = Math.max(anchorColumnIndex, focusColumnIndex);
    return (
      rowIndex >= minRow &&
      rowIndex <= maxRow &&
      currentColumnIndex >= minColumn &&
      currentColumnIndex <= maxColumn
    );
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
      <div className="window-controls">
        <span>{dataset.rows.length} rows · virtualized</span>
        <div className="table-delete-actions">
          <button type="button" disabled={!selectedCell} onClick={deleteSelectedRow}>
            Delete row
          </button>
          <button type="button" disabled={!selectedColumn} onClick={deleteSelectedColumn}>
            Delete column
          </button>
        </div>
        <label className="table-row-select">
          Rows
          <select
            aria-label="Visible rows"
            value={visibleRows}
            onChange={(event) => {
              const nextVisibleRows = Number(event.target.value) as TableVisibleRows;
              setVisibleRows(nextVisibleRows);
              updateWindow(windowId, { height: tableWindowHeightForRows(nextVisibleRows) });
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>
      </div>
      <div
        ref={parentRef}
        className="table-scroll"
        style={
          {
            "--table-visible-height": `${tableScrollHeight(visibleRows)}px`,
            "--table-width": `${tableWidth}px`,
          } as CSSProperties
        }
      >
        <table style={{ width: tableWidth, minWidth: tableWidth }}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ width: tableWidth }}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={selectedColumn === header.column.id ? "selected-column" : undefined}
                    aria-selected={selectedColumn === header.column.id}
                    style={{
                      width: getColumnWidth(header.column.id),
                      minWidth: minColumnWidth,
                    }}
                  >
                    <button
                      type="button"
                      className="table-header-button"
                      aria-label={`Select column ${header.column.id}`}
                      onClick={() => {
                        setSelectedColumn(header.column.id);
                        setSelectedCell(undefined);
                        setSelectedRange(undefined);
                        setEditingCell(undefined);
                      }}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </button>
                    <button
                      type="button"
                      role="separator"
                      aria-label={`Resize column ${header.column.id}`}
                      className="column-resize-handle"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        startColumnResize(header.column.id, event.clientX);
                      }}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody style={{ height: rowVirtualizer.getTotalSize() }}>
            {visibleVirtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              return (
                <tr
                  key={row.id}
                  style={{ width: tableWidth, transform: `translateY(${virtualRow.start}px)` }}
                >
                  {row.getVisibleCells().map((cell, columnIndex) => {
                    const column = cell.column.id;
                    const value = row.original[column];
                    const isSelectedCell =
                      selectedCell?.rowIndex === virtualRow.index && selectedCell.column === column;
                    const isRangeSelected = isCellInRange(virtualRow.index, column);
                    const isEditingCell =
                      editingCell?.rowIndex === virtualRow.index && editingCell.column === column;
                    const className = [
                      selectedColumn === column ? "selected-column" : "",
                      isRangeSelected ? "range-selected" : "",
                      isSelectedCell ? "selected-cell" : "",
                      isEditingCell ? "editing-cell" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <td
                        key={cell.id}
                        className={className || undefined}
                        aria-selected={isSelectedCell || isRangeSelected}
                        data-column-id={column}
                        data-column-index={columnIndex}
                        data-row-index={virtualRow.index}
                        tabIndex={0}
                        style={{ width: getColumnWidth(column), minWidth: minColumnWidth }}
                        onClick={(event) => {
                          const position = { rowIndex: virtualRow.index, column };
                          if (event.shiftKey) extendRangeSelection(position);
                          else selectSingleCell(position);
                        }}
                        onPointerDown={(event) => {
                          if (!event.shiftKey) return;
                          event.preventDefault();
                          setIsRangeDragging(true);
                          startRangeSelection({ rowIndex: virtualRow.index, column });
                        }}
                        onPointerEnter={() => {
                          if (!isRangeDragging) return;
                          extendRangeSelection({ rowIndex: virtualRow.index, column });
                        }}
                        onPointerUp={() => {
                          setIsRangeDragging(false);
                        }}
                        onDoubleClick={() => startEdit(virtualRow.index, column, value)}
                        onKeyDown={(event) =>
                          handleCellKeyDown(event, virtualRow.index, column, value)
                        }
                      >
                        {isEditingCell ? (
                          <input
                            className="table-cell-editor"
                            aria-label={`Edit row ${virtualRow.index + 1} ${column}`}
                            autoFocus
                            value={editingCell.value}
                            onChange={(event) =>
                              setEditingCell({ ...editingCell, value: event.target.value })
                            }
                            onBlur={(event) => commitEdit(event.currentTarget.value)}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitEdit(event.currentTarget.value);
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelEdit();
                              }
                            }}
                          />
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
