import { useMemo, useRef, useState, type CSSProperties } from "react";
import { datasetColumnIds } from "../domain/csv";
import type { Dataset, VirtualFile } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";
import { useContextMenu, type ContextMenuItem } from "./context-menu/ContextMenuProvider";
import { useDialog } from "./dialog/DialogProvider";

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

export const uploadOpenCommand = (
  uploadId: string,
  fileName: string,
  mode: "tabular" | "raw" = "tabular",
): string =>
  `upload-open ${uploadId} name=${quoteCommandArg(fileName)} ref=${uploadId} mode=${mode}`;

const tableCommand = (dataset: Dataset, columnIds: string[]): string =>
  `table ${quoteCommandArg(dataset.name)} columns=${columnIds.map(quoteCommandArg).join(",")}`;

const plotCommand = (dataset: Dataset, selectedColumnIds: string[]): string | undefined => {
  const allColumnIds = datasetColumnIds(dataset);
  const columns = selectedColumnIds.filter((columnId) => allColumnIds.includes(columnId));
  const plotColumns = columns.length > 0 ? columns : allColumnIds;
  const [firstColumn, ...remainingColumns] = plotColumns;
  const x =
    plotColumns.length > 1
      ? firstColumn
      : allColumnIds.find((columnId) => columnId !== firstColumn);
  const yColumns = plotColumns.length > 1 ? remainingColumns : firstColumn ? [firstColumn] : [];
  const validYColumns = yColumns.filter((columnId) => columnId !== x);
  if (!x || validYColumns.length === 0) return undefined;
  return `plot ${quoteCommandArg(dataset.name)} x=${quoteCommandArg(x)} y=${validYColumns
    .map(quoteCommandArg)
    .join(",")}`;
};

const columnsSelectedForDataset = (
  dataset: Dataset,
  selections: Record<string, string[]>,
): string[] => selections[dataset.id] ?? datasetColumnIds(dataset);

