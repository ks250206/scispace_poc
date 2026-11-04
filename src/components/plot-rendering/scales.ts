import { scaleLinear, scaleLog } from "d3-scale";
import type { PlotAxisSpec, PlotSpec } from "../../domain/types";
import {
  visibleYExtent,
  type PlotAxis,
  type PlotData,
  type PlotDomain,
  type PlotDomains,
} from "./data";

export type PlotScale =
  | ReturnType<typeof scaleLinear<number, number>>
  | ReturnType<typeof scaleLog<number, number>>;

const maxTickCount = 1000;
const labelArea = (axis: PlotAxisSpec) =>
  axis.label ? Math.max(axis.labelSize, axis.labelGap + axis.labelStyle.size) : 0;

const mirrorPadding = (axis: PlotAxisSpec, dimension: number, available: number) => {
  const { ticks } = axis;
  const outward = ticks.orientation === "out" && ticks.length > 0 ? ticks.length + 1 : 0;
  if (axis.mirror) {
    const tickArea = Math.max(axis.size, outward + axis.gap + axis.valueStyle.size);
    return Math.min(tickArea + labelArea(axis), Math.max(0, available * 0.42));
  }
  return ticks.mirror ? Math.min(outward, dimension / 4) : 0;
};

export const plotGeometry = (spec: PlotSpec) => {
  const { width, height } = spec.size;
  const { x, y } = spec.axes;
  const { padding } = spec;
  const titleHeight = spec.title ? spec.font.size * 1.65 : 0;
  const top = Math.min(
    height - 2,
    padding.top +
      titleHeight +
      mirrorPadding(x, height, height - padding.top - titleHeight - padding.bottom),
  );
  const right = Math.max(
    2,
    width - padding.right - mirrorPadding(y, width, width - padding.left - padding.right),
  );
  const minWidth = Math.min(32, right * 0.25);
  const minHeight = Math.min(32, (height - top) * 0.25);
  const left = Math.min(right - minWidth, padding.left + y.size + labelArea(y));
  const bottom = Math.max(top + minHeight, height - padding.bottom - x.size - labelArea(x));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};

export type PlotGeometry = ReturnType<typeof plotGeometry>;

const validDomain = (axis: PlotAxisSpec, min: number, max: number) =>
  Number.isFinite(min) && Number.isFinite(max) && min < max && (axis.scale !== "log" || min > 0);

const autoDomain = (
  spec: PlotAxisSpec,
  axis: PlotAxis,
  extent: PlotDomain | undefined,
): PlotDomain => {
  if (!extent) return spec.scale === "log" ? [1, 10] : [0, 1];
  const [min, max] = extent;
  if (spec.scale === "log")
    return min === max ? [min / 2 || min, Math.min(Number.MAX_VALUE, max * 2)] : extent;
  if (min === max) {
    const delta = Math.abs(min) * 0.05 || 1;
    return [Math.max(-Number.MAX_VALUE, min - delta), Math.min(Number.MAX_VALUE, max + delta)];
  }
  if (axis === "x") return extent;
  const pad = max * 0.05 - min * 0.05;
  return [Math.max(-Number.MAX_VALUE, min - pad), Math.min(Number.MAX_VALUE, max + pad)];
};

export const plotAxisBinding = (spec: PlotSpec, axis: PlotAxis) => {
  const { scale, range } = spec.axes[axis];
  return JSON.stringify([
    spec.source,
    spec.x,
    axis === "y" ? spec.series.map(({ y }) => y).sort() : null,
    scale,
    range.mode,
    range.min,
    range.max,
  ]);
};

export const plotScales = (
  spec: PlotSpec,
  data: PlotData,
  geometry: PlotGeometry,
  zoom: Partial<PlotDomains> = {},
): Record<PlotAxis, PlotScale> => {
  const makeScale = (key: PlotAxis, pixels: PlotDomain, xDomain?: PlotDomain): PlotScale => {
    const axis = spec.axes[key];
    const { range } = axis;
    const saved = zoom[key];
    const domain =
      saved && validDomain(axis, ...saved)
        ? saved
        : range.mode === "manual" &&
            range.min !== undefined &&
            range.max !== undefined &&
            validDomain(axis, range.min, range.max)
          ? [range.min, range.max]
          : autoDomain(
              axis,
              key,
              xDomain ? visibleYExtent(data, xDomain, axis.scale) : data.extents.x[axis.scale],
            );
    return axis.scale === "log" ? scaleLog(domain, pixels) : scaleLinear(domain, pixels);
  };
  const x = makeScale("x", [geometry.left, geometry.right]);
  const [minX, maxX] = x.domain();
  return { x, y: makeScale("y", [geometry.bottom, geometry.top], [minX, maxX]) };
};

const formatManualTick = (value: number): string =>
  Math.abs(value) >= 1e7 || (value !== 0 && Math.abs(value) < 1e-4)
    ? Number(value.toPrecision(12)).toExponential()
    : String(Number(value.toPrecision(12)));

const manualTicks = (min: number, max: number, step: number): number[] => {
  const first = Math.ceil(min / step - 1e-10);
  const last = Math.floor(max / step + 1e-10);
  const count = last - first + 1;
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    count <= 0 ||
    count > maxTickCount
  )
    return [];
  return Array.from({ length: count }, (_, index) =>
    Number(((first + index) * step).toPrecision(16)),
  );
};

export const plotTicks = (axis: PlotAxisSpec, scale: PlotScale, key: PlotAxis) => {
  const [min, max] = scale.domain();
  const [start, end] = scale.range();
  const spacing =
    key === "x"
      ? Math.max(48, axis.valueStyle.size * 5.5)
      : Math.max(24, axis.valueStyle.size * 2.2);
  const count = Math.max(2, Math.floor(Math.abs(end - start) / spacing));
  const interval = axis.ticks.mode === "manual" ? axis.ticks.interval : undefined;
  const values = interval ? manualTicks(min, max, interval) : scale.ticks(count);
  const format = interval ? formatManualTick : scale.tickFormat(count);
  const major = values
    .filter((value) => axis.scale !== "log" || value > 0)
    .map((value) => ({ value, position: scale(value), label: format(value) }));
  const minor =
    interval && axis.ticks.minor
      ? manualTicks(min - interval / 2, max - interval / 2, interval)
          .map((value) => value + interval / 2)
          .filter((value) => value >= min && value <= max)
          .map((value) => scale(value))
      : [];
  return { major, minor };
};
