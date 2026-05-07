import { useEffect, useMemo, useState } from "react";
import type {
  PlotAxisSpec,
  PlotMarkerShape,
  PlotSeries,
  PlotType,
  PlotZoomMode,
} from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";

type AxisPatch = Omit<Partial<PlotAxisSpec>, "ticks"> & {
  ticks?: Partial<PlotAxisSpec["ticks"]>;
};

type PlotConfigTab = "basic" | "axes" | "series";

const quoteArg = (value: string): string =>
  /[\s=]/.test(value) ? `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"` : value;

const rangeToCommand = (range: PlotAxisSpec["range"]): string =>
  range.mode === "manual" ? `${range.min}:${range.max}` : "auto";

const tickToCommand = (ticks: PlotAxisSpec["ticks"]): string =>
  ticks.mode === "manual" && ticks.interval ? String(ticks.interval) : "auto";

export function PlotConfigWindow() {
  const currentPlotId = useScispaceStore((state) => state.currentPlotId);
  const spec = useScispaceStore((state) =>
    state.plotSpecs.find((item) => item.id === state.currentPlotId),
  );
  const dataset = useScispaceStore((state) =>
    state.datasets.find((item) => item.id === spec?.source),
  );
  const runScispace = useScispaceStore((state) => state.runScispace);
  const [seriesToAdd, setSeriesToAdd] = useState("");
  const [activeTab, setActiveTab] = useState<PlotConfigTab>("basic");

  const availableSeriesColumns = useMemo(() => {
    if (!dataset || !spec) return [];
    const activeColumns = new Set(spec.series.map((series) => series.y));
    return dataset.columns.filter((column) => column !== spec.x && !activeColumns.has(column));
  }, [dataset, spec]);

  useEffect(() => {
    if (availableSeriesColumns.length === 0) {
      if (seriesToAdd) setSeriesToAdd("");
      return;
    }
    if (!availableSeriesColumns.includes(seriesToAdd)) {
      setSeriesToAdd(availableSeriesColumns[0] ?? "");
    }
  }, [availableSeriesColumns, seriesToAdd]);

  if (!spec || !dataset || !currentPlotId) {
    return <div className="empty-state">Select a plot window to edit its config.</div>;
  }

  const runPlotCommand = (command: string) => {
    void runScispace(command, { source: "gui" });
  };
  const setPlotType = (plotType: PlotType) =>
    runPlotCommand(`plot-set ${currentPlotId} type=${plotType}`);
  const setBorder = (border: boolean) =>
    runPlotCommand(`plot-set ${currentPlotId} border=${border}`);
  const setZoomMode = (zoomMode: PlotZoomMode) =>
    runPlotCommand(`plot-set ${currentPlotId} zoom=${zoomMode}`);
  const setTitle = (title: string) =>
    runPlotCommand(`plot-set ${currentPlotId} title=${quoteArg(title)}`);
  const setPlotSize = (patch: Partial<typeof spec.size>) => {
    const next = { ...spec.size, ...patch };
    runPlotCommand(`plot-set ${currentPlotId} width=${next.width} height=${next.height}`);
  };
  const setGrid = (axis: "x" | "y", value: boolean) =>
    runPlotCommand(`plot-grid ${currentPlotId} ${axis}=${value}`);
  const setAxis = (axis: "x" | "y", patch: AxisPatch) => {
    const next = {
      ...spec.axes[axis],
      ...patch,
      ticks: { ...spec.axes[axis].ticks, ...patch.ticks },
    };
    runPlotCommand(
      `plot-axis ${currentPlotId} axis=${axis} label=${quoteArg(
        next.label,
      )} range=${rangeToCommand(next.range)} tick=${tickToCommand(next.ticks)} tickDir=${
        next.ticks.orientation
      }`,
    );
  };
  const updateSeries = (series: PlotSeries, patch: Partial<PlotSeries>) => {
    const next = { ...series, ...patch };
    runPlotCommand(
      `plot-series ${currentPlotId} y=${next.y} label=${quoteArg(next.label)} color=${next.color} lineWidth=${
        next.lineWidth
      } markerSize=${next.markerSize} markerShape=${next.markerShape}`,
    );
  };
  const addSeries = () => {
    if (!seriesToAdd) return;
    runPlotCommand(`plot-series ${currentPlotId} y=${seriesToAdd} action=add`);
    setSeriesToAdd("");
  };
  const removeSeries = (series: PlotSeries) => {
    if (spec.series.length <= 1) return;
    runPlotCommand(`plot-series ${currentPlotId} y=${series.y} action=remove`);
  };

  return (
    <div className="plot-config-window">
      <div className="plot-config-current">
        <span>Current plot</span>
        <strong>{spec.title}</strong>
      </div>
      <div className="plot-config-tabs" role="tablist" aria-label="Plot config sections">
        {[
          ["basic", "Basic"],
          ["axes", "Axes"],
          ["series", "Series"],
        ].map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab as PlotConfigTab)}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === "basic" ? (
        <div className="plot-config-section" role="tabpanel">
          <div className="plot-controls">
            <input
              aria-label="Plot title"
              className="plot-title-input"
              value={spec.title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <label>
              x
              <select
                aria-label="Plot x column"
                value={spec.x}
                onChange={(event) =>
                  runPlotCommand(
                    `plot-set ${currentPlotId} x=${event.target.value} axisX=${quoteArg(
                      event.target.value,
                    )}`,
                  )
                }
              >
                {dataset.columns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
            <div className="segmented">
              {(["x", "y", "xy"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={spec.zoomMode === mode ? "active" : ""}
                  onClick={() => setZoomMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <div className="plot-style-panel">
            <label>
              Type
              <select
                aria-label="Plot type"
                value={spec.plotType}
                onChange={(event) => setPlotType(event.target.value as PlotType)}
              >
                <option value="line">line</option>
                <option value="line-marker">line + marker</option>
                <option value="marker">marker</option>
              </select>
            </label>
            <label>
              <input
                aria-label="Grid x"
                type="checkbox"
                checked={spec.grid.x}
                onChange={(event) => setGrid("x", event.target.checked)}
              />
              Grid x
            </label>
            <label>
              <input
                aria-label="Grid y"
                type="checkbox"
                checked={spec.grid.y}
                onChange={(event) => setGrid("y", event.target.checked)}
              />
              Grid y
            </label>
            <label>
              <input
                aria-label="Plot border"
                type="checkbox"
                checked={spec.border}
                onChange={(event) => setBorder(event.target.checked)}
              />
              Border
            </label>
            <label>
              W
              <input
                aria-label="Plot width"
                type="number"
                min={120}
                max={4000}
                value={spec.size.width}
                onChange={(event) => setPlotSize({ width: Number(event.target.value) })}
              />
            </label>
            <label>
              H
              <input
                aria-label="Plot height"
                type="number"
                min={120}
                max={4000}
                value={spec.size.height}
                onChange={(event) => setPlotSize({ height: Number(event.target.value) })}
              />
            </label>
          </div>
        </div>
      ) : null}
      {activeTab === "axes" ? (
        <div className="plot-axis-panel plot-config-section" role="tabpanel">
          {(["x", "y"] as const).map((axis) => (
            <div key={axis} className="plot-axis-row">
              <strong>{axis}</strong>
              <input
                aria-label={`${axis} axis label`}
                value={spec.axes[axis].label}
                onChange={(event) => setAxis(axis, { label: event.target.value })}
              />
              <select
                aria-label={`${axis} range mode`}
                value={spec.axes[axis].range.mode}
                onChange={(event) =>
                  setAxis(axis, {
                    range:
                      event.target.value === "manual"
                        ? { mode: "manual", min: 0, max: 1 }
                        : { mode: "auto" },
                  })
                }
              >
                <option value="auto">auto range</option>
                <option value="manual">manual range</option>
              </select>
              <input
                aria-label={`${axis} range min`}
                type="number"
                disabled={spec.axes[axis].range.mode === "auto"}
                value={spec.axes[axis].range.min ?? ""}
                onChange={(event) =>
                  setAxis(axis, {
                    range: {
                      mode: "manual",
                      min: Number(event.target.value),
                      max: spec.axes[axis].range.max ?? 1,
                    },
                  })
                }
              />
              <input
                aria-label={`${axis} range max`}
                type="number"
                disabled={spec.axes[axis].range.mode === "auto"}
                value={spec.axes[axis].range.max ?? ""}
                onChange={(event) =>
                  setAxis(axis, {
                    range: {
                      mode: "manual",
                      min: spec.axes[axis].range.min ?? 0,
                      max: Number(event.target.value),
                    },
                  })
                }
              />
              <input
                aria-label={`${axis} tick interval`}
                type="number"
                min={0}
                value={spec.axes[axis].ticks.interval ?? ""}
                placeholder="auto"
                onChange={(event) =>
                  setAxis(axis, {
                    ticks:
                      event.target.value === ""
                        ? { mode: "auto", interval: undefined }
                        : { mode: "manual", interval: Number(event.target.value) },
                  })
                }
              />
              <select
                aria-label={`${axis} tick direction`}
                value={spec.axes[axis].ticks.orientation}
                onChange={(event) =>
                  setAxis(axis, {
                    ticks: {
                      orientation: event.target.value as PlotAxisSpec["ticks"]["orientation"],
                    },
                  })
                }
              >
                <option value="out">out</option>
                <option value="in">in</option>
                <option value="none">none</option>
              </select>
            </div>
          ))}
        </div>
      ) : null}
      {activeTab === "series" ? (
        <div className="plot-series-panel plot-config-section" role="tabpanel">
          {spec.series.map((series, index) => (
            <div key={`${series.y}-${index}`} className="plot-series-row">
              <span className="series-source">{series.y}</span>
              <input
                aria-label={`Label ${series.y}`}
                value={series.label}
                onChange={(event) => updateSeries(series, { label: event.target.value })}
              />
              <input
                aria-label={`Color ${series.y}`}
                type="color"
                value={series.color}
                onChange={(event) => updateSeries(series, { color: event.target.value })}
              />
              <input
                aria-label={`Line width ${series.y}`}
                type="number"
                min={0}
                value={series.lineWidth}
                onChange={(event) =>
                  updateSeries(series, { lineWidth: Number(event.target.value) })
                }
              />
              <input
                aria-label={`Marker size ${series.y}`}
                type="number"
                min={0}
                value={series.markerSize}
                onChange={(event) =>
                  updateSeries(series, { markerSize: Number(event.target.value) })
                }
              />
              <select
                aria-label={`Marker shape ${series.y}`}
                value={series.markerShape}
                onChange={(event) =>
                  updateSeries(series, { markerShape: event.target.value as PlotMarkerShape })
                }
              >
                <option value="circle">circle</option>
                <option value="square">square</option>
              </select>
              <button
                type="button"
                aria-label={`Remove ${series.y}`}
                disabled={spec.series.length <= 1}
                onClick={() => removeSeries(series)}
              >
                x
              </button>
            </div>
          ))}
          <div className="plot-series-add">
            <select
              aria-label="Add series"
              value={seriesToAdd}
              onChange={(event) => setSeriesToAdd(event.target.value)}
            >
              {availableSeriesColumns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
            <button type="button" disabled={!seriesToAdd} onClick={addSeries}>
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
