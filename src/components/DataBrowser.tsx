import { useMemo, useRef, useState, type CSSProperties } from "react";
import { datasetColumnIds } from "../domain/csv";
import type { VirtualFile } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";

const depthOf = (path: string): number =>
  Math.max(
    0,
    path
      .replace(/^~\/raw\/?/, "")
      .split("/")
      .filter(Boolean).length - 1,
  );

const sortRawItems = (items: VirtualFile[]): VirtualFile[] =>
  [...items].sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path);
    if (left.kind === right.kind) return pathCompare;
    return left.kind === "directory" && right.path.startsWith(`${left.path}/`) ? -1 : pathCompare;
  });

const quoteCommandArg = (value: string): string =>
  /\s|["']/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;

export function DataBrowser() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [collapsedDatasetIds, setCollapsedDatasetIds] = useState<Set<string>>(() => new Set());
  const files = useScispaceStore((state) => state.files);
  const datasets = useScispaceStore((state) => state.datasets);
  const activeDatasetId = useScispaceStore((state) => state.activeDatasetId);
  const columnSelections = useScispaceStore((state) => state.columnSelections);
  const toggleDatasetColumn = useScispaceStore((state) => state.toggleDatasetColumn);
  const runScispace = useScispaceStore((state) => state.runScispace);

  const rawFiles = useMemo(
    () => sortRawItems(files.filter((file) => file.path.startsWith("~/raw/"))),
    [files],
  );

  const openFiles = async (loadedFiles: File[]) => {
    for (const file of loadedFiles) {
      const importId = crypto.randomUUID();
      const text = await file.text();
      openImportThroughCommand(importId, file.name, text);
    }
  };

  const openImportThroughCommand = (importId: string, fileName: string, text: string) => {
    void runScispace(
      `import-open ${importId} name=${quoteCommandArg(fileName)} text=${encodeURIComponent(text)}`,
      { source: "gui" },
    );
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    await openFiles(Array.from(event.dataTransfer.files));
  };

  const handleCreateFolder = () => {
    const name = window.prompt("Folder name", "New Folder");
    if (name) void runScispace(`file-mkdir ~/raw/${quoteCommandArg(name)}`, { source: "gui" });
  };

  const handleRename = (file: VirtualFile) => {
    const name = window.prompt("Rename", file.name);
    if (name && name !== file.name) {
      void runScispace(`file-rename ${quoteCommandArg(file.path)} name=${quoteCommandArg(name)}`, {
        source: "gui",
      });
    }
  };

  const handleMove = (file: VirtualFile) => {
    const directory = window.prompt("Move to directory", "~/raw");
    if (directory) {
      void runScispace(`file-move ${quoteCommandArg(file.path)} to=${quoteCommandArg(directory)}`, {
        source: "gui",
      });
    }
  };

  const handleDelete = (file: VirtualFile) => {
    const confirmed = window.confirm(`Delete ${file.path}?`);
    if (confirmed) void runScispace(`file-delete ${quoteCommandArg(file.path)}`, { source: "gui" });
  };

  const handleOpenTable = (datasetId: string, datasetName: string) => {
    const dataset = datasets.find((item) => item.id === datasetId);
    if (!dataset) return;
    const selectedColumns = useScispaceStore.getState().columnSelections[datasetId] ?? [];
    const columns = selectedColumns.length > 0 ? selectedColumns : datasetColumnIds(dataset);
    void runScispace(
      `table ${quoteCommandArg(datasetName)} columns=${columns.map(quoteCommandArg).join(",")}`,
      { source: "gui" },
    );
  };

  const toggleDatasetCollapse = (datasetId: string) => {
    setCollapsedDatasetIds((current) => {
      const next = new Set(current);
      if (next.has(datasetId)) {
        next.delete(datasetId);
      } else {
        next.add(datasetId);
      }
      return next;
    });
  };

  return (
    <div
      className="data-browser"
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={handleDrop}
    >
      <div className="tree-row root">
        <span>▾</span>
        <span className="folder-icon">~/raw</span>
        <button type="button" className="tree-action" onClick={handleCreateFolder}>
          +
        </button>
      </div>
      <div className="tree-scroll">
        {rawFiles.map((file) => {
          const dataset = datasets.find((item) => item.id === file.datasetId);
          const selected = dataset?.id === activeDatasetId;
          const isDirectory = file.kind === "directory";
          const selectedColumns = dataset
            ? (columnSelections[dataset.id] ?? datasetColumnIds(dataset))
            : [];
          const isCollapsed = dataset ? collapsedDatasetIds.has(dataset.id) : true;
          return (
            <div key={file.id} className="tree-node">
              <div
                className={`tree-row file ${selected ? "selected" : ""} ${dataset ? "parsed" : "raw-only"} ${isDirectory ? "directory" : ""}`}
                style={{ "--tree-depth": depthOf(file.path) } as CSSProperties}
              >
                <span className="tree-indent" />
                <button
                  type="button"
                  className="tree-fold"
                  disabled={!dataset}
                  aria-label={
                    dataset ? `${isCollapsed ? "Expand" : "Collapse"} ${file.name}` : undefined
                  }
                  onClick={() => {
                    if (dataset) toggleDatasetCollapse(dataset.id);
                  }}
                >
                  {dataset ? (isCollapsed ? "▸" : "▾") : isDirectory ? "▸" : "◇"}
                </button>
                <button
                  type="button"
                  className="tree-item-main"
                  disabled={!dataset}
                  title={file.parseError}
                  onClick={() => {
                    if (dataset) handleOpenTable(dataset.id, dataset.name);
                  }}
                >
                  <span className="file-icon">{dataset ? "▦" : isDirectory ? "▸" : "◇"}</span>
                  <span className="file-name">{file.name}</span>
                </button>
                <span className="file-meta">
                  {dataset ? `${dataset.rows.length}r · ${dataset.columns.length}c` : "raw"}
                </span>
                <div className="tree-actions">
                  {!dataset && file.kind === "file" ? (
                    <button
                      type="button"
                      aria-label={`Parse ${file.name}`}
                      className="tree-action"
                      onClick={() =>
                        openImportThroughCommand(crypto.randomUUID(), file.name, file.text ?? "")
                      }
                    >
                      ⇄
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Move ${file.name}`}
                    className="tree-action"
                    onClick={() => handleMove(file)}
                  >
                    ↵
                  </button>
                  <button
                    type="button"
                    aria-label={`Rename ${file.name}`}
                    className="tree-action"
                    onClick={() => handleRename(file)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${file.name}`}
                    className="tree-action"
                    onClick={() => handleDelete(file)}
                  >
                    ×
                  </button>
                </div>
              </div>
              {dataset && !isCollapsed
                ? dataset.columns.map((column) => (
                    <label
                      key={column.id}
                      className="tree-row column"
                      style={{ "--tree-depth": depthOf(file.path) + 1 } as CSSProperties}
                    >
                      <span className="tree-indent" />
                      <input
                        type="checkbox"
                        checked={selectedColumns.includes(column.id)}
                        disabled={
                          selectedColumns.includes(column.id) && selectedColumns.length === 1
                        }
                        onChange={() => toggleDatasetColumn(dataset.id, column.id)}
                      />
                      <span className="file-name">{column.name}</span>
                      <span className="file-meta">{column.dataType}</span>
                    </label>
                  ))
                : null}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="drop-hint"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <strong>Drop files here</strong>
        <span>Click to load, or drop files. Raw text can be parsed in the preview window.</span>
      </button>
      <input
        ref={fileInputRef}
        aria-label="Load data files"
        className="visually-hidden"
        multiple
        type="file"
        onChange={(event) => {
          void openFiles(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
