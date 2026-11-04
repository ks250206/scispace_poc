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
  const mirrorTicks = settings.mirror || settings.ticks.mirror;
  const mirroredEdge = horizontal ? top : right;
  const titleHeight = spec.title ? spec.font.size * 1.65 : 0;
  const mirroredRoom = horizontal
    ? top - spec.padding.top - titleHeight
    : spec.size.width - spec.padding.right - right;
  const requestedLength =
    settings.ticks.orientation === "none"
      ? 0
      : settings.ticks.length * (settings.ticks.orientation === "in" ? -1 : 1);
  const tickLength =
    mirrorTicks && requestedLength > 0
      ? Math.min(requestedLength, Math.max(0, mirroredRoom - 1))
      : requestedLength;
  const labelOffset = Math.max(0, tickLength) + settings.gap;
  const labelPosition = axisLabelPosition(spec, settings, geometry, horizontal);
  const titleX = horizontal ? (left + right) / 2 : labelPosition;
  const titleY = horizontal ? labelPosition : (top + bottom) / 2;
  const valueSpace = horizontal
    ? settings.valueStyle.size
    : major.reduce(
        (width, { label }) => Math.max(width, label.length * settings.valueStyle.size * 0.66),
        0,
      );
  const halfTitle = settings.labelStyle.size / 2;
  const mirrorTitleDistance = Math.max(
    Math.min(halfTitle, mirroredRoom / 2),
    Math.min(
      mirroredRoom - halfTitle,
      Math.max(settings.size, labelOffset + valueSpace) + settings.labelGap + halfTitle,
    ),
  );

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

  const axisTitle = (x: number, y: number, mirrored = false) => (
    <text
      x={x}
      y={y}
      fill={settings.color}
      fontFamily={settings.labelStyle.family}
      fontSize={settings.labelStyle.size}
      textAnchor="middle"
      dominantBaseline="central"
      transform={horizontal ? undefined : `rotate(${mirrored ? 90 : -90} ${x} ${y})`}
      data-axis-label={mirrored ? undefined : axis}
      data-mirrored-axis-label={mirrored ? axis : undefined}
    >
      {settings.label}
    </text>
  );

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
      {settings.mirror && spec.border && (
        <line
          data-mirrored-axis={axis}
          x1={horizontal ? left : right}
          x2={right}
          y1={top}
          y2={horizontal ? top : bottom}
          stroke={settings.color}
        />
      )}
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
            {mirrorTicks && tickLength !== 0 && tickMark(position, true)}
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
            {settings.mirror && label && (
              <text
                data-mirrored-tick-label=""
                x={horizontal ? position : mirroredEdge + labelOffset}
                y={horizontal ? mirroredEdge - labelOffset : position}
                textAnchor={
                  horizontal
                    ? xTickAnchor(position, label, spec.size.width, settings.valueStyle.size)
                    : "start"
                }
                dominantBaseline={horizontal ? "auto" : "central"}
              >
                {label}
              </text>
            )}
          </g>
        ))}
      </g>
      {settings.label && axisTitle(titleX, titleY)}
      {settings.mirror &&
        settings.label &&
        axisTitle(
          horizontal ? titleX : mirroredEdge + mirrorTitleDistance,
          horizontal ? mirroredEdge - mirrorTitleDistance : titleY,
          true,
        )}
    </g>
  );
}
