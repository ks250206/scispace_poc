import { useEffect, useMemo, useState } from "react";
import type { PlotAnnotation, PlotMarkerShape, PlotSeries, PlotType } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";
import { PlotConfigAxesTab } from "./plot-config/PlotConfigAxesTab";
import { PlotConfigBasicTab } from "./plot-config/PlotConfigBasicTab";
import { ConfigField, ConfigGroup } from "./plot-config/PlotConfigFields";
import {
  addAnnotationCommand,
  paddingToCommand,
  plotAxisCommand,
  plotGridCommand,
  plotSeriesActionCommand,
  plotSeriesStyleCommand,
  plotSetCommand,
  removeAnnotationCommand,
  updateAnnotationCommand,
} from "./plot-config/plotConfigCommands";
import {
  parseAnnotationDraft,
  parsePlotSizeDraft,
  plotSizeDraftFromSpec,
  type AnnotationDraft,
  type AxisPatch,
  type PlotConfigTab,
  type PlotSizeDraft,
} from "./plot-config/plotConfigModel";

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
  const [plotSizeDraft, setPlotSizeDraft] = useState<PlotSizeDraft>({ width: "", height: "" });
  const [annotationDraft, setAnnotationDraft] = useState<AnnotationDraft>({
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
    setPlotSizeDraft(plotSizeDraftFromSpec(spec.size));
  }, [spec?.size.height, spec?.size.width]);

  if (!spec || !dataset || !currentPlotId) {
    return <div className="empty-state">Select a plot window to edit its config.</div>;
  }

  const runPlotCommand = (command: string) => {
    void runScispace(command, { source: "gui" });
  };
  const setPlotType = (plotType: PlotType) =>
    runPlotCommand(plotSetCommand(currentPlotId, { type: plotType }));
  const setBorder = (border: boolean) => runPlotCommand(plotSetCommand(currentPlotId, { border }));
  const setTitle = (title: string) => runPlotCommand(plotSetCommand(currentPlotId, { title }));
  const setPlotSize = (patch: Partial<typeof spec.size>) => {
    const next = { ...spec.size, ...patch };
    runPlotCommand(plotSetCommand(currentPlotId, { width: next.width, height: next.height }));
  };
  const setPlotFont = (patch: Partial<typeof spec.font>) => {
    const next = { ...spec.font, ...patch };
    runPlotCommand(plotSetCommand(currentPlotId, { fontFamily: next.family, fontSize: next.size }));
  };
  const setPlotPadding = (patch: Partial<typeof spec.padding>) => {
    const next = { ...spec.padding, ...patch };
    runPlotCommand(plotSetCommand(currentPlotId, { padding: paddingToCommand(next) }));
  };
  const commitPlotSize = () => {
    const parsed = parsePlotSizeDraft(plotSizeDraft);
    if (!parsed || (parsed.width === spec.size.width && parsed.height === spec.size.height)) {
      setPlotSizeDraft(plotSizeDraftFromSpec(spec.size));
      return;
    }
    setPlotSize(parsed);
  };
  const setGrid = (axis: "x" | "y", value: boolean) =>
    runPlotCommand(plotGridCommand(currentPlotId, axis, value));
  const setAxis = (axis: "x" | "y", patch: AxisPatch) => {
    const next = {
      ...spec.axes[axis],
      ...patch,
      ticks: { ...spec.axes[axis].ticks, ...patch.ticks },
    };
    runPlotCommand(plotAxisCommand(currentPlotId, axis, next));
  };
  const updateSeries = (series: PlotSeries, patch: Partial<PlotSeries>) => {
    const next = { ...series, ...patch };
    runPlotCommand(plotSeriesStyleCommand(currentPlotId, next));
  };
  const addSeries = () => {
    if (!seriesToAdd) return;
    runPlotCommand(plotSeriesActionCommand(currentPlotId, seriesToAdd, "add"));
    setSeriesToAdd("");
  };
  const removeSeries = (series: PlotSeries) => {
    if (spec.series.length <= 1) return;
    runPlotCommand(plotSeriesActionCommand(currentPlotId, series.y, "remove"));
  };
  const addAnnotation = () => {
    const parsed = parseAnnotationDraft(annotationDraft);
    if (!parsed) return;
    runPlotCommand(addAnnotationCommand(currentPlotId, annotationDraft, parsed));
  };
  const updateAnnotation = (annotation: PlotAnnotation, patch: Partial<PlotAnnotation>) => {
    const next = { ...annotation, ...patch };
    runPlotCommand(updateAnnotationCommand(currentPlotId, next));
  };
  const removeAnnotation = (annotation: PlotAnnotation) => {
    runPlotCommand(removeAnnotationCommand(currentPlotId, annotation.id));
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
        <PlotConfigBasicTab
          currentPlotId={currentPlotId}
          dataset={dataset}
          spec={spec}
          plotSizeDraft={plotSizeDraft}
          onSetPlotSizeDraft={setPlotSizeDraft}
          onCommitPlotSize={commitPlotSize}
          onRunPlotCommand={runPlotCommand}
          onSetTitle={setTitle}
          onSetPlotType={setPlotType}
          onSetGrid={setGrid}
          onSetBorder={setBorder}
          onSetPlotFont={setPlotFont}
          onSetPlotPadding={setPlotPadding}
        />
      ) : null}
      {activeTab === "axes" ? <PlotConfigAxesTab spec={spec} onSetAxis={setAxis} /> : null}
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
