import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useScispaceStore } from "../store/scispaceStore";
import { ImportControls } from "./import-window/ImportControls";
import {
  importColumnCommand,
  importLineCommand,
  importSetCommand,
  quoteImportCommandArg,
} from "./import-window/importCommands";
import { RawTextTable } from "./import-window/RawTextTable";
import { ParsedPreviewTable } from "./import-window/ParsedPreviewTable";
import {
  defaultColumnWidth,
  formatCellValue,
  importStatusText,
  minColumnWidth,
  rawLineNumberWidth,
  rawTextDefaultWidth,
  rowHeight,
} from "./import-window/importModel";

interface ImportSettingsWindowProps {
  importId: string;
}

export function ImportSettingsWindow({ importId }: ImportSettingsWindowProps) {
  const pendingImport = useScispaceStore((state) =>
    state.pendingImports.find((item) => item.id === importId),
  );
  const runScispace = useScispaceStore((state) => state.runScispace);
  const confirmImport = useScispaceStore((state) => state.confirmImport);
  const rawParentRef = useRef<HTMLDivElement>(null);
  const previewParentRef = useRef<HTMLDivElement>(null);
  const [previewColumnWidths, setPreviewColumnWidths] = useState<Record<string, number>>({});
  const [rawColumnWidths, setRawColumnWidths] = useState<Record<string, number>>({});
  const preview = pendingImport?.preview;
  const allPreview = pendingImport?.allPreview;
  const rawLines = useMemo(() => pendingImport?.text.split(/\r?\n/) ?? [], [pendingImport?.text]);
  const columns = useMemo(
    () =>
      (preview?.columns ?? []).map((column) => ({
        accessorKey: column.id,
        header: column.name,
        cell: (info: { getValue: () => unknown }) => formatCellValue(info.getValue()),
      })),
    [preview],
  );
  const data = useMemo(() => preview?.rows ?? [], [preview]);
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => previewParentRef.current,
    estimateSize: () => rowHeight,
    initialRect: { width: 650, height: 260 },
    overscan: 8,
  });
  const rawVirtualizer = useVirtualizer({
    count: rawLines.length,
    getScrollElement: () => rawParentRef.current,
    estimateSize: () => rowHeight,
    initialRect: { width: 650, height: 190 },
    overscan: 12,
  });
  const getPreviewColumnWidth = useCallback(
    (columnId: string) => previewColumnWidths[columnId] ?? defaultColumnWidth,
    [previewColumnWidths],
  );
  const getRawColumnWidth = useCallback(
    (columnId: string) =>
      rawColumnWidths[columnId] ?? (columnId === "line" ? rawLineNumberWidth : rawTextDefaultWidth),
    [rawColumnWidths],
  );
  const previewTableWidth = useMemo(
    () =>
      (preview?.columns ?? []).reduce(
        (total, column) => total + getPreviewColumnWidth(column.id),
        0,
      ),
    [getPreviewColumnWidth, preview],
  );
  const rawTableWidth = getRawColumnWidth("line") + getRawColumnWidth("text");
  const visiblePreviewRows =
    rowVirtualizer.getVirtualItems().length > 0
      ? rowVirtualizer.getVirtualItems()
      : rows.slice(0, 18).map((_, index) => ({ index, key: index, start: index * rowHeight }));
  const visibleRawRows =
    rawVirtualizer.getVirtualItems().length > 0
      ? rawVirtualizer.getVirtualItems()
      : rawLines.slice(0, 18).map((_, index) => ({
          index,
          key: index,
          start: index * rowHeight,
        }));
  const isRawMode = pendingImport?.mode === "raw";
  const importStatus = pendingImport && importStatusText(pendingImport, preview, rawLines.length);

  const startColumnResize = (
    setter: Dispatch<SetStateAction<Record<string, number>>>,
    columnId: string,
    startX: number,
    startWidth: number,
  ) => {
    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = Math.max(minColumnWidth, startWidth + event.clientX - startX);
      setter((current) => ({ ...current, [columnId]: nextWidth }));
    };
    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  if (!pendingImport) return <div className="empty-state">Import request not found.</div>;

  const updateRawLine = (lineIndex: number, value: string) => {
    void runScispace(importLineCommand(importId, lineIndex, value), { source: "gui" });
  };
  const runImportSet = (options: string) => {
    void runScispace(importSetCommand(importId, options), { source: "gui" });
  };
  const toggleExcludedColumn = (columnId: string, checked: boolean) => {
    void runScispace(importColumnCommand(importId, columnId, checked), { source: "gui" });
  };

  return (
    <div className="import-window">
      <ImportControls
        pendingImport={pendingImport}
        onImportSet={runImportSet}
        onCancel={() => void runScispace(`import-cancel ${importId}`, { source: "gui" })}
        onImport={() => void confirmImport(importId)}
      />
      <div className="import-summary">
        <span className="import-file-name">{pendingImport.fileName}</span>
        <span className="import-file-meta">{importStatus}</span>
      </div>
      {pendingImport.detectedPreset ? (
        <div className="import-preset-banner">
          <strong>{`Detected: ${pendingImport.detectedPreset.label}`}</strong>
          <span>{`Data starts at line ${pendingImport.detectedPreset.dataStartLine}`}</span>
        </div>
      ) : null}
      {pendingImport.error && !preview ? (
        <div className="import-error">{pendingImport.error}</div>
      ) : null}
      {!pendingImport.options.hasHeader && allPreview ? (
        <div className="column-name-editor">
          {allPreview.columns.map((column, index) => (
            <label key={`${column.id}-${index}`}>
              <span>{`Column ${index + 1}`}</span>
              <input
                value={pendingImport.options.columnNames[index] ?? column.name}
                onChange={(event) => {
                  const columnNames = [...pendingImport.options.columnNames];
                  columnNames[index] = event.currentTarget.value;
                  runImportSet(`columnNames=${quoteImportCommandArg(columnNames.join(","))}`);
                }}
              />
            </label>
          ))}
        </div>
      ) : null}
      {pendingImport.mode === "tabular" && allPreview ? (
        <div className="column-import-editor">
          <div className="column-import-title">Columns</div>
          <div className="column-import-list">
            {allPreview.columns.map((column) => {
              const isExcluded = pendingImport.options.excludedColumnIds.includes(column.id);
              return (
                <label key={column.id} className={isExcluded ? "excluded" : undefined}>
                  <input
                    type="checkbox"
                    checked={isExcluded}
                    onChange={(event) =>
                      toggleExcludedColumn(column.id, event.currentTarget.checked)
                    }
                  />
                  <span>{column.name}</span>
                  <small>{isExcluded ? "delete" : "import"}</small>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className={`import-editor-grid stacked ${isRawMode ? "raw-only" : ""}`}>
        <RawTextTable
          pendingImport={pendingImport}
          rawLines={rawLines}
          parentRef={rawParentRef}
          visibleRows={visibleRawRows}
          totalSize={rawVirtualizer.getTotalSize()}
          tableWidth={rawTableWidth}
          getColumnWidth={getRawColumnWidth}
          onStartColumnResize={(columnId, startX, startWidth) =>
            startColumnResize(setRawColumnWidths, columnId, startX, startWidth)
          }
          onUpdateRawLine={updateRawLine}
        />
        {!isRawMode ? (
          <ParsedPreviewTable
            preview={preview}
            parentRef={previewParentRef}
            table={table}
            rows={rows}
            visibleRows={visiblePreviewRows}
            totalSize={rowVirtualizer.getTotalSize()}
            tableWidth={previewTableWidth}
            getColumnWidth={getPreviewColumnWidth}
            onStartColumnResize={(columnId, startX, startWidth) =>
              startColumnResize(setPreviewColumnWidths, columnId, startX, startWidth)
            }
          />
        ) : null}
      </div>
    </div>
  );
}
