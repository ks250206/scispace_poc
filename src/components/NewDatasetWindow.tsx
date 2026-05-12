import { useMemo, useState } from "react";
import { useScispaceStore } from "../store/scispaceStore";
import { datasetOption, quoteDatasetCommandValue } from "./datasetCommandWindows";

interface NewDatasetWindowProps {
  windowId: string;
}

export function NewDatasetWindow({ windowId }: NewDatasetWindowProps) {
  const runScispace = useScispaceStore((state) => state.runScispace);
  const closeWindow = useScispaceStore((state) => state.closeWindow);
  const sendCommandToTerminalLine = useScispaceStore((state) => state.sendCommandToTerminalLine);
  const [name, setName] = useState("calc");
  const [columns, setColumns] = useState("x,y");
  const [rows, setRows] = useState("10");
  const [status, setStatus] = useState("");

  const command = useMemo(
    () =>
      [
        "dataset-new",
        quoteDatasetCommandValue(name.trim() || "calc"),
        `columns=${columns.replace(/\s+/g, "")}`,
        datasetOption("rows", rows.trim() || "0"),
      ].join(" "),
    [columns, name, rows],
  );

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
          <input
            aria-label="Dataset columns"
            value={columns}
            placeholder="x,y"
            onChange={(event) => setColumns(event.target.value)}
          />
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
