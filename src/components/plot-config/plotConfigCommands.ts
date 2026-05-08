import type { PlotAnnotation, PlotAxisSpec, PlotSeries } from "../../domain/types";
import type { AnnotationDraft, ParsedAnnotationDraft } from "./plotConfigModel";

export const quotePlotArg = (value: string): string =>
  /[\s=]/.test(value) ? `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"` : value;

const rangeToCommand = (range: PlotAxisSpec["range"]): string =>
  range.mode === "manual" ? `${range.min}:${range.max}` : "auto";

const tickToCommand = (ticks: PlotAxisSpec["ticks"]): string =>
  ticks.mode === "manual" && ticks.interval ? String(ticks.interval) : "auto";

export const paddingToCommand = (padding: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}): string => `${padding.top}:${padding.right}:${padding.bottom}:${padding.left}`;

const commandArgs = (args: Record<string, string | number | boolean>): string =>
  Object.entries(args)
    .map(([key, value]) => `${key}=${typeof value === "string" ? quotePlotArg(value) : value}`)
    .join(" ");

export const plotSetCommand = (
  plotId: string,
  args: Record<string, string | number | boolean>,
): string => `plot-set ${plotId} ${commandArgs(args)}`;

export const plotGridCommand = (plotId: string, axis: "x" | "y", value: boolean): string =>
  `plot-grid ${plotId} ${axis}=${value}`;

export const plotAxisCommand = (plotId: string, axis: "x" | "y", axisSpec: PlotAxisSpec): string =>
  `plot-axis ${plotId} axis=${axis} ${commandArgs({
    label: axisSpec.label,
    range: rangeToCommand(axisSpec.range),
    tick: tickToCommand(axisSpec.ticks),
    tickDir: axisSpec.ticks.orientation,
    scale: axisSpec.scale,
    labelFontFamily: axisSpec.labelStyle.family,
    labelFontSize: axisSpec.labelStyle.size,
    valueFontFamily: axisSpec.valueStyle.family,
    valueFontSize: axisSpec.valueStyle.size,
    size: axisSpec.size,
    gap: axisSpec.gap,
    labelGap: axisSpec.labelGap,
    labelSize: axisSpec.labelSize,
    color: axisSpec.color,
    gridColor: axisSpec.gridColor,
    tickColor: axisSpec.tickColor,
    tickLength: axisSpec.ticks.length,
    minorTick: axisSpec.ticks.minor,
  })}`;

export const plotSeriesStyleCommand = (plotId: string, series: PlotSeries): string =>
  `plot-series ${plotId} ${commandArgs({
    y: series.y,
    label: series.label,
    color: series.color,
    lineWidth: series.lineWidth,
    markerSize: series.markerSize,
    markerShape: series.markerShape,
    order: series.drawOrder,
  })}`;

export const plotSeriesActionCommand = (
  plotId: string,
  y: string,
  action: "add" | "remove",
): string => `plot-series ${plotId} y=${quotePlotArg(y)} action=${action}`;

export const addAnnotationCommand = (
  plotId: string,
  draft: AnnotationDraft,
  position: ParsedAnnotationDraft,
): string =>
  `plot-annotation ${plotId} action=add ${commandArgs({
    type: "text-arrow",
    text: draft.text,
    x: position.x,
    y: position.y,
    dx: position.dx,
    dy: position.dy,
  })}`;

export const updateAnnotationCommand = (plotId: string, annotation: PlotAnnotation): string =>
  `plot-annotation ${plotId} action=update ${commandArgs({
    id: annotation.id,
    text: annotation.text,
    x: annotation.x,
    y: annotation.y,
    dx: annotation.dx,
    dy: annotation.dy,
    color: annotation.color,
    fontFamily: annotation.font.family,
    fontSize: annotation.font.size,
  })}`;

export const removeAnnotationCommand = (plotId: string, annotationId: string): string =>
  `plot-annotation ${plotId} action=remove id=${quotePlotArg(annotationId)}`;
