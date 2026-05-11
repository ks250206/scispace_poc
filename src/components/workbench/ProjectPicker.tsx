import { type RefObject } from "react";
import type { ProjectSummary } from "../../store/scispace/stateTypes";

type ProjectPickerProps = {
  currentProjectId?: string;
  currentProjectName: string;
  onDeleteProject: (projectId: string) => void;
  onSwitchProject: (projectId: string) => void;
  open: boolean;
  projects: ProjectSummary[];
  projectSelectorRef: RefObject<HTMLDivElement | null>;
  setOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  setOpenToolbarMenu: (label: string | undefined) => void;
};

export function ProjectPicker({
  currentProjectId,
  currentProjectName,
  onDeleteProject,
  onSwitchProject,
  open,
  projects,
  projectSelectorRef,
  setOpen,
  setOpenToolbarMenu,
}: ProjectPickerProps) {
  return (
    <div ref={projectSelectorRef} className="project-picker">
      <button
        type="button"
        className="project-select"
        aria-label="Project selector"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpenToolbarMenu(undefined);
          setOpen((currentOpen) => !currentOpen);
        }}
      >
        <span>{currentProjectName}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="project-picker-menu" role="menu" aria-label="Project menu">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`project-picker-row ${project.id === currentProjectId ? "active" : ""}`}
            >
              <button
                type="button"
                role="menuitem"
                className="project-picker-main"
                onClick={() => {
                  setOpen(false);
                  onSwitchProject(project.id);
                }}
              >
                <span className="project-picker-check">
                  {project.id === currentProjectId ? "✓" : ""}
                </span>
                <span>{project.name}</span>
              </button>
              <button
                type="button"
                className="project-picker-delete"
                aria-label={`Delete project ${project.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onDeleteProject(project.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
