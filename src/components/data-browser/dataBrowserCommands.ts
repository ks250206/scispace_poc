import { datasetColumnIds } from "../../domain/csv";
import type { Dataset, VirtualFile } from "../../domain/types";

export const depthOf = (path: string): number =>
  Math.max(
    0,
    path
      .replace(/^~\/raw\/?/, "")
      .split("/")
      .filter(Boolean).length - 1,
  );

export const sortRawItems = (items: VirtualFile[]): VirtualFile[] =>
  [...items].sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path);
    if (left.kind === right.kind) return pathCompare;
    return left.kind === "directory" && right.path.startsWith(`${left.path}/`) ? -1 : pathCompare;
  });

export const quoteCommandArg = (value: string): string =>
  /\s|["']/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;

export const uploadOpenCommand = (
  uploadId: string,
  fileName: string,
  mode: "tabular" | "raw" = "tabular",
): string =>
  `upload-open ${uploadId} name=${quoteCommandArg(fileName)} ref=${uploadId} mode=${mode}`;

export const tableCommand = (dataset: Dataset, columnIds: string[]): string =>
  `table ${quoteCommandArg(dataset.name)} columns=${columnIds.map(quoteCommandArg).join(",")}`;

export const plotCommand = (dataset: Dataset, selectedColumnIds: string[]): string | undefined => {
  const allColumnIds = datasetColumnIds(dataset);
  const columns = selectedColumnIds.filter((columnId) => allColumnIds.includes(columnId));
  const plotColumns = columns.length > 0 ? columns : allColumnIds;
  const [firstColumn, ...remainingColumns] = plotColumns;
  const x =
    plotColumns.length > 1
      ? firstColumn
      : allColumnIds.find((columnId) => columnId !== firstColumn);
  const yColumns = plotColumns.length > 1 ? remainingColumns : firstColumn ? [firstColumn] : [];
  const validYColumns = yColumns.filter((columnId) => columnId !== x);
  if (!x || validYColumns.length === 0) return undefined;
  return `plot ${quoteCommandArg(dataset.name)} x=${quoteCommandArg(x)} y=${validYColumns
    .map(quoteCommandArg)
    .join(",")}`;
};

export const columnsSelectedForDataset = (
  dataset: Dataset,
  selections: Record<string, string[]>,
): string[] => selections[dataset.id] ?? datasetColumnIds(dataset);
