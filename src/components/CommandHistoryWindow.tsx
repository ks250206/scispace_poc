import { useMemo, useRef } from "react";
import { flexRender, useTable } from "@tanstack/react-table";
import { visibleTableFeatures } from "./tableFeatures";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { CommandHistoryEntry } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";

const historyRowHeight = 38;

export function CommandHistoryWindow() {
  const history = useScispaceStore((state) => state.commandHistory);
  const sendCommandToTerminalLine = useScispaceStore((state) => state.sendCommandToTerminalLine);
  const parentRef = useRef<HTMLDivElement>(null);
  const entries = useMemo(() => [...history].reverse(), [history]);

  const copyCommand = (command: string) => {
    void navigator.clipboard?.writeText(command);
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: "command",
        header: "Command",
        cell: (info: { row: { original: CommandHistoryEntry }; getValue: () => unknown }) => (
          <code>{String(info.getValue())}</code>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: (info: { row: { original: CommandHistoryEntry } }) => {
          const { command } = info.row.original;
          return (
            <div className="history-entry-actions">
              <button
                type="button"
                aria-label={`Run ${command}`}
                onClick={() => sendCommandToTerminalLine(command, { execute: true })}
              >
                Run
              </button>
              <button
                type="button"
                aria-label={`Copy ${command}`}
                onClick={() => copyCommand(command)}
              >
                Copy
              </button>
              <button
                type="button"
                aria-label={`To command line ${command}`}
                onClick={() => sendCommandToTerminalLine(command)}
              >
                To cmd line
              </button>
            </div>
          );
        },
      },
    ],
    [sendCommandToTerminalLine],
  );
  const table = useTable({ data: entries, columns, features: visibleTableFeatures });
  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => historyRowHeight,
    initialRect: { width: 360, height: 360 },
    overscan: 8,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const visibleRows =
    virtualRows.length > 0
      ? virtualRows
      : rows
          .slice(0, 12)
          .map((_, index) => ({ index, key: index, start: index * historyRowHeight }));

  return (
    <section className="history-window">
      <div className="history-summary">{entries.length} commands</div>
      {entries.length === 0 ? (
        <div className="empty-state">No scispace commands yet.</div>
      ) : (
        <div ref={parentRef} className="history-table-scroll" aria-label="Command history">
          <table className="history-table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
              {visibleRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                return (
                  <tr
                    key={row.id}
                    className={`history-entry ${row.original.status}`}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
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
      )}
    </section>
  );
}
