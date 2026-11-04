import { bisectCenter } from "d3-array";
import { useRef, useState, type PointerEvent } from "react";
import type { PlotSpec, PlotZoomMode } from "../../domain/types";
import {
  sortedPlotSeries,
  type PlotAxis,
  type PlotData,
  type PlotDomain,
  type PlotDomains,
} from "./data";
import { inferPlotDragZoomMode, plotSelectionRectForZoomMode } from "./dragZoom";
import type { PlotGeometry, PlotScale } from "./scales";

type Point = { left: number; top: number };

interface PlotInteractionProps {
  spec: PlotSpec;
  data: PlotData;
  geometry: PlotGeometry;
  scales: Record<PlotAxis, PlotScale>;
  onZoom: (domains?: PlotDomains) => void;
}

function dragMode(start: Point, end: Point, preference: PlotZoomMode) {
  const width = Math.abs(end.left - start.left);
  const height = Math.abs(end.top - start.top);
  if (preference === "x") return width >= 8 ? "x" : undefined;
  if (preference === "y") return height >= 8 ? "y" : undefined;
  return inferPlotDragZoomMode(width, height);
}

export function PlotInteraction({ spec, data, geometry, scales, onZoom }: PlotInteractionProps) {
  const [point, setPoint] = useState<Point>();
  const [start, setStart] = useState<Point>();
  const pointerId = useRef<number | undefined>(undefined);
  const { width, height } = spec.size;
  const toPlotPoint = (event: PointerEvent<SVGSVGElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      left: ((event.clientX - bounds.left) * width) / bounds.width - geometry.left,
      top: ((event.clientY - bounds.top) * height) / bounds.height - geometry.top,
    };
  };
  const inside = ({ left, top }: Point) =>
    left >= 0 && left <= geometry.width && top >= 0 && top <= geometry.height;
  const clamp = ({ left, top }: Point) => ({
    left: Math.max(0, Math.min(geometry.width, left)),
    top: Math.max(0, Math.min(geometry.height, top)),
  });
  const endDrag = () => {
    pointerId.current = undefined;
    setStart(undefined);
  };
  const mode = start && point && dragMode(start, point, spec.zoomMode);
  const selection =
    mode && start && point ? plotSelectionRectForZoomMode(start, point, geometry, mode) : undefined;

  const hoverIndex =
    point && !start ? bisectCenter(data.x, scales.x.invert(point.left + geometry.left)) : undefined;
  const hoverX = hoverIndex === undefined ? undefined : data.x[hoverIndex];
  const displayValue = (value: number | null | undefined) =>
    value == null ? "–" : Number(value.toPrecision(7));

  return (
    <>
      <svg
        className="plot-interaction"
        aria-hidden="true"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onPointerDown={(event) => {
          const next = toPlotPoint(event);
          if (
            event.button !== 0 ||
            !event.isPrimary ||
            pointerId.current !== undefined ||
            !inside(next)
          )
            return;
          event.preventDefault();
          pointerId.current = event.pointerId;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setStart(next);
          setPoint(next);
        }}
        onPointerMove={(event) => {
          if (!event.isPrimary) return;
          const next = toPlotPoint(event);
          setPoint(
            pointerId.current === event.pointerId ? clamp(next) : inside(next) ? next : undefined,
          );
        }}
        onPointerLeave={() => {
          if (pointerId.current === undefined) setPoint(undefined);
        }}
        onLostPointerCapture={(event) => {
          if (event.pointerId === pointerId.current) {
            endDrag();
            setPoint(undefined);
          }
        }}
        onPointerUp={(event) => {
          if (event.pointerId !== pointerId.current || !start) return;
          const end = clamp(toPlotPoint(event));
          const zoom = dragMode(start, end, spec.zoomMode);
          endDrag();
          setPoint(undefined);
          if (!zoom) return;
          const domain = (axis: PlotAxis, a: number, b: number): PlotDomain => {
            const scale = scales[axis];
            if (zoom === axis || zoom === "xy") {
              const from = scale.invert(a);
              const to = scale.invert(b);
              return [Math.min(from, to), Math.max(from, to)];
            }
            const [min, max] = scale.domain();
            return [min, max];
          };
          onZoom({
            x: domain("x", geometry.left + start.left, geometry.left + end.left),
            y: domain("y", geometry.top + start.top, geometry.top + end.top),
          });
        }}
        onDoubleClick={() => onZoom()}
      >
        <g transform={`translate(${geometry.left},${geometry.top})`} pointerEvents="none">
          {point && !start ? (
            <path
              d={`M${point.left},0V${geometry.height} M0,${point.top}H${geometry.width}`}
              stroke="#64748b"
              strokeOpacity={0.7}
              strokeDasharray="4 4"
              fill="none"
            />
          ) : null}
          {selection ? (
            <rect
              x={selection.left}
              y={selection.top}
              width={selection.width}
              height={selection.height}
              fill="#2563eb"
              fillOpacity={0.14}
              stroke="#2563eb"
              strokeOpacity={0.75}
            />
          ) : null}
        </g>
      </svg>
      {hoverIndex !== undefined && hoverX !== undefined ? (
        <div className="plot-cursor-values" aria-hidden="true" style={{ maxWidth: width - 24 }}>
          <span>
            {spec.x} {displayValue(hoverX)}
          </span>
          {sortedPlotSeries(spec.series).map((series) => (
            <span key={series.y}>
              <i style={{ backgroundColor: series.color }} />
              {series.label} {displayValue(data.columns.get(series.y)?.[hoverIndex])}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
