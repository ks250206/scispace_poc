import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { CanvasWindow } from "./CanvasWindow";
import { useScispaceStore } from "../store/scispaceStore";

const centerViewport = { x: -1920, y: -1080, scale: 1 };
const minScale = 0.1;
const maxScale = 3;
const wheelPanSensitivity = 0.75;
const baseDotSpacing = 24;
const baseMajorGridSpacing = 240;
const quoteCommandArg = (value: string): string =>
  /\s|["']/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;

export function Workbench() {
  const viewport = useScispaceStore((state) => state.viewport);
  const setViewport = useScispaceStore((state) => state.setViewport);
  const windows = useScispaceStore((state) => state.windows);
  const runScispace = useScispaceStore((state) => state.runScispace);
  const createNewProject = useScispaceStore((state) => state.createNewProject);
  const undoStackLength = useScispaceStore((state) => state.undoStack.length);
  const redoStackLength = useScispaceStore((state) => state.redoStack.length);
  const undo = useScispaceStore((state) => state.undo);
  const redo = useScispaceStore((state) => state.redo);
  const [isPanning, setIsPanning] = useState(false);
  const canvasDrag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(
    null,
  );

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
      const importId = crypto.randomUUID();
      const text = await file.text();
      void runScispace(
        `import-open ${importId} name=${quoteCommandArg(file.name)} text=${encodeURIComponent(
          text,
        )}`,
        { source: "gui" },
      );
    }
  };

  const handleNewProject = () => {
    const confirmed = window.confirm("Create a new project? Current data and windows will reset.");
    if (confirmed) void createNewProject();
  };

  return (
    <main className="workbench" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
      <div className="topbar">
        <div className="brand">SciSpace</div>
        <div className="toolbar-group">
          <button type="button" disabled={undoStackLength === 0} onClick={() => void undo()}>
            Undo
          </button>
          <button type="button" disabled={redoStackLength === 0} onClick={() => void redo()}>
            Redo
          </button>
          <button type="button" onClick={handleNewProject}>
            New Project
          </button>
          <button type="button" onClick={() => setViewport(centerViewport)}>
            Reset View
          </button>
          <span>{Math.round(viewport.scale * 100)}%</span>
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
