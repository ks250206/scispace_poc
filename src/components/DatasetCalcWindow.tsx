import { useMemo, useState } from "react";
import type { Dataset } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";
import { datasetOption, quoteDatasetCommandValue } from "./datasetCommandWindows";

interface DatasetCalcWindowProps {
  windowId: string;
  datasetId?: string;
}

const defaultExpression = (dataset?: Dataset): string => {
  const numericColumns = dataset?.columns.filter((column) => column.dataType === "number") ?? [];
  if (numericColumns.length >= 2) return `${numericColumns[0].id} + ${numericColumns[1].id}`;
  if (numericColumns[0]) return `${numericColumns[0].id} * 2`;
  return "";
};

export function DatasetCalcWindow({ windowId, datasetId }: DatasetCalcWindowProps) {
  const datasets = useScispaceStore((state) => state.datasets);
  const activeDatasetId = useScispaceStore((state) => state.activeDatasetId);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const closeWindow = useScispaceStore((state) => state.closeWindow);
  const sendCommandToTerminalLine = useScispaceStore((state) => state.sendCommandToTerminalLine);
  const initialDatasetId = datasetId ?? activeDatasetId ?? datasets[0]?.id ?? "";
  const [selectedDatasetId, setSelectedDatasetId] = useState(initialDatasetId);
  const selectedDataset =
    datasets.find((dataset) => dataset.id === selectedDatasetId) ?? datasets[0];
  const [targetColumn, setTargetColumn] = useState("calculated");
  const [expression, setExpression] = useState(defaultExpression(selectedDataset));
  const [status, setStatus] = useState("");

  const command = useMemo(() => {
    if (!selectedDataset) return "";
    return [
      "dataset-calc",
      quoteDatasetCommandValue(selectedDataset.name),
      datasetOption("column", targetColumn.trim() || "calculated"),
      datasetOption("expr", expression.trim()),
    ].join(" ");
  }, [expression, selectedDataset, targetColumn]);

  const changeDataset = (nextDatasetId: string) => {
    const nextDataset = datasets.find((dataset) => dataset.id === nextDatasetId);
    setSelectedDatasetId(nextDatasetId);
    setExpression(defaultExpression(nextDataset));
    setStatus("");
  };

  const applyCalculation = async () => {
    if (!command) return;
    const result = await runScispace(command, { source: "gui" });
    if (result.kind === "error") {
      setStatus(result.output);
      return;
    }
    closeWindow(windowId);
  };

  return (
    <div className="dataset-tool-window">
      <section className="dataset-tool-panel">
        <h3>Calculate Column</h3>
        <label>
          <span>Dataset</span>
          <select
            aria-label="Calculation dataset"
            value={selectedDataset?.id ?? ""}
            onChange={(event) => changeDataset(event.target.value)}
          >
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Target column</span>
          <input
            aria-label="Target column"
            value={targetColumn}
            onChange={(event) => setTargetColumn(event.target.value)}
          />
        </label>
        <label>
          <span>Expression</span>
          <textarea
            aria-label="Column expression"
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
          />
        </label>
      </section>

      <section className="dataset-tool-columns" aria-label="Available columns">
        {selectedDataset?.columns.map((column) => (
          <span key={column.id}>
            {column.id}
            <small>{column.dataType}</small>
          </span>
        ))}
      </section>

      <div className="dataset-tool-command">
        <span>Command</span>
        <code>{command || "Select a dataset."}</code>
      </div>

      <div className="dataset-tool-actions">
        <button type="button" disabled={!command} onClick={() => void applyCalculation()}>
          Apply
        </button>
        <button
          type="button"
          disabled={!command}
          onClick={() => {
            sendCommandToTerminalLine(command);
            setStatus("Command sent to terminal line.");
          }}
        >
          To Cmd Line
        </button>
        <button type="button" onClick={() => closeWindow(windowId)}>
          Cancel
        </button>
      </div>
      {status ? <p className="dataset-tool-status">{status}</p> : null}
    </div>
  );
}
