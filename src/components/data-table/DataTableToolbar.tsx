import { tableWindowHeightForRows, type TableVisibleRows } from "./tableModel";

interface DataTableToolbarProps {
  rowCount: number;
  visibleRows: TableVisibleRows;
  hasSelectedRange: boolean;
  canFillDownRange: boolean;
  canPlotSelection: boolean;
  hasSelectedCell: boolean;
  hasSelectedColumn: boolean;
  onCopySelectedRange: () => void;
  onClearSelectedRange: () => void;
  onFillDownSelectedRange: () => void;
  onPlotSelectedColumns: () => void;
  onDeleteSelectedRow: () => void;
  onDeleteSelectedColumn: () => void;
  onVisibleRowsChange: (visibleRows: TableVisibleRows, height: number) => void;
}

export function DataTableToolbar({
  rowCount,
  visibleRows,
  hasSelectedRange,
  canFillDownRange,
  canPlotSelection,
  hasSelectedCell,
  hasSelectedColumn,
  onCopySelectedRange,
  onClearSelectedRange,
  onFillDownSelectedRange,
  onPlotSelectedColumns,
  onDeleteSelectedRow,
  onDeleteSelectedColumn,
  onVisibleRowsChange,
}: DataTableToolbarProps) {
  return (
    <div className="window-controls">
      <span>{rowCount} rows · virtualized</span>
      <div className="table-delete-actions">
        <button type="button" disabled={!hasSelectedRange} onClick={onCopySelectedRange}>
          Copy TSV
        </button>
        <button type="button" disabled={!hasSelectedRange} onClick={onClearSelectedRange}>
          Delete selected cells
        </button>
        <button type="button" disabled={!canFillDownRange} onClick={onFillDownSelectedRange}>
          Fill down
        </button>
        <button type="button" disabled={!canPlotSelection} onClick={onPlotSelectedColumns}>
          Plot selection
        </button>
        <button type="button" disabled={!hasSelectedCell} onClick={onDeleteSelectedRow}>
          Delete row
        </button>
        <button type="button" disabled={!hasSelectedColumn} onClick={onDeleteSelectedColumn}>
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
            onVisibleRowsChange(nextVisibleRows, tableWindowHeightForRows(nextVisibleRows));
          }}
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </label>
    </div>
  );
}
