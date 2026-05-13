import type { CSSProperties, DragEvent, MouseEvent, PointerEvent, WheelEvent } from "react";
import { CanvasWindow } from "../CanvasWindow";
import type { ViewportState, WorkspaceWindow } from "../../domain/types";

interface WorkspaceCanvasProps {
  canvasShellStyle: CSSProperties;
  canvasStyle: CSSProperties;
  handleBackgroundContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
  handleDrop: (event: DragEvent<HTMLElement>) => Promise<void>;
  handlePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  handleWheel: (event: WheelEvent<HTMLDivElement>) => void;
  isPanning: boolean;
  viewport: ViewportState;
  windows: WorkspaceWindow[];
}

export function WorkspaceCanvas({
  canvasShellStyle,
  canvasStyle,
  handleBackgroundContextMenu,
  handleDrop,
  handlePointerDown,
  handleWheel,
  isPanning,
  viewport,
  windows,
}: WorkspaceCanvasProps) {
  return (
    <section
      className="canvas-shell"
      data-grid-mode={viewport.scale < 0.5 ? "overview" : "dots"}
      data-panning={isPanning}
      style={canvasShellStyle}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onContextMenu={handleBackgroundContextMenu}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => void handleDrop(event)}
    >
      <div className="workspace-plane" style={canvasStyle}>
        {windows.map((window) => (
          <CanvasWindow key={window.id} window={window} />
        ))}
      </div>
    </section>
  );
}
