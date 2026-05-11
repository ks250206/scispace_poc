import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { CanvasWindow } from "./CanvasWindow";
import { uploadOpenCommand } from "./DataBrowser";
import { useDialog } from "./dialog/DialogProvider";
import { useScispaceStore } from "../store/scispaceStore";

const centerViewport = { x: -1920, y: -1080, scale: 1 };
const minScale = 0.1;
const maxScale = 3;
const wheelPanSensitivity = 0.75;
const baseDotSpacing = 24;
const baseMajorGridSpacing = 240;

const quoteCommandArg = (value: string): string =>
  /\s|["']/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;

interface ToolbarMenuItem {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
}

interface ToolbarMenuProps {
  label: string;
  openMenu: string | undefined;
  setOpenMenu: (label: string | undefined) => void;
  items: ToolbarMenuItem[];
}

function ToolbarMenu({ label, openMenu, setOpenMenu, items }: ToolbarMenuProps) {
  const isOpen = openMenu === label;
  return (
    <div className="toolbar-menu-root">
      <button
        type="button"
        className="toolbar-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setOpenMenu(isOpen ? undefined : label)}
      >
        {label}
      </button>
      {isOpen ? (
        <div className="toolbar-menu" role="menu" aria-label={`${label} menu`}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpenMenu(undefined);
                item.onSelect?.();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Workbench() {
  const dialog = useDialog();
  const viewport = useScispaceStore((state) => state.viewport);
  const setViewport = useScispaceStore((state) => state.setViewport);
  const windows = useScispaceStore((state) => state.windows);
  const projectImportInputRef = useRef<HTMLInputElement>(null);
  const dataLoadInputRef = useRef<HTMLInputElement>(null);
  const projects = useScispaceStore((state) => state.projects);
  const currentProjectId = useScispaceStore((state) => state.currentProjectId);
  const projectDirty = useScispaceStore((state) => state.projectDirty);
  const runScispace = useScispaceStore((state) => state.runScispace);
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
  const [isPanning, setIsPanning] = useState(false);
  const [openToolbarMenu, setOpenToolbarMenu] = useState<string>();
  const canvasDrag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(
    null,
  );

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

  const canvasStyle = useMemo(
    () => ({
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
    }),
    [viewport],
  );

  const canvasShellStyle = useMemo(
    () =>
      ({
        "--canvas-dot-step": `${Number((baseDotSpacing * viewport.scale).toFixed(2))}px`,
        "--canvas-major-step": `${Number((baseMajorGridSpacing * viewport.scale).toFixed(2))}px`,
        "--canvas-dot-x": `${Number(viewport.x.toFixed(2))}px`,
        "--canvas-dot-y": `${Number(viewport.y.toFixed(2))}px`,
      }) as CSSProperties,
    [viewport],
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (!event.metaKey && !event.ctrlKey && target.closest(".canvas-window")) return;
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        const nextScale = Math.min(
          maxScale,
          Math.max(minScale, viewport.scale - event.deltaY * 0.001),
        );
        const scale = Number(nextScale.toFixed(2));
        const centerX = event.clientX;
        const centerY = event.clientY;
        const worldCenterX = (centerX - viewport.x) / viewport.scale;
        const worldCenterY = (centerY - viewport.y) / viewport.scale;
        setViewport({
          ...viewport,
          x: centerX - worldCenterX * scale,
          y: centerY - worldCenterY * scale,
          scale,
        });
        return;
      }
      const horizontalDelta = event.shiftKey ? event.deltaY || event.deltaX : event.deltaX;
      const panStep = wheelPanSensitivity * viewport.scale;
      setViewport({
        ...viewport,
        x: viewport.x - horizontalDelta * panStep,
        y: viewport.y - (event.shiftKey ? 0 : event.deltaY * panStep),
      });
    },
    [setViewport, viewport],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const isBackground =
      target.classList.contains("canvas-shell") || target.classList.contains("workspace-plane");
    if (event.button !== 1 && !event.altKey && !(event.button === 0 && isBackground)) return;
    canvasDrag.current = {
      x: event.clientX,
      y: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (canvasDrag.current) {
      const drag = canvasDrag.current;
      setViewport({
        ...viewport,
        x: drag.originX + event.clientX - drag.x,
        y: drag.originY + event.clientY - drag.y,
      });
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    canvasDrag.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

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

  const handleDeleteProject = async () => {
    if (!currentProjectId) return;
    const currentName =
      projects.find((project) => project.id === currentProjectId)?.name ?? "current project";
    const confirmed = await dialog.confirm({
      title: "Delete project",
      message: `Delete project "${currentName}"?`,
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (confirmed) void deleteProject(currentProjectId);
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
        { label: "New Folder", onSelect: () => void handleNewFolder() },
      ],
    },
    {
      label: "Table",
      openMenu: openToolbarMenu,
      setOpenMenu: setOpenToolbarMenu,
      items: [
        { label: "Open Table", disabled: true },
        { label: "Delete Row", disabled: true },
        { label: "Delete Column", disabled: true },
      ],
    },
    {
      label: "Plot",
      openMenu: openToolbarMenu,
      setOpenMenu: setOpenToolbarMenu,
      items: [
        { label: "New Plot", disabled: true },
        { label: "Plot Config", disabled: true },
        { label: "Export Plot", disabled: true },
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
  ];

  return (
    <main className="workbench" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
      <div className="topbar">
        <div className="topbar-left">
          <div className="brand">SciSpace</div>
          <select
            className="project-select"
            aria-label="Project"
            value={currentProjectId ?? ""}
            onChange={(event) => void handleSwitchProject(event.target.value)}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {projectDirty ? <span className="project-dirty">Unsaved</span> : null}
        </div>
        <nav className="toolbar-menus" aria-label="SciSpace tools">
          {toolbarMenus.map((menu) => (
            <ToolbarMenu key={menu.label} {...menu} />
          ))}
        </nav>
        <div className="topbar-right">
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
