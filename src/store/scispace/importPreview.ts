import { executeScispaceCommand } from "../../domain/scispace";
import type { Dataset, ImportParseOptions } from "../../domain/types";

export const canParseAsTable = (name: string): boolean => /\.(csv|tsv)$/i.test(name);

export const emptyColumnIds = (dataset?: Dataset): string[] => {
  if (!dataset) return [];
  return dataset.columns
    .filter((column) =>
      dataset.rows.every((row) => {
        const value = row[column.id];
        return value == null || value === "";
      }),
    )
    .map((column) => column.id);
};

export const createPreviews = (
  id: string,
  fileName: string,
  text: string,
  options: ImportParseOptions,
): { allPreview?: Dataset; preview?: Dataset; error?: string } => {
  const allResult = executeScispaceCommand(`import-preview ${id}`, {
    datasets: [],
    pendingImports: [
      { id, fileName, text, mode: "tabular", options: { ...options, excludedColumnIds: [] } },
    ],
  });
  const result = executeScispaceCommand(`import-preview ${id}`, {
    datasets: [],
    pendingImports: [{ id, fileName, text, mode: "tabular", options }],
  });
  if (result.kind === "import-preview" && allResult.kind === "import-preview") {
    return { allPreview: allResult.preview, preview: result.preview, error: result.error };
  }
  return { error: result.output };
};

export const normalizeColumnNames = (
  options: ImportParseOptions,
  preview?: Dataset,
): ImportParseOptions => {
  if (!preview) return options;
  const columnNames = preview.columns.map(
    (column, index) => options.columnNames[index]?.trim() || column.name || `column_${index + 1}`,
  );
  return { ...options, columnNames };
};

export const readCommandPath = (input: string): string | undefined => {
  const match = input.match(/(?:^|\s)path=("[^"]+"|'[^']+'|\S+)/);
  if (!match) return undefined;
  const token = match[1].replace(/^["']|["']$/g, "");
  try {
    return decodeURIComponent(token);
  } catch {
    return token;
  }
};
