import { executeScispaceCommand } from "../../domain/scispace";
import type { Dataset, ImportParseOptions, PendingImport } from "../../domain/types";

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
  resolveExcludedIds?: (allPreview?: Dataset) => string[],
): Pick<PendingImport, "allPreview" | "preview" | "error" | "columnTypeError" | "options"> => {
  const result = executeScispaceCommand(`import-preview ${id}`, {
    datasets: [],
    pendingImports: [
      { id, fileName, text, mode: "tabular", options: { ...options, excludedColumnIds: [] } },
    ],
  });
  const allPreview = result.kind === "import-preview" ? result.preview : undefined;
  const excludedColumnIds = resolveExcludedIds?.(allPreview) ?? options.excludedColumnIds;
  const resolvedOptions = { ...options, excludedColumnIds };
  if (!allPreview)
    return {
      allPreview,
      preview: undefined,
      options: resolvedOptions,
      error: result.output,
      columnTypeError: undefined,
    };

  const columns = allPreview.columns.filter(({ id }) => !excludedColumnIds.includes(id));
  if (columns.length === 0)
    return {
      allPreview,
      preview: undefined,
      options: resolvedOptions,
      error: "No import columns selected",
      columnTypeError: undefined,
    };
  const typeErrors = result.kind === "import-preview" ? result.columnTypeErrors : undefined;
  const invalidColumn = typeErrors && columns.find(({ id }) => Object.hasOwn(typeErrors, id));
  const columnTypeError = invalidColumn && typeErrors[invalidColumn.id];
  if (columns.length === allPreview.columns.length)
    return {
      allPreview,
      preview: allPreview,
      options: resolvedOptions,
      error: undefined,
      columnTypeError,
    };
  const rows = allPreview.rows.map((row) =>
    Object.fromEntries(columns.map(({ id }) => [id, row[id]])),
  );
  return {
    allPreview,
    preview: { ...allPreview, columns, rows },
    options: resolvedOptions,
    error: undefined,
    columnTypeError,
  };
};

export const remapRenamedColumnExclusions = (
  previous: PendingImport | undefined,
  updated: PendingImport,
  allPreview?: Dataset,
): string[] => {
  const excluded = updated.options.excludedColumnIds;
  const previousColumns = previous?.allPreview?.columns;
  if (
    !excluded.length ||
    !previous ||
    !previousColumns ||
    !allPreview ||
    previous.options.columnNames === updated.options.columnNames ||
    previous.text !== updated.text ||
    previous.options.skipRows !== updated.options.skipRows ||
    previous.options.delimiter !== updated.options.delimiter ||
    previous.options.commentPrefix !== updated.options.commentPrefix ||
    previous.options.hasHeader !== updated.options.hasHeader
  )
    return excluded;

  return excluded.map((id) => {
    const index = previousColumns.findIndex((column) => column.id === id);
    return allPreview.columns[index]?.id ?? id;
  });
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
