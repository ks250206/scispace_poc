import { useEffect } from "react";
import type { Dataset } from "../../domain/types";
import type { ScispaceState, TableMenuState } from "../../store/scispace/stateTypes";
import type { TableVisibleRows } from "./tableModel";

type TableMenuRegistrationOptions = {
  actions: TableMenuState["actions"];
  canFillDownRange: boolean;
  canPlotSelection: boolean;
  clearTableMenuState: ScispaceState["clearTableMenuState"];
  dataset?: Dataset;
  datasetId: string;
  hasSelectedCell: boolean;
  hasSelectedColumn: boolean;
  hasSelectedRange: boolean;
  setTableMenuState: ScispaceState["setTableMenuState"];
  visibleRows: TableVisibleRows;
  windowId: string;
};

export function useTableMenuRegistration({
  actions,
  canFillDownRange,
  canPlotSelection,
  clearTableMenuState,
  dataset,
  datasetId,
  hasSelectedCell,
  hasSelectedColumn,
  hasSelectedRange,
  setTableMenuState,
  visibleRows,
  windowId,
}: TableMenuRegistrationOptions) {
  useEffect(() => {
    if (!dataset) {
      clearTableMenuState(windowId);
      return;
    }
    setTableMenuState({
      windowId,
      datasetId,
      rowCount: dataset.rows.length,
      visibleRows,
      hasSelectedRange,
      canFillDownRange,
      canPlotSelection,
      hasSelectedCell,
      hasSelectedColumn,
      actions,
    });
  }, [
    actions,
    canFillDownRange,
    canPlotSelection,
    clearTableMenuState,
    dataset,
    datasetId,
    hasSelectedCell,
    hasSelectedColumn,
    hasSelectedRange,
    setTableMenuState,
    visibleRows,
    windowId,
  ]);

  useEffect(() => () => clearTableMenuState(windowId), [clearTableMenuState, windowId]);
}
