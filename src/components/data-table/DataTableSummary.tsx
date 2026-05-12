import type { TableVisibleRows } from "./tableModel";

type DataTableSummaryProps = {
  isLocked: boolean;
  rowCount: number;
  visibleRows: TableVisibleRows;
};

export function DataTableSummary({ isLocked, rowCount, visibleRows }: DataTableSummaryProps) {
  return (
    <div className="window-controls table-window-summary">
      <span>
        {rowCount} rows · virtualized · rows {visibleRows === "auto" ? "auto" : visibleRows}
        {isLocked ? " · locked" : ""}
      </span>
    </div>
  );
}
