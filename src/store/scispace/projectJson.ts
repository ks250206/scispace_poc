import { normalizeDataset } from "../../domain/csv";
import type { ProjectRecord } from "../db";
import { normalizeColumnSelections } from "./createStoreHelpers";
import { uniqueProjectName } from "./projectNames";
import type { ProjectSummary, ScispaceState } from "./stateTypes";
import { ensureWorkspaceWindows, normalizePlotSpec, seedPlot } from "./workspaceDefaults";

type ImportedProjectCandidate = {
  createdAt?: unknown;
  datasets?: unknown;
  files?: unknown;
  layout?: unknown;
  name?: unknown;
};

type ImportedLayoutCandidate = {
  columnSelections?: unknown;
  commandHistory?: unknown;
  plotSpecs?: unknown;
  uploadPayloads?: unknown;
  viewport?: unknown;
  windows?: unknown;
};

export const parseProjectJson = (json: string): ImportedProjectCandidate => {
  const parsed: unknown = JSON.parse(json);
  const candidate =
    typeof parsed === "object" && parsed !== null && "project" in parsed
      ? (parsed as { project?: unknown }).project
      : parsed;
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("Project JSON must contain a project object");
  }
  return candidate as ImportedProjectCandidate;
};

export const importedProjectRecord = (
  json: string,
  id: string,
  projects: ProjectSummary[],
  now = Date.now(),
): ProjectRecord => {
  const project = parseProjectJson(json);
  if (!Array.isArray(project.files) || !Array.isArray(project.datasets)) {
    throw new Error("Project JSON must contain files and datasets arrays");
  }
  if (typeof project.layout !== "object" || project.layout === null) {
    throw new Error("Project JSON must contain a layout object");
  }
  const layout = project.layout as ImportedLayoutCandidate;
  if (!Array.isArray(layout.windows) || typeof layout.viewport !== "object") {
    throw new Error("Project JSON layout must contain windows and viewport");
  }

  const name = uniqueProjectName(importedProjectName(project), projects);
  const datasets = project.datasets.map(normalizeDataset);
  const plotSpecs = (Array.isArray(layout.plotSpecs) ? layout.plotSpecs : [seedPlot()]).map(
    normalizePlotSpec,
  );
  const windows = ensureWorkspaceWindows(layout.windows as ScispaceState["windows"]);
  const columnSelections = normalizeColumnSelections(
    datasets,
    (layout.columnSelections ?? {}) as Record<string, string[]>,
  );

  return {
    id,
    name,
    files: project.files as ScispaceState["files"],
    datasets,
    layout: {
      windows,
      viewport: layout.viewport as ScispaceState["viewport"],
      plotSpecs,
      commandHistory: Array.isArray(layout.commandHistory) ? layout.commandHistory : [],
      uploadPayloads:
        typeof layout.uploadPayloads === "object" && layout.uploadPayloads !== null
          ? (layout.uploadPayloads as ScispaceState["uploadPayloads"])
          : {},
      columnSelections,
      currentProjectId: id,
    },
    createdAt: typeof project.createdAt === "number" ? project.createdAt : now,
    updatedAt: now,
  };
};

const importedProjectName = (project: ImportedProjectCandidate): string =>
  typeof project.name === "string" && project.name.trim()
    ? project.name.trim()
    : "Imported Project";
