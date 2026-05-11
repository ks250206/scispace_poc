import type { TableVisibleRows } from "./tableModel";

type DataTableSummaryProps = {
  rowCount: number;
  visibleRows: TableVisibleRows;
};

export function DataTableSummary({ rowCount, visibleRows }: DataTableSummaryProps) {
  return (
    <div className="window-controls table-window-summary">
      <span>
        {rowCount} rows · virtualized · rows {visibleRows === "auto" ? "auto" : visibleRows}
      </span>
    </div>
  );
}
