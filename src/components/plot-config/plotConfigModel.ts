export type PlotConfigTab = "basic" | "axes" | "series" | "annotations";

export interface PlotSizeDraft {
  width: string;
  height: string;
}

export interface AnnotationDraft {
  text: string;
  x: string;
  y: string;
  dx: string;
  dy: string;
}

export interface ParsedAnnotationDraft {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export const plotSizeDraftFromSpec = (size: { width: number; height: number }): PlotSizeDraft => ({
  width: String(size.width),
  height: String(size.height),
});

export const parsePlotSizeDraft = (
  draft: PlotSizeDraft,
): { width: number; height: number } | null => {
  const width = Number(draft.width);
  const height = Number(draft.height);
  return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
};

export const parseAnnotationDraft = (draft: AnnotationDraft): ParsedAnnotationDraft | null => {
  const parsed = {
    x: Number(draft.x),
    y: Number(draft.y),
    dx: Number(draft.dx),
    dy: Number(draft.dy),
  };
  return Object.values(parsed).every(Number.isFinite) ? parsed : null;
};
