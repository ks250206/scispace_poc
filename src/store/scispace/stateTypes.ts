import type {
  CommandHistoryEntry,
  CommandHistorySource,
  Dataset,
  ImportFileResult,
  PendingImport,
  PlotSpec,
  ScispaceCommandResult,
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

export interface ScispaceState {
  initialized: boolean;
  files: VirtualFile[];
  datasets: Dataset[];
  projects: ProjectSummary[];
  currentProjectId?: string;
  windows: WorkspaceWindow[];
  plotSpecs: PlotSpec[];
  pendingImports: PendingImport[];
  terminalEvents: string[];
  commandHistory: CommandHistoryEntry[];
  undoStack: UndoHistoryEntry[];
  redoStack: UndoHistoryEntry[];
  terminalCommandLineRequest?: { id: string; command: string };
  columnSelections: Record<string, string[]>;
  activeDatasetId?: string;
  activeWindowId?: string;
  currentPlotId?: string;
  viewport: ViewportState;
  initialize: () => Promise<void>;
  importTextFile: (name: string, text: string) => Promise<ImportFileResult>;
  openImportDialog: (fileName: string, text: string) => string;
  confirmImport: (importId: string) => Promise<ImportFileResult | undefined>;
  setDatasetColumnSelection: (datasetId: string, columnIds: string[]) => void;
  toggleDatasetColumn: (datasetId: string, columnId: string) => void;
  selectDataset: (datasetId: string) => Promise<void>;
  openTable: (datasetId: string, columnIds?: string[]) => Promise<void>;
  openPlot: (spec: PlotSpec) => Promise<void>;
  openPlotConfig: (plotId: string) => void;
  runScispace: (
    input: string,
    options?: { source?: CommandHistorySource },
  ) => Promise<ScispaceCommandResult>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  closeWindow: (id: string) => void;
  createNewProject: (name?: string) => Promise<void>;
  saveCurrentProject: (name?: string) => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  createDirectory: (name: string, parentPath?: string) => Promise<VirtualFile | undefined>;
  renameVirtualItem: (path: string, name: string) => Promise<void>;
  moveVirtualItem: (path: string, targetDirectory: string) => Promise<void>;
  deleteVirtualItem: (path: string) => Promise<void>;
  updateWindow: (
    id: string,
    patch: Partial<Pick<WorkspaceWindow, "x" | "y" | "width" | "height">>,
  ) => void;
  focusWindow: (id: string) => void;
  setViewport: (viewport: ViewportState) => void;
  sendCommandToTerminalLine: (command: string) => void;
}

export interface ProjectSnapshot {
  files: VirtualFile[];
  datasets: Dataset[];
  windows: WorkspaceWindow[];
  plotSpecs: PlotSpec[];
  pendingImports: PendingImport[];
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
