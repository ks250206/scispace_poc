import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useScispaceStore } from "../store/scispaceStore";

interface PlotWindowProps {
  plotId: string;
}

export function PlotWindow({ plotId }: PlotWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const [zoomMode, setZoomMode] = useState<"x" | "y" | "xy">("xy");
  const spec = useScispaceStore((state) => state.plotSpecs.find((item) => item.id === plotId));
  const dataset = useScispaceStore((state) =>
    state.datasets.find((item) => item.id === spec?.source),
  );

  const plotData = useMemo(() => {
    if (!dataset || !spec) return undefined;
    const x = dataset.rows.map((row, index) => Number(row[spec.x] ?? index));
    const y = dataset.rows.map((row) => Number(row[spec.y] ?? 0));
    return [x, y] as uPlot.AlignedData;
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
        cursor: { drag: { x: zoomMode !== "y", y: zoomMode !== "x" } },
        scales: { x: { time: false } },
        series: [{ label: spec.x }, { label: spec.y, stroke: "#2563eb", width: 2 }],
      },
      plotData,
      containerRef.current,
    );

    return () => plotRef.current?.destroy();
  }, [plotData, spec, zoomMode]);

  if (!spec || !dataset) return <div className="empty-state">Plot source not found.</div>;

  return (
    <div className="plot-window">
      <div className="window-controls">
        <span>
          {spec.y} vs {spec.x}
        </span>
        <div className="segmented">
          {(["x", "y", "xy"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={zoomMode === mode ? "active" : ""}
              onClick={() => setZoomMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="plot-host" />
    </div>
  );
}
