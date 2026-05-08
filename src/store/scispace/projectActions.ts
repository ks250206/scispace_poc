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

export const createProjectActions = ({
  db,
  get,
  set,
}: ProjectActionContext): Pick<
  ScispaceState,
  "createNewProject" | "saveCurrentProject" | "switchProject" | "deleteProject"
> => ({
  createNewProject: async (name) => {
    if (get().initialized && get().currentProjectId) {
      await get().saveCurrentProject();
    }
    const id = `project-${crypto.randomUUID()}`;
    const projectName = name?.trim() || `Untitled Project ${get().projects.length + 1}`;
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
    const projectName = name?.trim() || previous?.name || defaultProjectName;
    const record = projectRecordFromState(get(), id, projectName, previous);
    await db.transaction("rw", db.projects, db.layout, async () => {
      await db.projects.put(record);
      await db.layout.put({ id: "main", value: record.layout });
    });
    set((state) => ({
      currentProjectId: id,
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
});
