import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ImportDelimiter } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";

interface ImportSettingsWindowProps {
  importId: string;
}

const delimiterOptions: Array<{ value: ImportDelimiter; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "comma", label: "Comma" },
  { value: "tab", label: "Tab" },
  { value: "space", label: "Space" },
  { value: "semicolon", label: "Semicolon" },
];

const formatCellValue = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
};

const rowHeight = 32;
const defaultColumnWidth = 140;
const minColumnWidth = 96;
const rawLineNumberWidth = 64;
const rawTextDefaultWidth = 720;
const quoteCommandArg = (value: string): string =>
  /[\s"']/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;

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
  const importStatus =
    pendingImport?.mode === "raw"
      ? `${rawLines.length} raw lines`
      : preview
        ? `${preview.rows.length} preview rows · ${preview.columns.length} columns`
        : pendingImport?.error;

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
    void runScispace(
      `import-line ${importId} line=${lineIndex + 1} value=${encodeURIComponent(value)}`,
      {
        source: "gui",
      },
    );
  };
  const runImportSet = (options: string) => {
    void runScispace(`import-set ${importId} ${options}`, { source: "gui" });
  };
  const toggleExcludedColumn = (columnId: string, checked: boolean) => {
    void runScispace(
      `import-column ${importId} column=${quoteCommandArg(columnId)} action=${
        checked ? "exclude" : "include"
      }`,
      { source: "gui" },
    );
  };

  return (
    <div className="import-window">
      <div className="import-controls">
        <label>
          <span>Skip rows</span>
          <input
            type="number"
            min={0}
            value={pendingImport.options.skipRows}
            onChange={(event) =>
              runImportSet(`skipRows=${Math.max(0, Number(event.currentTarget.value) || 0)}`)
            }
          />
        </label>
        <label>
          <span>Delimiter</span>
          <select
            value={pendingImport.options.delimiter}
            onChange={(event) =>
              runImportSet(`delimiter=${event.currentTarget.value as ImportDelimiter}`)
            }
          >
            {delimiterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Skip prefix</span>
          <input
            value={pendingImport.options.commentPrefix}
            placeholder="#"
            onChange={(event) =>
              runImportSet(`commentPrefix=${quoteCommandArg(event.currentTarget.value)}`)
            }
          />
        </label>
        <label className="import-checkbox">
          <input
            type="checkbox"
            checked={pendingImport.options.hasHeader}
            onChange={(event) => runImportSet(`hasHeader=${event.currentTarget.checked}`)}
          />
          <span>Header row</span>
        </label>
        <label>
          <span>Mode</span>
          <select
            value={pendingImport.mode}
            onChange={(event) => runImportSet(`mode=${event.currentTarget.value}`)}
          >
            <option value="tabular">Tabular</option>
            <option value="raw">Raw</option>
          </select>
        </label>
        <div className="import-actions">
          <button
            type="button"
            onClick={() => void runScispace(`import-cancel ${importId}`, { source: "gui" })}
          >
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => void confirmImport(importId)}>
            Import
          </button>
        </div>
      </div>
      <div className="import-summary">
        <span className="import-file-name">{pendingImport.fileName}</span>
        <span className="import-file-meta">{importStatus}</span>
      </div>
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
                  runImportSet(`columnNames=${quoteCommandArg(columnNames.join(","))}`);
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
        <section className="raw-text-editor">
          <div className="virtual-table-title">
            <span>Raw text</span>
            <span>{rawLines.length} lines</span>
          </div>
          <div
            ref={rawParentRef}
            className="table-scroll raw-text-table"
            style={
              {
                "--table-visible-height": "190px",
                "--table-width": `${rawTableWidth}px`,
              } as CSSProperties
            }
          >
            <table style={{ width: rawTableWidth, minWidth: rawTableWidth }}>
              <thead>
                <tr style={{ width: rawTableWidth }}>
                  <th
                    style={{
                      width: getRawColumnWidth("line"),
                      minWidth: minColumnWidth,
                    }}
                  >
                    line
                  </th>
                  <th
                    style={{
                      width: getRawColumnWidth("text"),
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
                        startColumnResize(
                          setRawColumnWidths,
                          "text",
                          event.clientX,
                          getRawColumnWidth("text"),
                        );
                      }}
                    />
                  </th>
                </tr>
              </thead>
              <tbody style={{ height: rawVirtualizer.getTotalSize() }}>
                {visibleRawRows.map((virtualRow) => (
                  <tr
                    key={virtualRow.key}
                    className={
                      virtualRow.index < pendingImport.options.skipRows ? "skipped-row" : undefined
                    }
                    style={{ width: rawTableWidth, transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <td
                      style={{
                        width: getRawColumnWidth("line"),
                        minWidth: minColumnWidth,
                      }}
                    >
                      {virtualRow.index + 1}
                    </td>
                    <td
                      style={{
                        width: getRawColumnWidth("text"),
                        minWidth: minColumnWidth,
                      }}
                    >
                      <input
                        aria-label={`Raw line ${virtualRow.index + 1}`}
                        className="raw-line-input"
                        spellCheck={false}
                        value={rawLines[virtualRow.index] ?? ""}
                        onChange={(event) => updateRawLine(virtualRow.index, event.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {!isRawMode ? (
          <section className="preview-editor">
            <div className="virtual-table-title">
              <span>Parsed preview</span>
              <span>{preview ? `${preview.rows.length} rows` : "No preview"}</span>
            </div>
            <div
              ref={previewParentRef}
              className="table-scroll import-preview"
              style={
                {
                  "--table-visible-height": "260px",
                  "--table-width": `${previewTableWidth}px`,
                } as CSSProperties
              }
            >
              <table style={{ width: previewTableWidth, minWidth: previewTableWidth }}>
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} style={{ width: previewTableWidth }}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          style={{
                            width: getPreviewColumnWidth(header.column.id),
                            minWidth: minColumnWidth,
                          }}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <button
                            type="button"
                            role="separator"
                            aria-label={`Resize import column ${header.column.id}`}
                            className="column-resize-handle"
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              startColumnResize(
                                setPreviewColumnWidths,
                                header.column.id,
                                event.clientX,
                                getPreviewColumnWidth(header.column.id),
                              );
                            }}
                          />
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody style={{ height: rowVirtualizer.getTotalSize() }}>
                  {visiblePreviewRows.map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    if (!row) return null;
                    return (
                      <tr
                        key={row.id}
                        style={{
                          width: previewTableWidth,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            style={{
                              width: getPreviewColumnWidth(cell.column.id),
                              minWidth: minColumnWidth,
                            }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
