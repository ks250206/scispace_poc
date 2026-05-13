import type { ChangeEvent, RefObject } from "react";
import type { ProjectSummary } from "../../store/scispace/stateTypes";
import type { useDialog } from "../dialog/DialogProvider";
import type { ToolbarMenuItem } from "./ToolbarMenu";
import { emptyWindowMenuItem } from "./windowMenuItems";

interface UseProjectMenuActionsOptions {
  createNewProject: (name?: string) => Promise<void>;
  currentProjectId?: string;
  deleteProject: (projectId: string) => Promise<void>;
  dialog: ReturnType<typeof useDialog>;
  exportCurrentProjectJson: () => Promise<string>;
  importProjectJson: (json: string) => Promise<void>;
  projectDirty: boolean;
  projectImportInputRef: RefObject<HTMLInputElement | null>;
  projects: ProjectSummary[];
  saveCurrentProject: (name?: string) => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
}

export const useProjectMenuActions = ({
  createNewProject,
  currentProjectId,
  deleteProject,
  dialog,
  exportCurrentProjectJson,
  importProjectJson,
  projectDirty,
  projectImportInputRef,
  projects,
  saveCurrentProject,
  switchProject,
}: UseProjectMenuActionsOptions) => {
  const currentProjectName =
    projects.find((project) => project.id === currentProjectId)?.name ?? "No Project";

  const handleNewProject = async () => {
    const confirmed = await dialog.confirm({
      title: "Create new project",
      message: "Current project will be saved first.",
      confirmLabel: "Create",
    });
    if (!confirmed) return;
    const name = await dialog.prompt({
      title: "Project name",
      defaultValue: `Untitled Project ${projects.length + 1}`,
      confirmLabel: "Create",
    });
    void createNewProject(name ?? undefined);
  };

  const handleSaveProjectAs = async () => {
    const currentName =
      projects.find((project) => project.id === currentProjectId)?.name ?? "Main Project";
    const name = await dialog.prompt({
      title: "Project name",
      defaultValue: currentName,
      confirmLabel: "Save",
    });
    if (name !== null) void saveCurrentProject(name);
  };

  const handleDeleteProject = async (projectId = currentProjectId) => {
    if (!projectId) return;
    const currentName =
      projects.find((project) => project.id === projectId)?.name ?? "current project";
    const confirmed = await dialog.confirm({
      title: "Delete project",
      message: `Delete project "${currentName}"?`,
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (confirmed) void deleteProject(projectId);
  };

  const handleExportProject = async () => {
    const json = await exportCurrentProjectJson();
    const link = document.createElement("a");
    link.href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    link.download = `${
      currentProjectName.replace(/[^\w.-]+/g, "_") || "scispace-project"
    }.scispace.json`;
    link.click();
  };

  const handleImportProjectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    await importProjectJson(await file.text());
  };

  const handleSwitchProject = async (projectId: string) => {
    if (!projectId || projectId === currentProjectId) return;
    if (
      projectDirty &&
      !(await dialog.confirm({
        title: "Switch project",
        message: "Switch projects and save current unsaved changes?",
        confirmLabel: "Switch",
      }))
    ) {
      return;
    }
    void switchProject(projectId);
  };

  const recentProjectItems: ToolbarMenuItem[] =
    projects.length > 0
      ? projects.map((project) => ({
          label: project.name,
          active: project.id === currentProjectId,
          onSelect: () => void handleSwitchProject(project.id),
          rightLabel: "×",
          rightAriaLabel: `Delete project ${project.name}`,
          onRightSelect: () => void handleDeleteProject(project.id),
        }))
      : [emptyWindowMenuItem()];

  return {
    currentProjectName,
    handleDeleteProject,
    handleExportProject,
    handleImportProjectFile,
    handleNewProject,
    handleSaveProjectAs,
    handleSwitchProject,
    openProjectImportFile: () => projectImportInputRef.current?.click(),
    recentProjectItems,
  };
};
