import type { StoreApi } from "zustand/vanilla";
import { normalizeDataset } from "../../domain/csv";
import type { SciSpaceDatabase } from "../db";
import {
  defaultProjectId,
  defaultProjectName,
  initialProjectRecord,
  persistLayout,
  projectRecordFromState,
  projectSummary,
} from "./projectPersistence";
import type { ScispaceState } from "./stateTypes";
import { normalizeColumnSelections } from "./createStoreHelpers";
import { ensureWorkspaceWindows, normalizePlotSpec, seedPlot } from "./workspaceDefaults";

interface ProjectActionContext {
  db: SciSpaceDatabase;
  get: StoreApi<ScispaceState>["getState"];
  set: StoreApi<ScispaceState>["setState"];
}

const uniqueProjectName = (
  requestedName: string,
  projects: { id: string; name: string }[],
  currentProjectId?: string,
): string => {
  const existingNames = new Set(
    projects.filter((project) => project.id !== currentProjectId).map((project) => project.name),
  );
  if (!existingNames.has(requestedName)) return requestedName;
  let index = 1;
  let candidate = `${requestedName} (${index})`;
  while (existingNames.has(candidate)) {
    index += 1;
    candidate = `${requestedName} (${index})`;
  }
  return candidate;
};

export const createProjectActions = ({
  db,
  get,
  set,
}: ProjectActionContext): Pick<
  ScispaceState,
  | "createNewProject"
  | "saveCurrentProject"
  | "switchProject"
  | "deleteProject"
  | "exportCurrentProjectJson"
  | "importProjectJson"
