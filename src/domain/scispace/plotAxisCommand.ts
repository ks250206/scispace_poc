import type { PlotTickDirection, ScispaceCommandResult } from "../types";
import {
  findDataset,
  parseColor,
  parseNonNegativeNumber,
  parseOptionalBoolean,
  parsePositiveNumber,
  readOption,
  type CommandContext,
} from "./commandUtils";
import {
  axisDataHasNonPositiveValues,
  findPlot,
  normalizePlotSpecForCommand,
  parseRange,
  parseTick,
  tickDirections,
} from "./plotSpec";

export const executePlotAxisCommand = (
  args: string[],
  context: CommandContext,
): ScispaceCommandResult => {
  const plot = findPlot(context.plotSpecs, args[0] ?? "");
  if (!plot) return { kind: "error", output: `Plot not found: ${args[0] ?? ""}` };
  const axisKey = readOption(args, "axis");
  if (axisKey !== "x" && axisKey !== "y") return { kind: "error", output: "axis must be x or y" };
  const current = normalizePlotSpecForCommand(plot);
  const range = parseRange(readOption(args, "range"));
  if (readOption(args, "range") && !range) return { kind: "error", output: "Invalid range" };
  const tick = parseTick(readOption(args, "tick"));
  if (readOption(args, "tick") && !tick) return { kind: "error", output: "Invalid tick interval" };
  const tickDir = readOption(args, "tickDir");
  if (tickDir && !tickDirections.has(tickDir as PlotTickDirection)) {
    return { kind: "error", output: `Invalid tick direction: ${tickDir}` };
  }
  const scale = readOption(args, "scale");
  if (scale !== undefined && scale !== "linear" && scale !== "log") {
    return { kind: "error", output: `Invalid axis scale: ${scale}` };
  }
  const dataset = findDataset(context.datasets, current.source);
  if (scale === "log" && axisDataHasNonPositiveValues(axisKey, dataset, current)) {
    return { kind: "error", output: `Log scale requires positive ${axisKey} values` };
  }

  const label = readOption(args, "label");
  const labelFontFamily = readOption(args, "labelFontFamily");
  const labelFontSizeValue = readOption(args, "labelFontSize");
  const labelFontSize = parsePositiveNumber(labelFontSizeValue);
  const valueFontFamily = readOption(args, "valueFontFamily");
  const valueFontSizeValue = readOption(args, "valueFontSize");
  const valueFontSize = parsePositiveNumber(valueFontSizeValue);
  const sizeValue = readOption(args, "size");
  const size = parsePositiveNumber(sizeValue);
  const gapValue = readOption(args, "gap");
  const gap = parseNonNegativeNumber(gapValue);
  const labelGapValue = readOption(args, "labelGap");
  const labelGap = parseNonNegativeNumber(labelGapValue);
  const labelSizeValue = readOption(args, "labelSize");
  const labelSize = parsePositiveNumber(labelSizeValue);
  const colorValue = readOption(args, "color");
  const color = parseColor(colorValue);
  const gridColorValue = readOption(args, "gridColor");
  const gridColor = parseColor(gridColorValue);
  const tickColorValue = readOption(args, "tickColor");
  const tickColor = parseColor(tickColorValue);
  const tickLengthValue = readOption(args, "tickLength");
  const tickLength = parseNonNegativeNumber(tickLengthValue);
  const minorTickValue = readOption(args, "minorTick");
  const minorTick = parseOptionalBoolean(minorTickValue);
  const mirrorTickValue = readOption(args, "mirrorTick");
  const mirrorTick = parseOptionalBoolean(mirrorTickValue);

  if (labelFontSizeValue !== undefined && labelFontSize === undefined)
    return { kind: "error", output: `Invalid label font size: ${labelFontSizeValue}` };
  if (valueFontSizeValue !== undefined && valueFontSize === undefined)
    return { kind: "error", output: `Invalid value font size: ${valueFontSizeValue}` };
  if (sizeValue !== undefined && size === undefined)
    return { kind: "error", output: `Invalid axis size: ${sizeValue}` };
  if (gapValue !== undefined && gap === undefined)
    return { kind: "error", output: `Invalid axis gap: ${gapValue}` };
  if (labelGapValue !== undefined && labelGap === undefined)
    return { kind: "error", output: `Invalid label gap: ${labelGapValue}` };
  if (labelSizeValue !== undefined && labelSize === undefined)
    return { kind: "error", output: `Invalid label size: ${labelSizeValue}` };
  if (colorValue !== undefined && color === undefined)
    return { kind: "error", output: `Invalid axis color: ${colorValue}` };
  if (gridColorValue !== undefined && gridColor === undefined)
    return { kind: "error", output: `Invalid grid color: ${gridColorValue}` };
  if (tickColorValue !== undefined && tickColor === undefined)
    return { kind: "error", output: `Invalid tick color: ${tickColorValue}` };
  if (tickLengthValue !== undefined && tickLength === undefined)
    return { kind: "error", output: `Invalid tick length: ${tickLengthValue}` };
  if (minorTickValue !== undefined && minorTick === undefined)
    return { kind: "error", output: `Invalid minor tick: ${minorTickValue}` };

  if (mirrorTickValue !== undefined && mirrorTick === undefined)
    return { kind: "error", output: `Invalid mirror tick: ${mirrorTickValue}` };

  const axis = {
    ...current.axes[axisKey],
    ...(label !== undefined ? { label } : {}),
    ...(range ? { range } : {}),
    ...(scale !== undefined ? { scale } : {}),
    ...(size !== undefined ? { size } : {}),
    ...(gap !== undefined ? { gap } : {}),
    ...(labelGap !== undefined ? { labelGap } : {}),
    ...(labelSize !== undefined ? { labelSize } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(gridColor !== undefined ? { gridColor } : {}),
    ...(tickColor !== undefined ? { tickColor } : {}),
    labelStyle: {
      ...current.axes[axisKey].labelStyle,
      ...(labelFontFamily !== undefined ? { family: labelFontFamily } : {}),
      ...(labelFontSize !== undefined ? { size: labelFontSize } : {}),
    },
    valueStyle: {
      ...current.axes[axisKey].valueStyle,
      ...(valueFontFamily !== undefined ? { family: valueFontFamily } : {}),
      ...(valueFontSize !== undefined ? { size: valueFontSize } : {}),
    },
    ticks: {
      ...current.axes[axisKey].ticks,
      ...tick,
      ...(tickDir ? { orientation: tickDir as PlotTickDirection } : {}),
      ...(tickLength !== undefined ? { length: tickLength } : {}),
      ...(minorTick !== undefined ? { minor: minorTick } : {}),
      ...(mirrorTick !== undefined ? { mirror: mirrorTick } : {}),
    },
  };
  const spec = normalizePlotSpecForCommand({
    ...current,
    axes: { ...current.axes, [axisKey]: axis },
    axisLabels: { ...current.axisLabels, [axisKey]: axis.label },
  });
  return {
    kind: "plot-axis-updated",
    spec,
    output: `Plot ${axisKey} axis updated: ${spec.title}`,
  };
};
