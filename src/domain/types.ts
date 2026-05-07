export type WindowKind = "browser" | "table" | "plot" | "terminal";

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
}

export interface VirtualFile {
  id: string;
  path: string;
  name: string;
  kind: "file" | "directory";
  text?: string;
  datasetId?: string;
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

export interface PlotSpec {
  id: string;
  type: "line";
  source: string;
  x: string;
  y: string;
  title: string;
}

export type ScispaceCommandResult =
  | { kind: "text"; output: string }
  | { kind: "open-table"; datasetId: string; output: string }
  | { kind: "plot"; spec: PlotSpec; output: string }
  | { kind: "dataset-created"; dataset: Dataset; output: string }
  | { kind: "error"; output: string };

export interface PersistedLayout {
  windows: WorkspaceWindow[];
  viewport: ViewportState;
  terminalHeight: number;
}
