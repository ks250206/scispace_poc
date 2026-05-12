import type {
  CommandHistoryEntry,
  CommandHistorySource,
  Dataset,
  ImportFileResult,
  PendingImport,
  PlotSpec,
  ScispaceCommandResult,
  UploadPayload,
  ViewportState,
  VirtualFile,
  WorkspaceWindow,
} from "../../domain/types";

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export type TableVisibleRows = "auto" | 10 | 20 | 50;

export interface TableMenuState {
  windowId: string;
  datasetId: string;
  rowCount: number;
  visibleRows: TableVisibleRows;
  hasSelectedRange: boolean;
  canFillDownRange: boolean;
  canPlotSelection: boolean;
  hasSelectedCell: boolean;
  hasSelectedColumn: boolean;
  actions: {
    copySelectedRange: () => void;
    clearSelectedRange: () => void;
    fillDownSelectedRange: () => void;
    plotSelectedColumns: () => void;
    deleteSelectedRow: () => void;
    deleteSelectedColumn: () => void;
    setVisibleRows: (visibleRows: TableVisibleRows) => void;
  };
}

export interface PlotMenuState {
  plotId: string;
  actions: {
    openConfig: () => void;
    copySchema: () => void;
    exportPng: () => void;
    exportSvg: () => void;
  };
}

export interface ScispaceState {
  initialized: boolean;
  files: VirtualFile[];
  datasets: Dataset[];
  projects: ProjectSummary[];
  currentProjectId?: string;
  projectDirty: boolean;
  windows: WorkspaceWindow[];
  plotSpecs: PlotSpec[];
  pendingImports: PendingImport[];
  terminalEvents: string[];
  commandHistory: CommandHistoryEntry[];
  uploadPayloads: Record<string, UploadPayload>;
  undoStack: UndoHistoryEntry[];
  redoStack: UndoHistoryEntry[];
  terminalCommandLineRequest?: { id: string; command: string; execute?: boolean };
  columnSelections: Record<string, string[]>;
  activeDatasetId?: string;
  activeWindowId?: string;
  currentPlotId?: string;
  tableMenuState?: TableMenuState;
  plotMenuState?: PlotMenuState;
  viewport: ViewportState;
  initialize: () => Promise<void>;
  importTextFile: (name: string, text: string) => Promise<ImportFileResult>;
  stageUploadPayload: (fileName: string, text: string, mode?: "tabular" | "raw") => string;
  openImportDialog: (fileName: string, text: string) => string;
  confirmImport: (importId: string) => Promise<ImportFileResult | undefined>;
  setDatasetColumnSelection: (datasetId: string, columnIds: string[]) => void;
  toggleDatasetColumn: (datasetId: string, columnId: string) => void;
  selectDataset: (datasetId: string) => Promise<void>;
  openTable: (datasetId: string, columnIds?: string[]) => Promise<void>;
  openPlot: (spec: PlotSpec) => Promise<void>;
  openNewPlotWindow: () => void;
  openNewDatasetWindow: () => void;
  openDatasetCalcWindow: (datasetId?: string) => void;
  openPlotConfig: (plotId: string) => void;
  runScispace: (
    input: string,
    options?: { source?: CommandHistorySource },
  ) => Promise<ScispaceCommandResult>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  closeWindow: (id: string) => void;
  toggleUtilityWindow: (kind: "browser" | "terminal" | "history") => void;
  createNewProject: (name?: string) => Promise<void>;
  saveCurrentProject: (name?: string) => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  exportCurrentProjectJson: () => Promise<string>;
  importProjectJson: (json: string) => Promise<void>;
  createDirectory: (name: string, parentPath?: string) => Promise<VirtualFile | undefined>;
  renameVirtualItem: (path: string, name: string) => Promise<void>;
  moveVirtualItem: (path: string, targetDirectory: string) => Promise<void>;
  deleteVirtualItem: (path: string) => Promise<void>;
  updateWindow: (
    id: string,
    patch: Partial<Pick<WorkspaceWindow, "x" | "y" | "width" | "height">>,
  ) => void;
  focusWindow: (id: string) => void;
  blurActiveWindow: () => void;
  setTableMenuState: (state: TableMenuState) => void;
  clearTableMenuState: (windowId: string) => void;
  setPlotMenuState: (state: PlotMenuState) => void;
  clearPlotMenuState: (plotId: string) => void;
  setViewport: (viewport: ViewportState) => void;
  sendCommandToTerminalLine: (command: string, options?: { execute?: boolean }) => void;
}

export interface ProjectSnapshot {
  files: VirtualFile[];
  datasets: Dataset[];
  windows: WorkspaceWindow[];
  plotSpecs: PlotSpec[];
  pendingImports: PendingImport[];
  uploadPayloads: Record<string, UploadPayload>;
  columnSelections: Record<string, string[]>;
  activeDatasetId?: string;
  activeWindowId?: string;
  currentPlotId?: string;
  viewport: ViewportState;
}

export interface UndoHistoryEntry {
  id: string;
  command: string;
  before: ProjectSnapshot;
  after: ProjectSnapshot;
  createdAt: number;
}
