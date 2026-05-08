import { type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { flexRender, type Row, type Table } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { DataValue } from "../../domain/types";
import {
  minColumnWidth,
  type TableCellPosition,
  type TableEditingCell,
  type TableVisibleRows,
} from "./tableModel";
import { tableScrollHeight } from "./tableModel";

type TableRow = Record<string, DataValue>;
type VisibleVirtualRow = Pick<VirtualItem, "index" | "start">;

interface DataTableGridProps {
  parentRef: RefObject<HTMLDivElement | null>;
  table: Table<TableRow>;
  rows: Row<TableRow>[];
  visibleVirtualRows: VisibleVirtualRow[];
  visibleRows: TableVisibleRows;
  totalSize: number;
  tableWidth: number;
  selectedColumn?: string;
  selectedCell?: TableCellPosition;
  editingCell?: TableEditingCell;
  isRangeDragging: boolean;
  getColumnWidth: (columnId: string) => number;
  isCellInRange: (rowIndex: number, column: string) => boolean;
  onSelectColumn: (columnId: string) => void;
  onStartColumnResize: (columnId: string, startX: number) => void;
  onSelectSingleCell: (position: TableCellPosition) => void;
  onExtendRangeSelection: (position: TableCellPosition) => void;
  onStartRangeSelection: (position: TableCellPosition) => void;
  onRangeDraggingChange: (isDragging: boolean) => void;
  onStartEdit: (rowIndex: number, column: string, value: unknown) => void;
  onCellKeyDown: (
    event: KeyboardEvent<HTMLTableCellElement>,
    rowIndex: number,
    column: string,
    value: unknown,
  ) => void;
  onEditingCellChange: (editingCell: TableEditingCell) => void;
  onCommitEdit: (value?: string) => void;
  onCancelEdit: () => void;
}

export function DataTableGrid({
  parentRef,
  table,
  rows,
  visibleVirtualRows,
  visibleRows,
  totalSize,
  tableWidth,
  selectedColumn,
  selectedCell,
  editingCell,
  isRangeDragging,
  getColumnWidth,
  isCellInRange,
  onSelectColumn,
  onStartColumnResize,
  onSelectSingleCell,
  onExtendRangeSelection,
  onStartRangeSelection,
  onRangeDraggingChange,
  onStartEdit,
  onCellKeyDown,
  onEditingCellChange,
  onCommitEdit,
  onCancelEdit,
}: DataTableGridProps) {
  return (
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
                    onClick={() => onSelectColumn(header.column.id)}
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
                      onStartColumnResize(header.column.id, event.clientX);
                    }}
                  />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody style={{ height: totalSize }}>
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
                        if (event.shiftKey) onExtendRangeSelection(position);
                        else onSelectSingleCell(position);
                      }}
                      onPointerDown={(event) => {
                        if (!event.shiftKey) return;
                        event.preventDefault();
                        onRangeDraggingChange(true);
                        onStartRangeSelection({ rowIndex: virtualRow.index, column });
                      }}
                      onPointerEnter={() => {
                        if (!isRangeDragging) return;
                        onExtendRangeSelection({ rowIndex: virtualRow.index, column });
                      }}
                      onPointerUp={() => onRangeDraggingChange(false)}
                      onDoubleClick={() => onStartEdit(virtualRow.index, column, value)}
                      onKeyDown={(event) => onCellKeyDown(event, virtualRow.index, column, value)}
                    >
                      {isEditingCell ? (
                        <input
                          className="table-cell-editor"
                          aria-label={`Edit row ${virtualRow.index + 1} ${column}`}
                          autoFocus
                          value={editingCell.value}
                          onChange={(event) =>
                            onEditingCellChange({ ...editingCell, value: event.target.value })
                          }
                          onBlur={(event) => onCommitEdit(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Enter") {
                              event.preventDefault();
                              onCommitEdit(event.currentTarget.value);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              onCancelEdit();
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
  );
}