> => ({
  createNewProject: async (name) => {
    if (get().initialized && get().currentProjectId) {
      await get().saveCurrentProject();
    }
    const id = `project-${crypto.randomUUID()}`;
    const baseName = name?.trim() || `Untitled Project ${get().projects.length + 1}`;
    const projectName = uniqueProjectName(baseName, get().projects);
    const record = initialProjectRecord(id, projectName);
    const initialProject = {
      files: record.files,
      datasets: record.datasets,
      windows: record.layout.windows,
      plotSpecs: record.layout.plotSpecs ?? [],
      viewport: record.layout.viewport,
      commandHistory: record.layout.commandHistory ?? [],
      columnSelections: record.layout.columnSelections ?? {},
    };
    await db.transaction("rw", db.files, db.datasets, db.layout, db.projects, async () => {
      await db.files.clear();
      await db.datasets.clear();
      await db.layout.clear();
      await db.projects.put(record);
      await db.files.bulkPut(initialProject.files);
      await db.datasets.bulkPut(initialProject.datasets);
      await db.layout.put({
        id: "main",
        value: record.layout,
      });
    });

    set({
      initialized: true,
      files: initialProject.files,
      datasets: initialProject.datasets,
      projects: [...get().projects.filter((project) => project.id !== id), projectSummary(record)],
      currentProjectId: id,
      projectDirty: false,
      windows: initialProject.windows,
      plotSpecs: initialProject.plotSpecs,
      pendingImports: [],
      terminalEvents: [],
      commandHistory: [],
      undoStack: [],
      redoStack: [],
      columnSelections: initialProject.columnSelections,
      terminalCommandLineRequest: undefined,
      activeDatasetId: initialProject.datasets[0]?.id,
      activeWindowId: undefined,
      currentPlotId: initialProject.plotSpecs[0]?.id,
      viewport: initialProject.viewport,
    });
    persistLayout(db, get());
  },

  saveCurrentProject: async (name) => {
    const id = get().currentProjectId ?? defaultProjectId;
    const previous = await db.projects.get(id);
    const baseName = name?.trim() || previous?.name || defaultProjectName;
    const projectName = uniqueProjectName(baseName, get().projects, id);
    const record = projectRecordFromState(get(), id, projectName, previous);
    await db.transaction("rw", db.projects, db.layout, async () => {
      await db.projects.put(record);
      await db.layout.put({ id: "main", value: record.layout });
    });
    set((state) => ({
      currentProjectId: id,
      projectDirty: false,
      projects: [
        ...state.projects.filter((project) => project.id !== id),
        projectSummary(record),
      ].sort((left, right) => left.createdAt - right.createdAt),
    }));
    persistLayout(db, get());
  },

  switchProject: async (projectId) => {
    if (!projectId || projectId === get().currentProjectId) return;
    const target = await db.projects.get(projectId);
    if (!target) return;
    if (get().currentProjectId) await get().saveCurrentProject();
    const datasets = target.datasets.map(normalizeDataset);
    const plotSpecs = (target.layout.plotSpecs ?? [seedPlot()]).map(normalizePlotSpec);
    const windows = ensureWorkspaceWindows(target.layout.windows);
    const columnSelections = normalizeColumnSelections(
      datasets,
      target.layout.columnSelections ?? {},
    );
    await db.transaction("rw", db.files, db.datasets, db.layout, async () => {
      await db.files.clear();
      await db.datasets.clear();
      await db.files.bulkPut(target.files);
      await db.datasets.bulkPut(datasets);
      await db.layout.put({
        id: "main",
        value: {
          ...target.layout,
          windows,
          plotSpecs,
          columnSelections,
          currentProjectId: projectId,
        },
      });
    });
    const projects = (await db.projects.toArray()).map(projectSummary);
    const persistedConfigPlotId = windows.find(
      (window) => window.kind === "plot-config" && window.plotId,
    )?.plotId;
    set({
      files: target.files,
      datasets,
      projects,
      currentProjectId: projectId,
      projectDirty: false,
      windows,
      plotSpecs,
      pendingImports: [],
      terminalEvents: [],
      commandHistory: target.layout.commandHistory ?? [],
      undoStack: [],
      redoStack: [],
      columnSelections,
      activeDatasetId: datasets[0]?.id,
      activeWindowId: undefined,
      currentPlotId:
        persistedConfigPlotId && plotSpecs.some((plot) => plot.id === persistedConfigPlotId)
          ? persistedConfigPlotId
          : plotSpecs[0]?.id,
      viewport: target.layout.viewport,
    });
    persistLayout(db, get());
  },

  deleteProject: async (projectId) => {
    if (!projectId) return;
    const deletingCurrent = projectId === get().currentProjectId;
    await db.projects.delete(projectId);
    const remaining = await db.projects.toArray();
    if (!deletingCurrent) {
      set({ projects: remaining.map(projectSummary) });
      return;
    }
    const nextProject = remaining[0];
    if (nextProject) {
      set({ currentProjectId: undefined });
      await get().switchProject(nextProject.id);
      return;
    }

    const replacement = initialProjectRecord(defaultProjectId, defaultProjectName);
    await db.projects.put(replacement);
    const datasets = replacement.datasets.map(normalizeDataset);
    await db.transaction("rw", db.files, db.datasets, db.layout, async () => {
      await db.files.clear();
      await db.datasets.clear();
      await db.files.bulkPut(replacement.files);
      await db.datasets.bulkPut(datasets);
      await db.layout.put({ id: "main", value: replacement.layout });
    });
    set({
      files: replacement.files,
      datasets,
      projects: [projectSummary(replacement)],
      currentProjectId: replacement.id,
      projectDirty: false,
      windows: replacement.layout.windows,
      plotSpecs: (replacement.layout.plotSpecs ?? []).map(normalizePlotSpec),
      pendingImports: [],
      terminalEvents: [],
      commandHistory: [],
      undoStack: [],
      redoStack: [],
      columnSelections: replacement.layout.columnSelections ?? {},
      terminalCommandLineRequest: undefined,
      activeDatasetId: datasets[0]?.id,
      activeWindowId: undefined,
      currentPlotId: replacement.layout.plotSpecs?.[0]?.id,
      viewport: replacement.layout.viewport,
    });
    persistLayout(db, get());
  },

  exportCurrentProjectJson: async () => {
    const id = get().currentProjectId ?? defaultProjectId;
    const previous = await db.projects.get(id);
    const name =
      get().projects.find((project) => project.id === id)?.name ??
      previous?.name ??
      defaultProjectName;
    const record = projectRecordFromState(get(), id, name, previous);
    return JSON.stringify({ version: 1, project: record }, null, 2);
  },

  importProjectJson: async (json) => {
    const parsed: unknown = JSON.parse(json);
    const candidate =
      typeof parsed === "object" && parsed !== null && "project" in parsed
        ? (parsed as { project?: unknown }).project
        : parsed;
    if (typeof candidate !== "object" || candidate === null) {
      throw new Error("Project JSON must contain a project object");
    }
    const project = candidate as {
      name?: unknown;
      files?: unknown;
      datasets?: unknown;
      layout?: unknown;
      createdAt?: unknown;
    };
    if (!Array.isArray(project.files) || !Array.isArray(project.datasets)) {
      throw new Error("Project JSON must contain files and datasets arrays");
    }
    if (typeof project.layout !== "object" || project.layout === null) {
      throw new Error("Project JSON must contain a layout object");
    }
    const layout = project.layout as {
      windows?: unknown;
      viewport?: unknown;
      plotSpecs?: unknown;
      commandHistory?: unknown;
      columnSelections?: unknown;
    };
    if (!Array.isArray(layout.windows) || typeof layout.viewport !== "object") {
      throw new Error("Project JSON layout must contain windows and viewport");
    }

    if (get().initialized && get().currentProjectId) {
      await get().saveCurrentProject();
    }

    const id = `project-${crypto.randomUUID()}`;
    const name = uniqueProjectName(
      typeof project.name === "string" && project.name.trim()
        ? project.name.trim()
        : "Imported Project",
      get().projects,
    );
    const datasets = project.datasets.map(normalizeDataset);
    const plotSpecs = (Array.isArray(layout.plotSpecs) ? layout.plotSpecs : [seedPlot()]).map(
      normalizePlotSpec,
    );
    const windows = ensureWorkspaceWindows(layout.windows as ScispaceState["windows"]);
    const columnSelections = normalizeColumnSelections(
      datasets,
      (layout.columnSelections ?? {}) as Record<string, string[]>,
    );
    const now = Date.now();
    const record = {
      id,
      name,
      files: project.files as ScispaceState["files"],
      datasets,
      layout: {
        windows,
        viewport: layout.viewport as ScispaceState["viewport"],
        plotSpecs,
        commandHistory: Array.isArray(layout.commandHistory) ? layout.commandHistory : [],
        columnSelections,
        currentProjectId: id,
      },
      createdAt: typeof project.createdAt === "number" ? project.createdAt : now,
      updatedAt: now,
    };

    await db.transaction("rw", db.files, db.datasets, db.layout, db.projects, async () => {
      await db.projects.put(record);
      await db.files.clear();
      await db.datasets.clear();
      await db.files.bulkPut(record.files);
      await db.datasets.bulkPut(record.datasets);
      await db.layout.put({ id: "main", value: record.layout });
    });
    const projects = (await db.projects.toArray()).map(projectSummary);
    set({
      files: record.files,
      datasets: record.datasets,
      projects,
      currentProjectId: id,
      projectDirty: false,
      windows,
      plotSpecs,
      pendingImports: [],
      terminalEvents: [],
      commandHistory: record.layout.commandHistory,
      undoStack: [],
      redoStack: [],
      columnSelections,
      terminalCommandLineRequest: undefined,
      activeDatasetId: record.datasets[0]?.id,
      activeWindowId: undefined,
      currentPlotId: plotSpecs[0]?.id,
      viewport: record.layout.viewport,
    });
    persistLayout(db, get());
  },
});
