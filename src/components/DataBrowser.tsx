import { useMemo } from "react";
import { useScispaceStore } from "../store/scispaceStore";

export function DataBrowser() {
  const files = useScispaceStore((state) => state.files);
  const datasets = useScispaceStore((state) => state.datasets);
  const activeDatasetId = useScispaceStore((state) => state.activeDatasetId);
  const selectDataset = useScispaceStore((state) => state.selectDataset);
  const openImportDialog = useScispaceStore((state) => state.openImportDialog);

  const rawFiles = useMemo(() => files.filter((file) => file.path.startsWith("~/raw/")), [files]);

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const droppedFiles = Array.from(event.dataTransfer.files);
    for (const file of droppedFiles) {
      openImportDialog(file.name, await file.text());
    }
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
      </div>
      {rawFiles.map((file) => {
        const dataset = datasets.find((item) => item.id === file.datasetId);
        const selected = dataset?.id === activeDatasetId;
        return (
          <button
            key={file.id}
            type="button"
            className={`tree-row file ${selected ? "selected" : ""} ${dataset ? "parsed" : "raw-only"}`}
            onClick={() => {
              if (dataset) void selectDataset(dataset.id);
            }}
            disabled={!dataset}
            title={file.parseError}
          >
            <span className="tree-indent" />
            <span className="file-icon">{dataset ? "▦" : "◇"}</span>
            <span className="file-name">{file.name}</span>
            <span className="file-meta">{dataset ? `${dataset.rows.length}r` : "raw"}</span>
          </button>
        );
      })}
      <div className="drop-hint">
        <strong>Drop files here</strong>
        <span>CSV/TSV become datasets. Other files stay as raw virtual FS files.</span>
      </div>
    </div>
  );
}
