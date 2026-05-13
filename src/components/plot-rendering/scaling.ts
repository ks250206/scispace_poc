import type { PlotAxisSpec, PlotSpec } from "../../domain/types";

const maxRenderScale = 4;

const scaleNumber = (value: number, scale: number): number => Number((value * scale).toFixed(3));

export const plotRenderScale = (workspaceScale: number): number =>
  Math.min(maxRenderScale, Math.max(1, workspaceScale || 1));

const scaleAxisForRender = (axis: PlotAxisSpec, renderScale: number): PlotAxisSpec => ({
  ...axis,
  size: scaleNumber(axis.size, renderScale),
  gap: scaleNumber(axis.gap, renderScale),
  labelGap: scaleNumber(axis.labelGap, renderScale),
  labelSize: scaleNumber(axis.labelSize, renderScale),
  ticks: {
    ...axis.ticks,
    length: scaleNumber(axis.ticks.length, renderScale),
  },
  labelStyle: {
    ...axis.labelStyle,
    size: scaleNumber(axis.labelStyle.size, renderScale),
  },
  valueStyle: {
    ...axis.valueStyle,
    size: scaleNumber(axis.valueStyle.size, renderScale),
  },
});

export const scalePlotSpecForRender = (spec: PlotSpec, renderScale: number): PlotSpec => {
  if (renderScale === 1) return spec;
  return {
    ...spec,
    size: {
      width: scaleNumber(spec.size.width, renderScale),
      height: scaleNumber(spec.size.height, renderScale),
    },
    font: { ...spec.font, size: scaleNumber(spec.font.size, renderScale) },
    padding: {
      top: scaleNumber(spec.padding.top, renderScale),
      right: scaleNumber(spec.padding.right, renderScale),
      bottom: scaleNumber(spec.padding.bottom, renderScale),
      left: scaleNumber(spec.padding.left, renderScale),
    },
    axes: {
      x: scaleAxisForRender(spec.axes.x, renderScale),
      y: scaleAxisForRender(spec.axes.y, renderScale),
    },
    series: spec.series.map((series) => ({
      ...series,
      lineWidth: scaleNumber(series.lineWidth, renderScale),
      markerSize: scaleNumber(series.markerSize, renderScale),
    })),
    annotations: spec.annotations.map((annotation) => ({
      ...annotation,
      dx: scaleNumber(annotation.dx, renderScale),
      dy: scaleNumber(annotation.dy, renderScale),
      font: {
        ...annotation.font,
        size: scaleNumber(annotation.font.size, renderScale),
      },
    })),
  };
};
