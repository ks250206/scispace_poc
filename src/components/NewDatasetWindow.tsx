import { useMemo, useState } from "react";
import { useScispaceStore } from "../store/scispaceStore";
import { datasetOption, quoteDatasetCommandValue } from "./datasetCommandWindows";
import type { DatasetColumn } from "../domain/types";

interface NewDatasetWindowProps {
  windowId: string;
}

export function NewDatasetWindow({ windowId }: NewDatasetWindowProps) {
  const runScispace = useScispaceStore((state) => state.runScispace);
  const closeWindow = useScispaceStore((state) => state.closeWindow);
  const sendCommandToTerminalLine = useScispaceStore((state) => state.sendCommandToTerminalLine);
  const [name, setName] = useState("calc");
  const [columns, setColumns] = useState<
    Array<{ id: string; name: string; type: DatasetColumn["dataType"] }>
  >([
    { id: crypto.randomUUID(), name: "x", type: "number" },
    { id: crypto.randomUUID(), name: "y", type: "number" },
  ]);
  const [rows, setRows] = useState("10");
  const [status, setStatus] = useState("");

  const columnSpec = columns
    .map((column) => `${column.name.trim() || "column"}:${column.type}`)
    .join(",");
  const command = useMemo(
    () =>
      [
        "dataset-new",
        quoteDatasetCommandValue(name.trim() || "calc"),
        `columns=${columnSpec.replace(/\s+/g, "")}`,
        datasetOption("rows", rows.trim() || "0"),
      ].join(" "),
    [columnSpec, name, rows],
  );

  const updateColumn = (
    id: string,
    patch: Partial<{ name: string; type: DatasetColumn["dataType"] }>,
  ) => {
    setColumns((current) =>
      current.map((column) => (column.id === id ? { ...column, ...patch } : column)),
    );
    setStatus("");
  };

  const createDataset = async () => {
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
        <h3>Dataset</h3>
        <label>
          <span>Name</span>
          <input
            aria-label="Dataset name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span>Columns</span>
          <div className="dataset-column-editor">
            {columns.map((column, index) => (
              <div key={column.id} className="dataset-column-row">
                <input
                  aria-label={`Dataset column ${index + 1} name`}
                  value={column.name}
                  onChange={(event) => updateColumn(column.id, { name: event.target.value })}
                />
                <select
                  aria-label={`Dataset column ${index + 1} type`}
                  value={column.type}
                  onChange={(event) =>
                    updateColumn(column.id, {
                      type: event.target.value as DatasetColumn["dataType"],
                    })
                  }
                >
                  <option value="number">number</option>
                  <option value="string">string</option>
                  <option value="mixed">mixed</option>
                </select>
                <button
                  type="button"
                  disabled={columns.length === 1}
                  onClick={() =>
                    setColumns((current) => current.filter((item) => item.id !== column.id))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setColumns((current) => [
                  ...current,
                  { id: crypto.randomUUID(), name: `column_${current.length + 1}`, type: "number" },
                ])
              }
            >
              Add column
            </button>
          </div>
        </label>
        <label>
          <span>Rows</span>
          <input
            aria-label="Dataset rows"
            inputMode="numeric"
            value={rows}
            onChange={(event) => setRows(event.target.value)}
          />
        </label>
      </section>

      <div className="dataset-tool-command">
        <span>Command</span>
        <code>{command}</code>
      </div>

      <div className="dataset-tool-actions">
        <button type="button" onClick={() => void createDataset()}>
          Create
        </button>
        <button
          type="button"
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
