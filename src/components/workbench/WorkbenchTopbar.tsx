import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import type { ProjectSummary } from "../../store/scispace/stateTypes";
import { ProjectPicker } from "./ProjectPicker";
import { ToolbarMenu, type ToolbarMenuProps } from "./ToolbarMenu";

interface WorkbenchTopbarProps {
  currentProjectId?: string;
  currentProjectName: string;
  dataLoadInputRef: RefObject<HTMLInputElement | null>;
  handleDeleteProject: (projectId?: string) => Promise<void>;
  handleImportProjectFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleLoadDataFiles: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  projectDirty: boolean;
  projectImportInputRef: RefObject<HTMLInputElement | null>;
  projectSelectorOpen: boolean;
  projectSelectorRef: RefObject<HTMLDivElement | null>;
  projects: ProjectSummary[];
  setOpenToolbarMenu: (label: string | undefined) => void;
  setProjectSelectorOpen: Dispatch<SetStateAction<boolean>>;
  switchProject: (projectId: string) => Promise<void>;
  toolbarMenus: ToolbarMenuProps[];
  zoomPercent: number;
}

export function WorkbenchTopbar({
  currentProjectId,
  currentProjectName,
  dataLoadInputRef,
  handleDeleteProject,
  handleImportProjectFile,
  handleLoadDataFiles,
  projectDirty,
  projectImportInputRef,
  projectSelectorOpen,
  projectSelectorRef,
  projects,
  setOpenToolbarMenu,
  setProjectSelectorOpen,
  switchProject,
  toolbarMenus,
  zoomPercent,
}: WorkbenchTopbarProps) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="brand">SciSpace</div>
      </div>
      <nav className="toolbar-menus" aria-label="SciSpace tools">
        {toolbarMenus.map((menu) => (
          <ToolbarMenu key={menu.label} {...menu} />
        ))}
      </nav>
      <div className="topbar-right">
        <ProjectPicker
          currentProjectId={currentProjectId}
          currentProjectName={currentProjectName}
          onDeleteProject={(projectId) => void handleDeleteProject(projectId)}
          onSwitchProject={(projectId) => void switchProject(projectId)}
          open={projectSelectorOpen}
          projects={projects}
          projectSelectorRef={projectSelectorRef}
          setOpen={setProjectSelectorOpen}
          setOpenToolbarMenu={setOpenToolbarMenu}
        />
        {projectDirty ? <span className="project-dirty">Unsaved</span> : null}
        <span className="zoom-control">Zoom {zoomPercent}%</span>
      </div>
      <div className="toolbar-hidden-inputs">
        <input
          ref={projectImportInputRef}
          aria-label="Import project file"
          className="visually-hidden"
          type="file"
          accept="application/json,.json,.scispace.json"
          onChange={(event) => void handleImportProjectFile(event)}
        />
        <input
          ref={dataLoadInputRef}
          aria-label="Load toolbar data files"
          className="visually-hidden"
          type="file"
          multiple
          onChange={(event) => void handleLoadDataFiles(event)}
        />
      </div>
    </div>
  );
}
