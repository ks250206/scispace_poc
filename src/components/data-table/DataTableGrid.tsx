import { memo, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { flexRender, type Row, type Table } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { DataValue } from "../../domain/types";
import {
  minColumnWidth,
  rowHeight,
  tableHeaderHeight,
  tableFallbackVisibleRows,
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
  viewportHeight: number;
  tableWidth: number;
  selectedColumns: string[];
  selectedCell?: TableCellPosition;
  editingCell?: TableEditingCell;
  isRangeDragging: boolean;
  isLocked: boolean;
  getColumnWidth: (columnId: string) => number;
  isCellInRange: (rowIndex: number, column: string) => boolean;
  onSelectColumn: (columnId: string, additive?: boolean) => void;
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
  onOpenTableContextMenu: (position: { x: number; y: number }) => void;
  onOpenCellContextMenu: (position: { x: number; y: number }, cell: TableCellPosition) => void;
  onOpenColumnContextMenu: (position: { x: number; y: number }, column: string) => void;
}

export const DataTableGrid = memo(function DataTableGrid({
  parentRef,
  table,
  rows,
  visibleVirtualRows,
  visibleRows,
  totalSize,
  viewportHeight,
  tableWidth,
  selectedColumns,
  selectedCell,
  editingCell,
  isRangeDragging,
  isLocked,
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
  onOpenTableContextMenu,
  onOpenCellContextMenu,
  onOpenColumnContextMenu,
}: DataTableGridProps) {
  const columnIds = table.getAllLeafColumns().map((column) => column.id);
  const bodyHeight = Math.max(totalSize, Math.max(0, viewportHeight - tableHeaderHeight));

  return (
    <div
      ref={parentRef}
      className="table-scroll"
      style={
        {
          "--table-visible-height":
            visibleRows === "auto"
              ? undefined
              : `${tableScrollHeight(tableFallbackVisibleRows(visibleRows))}px`,
          "--table-width": `${tableWidth}px`,
        } as CSSProperties
      }
      onContextMenu={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        onOpenTableContextMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <table style={{ width: tableWidth, minWidth: tableWidth }}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} style={{ width: tableWidth }}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={
                    selectedColumns.includes(header.column.id) ? "selected-column" : undefined
                  }
                  aria-selected={selectedColumns.includes(header.column.id)}
                  style={{
                    width: getColumnWidth(header.column.id),
                    minWidth: minColumnWidth,
                  }}
                >
                  <button
                    type="button"
                    className="table-header-button"
                    aria-label={`Select column ${header.column.id}`}
                    onClick={(event) =>
                      onSelectColumn(header.column.id, event.metaKey || event.ctrlKey)
                    }
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenColumnContextMenu(
                        { x: event.clientX, y: event.clientY },
                        header.column.id,
                      );
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
                      onStartColumnResize(header.column.id, event.clientX);
                    }}
                  />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody style={{ height: bodyHeight }}>
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
                    selectedColumns.includes(column) ? "selected-column" : "",
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
                      onDoubleClick={() => {
                        if (!isLocked) onStartEdit(virtualRow.index, column, value);
                      }}
                      onKeyDown={(event) => onCellKeyDown(event, virtualRow.index, column, value)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onOpenCellContextMenu(
                          { x: event.clientX, y: event.clientY },
                          { rowIndex: virtualRow.index, column },
                        );
                      }}
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
                            if (
                              ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                                event.key,
                              )
                            ) {
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
          <FillerRows
            columnIds={columnIds}
            getColumnWidth={getColumnWidth}
            startY={totalSize}
            viewportHeight={bodyHeight}
          />
        </tbody>
      </table>
    </div>
  );
});

const FillerRows = ({
  columnIds,
  getColumnWidth,
  startY,
  viewportHeight,
}: {
  columnIds: string[];
  getColumnWidth: (columnId: string) => number;
  startY: number;
  viewportHeight: number;
}) => {
  const remainingHeight = Math.max(0, viewportHeight - startY);
  const fillerRowCount = Math.ceil(remainingHeight / rowHeight);
  if (fillerRowCount <= 0) return null;
  return Array.from({ length: fillerRowCount }, (_, index) => (
    <tr
      key={`filler-${index}`}
      aria-hidden="true"
      className="table-filler-row"
      style={{ transform: `translateY(${startY + index * rowHeight}px)` }}
    >
      {columnIds.map((columnId) => (
        <td key={columnId} style={{ width: getColumnWidth(columnId), minWidth: minColumnWidth }} />
      ))}
    </tr>
  ));
};
