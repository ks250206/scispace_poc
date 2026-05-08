import { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useScispaceStore } from "../store/scispaceStore";
import {
  buildPlotOptions,
  plotPositionFromClient,
  plotRenderScale,
  plotSizeFromRenderedRect,
  scalePlotSpecForRender,
  sortedPlotSeries,
  xAxisLabelHeight,
} from "./plotRendering";

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
  const workspaceScale = useScispaceStore((state) => state.viewport.scale);
  const dataset = useScispaceStore((state) =>
    state.datasets.find((item) => item.id === spec?.source),
  );
  const openPlotConfig = useScispaceStore((state) => state.openPlotConfig);

  const plotData = useMemo(() => {
    if (!dataset || !spec) return undefined;
    const x = dataset.rows.map((row, index) => Number(row[spec.x] ?? index));
    const seriesData = sortedPlotSeries(spec.series).map((series) =>
      dataset.rows.map((row) => Number(row[series.y] ?? 0)),
    );
    return [x, ...seriesData] as uPlot.AlignedData;
  }, [dataset, spec]);

  useEffect(() => {
    if (!containerRef.current || !plotData || !spec) return;
    plotRef.current?.destroy();

    const renderScale = plotRenderScale(workspaceScale);
    const renderSpec = scalePlotSpecForRender(spec, renderScale);
    const plotHeight = Math.max(160, renderSpec.size.height - xAxisLabelHeight * renderScale);
    plotRef.current = new uPlot(
      buildPlotOptions(renderSpec, plotHeight),
      plotData,
      containerRef.current,
    );

    const plot = plotRef.current;
    plot.root.style.transform = `scale(${1 / renderScale})`;
    plot.root.style.transformOrigin = "0 0";
    let dragStart: { left: number; top: number } | undefined;
    const clampPosition = (position: { left: number; top: number }) => {
      plot.syncRect(false);
      const rect = plot.rect;
      const size = plotSizeFromRenderedRect(rect, workspaceScale, renderScale);
      return {
        left: Math.max(0, Math.min(size.width, position.left)),
        top: Math.max(0, Math.min(size.height, position.top)),
      };
    };
    const positionFromEvent = (event: MouseEvent) => {
      plot.syncRect(false);
      const rect = plot.rect;
      return plotPositionFromClient(
        { x: event.clientX, y: event.clientY },
        rect,
        workspaceScale,
        renderScale,
      );
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
  }, [plotData, spec, workspaceScale]);

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
      <div className="plot-host" style={{ width: spec.size.width, height: spec.size.height }}>
        <div
          ref={containerRef}
          className="plot-canvas-host"
          style={{
            width: spec.size.width,
            height: Math.max(160, spec.size.height - xAxisLabelHeight),
          }}
        />
        <div className="plot-x-axis-label">{spec.axes.x.label}</div>
      </div>
    </div>
  );
}
