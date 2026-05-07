import { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { PlotAxisSpec } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";

interface PlotWindowProps {
  plotId: string;
}

const zoomAxisFromDrag = (width: number, height: number): "x" | "y" | "xy" | undefined => {
  const minDrag = 8;
  if (width < minDrag && height < minDrag) return undefined;
  if (width >= 24 && height >= 24) return "xy";
  return width >= height ? "x" : "y";
};

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
        cursor: { drag: { x: false, y: false, setScale: false } },
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

    const plot = plotRef.current;
    let dragStart: { left: number; top: number } | undefined;
    const clampPosition = (position: { left: number; top: number }) => {
      plot.syncRect(false);
      const rect = plot.rect;
      return {
        left: Math.max(0, Math.min(rect.width, position.left)),
        top: Math.max(0, Math.min(rect.height, position.top)),
      };
    };
    const positionFromEvent = (event: MouseEvent) => {
      plot.syncRect(false);
      const rect = plot.rect;
      return {
        left: event.clientX - rect.left,
        top: event.clientY - rect.top,
      };
    };
    const updateSelection = (position: { left: number; top: number }) => {
      if (!dragStart) return;
      const start = clampPosition(dragStart);
      const end = clampPosition(position);
      plot.setSelect(
        {
          left: Math.min(start.left, end.left),
          top: Math.min(start.top, end.top),
          width: Math.abs(end.left - start.left),
          height: Math.abs(end.top - start.top),
        },
        false,
      );
    };
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragStart) return;
      event.preventDefault();
      updateSelection(positionFromEvent(event));
    };
    const handleMouseUp = (event: MouseEvent) => {
      if (!dragStart) return;
      event.preventDefault();
      const start = dragStart;
      const end = positionFromEvent(event);
      updateSelection(end);
      const width = Math.abs(end.left - start.left);
      const height = Math.abs(end.top - start.top);
      const zoomAxis = zoomAxisFromDrag(width, height);
      if (zoomAxis) {
        plot.batch(() => {
          if (zoomAxis === "x" || zoomAxis === "xy") {
            plot.setScale("x", {
              min: plot.posToVal(Math.min(start.left, end.left), "x"),
              max: plot.posToVal(Math.max(start.left, end.left), "x"),
            });
          }
          if (zoomAxis === "y" || zoomAxis === "xy") {
            plot.setScale("y", {
              min: plot.posToVal(Math.max(start.top, end.top), "y"),
              max: plot.posToVal(Math.min(start.top, end.top), "y"),
            });
          }
        });
      }
      plot.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
      dragStart = undefined;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dragStart = positionFromEvent(event);
      plot.setSelect({ left: dragStart.left, top: dragStart.top, width: 0, height: 0 }, false);
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    };
    plot.over.addEventListener("mousedown", handleMouseDown, { capture: true });

    return () => {
      plot.over.removeEventListener("mousedown", handleMouseDown, { capture: true });
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      plot.destroy();
    };
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
