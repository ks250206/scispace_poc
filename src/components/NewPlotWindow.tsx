import { useMemo, useState } from "react";
import type { PlotType } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";

interface NewPlotWindowProps {
  windowId: string;
}

const plotTypes: PlotType[] = ["line", "line-marker", "marker"];

const quoteCommandValue = (value: string): string =>
  /\s|["']|=|,/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;

const option = (key: string, value: string): string => `${key}=${quoteCommandValue(value)}`;

const defaultXColumn = (columns: { id: string; name: string }[]): string =>
  columns.find((column) => column.id === "time" || column.name.toLowerCase() === "time")?.id ??
  columns[0]?.id ??
  "";

const defaultYColumn = (columns: { id: string; name: string }[], xColumn: string): string =>
  columns.find((column) => column.id === "signal" || column.name.toLowerCase() === "signal")?.id ??
  columns.find((column) => column.id !== xColumn)?.id ??
  columns[0]?.id ??
  "";

export function NewPlotWindow({ windowId }: NewPlotWindowProps) {
  const datasets = useScispaceStore((state) => state.datasets);
  const activeDatasetId = useScispaceStore((state) => state.activeDatasetId);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const closeWindow = useScispaceStore((state) => state.closeWindow);
  const sendCommandToTerminalLine = useScispaceStore((state) => state.sendCommandToTerminalLine);

  const firstDatasetId = activeDatasetId ?? datasets[0]?.id ?? "";
  const [datasetId, setDatasetId] = useState(firstDatasetId);
  const dataset = datasets.find((item) => item.id === datasetId) ?? datasets[0];
  const columns = dataset?.columns ?? [];
  const defaultX = defaultXColumn(columns);
  const defaultY = defaultYColumn(columns, defaultX);
  const [xColumn, setXColumn] = useState(defaultX);
  const [yColumns, setYColumns] = useState<string[]>(defaultY ? [defaultY] : []);
  const [plotType, setPlotType] = useState<PlotType>("line");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("");

  const selectedDataset = dataset;
  const resolvedX = columns.some((column) => column.id === xColumn) ? xColumn : defaultX;
  const resolvedY = yColumns.filter((columnId) => columns.some((column) => column.id === columnId));
  const canPlot = Boolean(selectedDataset && resolvedX && resolvedY.length > 0);

  const command = useMemo(() => {
    if (!selectedDataset || !resolvedX || resolvedY.length === 0) return "";
    return [
      "plot",
      quoteCommandValue(selectedDataset.name),
      option("x", resolvedX),
      option("y", resolvedY.join(",")),
      option("type", plotType),
    ].join(" ");
  }, [plotType, resolvedX, resolvedY, selectedDataset]);

  const displayText = selectedDataset
    ? `Display ${resolvedY.join(", ") || "(none)"} vs ${resolvedX || "(none)"}`
    : "No dataset available";

  const changeDataset = (nextDatasetId: string) => {
    const nextDataset = datasets.find((item) => item.id === nextDatasetId);
    const nextColumns = nextDataset?.columns ?? [];
    const nextX = defaultXColumn(nextColumns);
    const nextY = defaultYColumn(nextColumns, nextX);
    setDatasetId(nextDatasetId);
    setXColumn(nextX);
    setYColumns(nextY ? [nextY] : []);
    setStatus("");
  };

  const toggleYColumn = (columnId: string) => {
    setYColumns((current) =>
      current.includes(columnId)
        ? current.filter((item) => item !== columnId)
        : [...current, columnId],
    );
  };

  const executePlot = async () => {
    if (!command) return;
    const result = await runScispace(command, { source: "gui" });
    if (result.kind === "error") {
      setStatus(result.output);
      return;
    }
    if (title.trim() && result.kind === "plot-created") {
      await runScispace(`plot-set ${result.spec.id} ${option("title", title.trim())}`, {
        source: "gui",
      });
    }
    closeWindow(windowId);
  };

  return (
    <div className="new-plot-window">
      <div className="new-plot-header">
        <label>
          <span>Dataset</span>
          <select
            aria-label="Plot dataset"
            value={selectedDataset?.id ?? ""}
            onChange={(event) => changeDataset(event.target.value)}
          >
            {datasets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Style</span>
          <select
            aria-label="Plot type"
            value={plotType}
            onChange={(event) => setPlotType(event.target.value as PlotType)}
          >
            {plotTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="new-plot-choices">
        <section className="new-plot-pane" aria-label="Y Wave(s)">
          <h3>Y Wave(s)</h3>
          <div className="new-plot-list">
            {columns.map((column) => (
              <label key={column.id} className="new-plot-row">
                <input
                  type="checkbox"
                  checked={resolvedY.includes(column.id)}
                  onChange={() => toggleYColumn(column.id)}
                />
                <span>{column.name}</span>
                <small>{column.dataType}</small>
              </label>
            ))}
          </div>
        </section>

        <div className="new-plot-middle">
          <button type="button" disabled={!canPlot} onClick={() => void executePlot()}>
            Do It
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

        <section className="new-plot-pane" aria-label="X Wave">
          <h3>X Wave</h3>
          <div className="new-plot-list">
            {columns.map((column) => (
              <label key={column.id} className="new-plot-row">
                <input
                  type="radio"
                  name={`new-plot-x-${windowId}`}
                  checked={resolvedX === column.id}
                  onChange={() => setXColumn(column.id)}
                />
                <span>{column.name}</span>
                <small>{column.dataType}</small>
              </label>
            ))}
          </div>
        </section>
      </div>

      <div className="new-plot-details">
        <label>
          <span>Title</span>
          <input
            aria-label="Plot title"
            value={title}
            placeholder={
              selectedDataset
                ? `${selectedDataset.name}: ${resolvedY.join(", ")} vs ${resolvedX}`
                : ""
            }
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div className="new-plot-display">{displayText}</div>
        <code className="new-plot-command">{command || "Select data, x, and y columns."}</code>
        {status ? <p className="new-plot-status">{status}</p> : null}
      </div>
    </div>
  );
}
