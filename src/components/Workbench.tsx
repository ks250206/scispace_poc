import { useEffect, useRef, useState } from "react";
import { CanvasWindow } from "./CanvasWindow";
import { useContextMenu } from "./context-menu/ContextMenuProvider";
import { useDialog } from "./dialog/DialogProvider";
import { useScispaceStore } from "../store/scispaceStore";
import { ProjectPicker } from "./workbench/ProjectPicker";
import { ToolbarMenu } from "./workbench/ToolbarMenu";
import { useActivePlotActions } from "./workbench/useActivePlotActions";
import { useWorkspacePanZoom } from "./workbench/useWorkspacePanZoom";
import { useWorkbenchWindowMenu } from "./workbench/useWorkbenchWindowMenu";
import { useProjectMenuActions } from "./workbench/useProjectMenuActions";
import { useWorkbenchDataActions } from "./workbench/useWorkbenchDataActions";
import { useWorkbenchToolbarMenus } from "./workbench/useWorkbenchToolbarMenus";

export function Workbench() {
  const dialog = useDialog();
  const { openContextMenu } = useContextMenu();
  const viewport = useScispaceStore((state) => state.viewport);
  const setViewport = useScispaceStore((state) => state.setViewport);
  const windows = useScispaceStore((state) => state.windows);
  const datasets = useScispaceStore((state) => state.datasets);
  const plotSpecs = useScispaceStore((state) => state.plotSpecs);
  const activeWindowId = useScispaceStore((state) => state.activeWindowId);
  const projectImportInputRef = useRef<HTMLInputElement>(null);
  const dataLoadInputRef = useRef<HTMLInputElement>(null);
  const projects = useScispaceStore((state) => state.projects);
  const currentProjectId = useScispaceStore((state) => state.currentProjectId);
  const projectDirty = useScispaceStore((state) => state.projectDirty);
  const currentPlotId = useScispaceStore((state) => state.currentPlotId);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const openNewPlotWindow = useScispaceStore((state) => state.openNewPlotWindow);
  const openNewDatasetWindow = useScispaceStore((state) => state.openNewDatasetWindow);
  const openDatasetCalcWindow = useScispaceStore((state) => state.openDatasetCalcWindow);
  const openHelpWindow = useScispaceStore((state) => state.openHelpWindow);
  const openPlotConfig = useScispaceStore((state) => state.openPlotConfig);
  const openPlotSchemaApplyWindow = useScispaceStore((state) => state.openPlotSchemaApplyWindow);
  const stageUploadPayload = useScispaceStore((state) => state.stageUploadPayload);
  const createNewProject = useScispaceStore((state) => state.createNewProject);
  const saveCurrentProject = useScispaceStore((state) => state.saveCurrentProject);
  const switchProject = useScispaceStore((state) => state.switchProject);
  const deleteProject = useScispaceStore((state) => state.deleteProject);
  const exportCurrentProjectJson = useScispaceStore((state) => state.exportCurrentProjectJson);
  const importProjectJson = useScispaceStore((state) => state.importProjectJson);
  const undoStackLength = useScispaceStore((state) => state.undoStack.length);
  const redoStackLength = useScispaceStore((state) => state.redoStack.length);
  const undo = useScispaceStore((state) => state.undo);
  const redo = useScispaceStore((state) => state.redo);
  const focusWindow = useScispaceStore((state) => state.focusWindow);
  const blurActiveWindow = useScispaceStore((state) => state.blurActiveWindow);
  const closeWindow = useScispaceStore((state) => state.closeWindow);
  const toggleUtilityWindow = useScispaceStore((state) => state.toggleUtilityWindow);
  const tableMenuState = useScispaceStore((state) => state.tableMenuState);
  const [openToolbarMenu, setOpenToolbarMenu] = useState<string>();
  const [projectSelectorOpen, setProjectSelectorOpen] = useState(false);
  const projectSelectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openToolbarMenu) return;
    const closeOnPointerDown = (event: globalThis.PointerEvent) => {
      if ((event.target as HTMLElement).closest(".toolbar-menu-root")) return;
      setOpenToolbarMenu(undefined);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenToolbarMenu(undefined);
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openToolbarMenu]);

  useEffect(() => {
    if (!projectSelectorOpen) return;
    const closeOnPointerDown = (event: globalThis.PointerEvent) => {
      if (projectSelectorRef.current?.contains(event.target as Node)) return;
      setProjectSelectorOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProjectSelectorOpen(false);
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [projectSelectorOpen]);

  const {
    canvasShellStyle,
    canvasStyle,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    isPanning,
  } = useWorkspacePanZoom({ blurActiveWindow, setViewport, viewport });

  const { handleDrop, handleLoadDataFiles, handleNewFolder } = useWorkbenchDataActions({
    dialog,
    runScispace,
    stageUploadPayload,
  });

  const {
    currentProjectName,
    handleDeleteProject,
    handleExportProject,
    handleImportProjectFile,
    handleNewProject,
    handleSaveProjectAs,
    handleSwitchProject,
    openProjectImportFile,
    recentProjectItems,
  } = useProjectMenuActions({
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
  });

  const activeWindow = windows.find((window) => window.id === activeWindowId);
  const activeTableMenuState =
    (!activeWindow || activeWindow.kind === "table") &&
    (!activeWindow || tableMenuState?.windowId === activeWindow.id)
      ? tableMenuState
      : undefined;
  const {
    activePlotSpec,
    copyActivePlotSchema,
    exportActivePlotPng,
    exportActivePlotSvg,
    hasResolvablePlotDataset,
    openActivePlotConfig,
    openActivePlotSchemaApply,
  } = useActivePlotActions({
    currentPlotId,
    datasets,
    openPlotConfig,
    openPlotSchemaApplyWindow,
    plotSpecs,
    runScispace,
  });
  const { directPlotConfigItems, directWindowItems, windowSubmenuItems } = useWorkbenchWindowMenu({
    activeWindowId,
    closeWindow,
    focusWindow,
    toggleUtilityWindow,
    windows,
  });
  const { backgroundContextItems, toolbarMenus } = useWorkbenchToolbarMenus({
    activePlotSpec,
    activeTableMenuState,
    activeWindowId,
    copyActivePlotSchema,
    currentProjectId,
    datasets,
    directPlotConfigItems,
    directWindowItems,
    exportActivePlotPng,
    exportActivePlotSvg,
    focusWindow,
    handleDeleteProject,
    handleExportProject,
    handleNewFolder,
    handleNewProject,
    handleSaveProjectAs,
    hasResolvablePlotDataset,
    openActivePlotConfig,
    openActivePlotSchemaApply,
    openDatasetCalcWindow,
    openHelpWindow,
    openMenu: openToolbarMenu,
    openNewDatasetWindow,
    openNewPlotWindow,
    openProjectImportFile,
    redo,
    redoStackLength,
    recentProjectItems,
    saveCurrentProject,
    setOpenMenu: setOpenToolbarMenu,
    setViewport,
    showDataLoadPicker: () => dataLoadInputRef.current?.click(),
    undo,
    undoStackLength,
    viewport,
    windowSubmenuItems,
  });

  const handleBackgroundContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        ".canvas-window, .context-menu, .toolbar-menu, .dialog-modal, button, input, select, textarea",
      )
    ) {
      return;
    }
    event.preventDefault();
    setOpenToolbarMenu(undefined);
    openContextMenu({
      x: event.clientX,
      y: event.clientY,
      title: "SciSpace",
      items: backgroundContextItems,
    });
  };

  return (
    <main className="workbench" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
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
            onSwitchProject={(projectId) => void handleSwitchProject(projectId)}
            open={projectSelectorOpen}
            projects={projects}
            projectSelectorRef={projectSelectorRef}
            setOpen={setProjectSelectorOpen}
            setOpenToolbarMenu={setOpenToolbarMenu}
          />
          {projectDirty ? <span className="project-dirty">Unsaved</span> : null}
          <span className="zoom-control">Zoom {Math.round(viewport.scale * 100)}%</span>
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
      <section
        className="canvas-shell"
        data-grid-mode={viewport.scale < 0.5 ? "overview" : "dots"}
        data-panning={isPanning}
        style={canvasShellStyle}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onContextMenu={handleBackgroundContextMenu}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="workspace-plane" style={canvasStyle}>
          {windows.map((window) => (
            <CanvasWindow key={window.id} window={window} />
          ))}
        </div>
      </section>
    </main>
  );
}
