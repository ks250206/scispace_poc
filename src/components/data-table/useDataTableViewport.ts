import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { DatasetColumn } from "../../domain/types";
import {
  defaultColumnWidth,
  minColumnWidth,
  rowHeight,
  tableFallbackVisibleRows,
  tableScrollHeight,
  type TableVisibleRows,
} from "./tableModel";

interface UseDataTableViewportOptions {
  rowsLength: number;
  visibleDatasetColumns: DatasetColumn[];
  visibleRows: TableVisibleRows;
}

export const useDataTableViewport = ({
  rowsLength,
  visibleDatasetColumns,
  visibleRows,
}: UseDataTableViewportOptions) => {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [tableViewportHeight, setTableViewportHeight] = useState(
    tableScrollHeight(tableFallbackVisibleRows(visibleRows)),
  );
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;
    if (typeof ResizeObserver === "undefined") {
      if (element.clientHeight > 0) setTableViewportHeight(element.clientHeight);
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const nextHeight = entry?.contentRect.height ?? 0;
      if (nextHeight > 0) setTableViewportHeight(nextHeight);
    });
    observer.observe(element);
    if (element.clientHeight > 0) setTableViewportHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  const getColumnWidth = useCallback(
    (columnId: string) => columnWidths[columnId] ?? defaultColumnWidth,
    [columnWidths],
  );

  const tableWidth = useMemo(
    () => visibleDatasetColumns.reduce((total, column) => total + getColumnWidth(column.id), 0),
    [getColumnWidth, visibleDatasetColumns],
  );

  const rowVirtualizer = useVirtualizer({
    count: rowsLength,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    initialRect: { width: 650, height: tableScrollHeight(tableFallbackVisibleRows(visibleRows)) },
    overscan: 6,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const visibleVirtualRows =
    virtualRows.length > 0
      ? virtualRows
      : Array.from({ length: Math.min(rowsLength, tableFallbackVisibleRows(visibleRows) + 6) }).map(
          (_, index) => ({
            index,
            start: index * rowHeight,
          }),
        );

  const startColumnResize = (columnId: string, startX: number) => {
    const startWidth = getColumnWidth(columnId);
    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = Math.max(minColumnWidth, startWidth + event.clientX - startX);
      setColumnWidths((current) => ({ ...current, [columnId]: nextWidth }));
    };
    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  return {
    getColumnWidth,
    parentRef,
    rowVirtualizer,
    startColumnResize,
    tableViewportHeight,
    tableWidth,
    visibleVirtualRows,
  };
};
