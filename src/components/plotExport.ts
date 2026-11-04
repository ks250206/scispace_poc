import { normalizePlotSpecForCommand } from "../domain/scispace";
import type { PlotSpec } from "../domain/types";

export const plotSchemaJson = (spec: PlotSpec): string =>
  JSON.stringify(normalizePlotSpecForCommand(spec), null, 2);

export const safePlotFileName = (title: string, extension: string): string =>
  `${title.replace(/[^\w.-]+/g, "_") || "plot"}.${extension}`;

export const serializePlotSvg = (svg: SVGSVGElement): string =>
  new XMLSerializer().serializeToString(svg);

export const svgDataUrl = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const exportPlotPng = async (
  svg: SVGSVGElement,
  { width, height }: PlotSpec["size"],
  scale: number,
): Promise<string> => {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([serializePlotSvg(svg)], { type: "image/svg+xml" }));
  try {
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    const pixelRatio = Math.min(scale, 8192 / Math.max(width, height));
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL("image/png");
    if (png === "data:,") throw new Error("Canvas could not encode PNG");
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
};
