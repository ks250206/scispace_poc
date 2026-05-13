export const inferPlotDragZoomMode = (
  width: number,
  height: number,
): "x" | "y" | "xy" | undefined => {
  const minDrag = 8;
  const dominanceRatio = 2.5;
  const absWidth = Math.abs(width);
  const absHeight = Math.abs(height);
  const hasWidth = absWidth >= minDrag;
  const hasHeight = absHeight >= minDrag;
  if (!hasWidth && !hasHeight) return undefined;
  if (hasWidth && !hasHeight) return "x";
  if (hasHeight && !hasWidth) return "y";
  if (absWidth / Math.max(absHeight, 1) >= dominanceRatio) return "x";
  if (absHeight / Math.max(absWidth, 1) >= dominanceRatio) return "y";
  return "xy";
};

export const plotSelectionRectForZoomMode = (
  start: { left: number; top: number },
  end: { left: number; top: number },
  plotSize: { width: number; height: number },
): { left: number; top: number; width: number; height: number } => {
  const width = Math.abs(end.left - start.left);
  const height = Math.abs(end.top - start.top);
  const mode = inferPlotDragZoomMode(width, height);
  const horizontal = {
    left: Math.min(start.left, end.left),
    width,
  };
  const vertical = {
    top: Math.min(start.top, end.top),
    height,
  };
  if (mode === "x") return { ...horizontal, top: 0, height: plotSize.height };
  if (mode === "y") return { left: 0, width: plotSize.width, ...vertical };
  return { ...horizontal, ...vertical };
};
