import { memo, useId, type RefObject } from "react";
import type { PlotSpec } from "../../domain/types";
import type { PlotAxis, PlotData } from "./data";
import type { PlotGeometry, PlotScale } from "./scales";
import { PlotAxisFigure } from "./PlotAxes";
import { plotTraces } from "./traces";

interface PlotFigureProps {
  svgRef: RefObject<SVGSVGElement | null>;
  spec: PlotSpec;
  data: PlotData;
  geometry: PlotGeometry;
  scales: Record<PlotAxis, PlotScale>;
}

export const PlotFigure = memo(function PlotFigure({
  svgRef,
  spec,
  data,
  geometry,
  scales,
}: PlotFigureProps) {
  const clipId = useId();
  const titleId = useId();
  const traces = plotTraces(spec, data, scales);
  const { width, height } = spec.size;
  return (
    <svg
      ref={svgRef}
      className="plot-figure"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{spec.title || `${spec.axes.y.label} vs ${spec.axes.x.label}`}</title>
      <rect width={width} height={height} fill="#ffffff" />
      <defs>
        <clipPath id={clipId}>
          <rect
            x={geometry.left}
            y={geometry.top}
            width={geometry.width}
            height={geometry.height}
          />
        </clipPath>
      </defs>
      {spec.title ? (
        <text
          x={width / 2}
          y={spec.padding.top + spec.font.size / 2}
          fill="#0f172a"
          fontFamily={spec.font.family}
          fontSize={spec.font.size}
          fontWeight={600}
          textAnchor="middle"
          dominantBaseline="central"
          data-plot-title=""
        >
          {spec.title}
        </text>
      ) : null}
      <PlotAxisFigure axis="x" spec={spec} geometry={geometry} scale={scales.x} />
      <PlotAxisFigure axis="y" spec={spec} geometry={geometry} scale={scales.y} />
      <g clipPath={`url(#${clipId})`}>
        {traces.map(({ series, path, markerPath }) => (
          <g
            key={series.y}
            data-series={series.label}
            stroke={series.color}
            strokeWidth={series.lineWidth}
          >
            {path && series.lineWidth > 0 ? (
              <path d={path} fill="none" strokeLinejoin="round" />
            ) : null}
            {markerPath ? (
              <path
                d={markerPath}
                fill={
                  series.markerShape === "cross" || series.markerShape === "plus" ? "none" : "#fff"
                }
                strokeWidth={Math.max(1, series.lineWidth)}
              />
            ) : null}
          </g>
        ))}
        {spec.annotations.map((annotation) => {
          const x = scales.x(annotation.x);
          const y = scales.y(annotation.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          const tx = x + annotation.dx;
          const ty = y + annotation.dy;
          return (
            <g
              key={annotation.id}
              fill={annotation.color}
              fontSize={annotation.font.size}
              fontFamily={annotation.font.family}
              data-plot-annotation=""
            >
              <line x1={tx} y1={ty} x2={x} y2={y} stroke={annotation.color} />
              <circle cx={x} cy={y} r={3} />
              <text x={tx + 4} y={ty - 4}>
                {annotation.text}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
});
