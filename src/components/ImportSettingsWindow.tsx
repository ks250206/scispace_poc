import { useMemo, useRef, type CSSProperties } from "react";
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

export function ImportSettingsWindow({ importId }: ImportSettingsWindowProps) {
  const pendingImport = useScispaceStore((state) =>
    state.pendingImports.find((item) => item.id === importId),
  );
  const updateImportOptions = useScispaceStore((state) => state.updateImportOptions);
  const updateImportText = useScispaceStore((state) => state.updateImportText);
  const updateImportMode = useScispaceStore((state) => state.updateImportMode);
  const confirmImport = useScispaceStore((state) => state.confirmImport);
  const cancelImport = useScispaceStore((state) => state.cancelImport);
  const parentRef = useRef<HTMLDivElement>(null);
  const preview = pendingImport?.preview;
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
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 8,
  });

  if (!pendingImport) return <div className="empty-state">Import request not found.</div>;

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
              updateImportOptions(importId, {
                skipRows: Math.max(0, Number(event.currentTarget.value) || 0),
              })
            }
          />
        </label>
        <label>
          <span>Delimiter</span>
          <select
            value={pendingImport.options.delimiter}
            onChange={(event) =>
              updateImportOptions(importId, {
                delimiter: event.currentTarget.value as ImportDelimiter,
              })
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
              updateImportOptions(importId, { commentPrefix: event.currentTarget.value })
            }
          />
        </label>
        <label className="import-checkbox">
          <input
            type="checkbox"
            checked={pendingImport.options.hasHeader}
            onChange={(event) =>
              updateImportOptions(importId, { hasHeader: event.currentTarget.checked })
            }
          />
          <span>Header row</span>
        </label>
        <label>
          <span>Mode</span>
          <select
            value={pendingImport.mode}
            onChange={(event) =>
              updateImportMode(importId, event.currentTarget.value as "tabular" | "raw")
            }
          >
            <option value="tabular">Tabular</option>
            <option value="raw">Raw</option>
          </select>
        </label>
        <div className="import-actions">
          <button type="button" onClick={() => cancelImport(importId)}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => void confirmImport(importId)}>
            Import
          </button>
        </div>
      </div>
      <div className="import-summary">
        <span>{pendingImport.fileName}</span>
        <span>
          {pendingImport.mode === "raw"
            ? "raw text import"
            : preview
              ? `${preview.rows.length} preview rows`
              : pendingImport.error}
        </span>
      </div>
      {pendingImport.error && !preview ? (
        <div className="import-error">{pendingImport.error}</div>
      ) : null}
      {!pendingImport.options.hasHeader && preview ? (
        <div className="column-name-editor">
          {preview.columns.map((column, index) => (
            <label key={`${column.id}-${index}`}>
              <span>{`Column ${index + 1}`}</span>
              <input
                value={pendingImport.options.columnNames[index] ?? column.name}
                onChange={(event) => {
                  const columnNames = [...pendingImport.options.columnNames];
                  columnNames[index] = event.currentTarget.value;
                  updateImportOptions(importId, { columnNames });
                }}
              />
            </label>
          ))}
        </div>
      ) : null}
      <div className="import-editor-grid">
        <label className="raw-text-editor">
          <span>Raw text</span>
          <textarea
            spellCheck={false}
            value={pendingImport.text}
            onChange={(event) => updateImportText(importId, event.currentTarget.value)}
          />
        </label>
        <div
          ref={parentRef}
          className="table-scroll import-preview"
          style={{ "--table-visible-height": "320px" } as CSSProperties}
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
    </div>
  );
}
