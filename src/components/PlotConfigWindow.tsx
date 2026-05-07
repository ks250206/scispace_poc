import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  PlotAnnotation,
  PlotAxisSpec,
  PlotMarkerShape,
  PlotSeries,
  PlotType,
} from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";

type AxisPatch = Omit<Partial<PlotAxisSpec>, "ticks"> & {
  ticks?: Partial<PlotAxisSpec["ticks"]>;
};

type PlotConfigTab = "basic" | "axes" | "series" | "annotations";

interface ConfigGroupProps {
  title: string;
  children: ReactNode;
}

interface ConfigFieldProps {
  label: string;
  children: ReactNode;
  compact?: boolean;
}

const quoteArg = (value: string): string =>
  /[\s=]/.test(value) ? `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"` : value;

const rangeToCommand = (range: PlotAxisSpec["range"]): string =>
  range.mode === "manual" ? `${range.min}:${range.max}` : "auto";

const tickToCommand = (ticks: PlotAxisSpec["ticks"]): string =>
  ticks.mode === "manual" && ticks.interval ? String(ticks.interval) : "auto";

const paddingToCommand = (padding: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}): string => `${padding.top}:${padding.right}:${padding.bottom}:${padding.left}`;

function ConfigGroup({ title, children }: ConfigGroupProps) {
  return (
    <section className="plot-config-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function ConfigField({ label, children, compact = false }: ConfigFieldProps) {
  return (
    <label className={compact ? "plot-config-field compact" : "plot-config-field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

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
  const [plotSizeDraft, setPlotSizeDraft] = useState({ width: "", height: "" });
  const [annotationDraft, setAnnotationDraft] = useState({
    text: "Annotation",
    x: "1",
    y: "1",
    dx: "24",
    dy: "-24",
  });

  const availableSeriesColumns = useMemo(() => {
    if (!dataset || !spec) return [];
    const activeColumns = new Set(spec.series.map((series) => series.y));
    return dataset.columns.filter(
      (column) => column.id !== spec.x && !activeColumns.has(column.id),
    );
  }, [dataset, spec]);

  useEffect(() => {
    if (availableSeriesColumns.length === 0) {
      if (seriesToAdd) setSeriesToAdd("");
      return;
    }
    if (!availableSeriesColumns.some((column) => column.id === seriesToAdd)) {
      setSeriesToAdd(availableSeriesColumns[0]?.id ?? "");
    }
  }, [availableSeriesColumns, seriesToAdd]);

  useEffect(() => {
    if (!spec) return;
    setPlotSizeDraft({
      width: String(spec.size.width),
      height: String(spec.size.height),
    });
  }, [spec?.size.height, spec?.size.width]);

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
  const setTitle = (title: string) =>
    runPlotCommand(`plot-set ${currentPlotId} title=${quoteArg(title)}`);
  const setPlotSize = (patch: Partial<typeof spec.size>) => {
    const next = { ...spec.size, ...patch };
    runPlotCommand(`plot-set ${currentPlotId} width=${next.width} height=${next.height}`);
  };
  const setPlotFont = (patch: Partial<typeof spec.font>) => {
    const next = { ...spec.font, ...patch };
    runPlotCommand(
      `plot-set ${currentPlotId} fontFamily=${quoteArg(next.family)} fontSize=${next.size}`,
    );
  };
  const setPlotPadding = (patch: Partial<typeof spec.padding>) => {
    const next = { ...spec.padding, ...patch };
    runPlotCommand(`plot-set ${currentPlotId} padding=${paddingToCommand(next)}`);
  };
  const commitPlotSize = () => {
    const width = Number(plotSizeDraft.width);
    const height = Number(plotSizeDraft.height);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      (width === spec.size.width && height === spec.size.height)
    ) {
      setPlotSizeDraft({ width: String(spec.size.width), height: String(spec.size.height) });
      return;
    }
    setPlotSize({ width, height });
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
      } scale=${next.scale} labelFontFamily=${quoteArg(next.labelStyle.family)} labelFontSize=${
        next.labelStyle.size
      } valueFontFamily=${quoteArg(next.valueStyle.family)} valueFontSize=${
        next.valueStyle.size
      } size=${next.size} gap=${next.gap} labelGap=${next.labelGap} labelSize=${
        next.labelSize
      } color=${next.color} gridColor=${next.gridColor} tickColor=${next.tickColor} tickLength=${
        next.ticks.length
      } minorTick=${next.ticks.minor}`,
    );
  };
  const updateSeries = (series: PlotSeries, patch: Partial<PlotSeries>) => {
    const next = { ...series, ...patch };
    runPlotCommand(
      `plot-series ${currentPlotId} y=${next.y} label=${quoteArg(next.label)} color=${next.color} lineWidth=${
        next.lineWidth
      } markerSize=${next.markerSize} markerShape=${next.markerShape} order=${next.drawOrder}`,
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
  const addAnnotation = () => {
    const x = Number(annotationDraft.x);
    const y = Number(annotationDraft.y);
    const dx = Number(annotationDraft.dx);
    const dy = Number(annotationDraft.dy);
    if (![x, y, dx, dy].every(Number.isFinite)) return;
    runPlotCommand(
      `plot-annotation ${currentPlotId} action=add type=text-arrow text=${quoteArg(
        annotationDraft.text,
      )} x=${x} y=${y} dx=${dx} dy=${dy}`,
    );
  };
  const updateAnnotation = (annotation: PlotAnnotation, patch: Partial<PlotAnnotation>) => {
    const next = { ...annotation, ...patch };
    runPlotCommand(
      `plot-annotation ${currentPlotId} action=update id=${next.id} text=${quoteArg(
        next.text,
      )} x=${next.x} y=${next.y} dx=${next.dx} dy=${next.dy} color=${next.color} fontFamily=${quoteArg(
        next.font.family,
      )} fontSize=${next.font.size}`,
    );
  };
  const removeAnnotation = (annotation: PlotAnnotation) => {
    runPlotCommand(`plot-annotation ${currentPlotId} action=remove id=${annotation.id}`);
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
          ["annotations", "Annotations"],
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
          <div className="plot-config-groups">
            <ConfigGroup title="Data">
              <div className="plot-field-grid two">
                <ConfigField label="Title">
                  <input
                    aria-label="Plot title"
                    className="plot-title-input"
                    value={spec.title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </ConfigField>
                <ConfigField label="X column">
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
                      <option key={column.id} value={column.id}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                </ConfigField>
              </div>
            </ConfigGroup>

            <ConfigGroup title="Appearance">
              <div className="plot-field-grid three">
                <ConfigField label="Type">
                  <select
                    aria-label="Plot type"
                    value={spec.plotType}
                    onChange={(event) => setPlotType(event.target.value as PlotType)}
                  >
                    <option value="line">line</option>
                    <option value="line-marker">line + marker</option>
                    <option value="marker">marker</option>
                  </select>
                </ConfigField>
                <label className="plot-config-check">
                  <input
                    aria-label="Grid x"
                    type="checkbox"
                    checked={spec.grid.x}
                    onChange={(event) => setGrid("x", event.target.checked)}
                  />
                  <span>Grid x</span>
                </label>
                <label className="plot-config-check">
                  <input
                    aria-label="Grid y"
                    type="checkbox"
                    checked={spec.grid.y}
                    onChange={(event) => setGrid("y", event.target.checked)}
                  />
                  <span>Grid y</span>
                </label>
                <label className="plot-config-check">
                  <input
                    aria-label="Plot border"
                    type="checkbox"
                    checked={spec.border}
                    onChange={(event) => setBorder(event.target.checked)}
                  />
                  <span>Border</span>
                </label>
              </div>
            </ConfigGroup>

            <ConfigGroup title="Size">
              <div className="plot-field-grid four">
                <ConfigField label="Width" compact>
                  <input
                    aria-label="Plot width"
                    type="number"
                    min={120}
                    max={4000}
                    value={plotSizeDraft.width}
                    onChange={(event) =>
                      setPlotSizeDraft((current) => ({ ...current, width: event.target.value }))
                    }
                    onBlur={commitPlotSize}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") {
                        setPlotSizeDraft({
                          width: String(spec.size.width),
                          height: String(spec.size.height),
                        });
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </ConfigField>
                <ConfigField label="Height" compact>
                  <input
                    aria-label="Plot height"
                    type="number"
                    min={120}
                    max={4000}
                    value={plotSizeDraft.height}
                    onChange={(event) =>
                      setPlotSizeDraft((current) => ({ ...current, height: event.target.value }))
                    }
                    onBlur={commitPlotSize}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") {
                        setPlotSizeDraft({
                          width: String(spec.size.width),
                          height: String(spec.size.height),
                        });
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </ConfigField>
              </div>
            </ConfigGroup>

            <ConfigGroup title="Typography">
              <div className="plot-field-grid two">
                <ConfigField label="Font family">
                  <input
                    aria-label="Plot font family"
                    value={spec.font.family}
                    onChange={(event) => setPlotFont({ family: event.target.value })}
                  />
                </ConfigField>
                <ConfigField label="Font size" compact>
                  <input
                    aria-label="Plot font size"
                    type="number"
                    min={1}
                    value={spec.font.size}
                    onChange={(event) => setPlotFont({ size: Number(event.target.value) })}
                  />
                </ConfigField>
              </div>
            </ConfigGroup>

            <ConfigGroup title="Plot Padding">
              <div className="plot-field-grid four">
                {(["top", "right", "bottom", "left"] as const).map((side) => (
                  <ConfigField key={side} label={side} compact>
                    <input
                      aria-label={`Plot padding ${side}`}
                      type="number"
                      min={0}
                      value={spec.padding[side]}
                      onChange={(event) => setPlotPadding({ [side]: Number(event.target.value) })}
                    />
                  </ConfigField>
                ))}
              </div>
            </ConfigGroup>
          </div>
        </div>
      ) : null}
      {activeTab === "axes" ? (
        <div className="plot-axis-panel plot-config-section" role="tabpanel">
          {(["x", "y"] as const).map((axis) => (
            <ConfigGroup key={axis} title={`${axis.toUpperCase()} Axis`}>
              <div className="plot-field-grid two">
                <ConfigField label="Label">
                  <input
                    aria-label={`${axis} axis label`}
                    value={spec.axes[axis].label}
                    onChange={(event) => setAxis(axis, { label: event.target.value })}
                  />
                </ConfigField>
                <ConfigField label="Scale">
                  <select
                    aria-label={`${axis} scale`}
                    value={spec.axes[axis].scale}
                    onChange={(event) =>
                      setAxis(axis, { scale: event.target.value as PlotAxisSpec["scale"] })
                    }
                  >
                    <option value="linear">linear</option>
                    <option value="log">log</option>
                  </select>
                </ConfigField>
              </div>

              <div className="plot-subgroup-title">Range</div>
              <div className="plot-field-grid four">
                <ConfigField label="Mode">
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
                </ConfigField>
                <ConfigField label="Min" compact>
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
                </ConfigField>
                <ConfigField label="Max" compact>
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
                </ConfigField>
              </div>

              <div className="plot-subgroup-title">Ticks</div>
              <div className="plot-field-grid four">
                <ConfigField label="Interval" compact>
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
                </ConfigField>
                <ConfigField label="Direction">
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
                </ConfigField>
                <ConfigField label="Length" compact>
                  <input
                    aria-label={`${axis} tick length`}
                    type="number"
                    min={0}
                    value={spec.axes[axis].ticks.length}
                    onChange={(event) =>
                      setAxis(axis, { ticks: { length: Number(event.target.value) } })
                    }
                  />
                </ConfigField>
                <label className="plot-config-check">
                  <input
                    aria-label={`${axis} minor tick`}
                    type="checkbox"
                    checked={spec.axes[axis].ticks.minor}
                    onChange={(event) => setAxis(axis, { ticks: { minor: event.target.checked } })}
                  />
                  <span>Minor tick</span>
                </label>
              </div>

              <div className="plot-subgroup-title">Typography</div>
              <div className="plot-field-grid two">
                <ConfigField label="Label font">
                  <input
                    aria-label={`${axis} label font family`}
                    value={spec.axes[axis].labelStyle.family}
                    onChange={(event) =>
                      setAxis(axis, {
                        labelStyle: { ...spec.axes[axis].labelStyle, family: event.target.value },
                      })
                    }
                  />
                </ConfigField>
                <ConfigField label="Label size" compact>
                  <input
                    aria-label={`${axis} label font size`}
                    type="number"
                    min={1}
                    value={spec.axes[axis].labelStyle.size}
                    onChange={(event) =>
                      setAxis(axis, {
                        labelStyle: {
                          ...spec.axes[axis].labelStyle,
                          size: Number(event.target.value),
                        },
                      })
                    }
                  />
                </ConfigField>
                <ConfigField label="Tick font">
                  <input
                    aria-label={`${axis} value font family`}
                    value={spec.axes[axis].valueStyle.family}
                    onChange={(event) =>
                      setAxis(axis, {
                        valueStyle: { ...spec.axes[axis].valueStyle, family: event.target.value },
                      })
                    }
                  />
                </ConfigField>
                <ConfigField label="Tick size" compact>
                  <input
                    aria-label={`${axis} value font size`}
                    type="number"
                    min={1}
                    value={spec.axes[axis].valueStyle.size}
                    onChange={(event) =>
                      setAxis(axis, {
                        valueStyle: {
                          ...spec.axes[axis].valueStyle,
                          size: Number(event.target.value),
                        },
                      })
                    }
                  />
                </ConfigField>
              </div>

              <div className="plot-subgroup-title">Layout</div>
              <div className="plot-field-grid four">
                <ConfigField label="Axis size" compact>
                  <input
                    aria-label={`${axis} axis size`}
                    type="number"
                    min={1}
                    value={spec.axes[axis].size}
                    onChange={(event) => setAxis(axis, { size: Number(event.target.value) })}
                  />
                </ConfigField>
                <ConfigField label="Axis gap" compact>
                  <input
                    aria-label={`${axis} axis gap`}
                    type="number"
                    min={0}
                    value={spec.axes[axis].gap}
                    onChange={(event) => setAxis(axis, { gap: Number(event.target.value) })}
                  />
                </ConfigField>
                <ConfigField label="Label gap" compact>
                  <input
                    aria-label={`${axis} label gap`}
                    type="number"
                    min={0}
                    value={spec.axes[axis].labelGap}
                    onChange={(event) => setAxis(axis, { labelGap: Number(event.target.value) })}
                  />
                </ConfigField>
                <ConfigField label="Label size" compact>
                  <input
                    aria-label={`${axis} label size`}
                    type="number"
                    min={1}
                    value={spec.axes[axis].labelSize}
                    onChange={(event) => setAxis(axis, { labelSize: Number(event.target.value) })}
                  />
                </ConfigField>
              </div>

              <div className="plot-subgroup-title">Colors</div>
              <div className="plot-field-grid three">
                <ConfigField label="Axis color" compact>
                  <input
                    aria-label={`${axis} axis color`}
                    type="color"
                    value={spec.axes[axis].color}
                    onChange={(event) => setAxis(axis, { color: event.target.value })}
                  />
                </ConfigField>
                <ConfigField label="Grid color" compact>
                  <input
                    aria-label={`${axis} grid color`}
                    type="color"
                    value={spec.axes[axis].gridColor}
                    onChange={(event) => setAxis(axis, { gridColor: event.target.value })}
                  />
                </ConfigField>
                <ConfigField label="Tick color" compact>
                  <input
                    aria-label={`${axis} tick color`}
                    type="color"
                    value={spec.axes[axis].tickColor}
                    onChange={(event) => setAxis(axis, { tickColor: event.target.value })}
                  />
                </ConfigField>
              </div>
            </ConfigGroup>
          ))}
        </div>
      ) : null}
      {activeTab === "series" ? (
        <div className="plot-series-panel plot-config-section" role="tabpanel">
          <ConfigGroup title="Add Trace">
            <div className="plot-field-grid two">
              <ConfigField label="Y column">
                <select
                  aria-label="Add series"
                  value={seriesToAdd}
                  onChange={(event) => setSeriesToAdd(event.target.value)}
                >
                  {availableSeriesColumns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </ConfigField>
              <button
                className="plot-config-command"
                type="button"
                disabled={!seriesToAdd}
                onClick={addSeries}
              >
                Add
              </button>
            </div>
          </ConfigGroup>
          {spec.series.map((series, index) => (
            <ConfigGroup key={`${series.y}-${index}`} title={`Trace: ${series.y}`}>
              <div className="plot-field-grid three">
                <ConfigField label="Label">
                  <input
                    aria-label={`Label ${series.y}`}
                    value={series.label}
                    onChange={(event) => updateSeries(series, { label: event.target.value })}
                  />
                </ConfigField>
                <ConfigField label="Color" compact>
                  <input
                    aria-label={`Color ${series.y}`}
                    type="color"
                    value={series.color}
                    onChange={(event) => updateSeries(series, { color: event.target.value })}
                  />
                </ConfigField>
                <ConfigField label="Draw order" compact>
                  <input
                    aria-label={`Draw order ${series.y}`}
                    type="number"
                    value={series.drawOrder}
                    onChange={(event) =>
                      updateSeries(series, { drawOrder: Number(event.target.value) })
                    }
                  />
                </ConfigField>
              </div>
              <div className="plot-subgroup-title">Line and Marker</div>
              <div className="plot-field-grid four">
                <ConfigField label="Line width" compact>
                  <input
                    aria-label={`Line width ${series.y}`}
                    type="number"
                    min={0}
                    value={series.lineWidth}
                    onChange={(event) =>
                      updateSeries(series, { lineWidth: Number(event.target.value) })
                    }
                  />
                </ConfigField>
                <ConfigField label="Marker size" compact>
                  <input
                    aria-label={`Marker size ${series.y}`}
                    type="number"
                    min={0}
                    value={series.markerSize}
                    onChange={(event) =>
                      updateSeries(series, { markerSize: Number(event.target.value) })
                    }
                  />
                </ConfigField>
                <ConfigField label="Marker shape">
                  <select
                    aria-label={`Marker shape ${series.y}`}
                    value={series.markerShape}
                    onChange={(event) =>
                      updateSeries(series, { markerShape: event.target.value as PlotMarkerShape })
                    }
                  >
                    <option value="circle">circle</option>
                    <option value="square">square</option>
                    <option value="triangle">triangle</option>
                    <option value="diamond">diamond</option>
                    <option value="cross">cross</option>
                    <option value="plus">plus</option>
                  </select>
                </ConfigField>
                <button
                  className="plot-config-command danger"
                  type="button"
                  aria-label={`Remove ${series.y}`}
                  disabled={spec.series.length <= 1}
                  onClick={() => removeSeries(series)}
                >
                  Remove
                </button>
              </div>
            </ConfigGroup>
          ))}
        </div>
      ) : null}
      {activeTab === "annotations" ? (
        <div className="plot-annotation-panel plot-config-section" role="tabpanel">
          <ConfigGroup title="Add Text Arrow">
            <div className="plot-field-grid two">
              <ConfigField label="Text">
                <input
                  aria-label="Annotation text"
                  value={annotationDraft.text}
                  onChange={(event) =>
                    setAnnotationDraft((current) => ({ ...current, text: event.target.value }))
                  }
                />
              </ConfigField>
              <button className="plot-config-command" type="button" onClick={addAnnotation}>
                Add annotation
              </button>
            </div>
            <div className="plot-subgroup-title">Position</div>
            <div className="plot-field-grid four">
              {(["x", "y", "dx", "dy"] as const).map((field) => (
                <ConfigField key={field} label={field} compact>
                  <input
                    aria-label={`Annotation ${field}`}
                    type="number"
                    value={annotationDraft[field]}
                    onChange={(event) =>
                      setAnnotationDraft((current) => ({ ...current, [field]: event.target.value }))
                    }
                  />
                </ConfigField>
              ))}
            </div>
          </ConfigGroup>
          {spec.annotations.map((annotation) => (
            <ConfigGroup key={annotation.id} title={`Annotation: ${annotation.text}`}>
              <div className="plot-field-grid three">
                <ConfigField label="Text">
                  <input
                    aria-label={`Annotation label ${annotation.id}`}
                    value={annotation.text}
                    onChange={(event) => updateAnnotation(annotation, { text: event.target.value })}
                  />
                </ConfigField>
                <ConfigField label="Color" compact>
                  <input
                    aria-label={`Annotation color ${annotation.id}`}
                    type="color"
                    value={annotation.color}
                    onChange={(event) =>
                      updateAnnotation(annotation, { color: event.target.value })
                    }
                  />
                </ConfigField>
                <button
                  className="plot-config-command danger"
                  type="button"
                  aria-label={`Remove annotation ${annotation.id}`}
                  onClick={() => removeAnnotation(annotation)}
                >
                  Remove
                </button>
              </div>
              <div className="plot-subgroup-title">Typography</div>
              <div className="plot-field-grid two">
                <ConfigField label="Font family">
                  <input
                    aria-label={`Annotation font family ${annotation.id}`}
                    value={annotation.font.family}
                    onChange={(event) =>
                      updateAnnotation(annotation, {
                        font: { ...annotation.font, family: event.target.value },
                      })
                    }
                  />
                </ConfigField>
                <ConfigField label="Font size" compact>
                  <input
                    aria-label={`Annotation font size ${annotation.id}`}
                    type="number"
                    min={1}
                    value={annotation.font.size}
                    onChange={(event) =>
                      updateAnnotation(annotation, {
                        font: { ...annotation.font, size: Number(event.target.value) },
                      })
                    }
                  />
                </ConfigField>
              </div>
            </ConfigGroup>
          ))}
        </div>
      ) : null}
    </div>
  );
}
