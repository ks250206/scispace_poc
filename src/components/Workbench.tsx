import { useEffect, useRef, useState } from "react";
import { CanvasWindow } from "./CanvasWindow";
import { uploadOpenCommand } from "./DataBrowser";
import { useContextMenu, type ContextMenuItem } from "./context-menu/ContextMenuProvider";
import { useDialog } from "./dialog/DialogProvider";
import { buildPlotSvg, safePlotFileName, svgDataUrl } from "./plotExport";
import type { WorkspaceWindow } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";
import { ProjectPicker } from "./workbench/ProjectPicker";
import {
  ToolbarMenu,
  toContextMenuItem,
  type ToolbarMenuItem,
  type ToolbarMenuProps,
} from "./workbench/ToolbarMenu";
import { emptyWindowMenuItem, windowMenuItem } from "./workbench/windowMenuItems";
import { useWorkspacePanZoom } from "./workbench/useWorkspacePanZoom";
import { centerViewport, quoteCommandArg } from "./workbench/workbenchView";

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
  const openPlotConfig = useScispaceStore((state) => state.openPlotConfig);
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

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    for (const file of files) {
      const text = await file.text();
      const uploadId = stageUploadPayload(file.name, text);
      void runScispace(uploadOpenCommand(uploadId, file.name), { source: "gui" });
    }
  };

  const handleLoadDataFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    for (const file of files) {
      const text = await file.text();
      const uploadId = stageUploadPayload(file.name, text);
      void runScispace(uploadOpenCommand(uploadId, file.name), { source: "gui" });
    }
  };

  const handleNewFolder = async () => {
    const name = await dialog.prompt({
      title: "Folder name",
      defaultValue: "New Folder",
      confirmLabel: "Create",
    });
    if (name) void runScispace(`file-mkdir ~/raw/${quoteCommandArg(name)}`, { source: "gui" });
  };

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

  const handleSaveProject = async () => {
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
    const currentName =
      projects.find((project) => project.id === currentProjectId)?.name ?? "scispace-project";
    const link = document.createElement("a");
    link.href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    link.download = `${currentName.replace(/[^\w.-]+/g, "_") || "scispace-project"}.scispace.json`;
    link.click();
  };

  const handleImportProjectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
  const currentProjectName =
    projects.find((project) => project.id === currentProjectId)?.name ?? "No Project";

  const activeWindow = windows.find((window) => window.id === activeWindowId);
  const activeTableMenuState =
    (!activeWindow || activeWindow.kind === "table") &&
    (!activeWindow || tableMenuState?.windowId === activeWindow.id)
      ? tableMenuState
      : undefined;
  const activePlotSpec = plotSpecs.find((plot) => plot.id === currentPlotId) ?? plotSpecs[0];
  const activePlotDataset = datasets.find((dataset) => dataset.id === activePlotSpec?.source);
  const hasResolvablePlotDataset =
    Boolean(activePlotDataset) || Boolean(resolveActivePlotDatasetFromStore());
  const resolveActivePlot = () => {
    const state = useScispaceStore.getState();
    const spec =
      state.plotSpecs.find((plot) => plot.id === state.currentPlotId) ?? state.plotSpecs[0];
    return {
      spec,
      dataset: state.datasets.find((dataset) => dataset.id === spec?.source),
      registeredActions:
        spec && state.plotMenuState?.plotId === spec.id ? state.plotMenuState.actions : undefined,
    };
  };
  function resolveActivePlotDatasetFromStore() {
    const state = useScispaceStore.getState();
    const spec =
      state.plotSpecs.find((plot) => plot.id === state.currentPlotId) ?? state.plotSpecs[0];
    return state.datasets.find((dataset) => dataset.id === spec?.source);
  }
  const clickDownload = (href: string, download: string) => {
    const link = document.createElement("a");
    link.href = href;
    link.download = download;
    link.click();
  };
  const copyActivePlotSchema = async () => {
    const { spec } = resolveActivePlot();
    if (!spec) return;
    const result = await runScispace(`plot-schema ${spec.id}`, { source: "gui" });
    if (result.kind !== "error") await navigator.clipboard?.writeText(result.output);
  };
  const openActivePlotConfig = () => {
    const { spec, registeredActions } = resolveActivePlot();
    if (registeredActions) {
      registeredActions.openConfig();
      return;
    }
    if (spec) openPlotConfig(spec.id);
  };
  const exportActivePlotPng = () => {
    const { spec, registeredActions } = resolveActivePlot();
    if (registeredActions) {
      registeredActions.exportPng();
      return;
    }
    if (!spec) return;
    const canvas = document.querySelector<HTMLCanvasElement>(".plot-window canvas");
    if (!canvas) return;
    clickDownload(canvas.toDataURL("image/png"), safePlotFileName(spec.title, "png"));
  };
  const exportActivePlotSvg = () => {
    const { spec, dataset } = resolveActivePlot();
    if (!spec || !dataset) return;
    clickDownload(svgDataUrl(buildPlotSvg(spec, dataset)), safePlotFileName(spec.title, "svg"));
  };
  const windowsByKind = {
    browser: windows.filter((window) => window.kind === "browser"),
    terminal: windows.filter((window) => window.kind === "terminal"),
    history: windows.filter((window) => window.kind === "history"),
    plotConfig: windows.filter((window) => window.kind === "plot-config"),
    tables: windows.filter((window) => window.kind === "table"),
    graphs: windows.filter((window) => window.kind === "plot"),
    imports: windows.filter((window) => window.kind === "import"),
    other: windows.filter(
      (window) =>
        !["browser", "terminal", "history", "plot-config", "table", "plot", "import"].includes(
          window.kind,
        ),
    ),
  };
  const windowItems = (items: WorkspaceWindow[]): ToolbarMenuItem[] =>
    items.length
      ? items.map((window) => windowMenuItem(window, activeWindowId, focusWindow, closeWindow))
      : [emptyWindowMenuItem()];
  const directWindowItems = [
    {
      kind: "browser" as const,
      label: "Data Browser",
      visible: windowsByKind.browser.length > 0,
    },
    {
      kind: "terminal" as const,
      label: "Terminal",
      visible: windowsByKind.terminal.length > 0,
    },
    {
      kind: "history" as const,
      label: "Command History",
      visible: windowsByKind.history.length > 0,
    },
  ].map(
    (window): ToolbarMenuItem => ({
      label: window.label,
      active: window.visible,
      onSelect: () => toggleUtilityWindow(window.kind),
    }),
  );
  const directPlotConfigItems = [...windowsByKind.plotConfig].map((window) =>
    windowMenuItem(window, activeWindowId, focusWindow, closeWindow),
  );
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

  const toolbarMenus: ToolbarMenuProps[] = [
    {
      label: "Project",
      openMenu: openToolbarMenu,
      setOpenMenu: setOpenToolbarMenu,
      items: [
        { label: "New Project", onSelect: () => void handleNewProject() },
        { label: "Save Project", onSelect: () => void handleSaveProject() },
        {
          label: "Delete Project",
          onSelect: () => void handleDeleteProject(),
          disabled: !currentProjectId,
        },
        { kind: "separator" },
        { kind: "submenu", label: "Recent Projects", items: recentProjectItems },
        { kind: "separator" },
        { label: "Import Project", onSelect: () => projectImportInputRef.current?.click() },
        { label: "Export Project", onSelect: () => void handleExportProject() },
      ],
    },
    {
      label: "Data",
      openMenu: openToolbarMenu,
      setOpenMenu: setOpenToolbarMenu,
      items: [
        { label: "Load Data", onSelect: () => dataLoadInputRef.current?.click() },
        { label: "New Dataset", onSelect: openNewDatasetWindow },
        {
          label: "Calculate Column",
          onSelect: () => openDatasetCalcWindow(),
          disabled: datasets.length === 0,
        },
        { label: "New Folder", onSelect: () => void handleNewFolder() },
      ],
    },
    {
      label: "Table",
      openMenu: openToolbarMenu,
      setOpenMenu: setOpenToolbarMenu,
      items: [
        {
          label: "Copy TSV",
          onSelect: () => activeTableMenuState?.actions.copySelectedRange(),
          disabled: !activeTableMenuState?.hasSelectedRange,
        },
        {
          label: "Delete selected cells",
          onSelect: () => activeTableMenuState?.actions.clearSelectedRange(),
          disabled: !activeTableMenuState?.hasSelectedRange || activeTableMenuState?.isLocked,
        },
        {
          label: "Fill down",
          onSelect: () => activeTableMenuState?.actions.fillDownSelectedRange(),
          disabled: !activeTableMenuState?.canFillDownRange || activeTableMenuState?.isLocked,
        },
        {
          label: "Plot selection",
          onSelect: () => activeTableMenuState?.actions.plotSelectedColumns(),
          disabled: !activeTableMenuState?.canPlotSelection,
        },
        {
          label: "Delete row",
          onSelect: () => activeTableMenuState?.actions.deleteSelectedRow(),
          disabled: !activeTableMenuState?.hasSelectedCell || activeTableMenuState?.isLocked,
        },
        {
          label: "Delete column",
          onSelect: () => activeTableMenuState?.actions.deleteSelectedColumn(),
          disabled: !activeTableMenuState?.hasSelectedColumn || activeTableMenuState?.isLocked,
        },
        {
          label: "Insert column",
          onSelect: () => activeTableMenuState?.actions.insertColumn(),
          disabled: !activeTableMenuState || activeTableMenuState.isLocked,
        },
        {
          label: activeTableMenuState?.isLocked ? "Unlock table" : "Lock table",
          onSelect: () => activeTableMenuState?.actions.toggleLock(),
          disabled: !activeTableMenuState,
        },
        {
          kind: "submenu",
          label: "Rows",
          disabled: !activeTableMenuState,
          items: [
            {
              label: "Rows Auto",
              onSelect: () => activeTableMenuState?.actions.setVisibleRows("auto"),
              disabled: !activeTableMenuState || activeTableMenuState.visibleRows === "auto",
            },
            {
              label: "Rows 10",
              onSelect: () => activeTableMenuState?.actions.setVisibleRows(10),
              disabled: !activeTableMenuState || activeTableMenuState.visibleRows === 10,
            },
            {
              label: "Rows 20",
              onSelect: () => activeTableMenuState?.actions.setVisibleRows(20),
              disabled: !activeTableMenuState || activeTableMenuState.visibleRows === 20,
            },
            {
              label: "Rows 50",
              onSelect: () => activeTableMenuState?.actions.setVisibleRows(50),
              disabled: !activeTableMenuState || activeTableMenuState.visibleRows === 50,
            },
          ],
        },
      ],
    },
    {
      label: "Plot",
      openMenu: openToolbarMenu,
      setOpenMenu: setOpenToolbarMenu,
      items: [
        {
          label: "New Plot",
          onSelect: openNewPlotWindow,
          disabled: datasets.length === 0,
        },
        {
          label: "Plot Config",
          onSelect: openActivePlotConfig,
        },
        {
          label: "Copy plot schema",
          onSelect: () => void copyActivePlotSchema(),
        },
        {
          label: "Export plot PNG",
          onSelect: exportActivePlotPng,
        },
        {
          label: "Export plot SVG",
          onSelect: exportActivePlotSvg,
          disabled: !hasResolvablePlotDataset,
        },
      ],
    },
    {
      label: "Edit",
      openMenu: openToolbarMenu,
      setOpenMenu: setOpenToolbarMenu,
      items: [
        { label: "Undo", onSelect: () => void undo(), disabled: undoStackLength === 0 },
        { label: "Redo", onSelect: () => void redo(), disabled: redoStackLength === 0 },
      ],
    },
    {
      label: "View",
      openMenu: openToolbarMenu,
      setOpenMenu: setOpenToolbarMenu,
      items: [
        { label: "Reset View", onSelect: () => setViewport(centerViewport) },
        { label: `Zoom ${Math.round(viewport.scale * 100)}%`, disabled: true },
      ],
    },
    {
      label: "Windows",
      openMenu: openToolbarMenu,
      setOpenMenu: setOpenToolbarMenu,
      items: [
        {
          label: "Bring to Front",
          onSelect: () => {
            if (activeWindowId) focusWindow(activeWindowId);
          },
          disabled: !activeWindowId,
        },
        { label: "Send to Back", disabled: true },
        { kind: "separator" },
        ...directWindowItems,
        ...directPlotConfigItems,
        { kind: "separator" },
        { kind: "submenu", label: "Tables", items: windowItems(windowsByKind.tables) },
        { kind: "submenu", label: "Graphs", items: windowItems(windowsByKind.graphs) },
        { kind: "submenu", label: "Imports", items: windowItems(windowsByKind.imports) },
        { kind: "submenu", label: "Other Windows", items: windowItems(windowsByKind.other) },
      ],
    },
  ];

  const backgroundContextItems: ContextMenuItem[] = toolbarMenus.map((menu) => ({
    kind: "submenu",
    label: menu.label,
    items: menu.items.map(toContextMenuItem),
  }));

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
