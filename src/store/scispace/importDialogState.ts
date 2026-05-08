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
  const initialPreview = createPreviews(id, fileName, text, baseOptions);
  const options = {
    ...baseOptions,
    excludedColumnIds: emptyColumnIds(initialPreview.allPreview),
  };
  const { allPreview, preview, error } = createPreviews(id, fileName, text, options);
  const zIndex = Math.max(0, ...state.windows.map((window) => window.zIndex)) + 1;
  const position = newWindowPosition(state, 72, 84);
  const pendingImport: PendingImport = {
    id,
    fileName,
    text,
    mode: "tabular",
    options,
    detectedPreset,
    allPreview,
    preview,
    error,
  };
  const window: WorkspaceWindow = {
    id: `import-${id}`,
    kind: "import",
    title: `Import - ${fileName}`,
    x: position.x,
    y: position.y,
    width: 820,
    height: 540,
    zIndex,
    importId: id,
  };

  return { id, pendingImport, window };
};
