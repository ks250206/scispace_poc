import { type CSSProperties } from "react";
import type { Dataset, VirtualFile } from "../../domain/types";
import { columnsSelectedForDataset, depthOf } from "./dataBrowserCommands";

type DataBrowserTreeProps = {
  activeDatasetId?: string;
  collapsedDatasetIds: Set<string>;
  columnSelections: Record<string, string[]>;
  datasets: Dataset[];
  files: VirtualFile[];
  onOpenContextMenu: (
    file: VirtualFile,
    dataset: Dataset | undefined,
    position: { x: number; y: number },
  ) => void;
  onOpenTable: (datasetId: string) => void;
  onToggleColumn: (datasetId: string, columnId: string) => void;
  onToggleDataset: (datasetId: string) => void;
};

export function DataBrowserTree({
  activeDatasetId,
  collapsedDatasetIds,
  columnSelections,
  datasets,
  files,
  onOpenContextMenu,
  onOpenTable,
  onToggleColumn,
  onToggleDataset,
}: DataBrowserTreeProps) {
  return (
    <div className="tree-scroll">
      {files.map((file) => {
        const dataset = datasets.find((item) => item.id === file.datasetId);
        return (
          <DataBrowserNode
            key={file.id}
            activeDatasetId={activeDatasetId}
            collapsedDatasetIds={collapsedDatasetIds}
            columnSelections={columnSelections}
            dataset={dataset}
            file={file}
            onOpenContextMenu={onOpenContextMenu}
            onOpenTable={onOpenTable}
            onToggleColumn={onToggleColumn}
            onToggleDataset={onToggleDataset}
          />
        );
      })}
    </div>
  );
}

type DataBrowserNodeProps = Omit<DataBrowserTreeProps, "datasets" | "files"> & {
  dataset?: Dataset;
  file: VirtualFile;
};

function DataBrowserNode({
  activeDatasetId,
  collapsedDatasetIds,
  columnSelections,
  dataset,
  file,
  onOpenContextMenu,
  onOpenTable,
  onToggleColumn,
  onToggleDataset,
}: DataBrowserNodeProps) {
  const selected = dataset?.id === activeDatasetId;
  const isDirectory = file.kind === "directory";
  const selectedColumns = dataset ? columnsSelectedForDataset(dataset, columnSelections) : [];
  const isCollapsed = dataset ? collapsedDatasetIds.has(dataset.id) : true;

  return (
    <div className="tree-node">
      <div
        className={`tree-row file ${selected ? "selected" : ""} ${dataset ? "parsed" : "raw-only"} ${isDirectory ? "directory" : ""}`}
        style={{ "--tree-depth": depthOf(file.path) } as CSSProperties}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenContextMenu(file, dataset, { x: event.clientX, y: event.clientY });
        }}
      >
        <span className="tree-indent" />
        <button
          type="button"
          className="tree-fold"
          disabled={!dataset}
          aria-label={dataset ? `${isCollapsed ? "Expand" : "Collapse"} ${file.name}` : undefined}
          onClick={() => {
            if (dataset) onToggleDataset(dataset.id);
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
            if (dataset) onOpenTable(dataset.id);
          }}
        >
          <span className="file-icon">{dataset ? "▦" : isDirectory ? "▸" : "◇"}</span>
          <span className="file-name">{file.name}</span>
        </button>
        <span className="file-meta">
          {dataset ? `${dataset.rows.length}r · ${dataset.columns.length}c` : "raw"}
        </span>
        <div className="tree-actions">
          <button
            type="button"
            aria-label={`Actions ${file.name}`}
            aria-haspopup="menu"
            className="tree-action tree-menu-trigger"
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenContextMenu(file, dataset, { x: rect.left, y: rect.bottom + 4 });
            }}
          >
            ⋯
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
                disabled={selectedColumns.includes(column.id) && selectedColumns.length === 1}
                onChange={() => onToggleColumn(dataset.id, column.id)}
              />
              <span className="file-name">{column.name}</span>
              <span className="file-meta">{column.dataType}</span>
            </label>
          ))
        : null}
    </div>
  );
}
