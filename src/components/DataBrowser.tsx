import { useMemo } from "react";
import { useScispaceStore } from "../store/scispaceStore";

export function DataBrowser() {
  const files = useScispaceStore((state) => state.files);
  const datasets = useScispaceStore((state) => state.datasets);
  const activeDatasetId = useScispaceStore((state) => state.activeDatasetId);
  const selectDataset = useScispaceStore((state) => state.selectDataset);

  const rawFiles = useMemo(() => files.filter((file) => file.path.startsWith("~/raw/")), [files]);

  return (
    <div className="data-browser">
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
            className={`tree-row file ${selected ? "selected" : ""}`}
            onClick={() => {
              if (dataset) void selectDataset(dataset.id);
            }}
          >
            <span className="tree-indent" />
            <span className="file-icon">▦</span>
            <span className="file-name">{file.name}</span>
            <span className="file-meta">{dataset ? `${dataset.rows.length}r` : "raw"}</span>
          </button>
        );
      })}
      <div className="drop-hint">Drop CSV/TSV files anywhere on the canvas.</div>
    </div>
  );
}
