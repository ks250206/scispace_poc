export type WindowKind =
  | "browser"
  | "table"
  | "plot"
  | "plot-config"
  | "terminal"
  | "import"
  | "history";

export type ImportDelimiter = "auto" | "comma" | "tab" | "space" | "semicolon";

export interface ImportParseOptions {
  skipRows: number;
  delimiter: ImportDelimiter;
  commentPrefix: string;
  hasHeader: boolean;
  columnNames: string[];
  excludedColumnIds: string[];
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
  columnIds?: string[];
  plotId?: string;
  importId?: string;
}

export type CommandHistorySource = "terminal" | "gui" | "history";
export type CommandHistoryStatus = "success" | "error";

export interface CommandHistoryEntry {
  id: string;
  command: string;
  output: string;
  kind: ScispaceCommandResult["kind"];
  status: CommandHistoryStatus;
  createdAt: number;
  source: CommandHistorySource;
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

export interface DatasetColumn {
  id: string;
  name: string;
  sourceName?: string;
  dataType: "number" | "string" | "mixed";
}

export interface Dataset {
  id: string;
  name: string;
  sourcePath: string;
  columns: DatasetColumn[];
  rows: Record<string, DataValue>[];
  createdBy: "seed" | "upload" | "elt";
  createdAt: number;
}

export type PlotZoomMode = "x" | "y" | "xy";
export type PlotType = "line" | "line-marker" | "marker";
export type PlotTickDirection = "out" | "in" | "none";
export type PlotScale = "linear" | "log";
export type PlotMarkerShape = "circle" | "square" | "triangle" | "diamond" | "cross" | "plus";

export interface PlotTextStyle {
  family: string;
  size: number;
}

export interface PlotPaddingSpec {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PlotAxisSpec {
  label: string;
  range: { mode: "auto" | "manual"; min?: number; max?: number };
  ticks: {
    mode: "auto" | "manual";
    interval?: number;
    orientation: PlotTickDirection;
    length: number;
    minor: boolean;
  };
  scale: PlotScale;
  labelStyle: PlotTextStyle;
  valueStyle: PlotTextStyle;
  size: number;
  gap: number;
  labelGap: number;
  labelSize: number;
  color: string;
  gridColor: string;
  tickColor: string;
}

export interface PlotSizeSpec {
  width: number;
  height: number;
}

export interface PlotSeries {
  y: string;
  label: string;
  color: string;
  lineWidth: number;
  markerSize: number;
  markerShape: PlotMarkerShape;
  drawOrder: number;
}

export interface PlotAnnotation {
  id: string;
  type: "text-arrow";
  text: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
  font: PlotTextStyle;
}

export interface PlotSpec {
  id: string;
  type: "line";
  plotType: PlotType;
  source: string;
  x: string;
  title: string;
  series: PlotSeries[];
  zoomMode: PlotZoomMode;
  axes: { x: PlotAxisSpec; y: PlotAxisSpec };
  grid: { x: boolean; y: boolean };
  border: boolean;
  size: PlotSizeSpec;
  font: PlotTextStyle;
  padding: PlotPaddingSpec;
  annotations: PlotAnnotation[];
  axisLabels?: { x?: string; y?: string };
  titleEdited?: boolean;
  y?: string;
}

export type ScispaceCommandResult =
  | { kind: "text"; output: string }
  | { kind: "open-table"; datasetId: string; columnIds?: string[]; output: string }
  | { kind: "plot"; spec: PlotSpec; output: string }
  | { kind: "plot-created"; spec: PlotSpec; output: string }
  | { kind: "plot-updated"; spec: PlotSpec; output: string }
  | { kind: "plot-series-updated"; spec: PlotSpec; output: string }
  | { kind: "plot-axis-updated"; spec: PlotSpec; output: string }
  | { kind: "plot-annotation-updated"; spec: PlotSpec; output: string }
  | { kind: "dataset-updated"; datasetId: string; dataset: Dataset; output: string }
  | {
      kind: "file-command";
      action: "mkdir" | "rename" | "move" | "delete" | "list";
      path: string;
      name?: string;
      targetDirectory?: string;
      output: string;
    }
  | { kind: "import-preview"; importId: string; preview?: Dataset; error?: string; output: string }
  | { kind: "import-open"; importId: string; pendingImport: PendingImport; output: string }
  | { kind: "import-updated"; importId: string; pendingImport: PendingImport; output: string }
  | { kind: "import-cancel"; importId: string; output: string }
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
  commandHistory?: CommandHistoryEntry[];
  columnSelections?: Record<string, string[]>;
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
  mode: "tabular" | "raw";
  options: ImportParseOptions;
  allPreview?: Dataset;
  preview?: Dataset;
  error?: string;
}
