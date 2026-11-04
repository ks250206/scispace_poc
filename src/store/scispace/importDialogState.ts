import { detectImportPreset, defaultImportParseOptions } from "../../domain/csv";
import type { PendingImport, WorkspaceWindow } from "../../domain/types";
import type { ScispaceState } from "./stateTypes";
import { createPreviews, emptyColumnIds } from "./importPreview";
import { newWindowPosition } from "./workspaceDefaults";

interface ImportDialogState {
  id: string;
  pendingImport: PendingImport;
  window: WorkspaceWindow;
}

export const createImportDialogState = (
  fileName: string,
  text: string,
  state: ScispaceState,
): ImportDialogState => {
  const id = crypto.randomUUID();
  const detectedPreset = detectImportPreset(text, fileName);
  const baseOptions = detectedPreset
    ? { ...defaultImportParseOptions, ...detectedPreset.options }
    : defaultImportParseOptions;
  const previews = createPreviews(id, fileName, text, baseOptions, emptyColumnIds);
  const zIndex = Math.max(0, ...state.windows.map((window) => window.zIndex)) + 1;
  const position = newWindowPosition(state, 88, 72);
  const pendingImport: PendingImport = {
    id,
    fileName,
    text,
    mode: "tabular",
    ...previews,
    detectedPreset,
    presetOverridden: false,
  };
  const window: WorkspaceWindow = {
    id: `import-${id}`,
    kind: "import",
    title: `Import - ${fileName}`,
    x: position.x,
    y: position.y,
    width: 1120,
    height: 720,
    zIndex,
    importId: id,
  };

  return { id, pendingImport, window };
};