export function DataBrowser() {
  const dialog = useDialog();
  const { openContextMenu } = useContextMenu();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [collapsedDatasetIds, setCollapsedDatasetIds] = useState<Set<string>>(() => new Set());
  const files = useScispaceStore((state) => state.files);
  const datasets = useScispaceStore((state) => state.datasets);
  const activeDatasetId = useScispaceStore((state) => state.activeDatasetId);
  const columnSelections = useScispaceStore((state) => state.columnSelections);
  const toggleDatasetColumn = useScispaceStore((state) => state.toggleDatasetColumn);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const stageUploadPayload = useScispaceStore((state) => state.stageUploadPayload);

  const rawFiles = useMemo(
    () => sortRawItems(files.filter((file) => file.path.startsWith("~/raw/"))),
    [files],
  );

  const openFiles = async (loadedFiles: File[]) => {
    for (const file of loadedFiles) {
      const text = await file.text();
      openImportThroughCommand(file.name, text);
    }
  };

  const openImportThroughCommand = (fileName: string, text: string) => {
    const uploadId = stageUploadPayload(fileName, text);
    void runScispace(uploadOpenCommand(uploadId, fileName), { source: "gui" });
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    await openFiles(Array.from(event.dataTransfer.files));
  };

  const handleCreateFolder = async () => {
    const name = await dialog.prompt({
      title: "Folder name",
      defaultValue: "New Folder",
      confirmLabel: "Create",
    });
    if (name) void runScispace(`file-mkdir ~/raw/${quoteCommandArg(name)}`, { source: "gui" });
  };

  const handleRename = async (file: VirtualFile) => {
    const name = await dialog.prompt({
      title: "Rename",
      defaultValue: file.name,
      confirmLabel: "Rename",
    });
    if (name && name !== file.name) {
      void runScispace(`file-rename ${quoteCommandArg(file.path)} name=${quoteCommandArg(name)}`, {
        source: "gui",
      });
    }
  };

  const handleMove = async (file: VirtualFile) => {
    const directory = await dialog.prompt({
      title: "Move to directory",
      defaultValue: "~/raw",
      confirmLabel: "Move",
    });
    if (directory) {
      void runScispace(`file-move ${quoteCommandArg(file.path)} to=${quoteCommandArg(directory)}`, {
        source: "gui",
      });
    }
  };

  const handleDelete = async (file: VirtualFile) => {
    const confirmed = await dialog.confirm({
      title: "Delete item",
      message: `Delete ${file.path}?`,
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (confirmed) void runScispace(`file-delete ${quoteCommandArg(file.path)}`, { source: "gui" });
  };

  const handleOpenTable = (datasetId: string) => {
    const dataset = datasets.find((item) => item.id === datasetId);
    if (!dataset) return;
    const selectedColumns = useScispaceStore.getState().columnSelections[datasetId] ?? [];
    const columns = selectedColumns.length > 0 ? selectedColumns : datasetColumnIds(dataset);
    void runScispace(tableCommand(dataset, columns), { source: "gui" });
  };

  const handlePlotDataset = (datasetId: string) => {
    const dataset = datasets.find((item) => item.id === datasetId);
    if (!dataset) return;
    const command = plotCommand(
      dataset,
      columnsSelectedForDataset(dataset, useScispaceStore.getState().columnSelections),
    );
    if (command) void runScispace(command, { source: "gui" });
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

  const fileContextItems = (file: VirtualFile, dataset?: Dataset): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (dataset) {
      items.push(
        {
          label: "Table",
          onSelect: () => handleOpenTable(dataset.id),
        },
        {
          label: "Plot",
          ariaLabel: `Plot ${file.name}`,
          onSelect: () => handlePlotDataset(dataset.id),
        },
      );
    }
    if (!dataset && file.kind === "file") {
      items.push({
        label: "Load",
        ariaLabel: `Load ${file.name}`,
        onSelect: () => openImportThroughCommand(file.name, file.text ?? ""),
      });
    }
    items.push(
      {
        label: "Move",
        ariaLabel: `Move ${file.name}`,
        onSelect: () => void handleMove(file),
      },
      {
        label: "Rename",
        ariaLabel: `Rename ${file.name}`,
        onSelect: () => void handleRename(file),
      },
      {
        label: "Delete",
        ariaLabel: `Delete ${file.name}`,
        danger: true,
        onSelect: () => void handleDelete(file),
      },
    );
    return items;
  };

  const openFileContextMenu = (
    file: VirtualFile,
    dataset: Dataset | undefined,
    position: { x: number; y: number },
  ) => {
    openContextMenu({
      x: position.x,
      y: position.y,
      title: file.path,
      items: fileContextItems(file, dataset),
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
        <button type="button" className="tree-action" onClick={() => void handleCreateFolder()}>
          +
        </button>
      </div>
      <div className="tree-scroll">
        {rawFiles.map((file) => {
          const dataset = datasets.find((item) => item.id === file.datasetId);
          const selected = dataset?.id === activeDatasetId;
          const isDirectory = file.kind === "directory";
          const selectedColumns = dataset
            ? columnsSelectedForDataset(dataset, columnSelections)
            : [];
          const isCollapsed = dataset ? collapsedDatasetIds.has(dataset.id) : true;
          return (
            <div key={file.id} className="tree-node">
              <div
                className={`tree-row file ${selected ? "selected" : ""} ${dataset ? "parsed" : "raw-only"} ${isDirectory ? "directory" : ""}`}
                style={{ "--tree-depth": depthOf(file.path) } as CSSProperties}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openFileContextMenu(file, dataset, { x: event.clientX, y: event.clientY });
                }}
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
                    if (dataset) handleOpenTable(dataset.id);
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
                      openFileContextMenu(file, dataset, { x: rect.left, y: rect.bottom + 4 });
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
