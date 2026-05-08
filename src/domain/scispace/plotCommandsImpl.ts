import { datasetColumnIds, resolveDatasetColumnId } from "../csv";
import type {
  PlotAnnotation,
  PlotMarkerShape,
  PlotSeries,
  PlotSpec,
  PlotTickDirection,
  PlotType,
  ScispaceCommandResult,
} from "../types";
import {
  findDataset,
  isString,
  parseColor,
  parseInteger,
  parseNonNegativeNumber,
  parseOptionalBoolean,
  parsePositiveNumber,
  readOption,
  type CommandContext,
} from "./commandUtils";
import {
  axisDataHasNonPositiveValues,
  createPlotSeries,
  defaultPlotAxis,
  defaultPlotFont,
  defaultPlotPadding,
  defaultPlotSize,
  findPlot,
  markerShapes,
  normalizePlotSpecForCommand,
  normalizeSeriesStyle,
  parsePadding,
  parsePlotDimension,
  parseRange,
  parseTick,
  plotSpecSchema,
  plotTypes,
  tickDirections,
} from "./plotSpec";

export const executePlotCommand = (
  command: string,
  args: string[],
  context: CommandContext,
): ScispaceCommandResult | undefined => {
  if (command === "plot") {
    const dataset = findDataset(context.datasets, args[0] ?? "");
    if (!dataset) return { kind: "error", output: `Dataset not found: ${args[0] ?? ""}` };

    const columnIds = datasetColumnIds(dataset);
    const requestedX = readOption(args, "x");
    const x = requestedX ? resolveDatasetColumnId(dataset, requestedX) : columnIds[0];
    const yColumns = (readOption(args, "y") ?? columnIds[1] ?? "")
      .split(",")
      .map((column) => column.trim())
      .map((column) => resolveDatasetColumnId(dataset, column))
      .filter(isString);
    const requestedPlotColumns = [
      requestedX ?? columnIds[0],
      ...(readOption(args, "y") ?? columnIds[1] ?? "").split(",").map((column) => column.trim()),
    ].filter(Boolean);
    const resolvedPlotColumns = [x, ...yColumns].filter(Boolean);
    const unknownColumns =
      requestedPlotColumns.length === resolvedPlotColumns.length
        ? []
        : requestedPlotColumns.filter((column) => !resolveDatasetColumnId(dataset, column));
    if (yColumns.length === 0 || unknownColumns.length > 0) {
      return {
        kind: "error",
        output: `Unknown plot columns for ${dataset.name}: ${unknownColumns.join(", ")}`,
      };
    }
    const series = createPlotSeries(yColumns);
    const plotType = readOption(args, "type") ?? "line";
    if (!plotTypes.has(plotType as PlotType)) {
      return { kind: "error", output: `Unknown plot type: ${plotType}` };
    }
    const width = parsePlotDimension(readOption(args, "width"));
    const height = parsePlotDimension(readOption(args, "height"));
    if (readOption(args, "width") !== undefined && width === undefined)
      return { kind: "error", output: `Invalid plot width: ${readOption(args, "width")}` };
    if (readOption(args, "height") !== undefined && height === undefined)
      return { kind: "error", output: `Invalid plot height: ${readOption(args, "height")}` };

    const spec = normalizePlotSpecForCommand({
      id: crypto.randomUUID(),
      type: "line",
      plotType: plotType as PlotType,
      source: dataset.id,
      x: x ?? "",
      y: series[0]?.y,
      title: `${dataset.name}: ${series.map((item) => item.y).join(", ")} vs ${x}`,
      series,
      zoomMode: "xy",
      axisLabels: { x: x ?? "", y: series.map((item) => item.label).join(", ") },
      axes: {
        x: defaultPlotAxis(x ?? ""),
        y: defaultPlotAxis(series.map((item) => item.label).join(", ")),
      },
      grid: { x: true, y: true },
      border: true,
      size: {
        width: width ?? defaultPlotSize.width,
        height: height ?? defaultPlotSize.height,
      },
      font: defaultPlotFont,
      padding: defaultPlotPadding,
      annotations: [],
    });

    return { kind: "plot-created", spec, output: `Plot opened: ${spec.title}` };
  }

  if (command === "plot-set") {
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
  }

  if (command === "plot-schema") {
    const plotId = args[0];
    if (!plotId) {
      return { kind: "text", output: JSON.stringify(plotSpecSchema, null, 2) };
    }
    const plot = findPlot(context.plotSpecs, plotId);
    if (!plot) return { kind: "error", output: `Plot not found: ${plotId}` };
    return { kind: "text", output: JSON.stringify(normalizePlotSpecForCommand(plot), null, 2) };
  }

  if (command === "plot-axis") {
    const plot = findPlot(context.plotSpecs, args[0] ?? "");
    if (!plot) return { kind: "error", output: `Plot not found: ${args[0] ?? ""}` };
    const axisKey = readOption(args, "axis");
    if (axisKey !== "x" && axisKey !== "y") return { kind: "error", output: "axis must be x or y" };
    const current = normalizePlotSpecForCommand(plot);
    const range = parseRange(readOption(args, "range"));
    if (readOption(args, "range") && !range) return { kind: "error", output: "Invalid range" };
    const tick = parseTick(readOption(args, "tick"));
    if (readOption(args, "tick") && !tick)
      return { kind: "error", output: "Invalid tick interval" };
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
  }

  if (command === "plot-grid") {
    const plot = findPlot(context.plotSpecs, args[0] ?? "");
    if (!plot) return { kind: "error", output: `Plot not found: ${args[0] ?? ""}` };
    const current = normalizePlotSpecForCommand(plot);
    const xValue = readOption(args, "x");
    const yValue = readOption(args, "y");
    const x = parseOptionalBoolean(xValue);
    const y = parseOptionalBoolean(yValue);
    if (xValue !== undefined && x === undefined)
      return { kind: "error", output: `Invalid grid x value: ${xValue}` };
    if (yValue !== undefined && y === undefined)
      return { kind: "error", output: `Invalid grid y value: ${yValue}` };
    const spec = normalizePlotSpecForCommand({
      ...current,
      grid: { x: x ?? current.grid.x, y: y ?? current.grid.y },
    });
    return { kind: "plot-updated", spec, output: `Plot grid updated: ${spec.title}` };
  }

  if (command === "plot-series") {
    const plot = findPlot(context.plotSpecs, args[0] ?? "");
    if (!plot) return { kind: "error", output: `Plot not found: ${args[0] ?? ""}` };
    const current = normalizePlotSpecForCommand(plot);
    const dataset = findDataset(context.datasets, current.source);
    const requestedY = readOption(args, "y");
    const y = dataset ? resolveDatasetColumnId(dataset, requestedY) : undefined;
    if (!y) return { kind: "error", output: `Unknown series column: ${requestedY ?? ""}` };
    const action = readOption(args, "action");
    let series = current.series;
    if (action === "add") {
      if (!series.some((item) => item.y === y)) {
        series = [...series, createPlotSeries([y])[0] as PlotSeries];
      }
    } else if (action === "remove") {
      if (series.length <= 1) return { kind: "error", output: "Cannot remove the last series" };
      series = series.filter((item) => item.y !== y);
    } else {
      const markerShape = readOption(args, "markerShape");
      if (markerShape && !markerShapes.has(markerShape as PlotMarkerShape))
        return { kind: "error", output: `Invalid marker shape: ${markerShape}` };
      const lineWidth = readOption(args, "lineWidth");
      if (lineWidth !== undefined && !Number.isFinite(Number(lineWidth)))
        return { kind: "error", output: `Invalid line width: ${lineWidth}` };
      const markerSize = readOption(args, "markerSize");
      if (markerSize !== undefined && !Number.isFinite(Number(markerSize)))
        return { kind: "error", output: `Invalid marker size: ${markerSize}` };
      const orderValue = readOption(args, "order");
      const drawOrder = parseInteger(orderValue);
      if (orderValue !== undefined && drawOrder === undefined)
        return { kind: "error", output: `Invalid draw order: ${orderValue}` };
      series = series.map((item) => {
        if (item.y !== y) return item;
        return normalizeSeriesStyle(
          {
            ...item,
            label: readOption(args, "label") ?? item.label,
            color: readOption(args, "color") ?? item.color,
            lineWidth: Number(lineWidth ?? item.lineWidth),
            markerSize: Number(markerSize ?? item.markerSize),
            markerShape: (markerShape as PlotMarkerShape | undefined) ?? item.markerShape,
            drawOrder: drawOrder ?? item.drawOrder,
          },
          series.findIndex((candidate) => candidate.y === y),
        );
      });
    }
    const spec = normalizePlotSpecForCommand({ ...current, series });
    return { kind: "plot-series-updated", spec, output: `Plot series updated: ${spec.title}` };
  }

  if (command === "plot-annotation") {
    const plot = findPlot(context.plotSpecs, args[0] ?? "");
    if (!plot) return { kind: "error", output: `Plot not found: ${args[0] ?? ""}` };
    const current = normalizePlotSpecForCommand(plot);
    const action = readOption(args, "action");
    const id = readOption(args, "id");
    if (action !== "add" && action !== "update" && action !== "remove") {
      return {
        kind: "error",
        output: "Usage: plot-annotation <plotId> action=<add|update|remove>",
      };
    }

    if (action === "remove") {
      if (!id || !current.annotations.some((annotation) => annotation.id === id)) {
        return { kind: "error", output: `Annotation not found: ${id ?? ""}` };
      }
      const spec = normalizePlotSpecForCommand({
        ...current,
        annotations: current.annotations.filter((annotation) => annotation.id !== id),
      });
      return {
        kind: "plot-annotation-updated",
        spec,
        output: `Plot annotation removed: ${spec.title}`,
      };
    }

    const xValue = readOption(args, "x");
    const yValue = readOption(args, "y");
    const dxValue = readOption(args, "dx");
    const dyValue = readOption(args, "dy");
    const fontSizeValue = readOption(args, "fontSize");
    const x = xValue === undefined ? undefined : Number(xValue);
    const y = yValue === undefined ? undefined : Number(yValue);
    const dx = dxValue === undefined ? undefined : Number(dxValue);
    const dy = dyValue === undefined ? undefined : Number(dyValue);
    const fontSize = parsePositiveNumber(fontSizeValue);
    const colorValue = readOption(args, "color");
    const color = parseColor(colorValue);
    if (xValue !== undefined && !Number.isFinite(x))
      return { kind: "error", output: `Invalid annotation x: ${xValue}` };
    if (yValue !== undefined && !Number.isFinite(y))
      return { kind: "error", output: `Invalid annotation y: ${yValue}` };
    if (dxValue !== undefined && !Number.isFinite(dx))
      return { kind: "error", output: `Invalid annotation dx: ${dxValue}` };
    if (dyValue !== undefined && !Number.isFinite(dy))
      return { kind: "error", output: `Invalid annotation dy: ${dyValue}` };
    if (fontSizeValue !== undefined && fontSize === undefined)
      return { kind: "error", output: `Invalid annotation font size: ${fontSizeValue}` };
    if (colorValue !== undefined && color === undefined)
      return { kind: "error", output: `Invalid annotation color: ${colorValue}` };

    if (action === "add") {
      if (readOption(args, "type") !== "text-arrow" || x === undefined || y === undefined) {
        return {
          kind: "error",
          output: "Usage: plot-annotation <plotId> action=add type=text-arrow x=<n> y=<n>",
        };
      }
      const annotation: PlotAnnotation = {
        id: crypto.randomUUID(),
        type: "text-arrow",
        text: readOption(args, "text") ?? "Annotation",
        x,
        y,
        dx: dx ?? 24,
        dy: dy ?? -24,
        color: color ?? "#111827",
        font: {
          family: readOption(args, "fontFamily") ?? current.font.family,
          size: fontSize ?? current.font.size,
        },
      };
      const spec = normalizePlotSpecForCommand({
        ...current,
        annotations: [...current.annotations, annotation],
      });
      return {
        kind: "plot-annotation-updated",
        spec,
        output: `Plot annotation added: ${spec.title}`,
      };
    }

    if (!id) return { kind: "error", output: "Annotation id is required" };
    let found = false;
    const annotations = current.annotations.map((annotation) => {
      if (annotation.id !== id) return annotation;
      found = true;
      return {
        ...annotation,
        text: readOption(args, "text") ?? annotation.text,
        x: x ?? annotation.x,
        y: y ?? annotation.y,
        dx: dx ?? annotation.dx,
        dy: dy ?? annotation.dy,
        color: color ?? annotation.color,
        font: {
          family: readOption(args, "fontFamily") ?? annotation.font.family,
          size: fontSize ?? annotation.font.size,
        },
      };
    });
    if (!found) return { kind: "error", output: `Annotation not found: ${id}` };
    const spec = normalizePlotSpecForCommand({ ...current, annotations });
    return {
      kind: "plot-annotation-updated",
      spec,
      output: `Plot annotation updated: ${spec.title}`,
    };
  }

  return undefined;
};
