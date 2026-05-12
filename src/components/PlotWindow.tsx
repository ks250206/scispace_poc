import { useCallback, useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useScispaceStore } from "../store/scispaceStore";
import {
  buildPlotOptions,
  buildSortedAlignedPlotData,
  inferPlotDragZoomMode,
  normalizePlotClientPoint,
  plotRenderScale,
  plotSelectionRectForZoomMode,
  plotSizeFromRenderedRect,
  plotScaleRange,
  scalePlotSpecForRender,
  scaledPlotCursorBind,
  xAxisLabelHeight,
} from "./plotRendering";
import { buildPlotSvg, safePlotFileName, svgDataUrl } from "./plotExport";
import { useContextMenu } from "./context-menu/ContextMenuProvider";

interface PlotWindowProps {
  plotId: string;
  windowId: string;
}

export function PlotWindow({ plotId, windowId }: PlotWindowProps) {
  const { openContextMenu } = useContextMenu();
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const spec = useScispaceStore((state) => state.plotSpecs.find((item) => item.id === plotId));
  const workspaceScale = useScispaceStore((state) => state.viewport.scale);
  const dataset = useScispaceStore((state) =>
    state.datasets.find((item) => item.id === spec?.source),
  );
  const openPlotConfig = useScispaceStore((state) => state.openPlotConfig);
  const openPlotSchemaApplyWindow = useScispaceStore((state) => state.openPlotSchemaApplyWindow);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const focusWindow = useScispaceStore((state) => state.focusWindow);
  const setPlotMenuState = useScispaceStore((state) => state.setPlotMenuState);
  const clearPlotMenuState = useScispaceStore((state) => state.clearPlotMenuState);

  const plotData = useMemo(() => {
    if (!dataset || !spec) return undefined;
    return buildSortedAlignedPlotData(dataset, spec);
  }, [dataset, spec]);

  useEffect(() => {
    if (!containerRef.current || !plotData || !spec) return;
    plotRef.current?.destroy();

    const renderScale = plotRenderScale(workspaceScale);
    const renderSpec = scalePlotSpecForRender(spec, renderScale);
    const plotHeight = Math.max(160, renderSpec.size.height - xAxisLabelHeight * renderScale);
    plotRef.current = new uPlot(
      buildPlotOptions(renderSpec, plotHeight, scaledPlotCursorBind(workspaceScale, renderScale)),
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
      return normalizePlotClientPoint(
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
      plot.syncRect(false);
      const size = plotSizeFromRenderedRect(plot.rect, workspaceScale, renderScale);
      plot.setSelect(plotSelectionRectForZoomMode(start, end, size), false);
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
      const zoomAxis = inferPlotDragZoomMode(width, height);
      if (zoomAxis) {
        const currentXRange = plotScaleRange(plot.scales.x);
        const currentYRange = plotScaleRange(plot.scales.y);
        plot.batch(() => {
          if (zoomAxis === "x" || zoomAxis === "xy") {
            plot.setScale("x", {
              min: plot.posToVal(Math.min(start.left, end.left), "x"),
              max: plot.posToVal(Math.max(start.left, end.left), "x"),
            });
          }
          if (zoomAxis === "x" && currentYRange) plot.setScale("y", currentYRange);
          if (zoomAxis === "y" || zoomAxis === "xy") {
            plot.setScale("y", {
              min: plot.posToVal(Math.max(start.top, end.top), "y"),
              max: plot.posToVal(Math.min(start.top, end.top), "y"),
            });
          }
          if (zoomAxis === "y" && currentXRange) plot.setScale("x", currentXRange);
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

  const copySchema = useCallback(async () => {
    const result = await runScispace(`plot-schema ${plotId}`, { source: "gui" });
    if (result.kind !== "error") await navigator.clipboard?.writeText(result.output);
  }, [plotId, runScispace]);
  const clickDownload = useCallback((href: string, download: string) => {
    const link = document.createElement("a");
    link.href = href;
    link.download = download;
    link.click();
  }, []);
  const exportPng = useCallback(() => {
    if (!spec) return;
    const canvas = containerRef.current?.querySelector("canvas");
    if (!canvas) return;
    clickDownload(canvas.toDataURL("image/png"), safePlotFileName(spec.title, "png"));
  }, [clickDownload, spec]);
  const exportSvg = useCallback(() => {
    if (!spec || !dataset) return;
    clickDownload(svgDataUrl(buildPlotSvg(spec, dataset)), safePlotFileName(spec.title, "svg"));
  }, [clickDownload, dataset, spec]);
  const openPlotContextMenu = (position: { x: number; y: number }) => {
    focusWindow(windowId);
    openContextMenu({
      x: position.x,
      y: position.y,
      title: spec?.title,
      items: [
        { label: "Plot Config", onSelect: () => openPlotConfig(plotId) },
        { label: "Copy plot schema", onSelect: () => void copySchema() },
        { label: "Apply plot schema", onSelect: () => openPlotSchemaApplyWindow(plotId) },
        { label: "Export plot PNG", onSelect: exportPng },
        { label: "Export plot SVG", onSelect: exportSvg },
      ],
    });
  };

  useEffect(() => {
    if (!spec || !dataset) {
      clearPlotMenuState(plotId);
      return;
    }
    setPlotMenuState({
      plotId,
      actions: {
        openConfig: () => openPlotConfig(plotId),
        copySchema: () => void copySchema(),
        applySchema: () => openPlotSchemaApplyWindow(plotId),
        exportPng,
        exportSvg,
      },
    });
  }, [
    clearPlotMenuState,
    copySchema,
    dataset,
    exportPng,
    exportSvg,
    openPlotConfig,
    openPlotSchemaApplyWindow,
    plotId,
    setPlotMenuState,
    spec,
  ]);

  useEffect(() => () => clearPlotMenuState(plotId), [clearPlotMenuState, plotId]);

  if (!spec || !dataset) return <div className="empty-state">Plot source not found.</div>;

  return (
    <div
      className="plot-window"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openPlotContextMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <div className="plot-window-toolbar">
        <div className="plot-window-summary">
          <strong>{spec.title}</strong>
          <span>
            {dataset.name} / x={spec.x} / {spec.series.length} series
          </span>
        </div>
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
