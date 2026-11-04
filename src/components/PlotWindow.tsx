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
  type PlotAxisTicks,
} from "./plotRendering";
import { buildPlotSvg, plotExportLayout, safePlotFileName, svgDataUrl } from "./plotExport";
import { useContextMenu } from "./context-menu/ContextMenuProvider";

interface PlotWindowProps {
  plotId: string;
  windowId: string;
}

type AxisZoom = { binding: string; range: { min: number; max: number } };
type PlotAxis = "x" | "y";

export function PlotWindow({ plotId, windowId }: PlotWindowProps) {
  const { openContextMenu } = useContextMenu();
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const ticksRef = useRef<PlotAxisTicks>({ x: [], y: [] });
  const zoomRef = useRef<Partial<Record<PlotAxis, AxisZoom>>>({});
  const projectId = useScispaceStore((state) => state.currentProjectId);
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
    const renderScale = plotRenderScale(workspaceScale);
    const renderSpec = scalePlotSpecForRender(spec, renderScale);
    const axes = ["x", "y"] as const;
    const binding = (axis: PlotAxis) =>
      JSON.stringify([
        projectId,
        spec.source,
        spec.x,
        axis === "y" ? spec.series.map(({ y }) => y).sort() : null,
        spec.axes[axis].scale,
        spec.axes[axis].range.mode,
        spec.axes[axis].range.min,
        spec.axes[axis].range.max,
      ]);
    const ticks: PlotAxisTicks = { x: [], y: [] };
    const plot = new uPlot(
      buildPlotOptions(
        renderSpec,
        renderSpec.size.height,
        scaledPlotCursorBind(workspaceScale, renderScale),
        ticks,
      ),
      plotData,
      containerRef.current,
    );
    plotRef.current = plot;
    ticksRef.current = ticks;
    plot.batch(() => {
      for (const axis of axes) {
        const saved = zoomRef.current[axis];
        if (saved?.binding === binding(axis)) plot.setScale(axis, saved.range);
        else delete zoomRef.current[axis];
      }
    });

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
      const start = clampPosition(dragStart);
      const end = clampPosition(positionFromEvent(event));
      updateSelection(end);
      const width = Math.abs(end.left - start.left);
      const height = Math.abs(end.top - start.top);
      const zoomAxis = inferPlotDragZoomMode(width, height);
      if (zoomAxis) {
        const currentXRange = plotScaleRange(plot.scales.x);
        const currentYRange = plotScaleRange(plot.scales.y);
        plot.batch(() => {
          for (const axis of axes) {
            const currentRange = axis === "x" ? currentXRange : currentYRange;
            if (zoomAxis !== "xy" && zoomAxis !== axis) {
              if (currentRange) {
                zoomRef.current[axis] = { binding: binding(axis), range: currentRange };
                plot.setScale(axis, currentRange);
              }
              continue;
            }
            const from = plot.posToVal(axis === "x" ? start.left : start.top, axis);
            const to = plot.posToVal(axis === "x" ? end.left : end.top, axis);
            const range = { min: Math.min(from, to), max: Math.max(from, to) };
            if (
              !Number.isFinite(range.min) ||
              !Number.isFinite(range.max) ||
              range.min >= range.max
            )
              continue;
            zoomRef.current[axis] = { binding: binding(axis), range };
            plot.setScale(axis, range);
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
      plotRef.current = null;
      plot.destroy();
    };
  }, [plotData, projectId, spec, workspaceScale]);

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
    const plot = plotRef.current;
    if (!spec || !plot) return;
    const svg = buildPlotSvg(spec, plot.data, plotExportLayout(plot, spec, ticksRef.current));
    clickDownload(svgDataUrl(svg), safePlotFileName(spec.title, "svg"));
  }, [clickDownload, spec]);
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
            height: spec.size.height,
          }}
        />
      </div>
    </div>
  );
}
