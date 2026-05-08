import type { PlotAnnotation, ScispaceCommandResult } from "../types";
import { parseColor, parsePositiveNumber, readOption, type CommandContext } from "./commandUtils";
import { findPlot, normalizePlotSpecForCommand } from "./plotSpec";

export const executePlotAnnotationCommand = (
  args: string[],
  context: CommandContext,
): ScispaceCommandResult => {
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
};
