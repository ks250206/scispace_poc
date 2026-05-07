import { useMemo, type CSSProperties } from "react";
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
  const files = useScispaceStore((state) => state.files);
  const datasets = useScispaceStore((state) => state.datasets);
  const activeDatasetId = useScispaceStore((state) => state.activeDatasetId);
  const selectDataset = useScispaceStore((state) => state.selectDataset);
  const openImportDialog = useScispaceStore((state) => state.openImportDialog);
  const runScispace = useScispaceStore((state) => state.runScispace);

  const rawFiles = useMemo(
    () => sortRawItems(files.filter((file) => file.path.startsWith("~/raw/"))),
    [files],
  );

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const droppedFiles = Array.from(event.dataTransfer.files);
    for (const file of droppedFiles) {
      openImportDialog(file.name, await file.text());
    }
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
      {rawFiles.map((file) => {
        const dataset = datasets.find((item) => item.id === file.datasetId);
        const selected = dataset?.id === activeDatasetId;
        const isDirectory = file.kind === "directory";
        return (
          <div
            key={file.id}
            className={`tree-row file ${selected ? "selected" : ""} ${dataset ? "parsed" : "raw-only"} ${isDirectory ? "directory" : ""}`}
            style={{ "--tree-depth": depthOf(file.path) } as CSSProperties}
          >
            <span className="tree-indent" />
            <button
              type="button"
              className="tree-item-main"
              disabled={!dataset}
              title={file.parseError}
              onClick={() => {
                if (dataset) void selectDataset(dataset.id);
              }}
            >
              <span className="file-icon">{isDirectory ? "▸" : dataset ? "▦" : "◇"}</span>
              <span className="file-name">{file.name}</span>
            </button>
            <span className="file-meta">{dataset ? `${dataset.rows.length}r` : "raw"}</span>
            <div className="tree-actions">
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
        );
      })}
      <div className="drop-hint">
        <strong>Drop files here</strong>
        <span>CSV/TSV become datasets. Other files stay as raw virtual FS files.</span>
      </div>
    </div>
  );
}
