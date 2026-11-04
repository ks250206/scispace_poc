import { useScispaceStore } from "../store/scispaceStore";
import { useCallback, useEffect, useRef } from "react";
import { exportPlotPng, safePlotFileName, serializePlotSvg, svgDataUrl } from "./plotExport";
import { useContextMenu } from "./context-menu/ContextMenuProvider";
import { useDialog } from "./dialog/DialogProvider";
import { PlotViewport } from "./plot-rendering/PlotViewport";

interface PlotWindowProps {
  plotId: string;
  windowId: string;
}

export function PlotWindow({ plotId, windowId }: PlotWindowProps) {
  const { openContextMenu } = useContextMenu();
  const svgRef = useRef<SVGSVGElement>(null);
  const { alert } = useDialog();
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
    const svg = svgRef.current;
    if (!spec || !svg) return;
    const scale = Math.max(1, Math.min(4, workspaceScale)) * window.devicePixelRatio;
    void exportPlotPng(svg, spec.size, scale)
      .then((url) => clickDownload(url, safePlotFileName(spec.title, "png")))
      .catch(() =>
        alert({ title: "Plot export failed", message: "Could not create the PNG image." }),
      );
  }, [alert, clickDownload, spec, workspaceScale]);
  const exportSvg = useCallback(() => {
    const svg = svgRef.current;
    if (!spec || !svg) return;
    clickDownload(svgDataUrl(serializePlotSvg(svg)), safePlotFileName(spec.title, "svg"));
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
      <PlotViewport key={projectId} svgRef={svgRef} spec={spec} dataset={dataset} />
    </div>
  );
}
