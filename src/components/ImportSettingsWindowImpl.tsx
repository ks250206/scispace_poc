import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useTable } from "@tanstack/react-table";
import { visibleTableFeatures } from "./tableFeatures";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useScispaceStore } from "../store/scispaceStore";
import { ImportColumnsTab } from "./import-window/ImportColumnsTab";
import { ImportControls } from "./import-window/ImportControls";
import { ImportMetadataTab } from "./import-window/ImportMetadataTab";
import { ImportPresetCard } from "./import-window/ImportPresetCard";
import { ImportTabs } from "./import-window/ImportTabs";
import {
  importColumnCommand,
  importLineCommand,
  importRenameColumnCommand,
  importSetCommand,
} from "./import-window/importCommands";
import { RawTextTable } from "./import-window/RawTextTable";
import { ParsedPreviewTable } from "./import-window/ParsedPreviewTable";
import {
  defaultColumnWidth,
  formatCellValue,
  importStatusText,
  type ImportTab,
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
  const windowRef = useRef<HTMLDivElement>(null);
  const pendingRename = useRef<ReturnType<typeof runScispace> | undefined>(undefined);
  const rawParentRef = useRef<HTMLDivElement>(null);
  const previewParentRef = useRef<HTMLDivElement>(null);
  const [previewColumnWidths, setPreviewColumnWidths] = useState<Record<string, number>>({});
  const [rawColumnWidths, setRawColumnWidths] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<ImportTab>("preview");
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
  const table = useTable({ data, columns, features: visibleTableFeatures });
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

  useEffect(() => {
    setActiveTab(isRawMode ? "raw" : "preview");
  }, [isRawMode]);

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
  const renameColumn = (columnId: string, name: string) => {
    pendingRename.current = runScispace(importRenameColumnCommand(importId, columnId, name), {
      source: "gui",
    });
  };
  const submitImport = async () => {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement &&
      windowRef.current?.contains(active) &&
      active.closest(".column-name-editor")
    )
      active.blur();
    const rename = pendingRename.current;
    const result = await rename;
    if (pendingRename.current === rename) pendingRename.current = undefined;
    if (result?.kind !== "error") await confirmImport(importId);
  };
  const reapplyPreset = () => {
    void runScispace(importSetCommand(importId, "preset=apply"), { source: "gui" });
  };
  const presetMetadataEntries = Object.entries(pendingImport.detectedPreset?.metadata ?? {}).slice(
    0,
    4,
  );

  return (
    <div className="import-window" ref={windowRef}>
      <div className="import-summary">
        <div>
          <span className="import-summary-kicker">Import source</span>
          <span className="import-file-name">{pendingImport.fileName}</span>
        </div>
        <span className="import-file-meta">{importStatus}</span>
      </div>
      <div className="import-setup-grid">
        <ImportControls
          pendingImport={pendingImport}
          onImportSet={runImportSet}
          onCancel={() => void runScispace(`import-cancel ${importId}`, { source: "gui" })}
          onImport={() => void submitImport()}
        />
        <ImportPresetCard
          pendingImport={pendingImport}
          metadataEntries={presetMetadataEntries}
          onReapplyPreset={reapplyPreset}
        />
      </div>
      {pendingImport.error && !preview ? (
        <div className="import-error">{pendingImport.error}</div>
      ) : null}
      <div className="import-tab-area">
        <ImportTabs activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="import-tab-panel">
          {activeTab === "preview" ? (
            !isRawMode ? (
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
            ) : (
              <div className="import-tab-empty">Raw mode does not create a parsed preview.</div>
            )
          ) : null}
          {activeTab === "raw" ? (
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
          ) : null}
          {activeTab === "columns" ? (
            <ImportColumnsTab
              allPreview={allPreview}
              pendingImport={pendingImport}
              onRenameColumn={renameColumn}
              onToggleExcludedColumn={toggleExcludedColumn}
            />
          ) : null}
          {activeTab === "metadata" ? <ImportMetadataTab pendingImport={pendingImport} /> : null}
        </div>
      </div>
    </div>
  );
}
