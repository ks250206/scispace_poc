import { useCallback, useMemo, useRef, type PointerEvent, type WheelEvent } from "react";
import { CanvasWindow } from "./CanvasWindow";
import { useScispaceStore } from "../store/scispaceStore";

const workspaceWidth = 1920 * 3;
const workspaceHeight = 1080 * 3;

export function Workbench() {
  const viewport = useScispaceStore((state) => state.viewport);
  const setViewport = useScispaceStore((state) => state.setViewport);
  const windows = useScispaceStore((state) => state.windows);
  const importTextFile = useScispaceStore((state) => state.importTextFile);
  const canvasDrag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(
    null,
  );

  const canvasStyle = useMemo(
    () => ({
      width: workspaceWidth,
      height: workspaceHeight,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
    }),
    [viewport],
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      const nextScale = Math.min(1.8, Math.max(0.35, viewport.scale - event.deltaY * 0.001));
      setViewport({ ...viewport, scale: Number(nextScale.toFixed(2)) });
    },
    [setViewport, viewport],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 1 && !event.altKey) return;
    canvasDrag.current = {
      x: event.clientX,
      y: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
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
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    await Promise.all(files.map(async (file) => importTextFile(file.name, await file.text())));
  };

  return (
    <main className="workbench" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
      <div className="topbar">
        <div className="brand">SciSpace</div>
        <div className="toolbar-group">
          <button type="button" onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}>
            Reset View
          </button>
          <span>{Math.round(viewport.scale * 100)}%</span>
        </div>
      </div>
      <section
        className="canvas-shell"
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
