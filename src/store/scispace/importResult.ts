import { datasetColumnIds, normalizeVirtualPath } from "../../domain/csv";
import type { PendingImport, ScispaceCommandResult } from "../../domain/types";
import { createPreviews, normalizeColumnNames, readCommandPath } from "./importPreview";
import type { ResultApplyContext } from "./resultApplyContext";
import { makeFileRecord } from "./workspaceDefaults";
import { uniquifyPath } from "./virtualFiles";

export const applyImportResult = async (
  current: ScispaceCommandResult,
  context: ResultApplyContext,
): Promise<ScispaceCommandResult> => {
  let result = current;
  const { db, get, input, set } = context;
  if (result.kind === "import-updated") {
    const updatedImport = result.pendingImport;
    const { allPreview, preview, error } = createPreviews(
      updatedImport.id,
      updatedImport.fileName,
      updatedImport.text,
      updatedImport.options,
    );
    const normalizedImport: PendingImport = {
      ...updatedImport,
      options: normalizeColumnNames(updatedImport.options, allPreview),
      allPreview,
      preview,
      error,
    };
    set((state) => ({
      pendingImports: state.pendingImports.map((pendingImport) =>
        pendingImport.id === normalizedImport.id ? normalizedImport : pendingImport,
      ),
    }));
    result = { ...result, pendingImport: normalizedImport };
  }
  if (result.kind === "import-confirm") {
    const importId = result.importId;
    const pendingImport = get().pendingImports.find((item) => item.id === importId);
    if (!pendingImport) {
      result = { kind: "error", output: `Pending import not found: ${importId}` };
    } else {
      const rawPath = readCommandPath(input) ?? normalizeVirtualPath(pendingImport.fileName);
      const path = uniquifyPath(rawPath, get().files);
      const dataset = result.dataset
        ? {
            ...result.dataset,
            name: path.split("/").at(-1) ?? result.dataset.name,
            sourcePath: path,
          }
        : undefined;
      const file = makeFileRecord(path, pendingImport.text, dataset?.id, result.parseError);
      await db.transaction("rw", db.datasets, db.files, async () => {
        await db.files.put(file);
        if (dataset) await db.datasets.put(dataset);
      });
      set((state) => ({
        files: [...state.files.filter((item) => item.id !== file.id), file],
        datasets: dataset
          ? [...state.datasets.filter((item) => item.id !== dataset.id), dataset]
          : state.datasets,
        columnSelections: dataset
          ? { ...state.columnSelections, [dataset.id]: datasetColumnIds(dataset) }
          : state.columnSelections,
        activeDatasetId: dataset?.id ?? state.activeDatasetId,
        pendingImports: state.pendingImports.filter((item) => item.id !== importId),
        windows: state.windows.filter((window) => window.importId !== importId),
      }));
    }
  }
  if (result.kind === "import-cancel") {
    const importId = result.importId;
    set((state) => ({
      pendingImports: state.pendingImports.filter((item) => item.id !== importId),
      windows: state.windows.filter((window) => window.importId !== importId),
    }));
  }

  return result;
};
