import { detectImportPreset } from "../../domain/csv";
import type { PendingImport, ScispaceCommandResult, WorkspaceWindow } from "../../domain/types";
import { createPreviews, emptyColumnIds } from "./importPreview";
import type { ResultApplyContext } from "./resultApplyContext";
import { newWindowPosition } from "./workspaceDefaults";

export const applyImportOpenResult = async (
  current: ScispaceCommandResult,
  context: ResultApplyContext,
): Promise<ScispaceCommandResult> => {
  let result = current;
  const { set } = context;
  if (result.kind === "import-open") {
    const importId = result.importId;
    const detectedPreset = detectImportPreset(
      result.pendingImport.text,
      result.pendingImport.fileName,
    );
    const baseOptions = detectedPreset
      ? { ...result.pendingImport.options, ...detectedPreset.options }
      : result.pendingImport.options;
    const previews = createPreviews(
      importId,
      result.pendingImport.fileName,
      result.pendingImport.text,
      baseOptions,
      emptyColumnIds,
    );
    const pendingImport: PendingImport = {
      ...result.pendingImport,
      ...previews,
      detectedPreset,
      presetOverridden: false,
    };
    set((state) => {
      const existingWindow = state.windows.find((window) => window.importId === importId);
      const zIndex = Math.max(0, ...state.windows.map((window) => window.zIndex)) + 1;
      const position = newWindowPosition(state, 88, 72);
      const window: WorkspaceWindow = {
        id: `import-${importId}`,
        kind: "import",
        title: `Import - ${pendingImport.fileName}`,
        x: position.x,
        y: position.y,
        width: 1120,
        height: 720,
        zIndex,
        importId,
      };
      return {
        pendingImports: [
          ...state.pendingImports.filter((item) => item.id !== importId),
          pendingImport,
        ],
        windows: existingWindow
          ? state.windows.map((item) =>
              item.id === existingWindow.id ? { ...item, zIndex } : item,
            )
          : [...state.windows, window],
        activeWindowId: existingWindow?.id ?? window.id,
      };
    });
    result = { ...result, pendingImport };
  }

  return result;
};
