import { memo, type CSSProperties, type RefObject } from "react";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { PendingImport } from "../../domain/types";
import { minColumnWidth, rawRowClassName } from "./importModel";

type VisibleRawRow = Pick<VirtualItem, "index" | "key" | "start">;

interface RawTextTableProps {
  pendingImport: PendingImport;
  rawLines: string[];
  parentRef: RefObject<HTMLDivElement | null>;
  visibleRows: VisibleRawRow[];
  totalSize: number;
  tableWidth: number;
  getColumnWidth: (columnId: string) => number;
  onStartColumnResize: (columnId: string, startX: number, startWidth: number) => void;
  onUpdateRawLine: (lineIndex: number, value: string) => void;
}

export const RawTextTable = memo(function RawTextTable({
  pendingImport,
  rawLines,
  parentRef,
  visibleRows,
  totalSize,
  tableWidth,
  getColumnWidth,
  onStartColumnResize,
  onUpdateRawLine,
}: RawTextTableProps) {
  return (
    <section className="raw-text-editor">
      <div className="virtual-table-title">
        <span>Raw text</span>
        <span>{rawLines.length} lines</span>
      </div>
      <div
        ref={parentRef}
        className="table-scroll raw-text-table"
        style={
          {
            "--table-visible-height": "190px",
            "--table-width": `${tableWidth}px`,
          } as CSSProperties
        }
      >
        <table style={{ width: tableWidth, minWidth: tableWidth }}>
          <thead>
            <tr style={{ width: tableWidth }}>
              <th
                style={{
                  width: getColumnWidth("line"),
                  minWidth: minColumnWidth,
                }}
              >
                line
              </th>
              <th
                style={{
                  width: getColumnWidth("text"),
                  minWidth: minColumnWidth,
                }}
              >
                raw text
                <button
                  type="button"
                  role="separator"
                  aria-label="Resize raw text column"
                  className="column-resize-handle"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onStartColumnResize("text", event.clientX, getColumnWidth("text"));
                  }}
                />
              </th>
            </tr>
          </thead>
          <tbody style={{ height: totalSize }}>
            {visibleRows.map((virtualRow) => (
              <tr
                key={virtualRow.key}
                className={rawRowClassName(pendingImport, virtualRow.index)}
                style={{ width: tableWidth, transform: `translateY(${virtualRow.start}px)` }}
              >
                <td
                  style={{
                    width: getColumnWidth("line"),
                    minWidth: minColumnWidth,
                  }}
                >
                  {virtualRow.index + 1}
                </td>
                <td
                  style={{
                    width: getColumnWidth("text"),
                    minWidth: minColumnWidth,
                  }}
                >
                  <input
                    aria-label={`Raw line ${virtualRow.index + 1}`}
                    className="raw-line-input"
                    spellCheck={false}
                    value={rawLines[virtualRow.index] ?? ""}
                    onChange={(event) => onUpdateRawLine(virtualRow.index, event.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
});
