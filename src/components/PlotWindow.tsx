import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { PlotSeries, PlotZoomMode } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";

interface PlotWindowProps {
  plotId: string;
}

export function PlotWindow({ plotId }: PlotWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const [seriesToAdd, setSeriesToAdd] = useState("");
  const spec = useScispaceStore((state) => state.plotSpecs.find((item) => item.id === plotId));
  const dataset = useScispaceStore((state) =>
    state.datasets.find((item) => item.id === spec?.source),
  );
  const updatePlotSpec = useScispaceStore((state) => state.updatePlotSpec);

  const plotData = useMemo(() => {
    if (!dataset || !spec) return undefined;
    const x = dataset.rows.map((row, index) => Number(row[spec.x] ?? index));
    const seriesData = spec.series.map((series) =>
      dataset.rows.map((row) => Number(row[series.y] ?? 0)),
    );
    return [x, ...seriesData] as uPlot.AlignedData;
  }, [dataset, spec]);

  const availableSeriesColumns = useMemo(() => {
    if (!dataset || !spec) return [];
    const activeColumns = new Set(spec.series.map((series) => series.y));
    return dataset.columns.filter((column) => column !== spec.x && !activeColumns.has(column));
  }, [dataset, spec]);

  useEffect(() => {
    if (!containerRef.current || !plotData || !spec) return;
    plotRef.current?.destroy();

    const bounds = containerRef.current.getBoundingClientRect();
    plotRef.current = new uPlot(
      {
        width: Math.max(320, bounds.width),
        height: Math.max(220, bounds.height),
        title: spec.title,
        cursor: { drag: { x: spec.zoomMode !== "y", y: spec.zoomMode !== "x" } },
        scales: { x: { time: false } },
        axes: [
          { label: spec.axisLabels?.x ?? spec.x },
          { label: spec.axisLabels?.y ?? spec.series.map((series) => series.label).join(", ") },
        ],
        series: [
          { label: spec.x },
          ...spec.series.map((series) => ({
            label: series.label,
            stroke: series.color,
            width: 2,
          })),
        ],
      },
      plotData,
      containerRef.current,
    );

    return () => plotRef.current?.destroy();
  }, [plotData, spec]);

  useEffect(() => {
    if (availableSeriesColumns.length === 0) {
      if (seriesToAdd) setSeriesToAdd("");
      return;
    }
    if (!availableSeriesColumns.includes(seriesToAdd)) {
      setSeriesToAdd(availableSeriesColumns[0] ?? "");
    }
  }, [availableSeriesColumns, seriesToAdd]);

  if (!spec || !dataset) return <div className="empty-state">Plot source not found.</div>;

  const setZoomMode = (zoomMode: PlotZoomMode) => updatePlotSpec(plotId, { zoomMode });
  const updateSeries = (index: number, patch: Partial<PlotSeries>) => {
    updatePlotSpec(plotId, {
      series: spec.series.map((series, seriesIndex) =>
        seriesIndex === index ? { ...series, ...patch } : series,
      ),
    });
  };
  const addSeries = () => {
    if (!seriesToAdd) return;
    updatePlotSpec(plotId, {
      series: [
        ...spec.series,
        {
          y: seriesToAdd,
          label: seriesToAdd,
          color:
            ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"][spec.series.length % 5] ??
            "#2563eb",
        },
      ],
      axisLabels: {
        ...spec.axisLabels,
        y: [...spec.series.map((series) => series.label), seriesToAdd].join(", "),
      },
    });
    setSeriesToAdd("");
  };
  const removeSeries = (index: number) => {
    if (spec.series.length <= 1) return;
    updatePlotSpec(plotId, {
      series: spec.series.filter((_, seriesIndex) => seriesIndex !== index),
    });
  };

  return (
    <div className="plot-window">
      <div className="plot-controls">
        <input
          aria-label="Plot title"
          className="plot-title-input"
          value={spec.title}
          onChange={(event) => updatePlotSpec(plotId, { title: event.target.value })}
        />
        <label>
          x
          <select
            aria-label="Plot x column"
            value={spec.x}
            onChange={(event) =>
              updatePlotSpec(plotId, {
                x: event.target.value,
                axisLabels: { ...spec.axisLabels, x: event.target.value },
              })
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
      <div className="plot-series-panel">
        {spec.series.map((series, index) => (
          <div key={`${series.y}-${index}`} className="plot-series-row">
            <span className="series-source">{series.y}</span>
            <input
              aria-label={`Label ${series.y}`}
              value={series.label}
              onChange={(event) => updateSeries(index, { label: event.target.value })}
            />
            <input
              aria-label={`Color ${series.y}`}
              type="color"
              value={series.color}
              onChange={(event) => updateSeries(index, { color: event.target.value })}
            />
            <button
              type="button"
              aria-label={`Remove ${series.y}`}
              disabled={spec.series.length <= 1}
              onClick={() => removeSeries(index)}
            >
              ×
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
      <div ref={containerRef} className="plot-host" />
    </div>
  );
}
