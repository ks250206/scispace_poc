import { useMemo, useRef, useState } from "react";
import type { Dataset, VirtualFile } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";
import { useContextMenu, type ContextMenuItem } from "./context-menu/ContextMenuProvider";
import { DataBrowserDropZone } from "./data-browser/DataBrowserDropZone";
import { DataBrowserTree } from "./data-browser/DataBrowserTree";
import {
  columnsSelectedForDataset,
  plotCommand,
  quoteCommandArg,
  sortRawItems,
  tableCommand,
  uploadOpenCommand,
} from "./data-browser/dataBrowserCommands";
import { useDialog } from "./dialog/DialogProvider";

export { uploadOpenCommand } from "./data-browser/dataBrowserCommands";

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
  const openDatasetCalcWindow = useScispaceStore((state) => state.openDatasetCalcWindow);

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
    const columns =
      selectedColumns.length > 0
        ? selectedColumns
        : columnsSelectedForDataset(dataset, useScispaceStore.getState().columnSelections);
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
        {
          label: "Calculate Column",
          ariaLabel: `Calculate Column ${file.name}`,
          onSelect: () => openDatasetCalcWindow(dataset.id),
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
      <DataBrowserTree
        activeDatasetId={activeDatasetId}
        collapsedDatasetIds={collapsedDatasetIds}
        columnSelections={columnSelections}
        datasets={datasets}
        files={rawFiles}
        onOpenContextMenu={openFileContextMenu}
        onOpenTable={handleOpenTable}
        onToggleColumn={toggleDatasetColumn}
        onToggleDataset={toggleDatasetCollapse}
      />
      <DataBrowserDropZone
        fileInputRef={fileInputRef}
        onOpenFiles={(files) => void openFiles(files)}
      />
    </div>
  );
}
