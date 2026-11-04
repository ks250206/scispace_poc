import type { PlotAxisSpec, PlotSpec } from "../../domain/types";
import type { PlotAxis } from "./data";
import { plotTicks, type PlotGeometry, type PlotScale } from "./scales";

interface AxisProps {
  axis: PlotAxis;
  spec: PlotSpec;
  geometry: PlotGeometry;
  scale: PlotScale;
}

const axisLabelPosition = (
  spec: PlotSpec,
  axis: PlotAxisSpec,
  geometry: PlotGeometry,
  horizontal: boolean,
) => {
  const halfFont = axis.labelStyle.size / 2;
  if (horizontal) {
    const outerEdge = spec.size.height - spec.padding.bottom;
    const area = Math.max(axis.labelSize, axis.labelGap + axis.labelStyle.size);
    return Math.min(
      outerEdge - halfFont,
      Math.max(geometry.bottom + halfFont, outerEdge - area + axis.labelGap + halfFont),
    );
  }
  return Math.max(
    spec.padding.left + halfFont,
    geometry.left - axis.size - axis.labelGap - halfFont,
  );
};

function xTickAnchor(position: number, label: string, width: number, fontSize: number) {
  const halfLabelWidth = label.length * fontSize * 0.33;
  if (position < halfLabelWidth) return "start";
  if (position > width - halfLabelWidth) return "end";
  return "middle";
}

export function PlotAxisFigure({ axis, spec, geometry, scale }: AxisProps) {
  const settings = spec.axes[axis];
  const horizontal = axis === "x";
  const { left, top, right, bottom } = geometry;
  const { major, minor } = plotTicks(settings, scale, axis);
  const requestedLength =
    settings.ticks.orientation === "none"
      ? 0
      : settings.ticks.length * (settings.ticks.orientation === "in" ? -1 : 1);
  const tickLength =
    settings.ticks.mirror && requestedLength > 0
      ? Math.min(requestedLength, Math.max(0, (horizontal ? top : spec.size.width - right) - 1))
      : requestedLength;
  const labelOffset = Math.max(0, tickLength) + settings.gap;
  const labelPosition = axisLabelPosition(spec, settings, geometry, horizontal);
  const titleX = horizontal ? (left + right) / 2 : labelPosition;
  const titleY = horizontal ? labelPosition : (top + bottom) / 2;

  const gridLine = (position: number, key: string | number, dashed = false) => (
    <line
      key={key}
      x1={horizontal ? position : left}
      x2={horizontal ? position : right}
      y1={horizontal ? top : position}
      y2={horizontal ? bottom : position}
      strokeDasharray={dashed ? "2 3" : undefined}
    />
  );

  const tickMark = (position: number, mirrored = false) => {
    const edge = horizontal ? (mirrored ? top : bottom) : mirrored ? right : left;
    const end = edge + tickLength * (horizontal === mirrored ? -1 : 1);
    return (
      <line
        data-mirrored-tick={mirrored ? "" : undefined}
        x1={horizontal ? position : edge}
        x2={horizontal ? position : end}
        y1={horizontal ? edge : position}
        y2={horizontal ? end : position}
        stroke={settings.tickColor}
      />
    );
  };

  return (
    <g data-plot-axis={axis}>
      {spec.grid[axis] ? (
        <g stroke={settings.gridColor} strokeWidth={0.8}>
          {major.map(({ value, position }) => gridLine(position, value))}
        </g>
      ) : null}
      {minor.length > 0 ? (
        <g stroke={settings.gridColor} strokeWidth={0.75}>
          {minor.map((position) => gridLine(position, position, true))}
        </g>
      ) : null}
      {spec.border ? (
        <line
          x1={left}
          y1={bottom}
          x2={horizontal ? right : left}
          y2={horizontal ? bottom : top}
          stroke={settings.color}
        />
      ) : null}
      <g
        fill={settings.color}
        fontFamily={settings.valueStyle.family}
        fontSize={settings.valueStyle.size}
        textAnchor={horizontal ? "middle" : "end"}
        dominantBaseline={horizontal ? "hanging" : "central"}
      >
        {major.map(({ value, position, label }) => (
          <g key={value} data-tick-value={value}>
            {tickLength !== 0 && tickMark(position)}
            {settings.ticks.mirror && tickLength !== 0 && tickMark(position, true)}
            {label ? (
              <text
                x={horizontal ? position : left - labelOffset}
                y={horizontal ? bottom + labelOffset : position}
                textAnchor={
                  horizontal
                    ? xTickAnchor(position, label, spec.size.width, settings.valueStyle.size)
                    : undefined
                }
              >
                {label}
              </text>
            ) : null}
          </g>
        ))}
      </g>
      {settings.label ? (
        <text
          x={titleX}
          y={titleY}
          fill={settings.color}
          fontFamily={settings.labelStyle.family}
          fontSize={settings.labelStyle.size}
          textAnchor="middle"
          dominantBaseline="central"
          transform={horizontal ? undefined : `rotate(-90 ${titleX} ${titleY})`}
          data-axis-label={axis}
        >
          {settings.label}
        </text>
      ) : null}
    </g>
  );
}
