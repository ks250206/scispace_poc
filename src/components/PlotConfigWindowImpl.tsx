import { useEffect, useMemo, useRef, useState } from "react";
import type { PlotAnnotation, PlotSeries, PlotType } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";
import { PlotConfigAnnotationsTab } from "./plot-config/PlotConfigAnnotationsTab";
import { PlotConfigAxesTab } from "./plot-config/PlotConfigAxesTab";
import { PlotConfigBasicTab } from "./plot-config/PlotConfigBasicTab";
import { PlotConfigSeriesTab } from "./plot-config/PlotConfigSeriesTab";
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
  const commandSequence = useRef(0);
  const [commandError, setCommandError] = useState<{ plotId: string; message: string }>();
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
    const sequence = ++commandSequence.current;
    void runScispace(command, { source: "gui" }).then((result) => {
      if (sequence !== commandSequence.current) return;
      setCommandError(
        result.kind === "error" ? { plotId: currentPlotId, message: result.output } : undefined,
      );
    });
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
      {commandError?.plotId === currentPlotId ? (
        <div className="plot-config-error" role="alert">
          {commandError.message}
        </div>
      ) : null}
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
        <PlotConfigSeriesTab
          spec={spec}
          availableSeriesColumns={availableSeriesColumns}
          seriesToAdd={seriesToAdd}
          onSetSeriesToAdd={setSeriesToAdd}
          onAddSeries={addSeries}
          onUpdateSeries={updateSeries}
          onRemoveSeries={removeSeries}
        />
      ) : null}
      {activeTab === "annotations" ? (
        <PlotConfigAnnotationsTab
          spec={spec}
          annotationDraft={annotationDraft}
          onSetAnnotationDraft={setAnnotationDraft}
          onAddAnnotation={addAnnotation}
          onUpdateAnnotation={updateAnnotation}
          onRemoveAnnotation={removeAnnotation}
        />
      ) : null}
    </div>
  );
}
