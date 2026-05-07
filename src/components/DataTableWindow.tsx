import { useMemo, useRef, useState } from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useScispaceStore } from "../store/scispaceStore";

interface DataTableWindowProps {
  datasetId: string;
}

const formatCellValue = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
};

export function DataTableWindow({ datasetId }: DataTableWindowProps) {
  const dataset = useScispaceStore((state) => state.datasets.find((item) => item.id === datasetId));
  const [pageSize, setPageSize] = useState<20 | 50>(20);
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

  const data = useMemo(() => dataset?.rows.slice(0, pageSize) ?? [], [dataset, pageSize]);
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 6,
  });

  if (!dataset) return <div className="empty-state">Dataset not found.</div>;

  return (
    <div className="table-window">
      <div className="window-controls">
        <span>{dataset.rows.length} rows</span>
        <div className="segmented">
          <button
            type="button"
            className={pageSize === 20 ? "active" : ""}
            onClick={() => setPageSize(20)}
          >
            20
          </button>
          <button
            type="button"
            className={pageSize === 50 ? "active" : ""}
            onClick={() => setPageSize(50)}
          >
            50
          </button>
        </div>
      </div>
      <div ref={parentRef} className="table-scroll">
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
