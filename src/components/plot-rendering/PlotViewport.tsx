import { useCallback, useMemo, useState, type RefObject } from "react";
import type { Dataset, PlotSpec } from "../../domain/types";
import { buildPlotData, type PlotAxis, type PlotDomain, type PlotDomains } from "./data";
import { plotAxisBinding, plotGeometry, plotScales } from "./scales";
import { PlotFigure } from "./PlotFigure";
import { PlotInteraction } from "./PlotInteraction";

type SavedZoom = Partial<Record<PlotAxis, { binding: string; domain: PlotDomain }>>;

interface PlotViewportProps {
  spec: PlotSpec;
  dataset: Dataset;
  svgRef: RefObject<SVGSVGElement | null>;
}

export function PlotViewport({ spec, dataset, svgRef }: PlotViewportProps) {
  const [zoom, setZoom] = useState<SavedZoom>({});
  const yColumns = JSON.stringify(spec.series.map(({ y }) => y).sort());
  const data = useMemo(
    () => buildPlotData(dataset, spec.x, JSON.parse(yColumns) as string[]),
    [dataset, spec.x, yColumns],
  );
  const geometry = useMemo(() => plotGeometry(spec), [spec]);
  const xBinding = plotAxisBinding(spec, "x");
  const yBinding = plotAxisBinding(spec, "y");
  const xZoom = zoom.x?.binding === xBinding ? zoom.x : undefined;
  const yZoom = zoom.y?.binding === yBinding ? zoom.y : undefined;
  if (xZoom !== zoom.x || yZoom !== zoom.y) setZoom({ x: xZoom, y: yZoom });

  const scales = useMemo(
    () =>
      plotScales(spec, data, geometry, {
        x: xZoom?.domain,
        y: yZoom?.domain,
      }),
    [spec, data, geometry, xZoom, yZoom],
  );
  const applyZoom = useCallback(
    (domains?: PlotDomains) => {
      setZoom(
        domains
          ? {
              x: { binding: xBinding, domain: domains.x },
              y: { binding: yBinding, domain: domains.y },
            }
          : {},
      );
    },
    [xBinding, yBinding],
  );

  return (
    <div className="plot-host" style={spec.size}>
      <PlotFigure svgRef={svgRef} spec={spec} data={data} geometry={geometry} scales={scales} />
      <PlotInteraction
        spec={spec}
        data={data}
        geometry={geometry}
        scales={scales}
        onZoom={applyZoom}
      />
    </div>
  );
}
