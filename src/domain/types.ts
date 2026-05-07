export type WindowKind = "browser" | "table" | "plot" | "terminal" | "import";

export type ImportDelimiter = "auto" | "comma" | "tab" | "space" | "semicolon";

export interface ImportParseOptions {
  skipRows: number;
  delimiter: ImportDelimiter;
  commentPrefix: string;
  hasHeader: boolean;
  columnNames: string[];
}

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

export interface WorkspaceWindow {
  id: string;
  kind: WindowKind;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  datasetId?: string;
  plotId?: string;
  importId?: string;
}

export interface VirtualFile {
  id: string;
  path: string;
  name: string;
  kind: "file" | "directory";
  text?: string;
  datasetId?: string;
  parseError?: string;
  createdAt: number;
}

export type DataValue = number | string;

export interface Dataset {
  id: string;
  name: string;
  sourcePath: string;
  columns: string[];
  rows: Record<string, DataValue>[];
  createdBy: "seed" | "upload" | "elt";
  createdAt: number;
}

export type PlotZoomMode = "x" | "y" | "xy";

export interface PlotSeries {
  y: string;
  label: string;
  color: string;
}

export interface PlotSpec {
  id: string;
  type: "line";
  source: string;
  x: string;
  title: string;
  series: PlotSeries[];
  zoomMode: PlotZoomMode;
  axisLabels?: { x?: string; y?: string };
  titleEdited?: boolean;
  y?: string;
}

export type ScispaceCommandResult =
  | { kind: "text"; output: string }
  | { kind: "open-table"; datasetId: string; output: string }
  | { kind: "plot"; spec: PlotSpec; output: string }
  | { kind: "import-preview"; importId: string; preview?: Dataset; error?: string; output: string }
  | {
      kind: "import-confirm";
      importId: string;
      dataset?: Dataset;
      parseError?: string;
      output: string;
    }
  | { kind: "dataset-created"; dataset: Dataset; output: string }
  | { kind: "error"; output: string };

export interface PersistedLayout {
  windows: WorkspaceWindow[];
  viewport: ViewportState;
  plotSpecs?: PlotSpec[];
}

export interface ImportFileResult {
  file: VirtualFile;
  dataset?: Dataset;
  parseError?: string;
}

export interface PendingImport {
  id: string;
  fileName: string;
  text: string;
  options: ImportParseOptions;
  preview?: Dataset;
  error?: string;
}
