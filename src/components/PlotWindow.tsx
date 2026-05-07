import { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { PlotAxisSpec } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";

interface PlotWindowProps {
  plotId: string;
}

export function PlotWindow({ plotId }: PlotWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const spec = useScispaceStore((state) => state.plotSpecs.find((item) => item.id === plotId));
  const dataset = useScispaceStore((state) =>
    state.datasets.find((item) => item.id === spec?.source),
  );
  const openPlotConfig = useScispaceStore((state) => state.openPlotConfig);

  const plotData = useMemo(() => {
    if (!dataset || !spec) return undefined;
    const x = dataset.rows.map((row, index) => Number(row[spec.x] ?? index));
    const seriesData = spec.series.map((series) =>
      dataset.rows.map((row) => Number(row[series.y] ?? 0)),
    );
    return [x, ...seriesData] as uPlot.AlignedData;
  }, [dataset, spec]);

  useEffect(() => {
    if (!containerRef.current || !plotData || !spec) return;
    plotRef.current?.destroy();

    const xRange = spec.axes.x.range;
    const yRange = spec.axes.y.range;
    const axisOptions = (axis: PlotAxisSpec, grid: boolean) => ({
      label: axis.label,
      grid: { show: grid },
      border: { show: spec.border },
      ticks: {
        show: axis.ticks.orientation !== "none",
        size: axis.ticks.orientation === "in" ? -6 : 6,
      },
      incrs:
        axis.ticks.mode === "manual" && axis.ticks.interval ? [axis.ticks.interval] : undefined,
    });
    plotRef.current = new uPlot(
      {
        width: spec.size.width,
        height: spec.size.height,
        title: spec.title,
        cursor: { drag: { x: spec.zoomMode !== "y", y: spec.zoomMode !== "x" } },
        scales: {
          x: {
            time: false,
            min: xRange.mode === "manual" ? xRange.min : undefined,
            max: xRange.mode === "manual" ? xRange.max : undefined,
          },
          y: {
            min: yRange.mode === "manual" ? yRange.min : undefined,
            max: yRange.mode === "manual" ? yRange.max : undefined,
          },
        },
        axes: [axisOptions(spec.axes.x, spec.grid.x), axisOptions(spec.axes.y, spec.grid.y)],
        series: [
          { label: spec.x },
          ...spec.series.map((series) => ({
            label: series.label,
            stroke: series.color,
            width: spec.plotType === "marker" ? 0 : series.lineWidth,
            points: {
              show: spec.plotType !== "line",
              size: series.markerSize,
            },
          })),
        ],
      },
      plotData,
      containerRef.current,
    );

    return () => plotRef.current?.destroy();
  }, [plotData, spec]);

  if (!spec || !dataset) return <div className="empty-state">Plot source not found.</div>;

  return (
    <div className="plot-window">
      <div className="plot-window-toolbar">
        <div className="plot-window-summary">
          <strong>{spec.title}</strong>
          <span>
            {dataset.name} / x={spec.x} / {spec.series.length} series
          </span>
        </div>
        <button type="button" onClick={() => openPlotConfig(plotId)}>
          Config
        </button>
      </div>
      <div ref={containerRef} className="plot-host" style={{ width: spec.size.width }} />
    </div>
  );
}
