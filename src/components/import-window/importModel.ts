import type { Dataset, PendingImport } from "../../domain/types";

export const rowHeight = 32;
export const defaultColumnWidth = 140;
export const minColumnWidth = 96;
export const rawLineNumberWidth = 64;
export const rawTextDefaultWidth = 720;

export const formatCellValue = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
};

export const importStatusText = (
  pendingImport: PendingImport,
  preview: Dataset | undefined,
  rawLineCount: number,
): string | undefined => {
  if (pendingImport.mode === "raw") return `${rawLineCount} raw lines`;
  if (preview) return `${preview.rows.length} preview rows · ${preview.columns.length} columns`;
  return pendingImport.error;
};

export const rawRowClassName = (
  pendingImport: PendingImport,
  lineIndex: number,
): string | undefined => {
  const classNames = [
    lineIndex < pendingImport.options.skipRows ? "skipped-row" : "",
    pendingImport.detectedPreset?.dataStartLine === lineIndex + 1 ? "data-start-row" : "",
  ].filter(Boolean);
  return classNames.length > 0 ? classNames.join(" ") : undefined;
};
