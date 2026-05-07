import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useScispaceStore } from "../store/scispaceStore";

interface DataTableWindowProps {
  datasetId: string;
  windowId: string;
}

export type TableVisibleRows = 10 | 20 | 50;

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

const tableScrollHeight = (visibleRows: TableVisibleRows): number =>
  tableHeaderHeight + visibleRows * rowHeight;

export const tableWindowHeightForRows = (visibleRows: TableVisibleRows): number =>
  tableTitlebarHeight + tableControlsHeight + tableScrollHeight(visibleRows);

export function DataTableWindow({ datasetId, windowId }: DataTableWindowProps) {
  const dataset = useScispaceStore((state) => state.datasets.find((item) => item.id === datasetId));
  const updateWindow = useScispaceStore((state) => state.updateWindow);
  const updateDatasetCell = useScispaceStore((state) => state.updateDatasetCell);
  const [visibleRows, setVisibleRows] = useState<TableVisibleRows>(10);
  const [selectedColumn, setSelectedColumn] = useState<string>();
  const [selectedCell, setSelectedCell] = useState<{ rowIndex: number; column: string }>();
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    column: string;
    value: string;
  }>();
  const parentRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(
    () =>
      (dataset?.columns ?? []).map((column) => ({
        accessorKey: column,
        header: column,
        cell: (info: { getValue: () => unknown }) => formatCellValue(info.getValue()),
      })),
    [dataset],
  );

  const data = useMemo(() => dataset?.rows ?? [], [dataset]);
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  const rows = table.getRowModel().rows;
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

  if (!dataset) return <div className="empty-state">Dataset not found.</div>;

  const startEdit = (rowIndex: number, column: string, value: unknown) => {
    setSelectedColumn(undefined);
    setSelectedCell({ rowIndex, column });
    setEditingCell({ rowIndex, column, value: formatCellValue(value) });
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const { rowIndex, column, value } = editingCell;
    setEditingCell(undefined);
    void updateDatasetCell(dataset.id, rowIndex, column, value);
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
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      startEdit(rowIndex, column, value);
    }
  };

  return (
    <div className="table-window">
      <div className="window-controls">
        <span>{dataset.rows.length} rows · virtualized</span>
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
        style={{ "--table-visible-height": `${tableScrollHeight(visibleRows)}px` } as CSSProperties}
      >
        <table>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={selectedColumn === header.column.id ? "selected-column" : undefined}
                    aria-selected={selectedColumn === header.column.id}
                  >
                    <button
                      type="button"
                      className="table-header-button"
                      aria-label={`Select column ${header.column.id}`}
                      onClick={() => {
                        setSelectedColumn(header.column.id);
                        setSelectedCell(undefined);
                        setEditingCell(undefined);
                      }}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </button>
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
                <tr key={row.id} style={{ transform: `translateY(${virtualRow.start}px)` }}>
                  {row.getVisibleCells().map((cell) => {
                    const column = cell.column.id;
                    const value = row.original[column];
                    const isSelectedCell =
                      selectedCell?.rowIndex === virtualRow.index && selectedCell.column === column;
                    const isEditingCell =
                      editingCell?.rowIndex === virtualRow.index && editingCell.column === column;
                    const className = [
                      selectedColumn === column ? "selected-column" : "",
                      isSelectedCell ? "selected-cell" : "",
                      isEditingCell ? "editing-cell" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <td
                        key={cell.id}
                        className={className || undefined}
                        aria-selected={isSelectedCell}
                        tabIndex={0}
                        onClick={() => {
                          setSelectedColumn(undefined);
                          setSelectedCell({ rowIndex: virtualRow.index, column });
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
                            onBlur={commitEdit}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitEdit();
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
