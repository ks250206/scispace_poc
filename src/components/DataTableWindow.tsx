import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  const [visibleRows, setVisibleRows] = useState<TableVisibleRows>(10);
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
    overscan: 6,
  });

  useEffect(() => {
    updateWindow(windowId, { height: tableWindowHeightForRows(visibleRows) });
  }, [updateWindow, visibleRows, windowId]);

  if (!dataset) return <div className="empty-state">Dataset not found.</div>;

  return (
    <div className="table-window">
      <div className="window-controls">
        <span>{dataset.rows.length} rows · virtualized</span>
        <label className="table-row-select">
          Rows
          <select
            aria-label="Visible rows"
            value={visibleRows}
            onChange={(event) => setVisibleRows(Number(event.target.value) as TableVisibleRows)}
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
                  <th key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              return (
                <tr key={row.id} style={{ transform: `translateY(${virtualRow.start}px)` }}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
