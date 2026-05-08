import type { CSSProperties, RefObject } from "react";
import { flexRender, type Row, type Table } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { DataValue, Dataset } from "../../domain/types";
import { minColumnWidth } from "./importModel";

type PreviewRow = Record<string, DataValue>;
type VisiblePreviewRow = Pick<VirtualItem, "index" | "start">;

interface ParsedPreviewTableProps {
  preview?: Dataset;
  parentRef: RefObject<HTMLDivElement | null>;
  table: Table<PreviewRow>;
  rows: Row<PreviewRow>[];
  visibleRows: VisiblePreviewRow[];
  totalSize: number;
  tableWidth: number;
  getColumnWidth: (columnId: string) => number;
  onStartColumnResize: (columnId: string, startX: number, startWidth: number) => void;
}

export function ParsedPreviewTable({
  preview,
  parentRef,
  table,
  rows,
  visibleRows,
  totalSize,
  tableWidth,
  getColumnWidth,
  onStartColumnResize,
}: ParsedPreviewTableProps) {
  return (
    <section className="preview-editor">
      <div className="virtual-table-title">
        <span>Parsed preview</span>
        <span>{preview ? `${preview.rows.length} rows` : "No preview"}</span>
      </div>
      <div
        ref={parentRef}
        className="table-scroll import-preview"
        style={
          {
            "--table-visible-height": "260px",
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
                    style={{
                      width: getColumnWidth(header.column.id),
                      minWidth: minColumnWidth,
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    <button
                      type="button"
                      role="separator"
                      aria-label={`Resize import column ${header.column.id}`}
                      className="column-resize-handle"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onStartColumnResize(
                          header.column.id,
                          event.clientX,
                          getColumnWidth(header.column.id),
                        );
                      }}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody style={{ height: totalSize }}>
            {visibleRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              return (
                <tr
                  key={row.id}
                  style={{
                    width: tableWidth,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{
                        width: getColumnWidth(cell.column.id),
                        minWidth: minColumnWidth,
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
