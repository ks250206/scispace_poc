import { resolveDatasetColumnId } from "../csv";
import type { PlotSpec, PlotType, ScispaceCommandResult } from "../types";
import {
  findDataset,
  parseOptionalBoolean,
  parsePositiveNumber,
  readOption,
  type CommandContext,
} from "./commandUtils";
import {
  findPlot,
  normalizePlotSpecForCommand,
  parsePadding,
  parsePlotDimension,
  plotTypes,
} from "./plotSpec";

export const executePlotSetCommand = (
  args: string[],
  context: CommandContext,
): ScispaceCommandResult => {
  const plot = findPlot(context.plotSpecs, args[0] ?? "");
  if (!plot) return { kind: "error", output: `Plot not found: ${args[0] ?? ""}` };

  const patch: Partial<PlotSpec> = {};
  const title = readOption(args, "title");
  const type = readOption(args, "type");
  const x = readOption(args, "x");
  const zoom = readOption(args, "zoom");
  const axisX = readOption(args, "axisX");
  const borderValue = readOption(args, "border");
  const border = parseOptionalBoolean(borderValue);
  const widthValue = readOption(args, "width");
  const heightValue = readOption(args, "height");
  const width = parsePlotDimension(widthValue);
  const height = parsePlotDimension(heightValue);
  const fontFamily = readOption(args, "fontFamily");
  const fontSizeValue = readOption(args, "fontSize");
  const fontSize = parsePositiveNumber(fontSizeValue);
  const paddingValue = readOption(args, "padding");
  const padding = parsePadding(paddingValue);
  const dataset = findDataset(context.datasets, plot.source);

  if (title !== undefined) {
    patch.title = title;
    patch.titleEdited = true;
  }
  if (type !== undefined) {
    if (!plotTypes.has(type as PlotType))
      return { kind: "error", output: `Unknown plot type: ${type}` };
    patch.plotType = type as PlotType;
  }
  if (x !== undefined) {
    const resolvedX = dataset ? resolveDatasetColumnId(dataset, x) : undefined;
    if (!resolvedX) return { kind: "error", output: `Unknown x column: ${x}` };
    patch.x = resolvedX;
  }
  if (zoom !== undefined) {
    if (zoom !== "x" && zoom !== "y" && zoom !== "xy")
      return { kind: "error", output: `Invalid zoom: ${zoom}` };
    patch.zoomMode = zoom;
  }
  if (borderValue !== undefined && border === undefined)
    return { kind: "error", output: `Invalid border value: ${borderValue}` };
  if (border !== undefined) patch.border = border;
  if (widthValue !== undefined && width === undefined)
    return { kind: "error", output: `Invalid plot width: ${widthValue}` };
  if (heightValue !== undefined && height === undefined)
    return { kind: "error", output: `Invalid plot height: ${heightValue}` };
  if (fontSizeValue !== undefined && fontSize === undefined)
    return { kind: "error", output: `Invalid font size: ${fontSizeValue}` };
  if (paddingValue !== undefined && padding === undefined)
    return { kind: "error", output: `Invalid padding: ${paddingValue}` };

  if (width !== undefined || height !== undefined) {
    const currentSize = normalizePlotSpecForCommand(plot).size;
    patch.size = {
      width: width ?? currentSize.width,
      height: height ?? currentSize.height,
    };
  }
  if (fontFamily !== undefined || fontSize !== undefined) {
    const currentFont = normalizePlotSpecForCommand(plot).font;
    patch.font = {
      family: fontFamily ?? currentFont.family,
      size: fontSize ?? currentFont.size,
    };
  }
  if (padding) patch.padding = padding;

  const current = normalizePlotSpecForCommand({ ...plot, ...patch });
  const spec = normalizePlotSpecForCommand({
    ...current,
    axes:
      axisX !== undefined
        ? { ...current.axes, x: { ...current.axes.x, label: axisX } }
        : current.axes,
    axisLabels: axisX !== undefined ? { ...current.axisLabels, x: axisX } : current.axisLabels,
  });
  return { kind: "plot-updated", spec, output: `Plot updated: ${spec.title}` };
};
