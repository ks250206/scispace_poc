import { Rnd } from "react-rnd";
import { CommandHistoryWindow } from "./CommandHistoryWindow";
import { DataBrowser } from "./DataBrowser";
import { DataTableWindow } from "./DataTableWindow";
import { ImportSettingsWindow } from "./ImportSettingsWindow";
import { PlotWindow } from "./PlotWindow";
import { TerminalPanel } from "./TerminalPanel";
import type { WorkspaceWindow } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";

interface CanvasWindowProps {
  window: WorkspaceWindow;
}

export function CanvasWindow({ window }: CanvasWindowProps) {
  const activeWindowId = useScispaceStore((state) => state.activeWindowId);
  const updateWindow = useScispaceStore((state) => state.updateWindow);
  const focusWindow = useScispaceStore((state) => state.focusWindow);
  const closeWindow = useScispaceStore((state) => state.closeWindow);
  const canClose = window.kind === "table" || window.kind === "plot";

  return (
    <Rnd
      className={`canvas-window ${activeWindowId === window.id ? "is-active" : ""}`}
      size={{ width: window.width, height: window.height }}
      position={{ x: window.x, y: window.y }}
      minWidth={260}
      minHeight={220}
      bounds="parent"
      style={{ zIndex: window.zIndex }}
      dragHandleClassName="window-titlebar"
      onMouseDown={() => focusWindow(window.id)}
      onDragStop={(_, data) => updateWindow(window.id, { x: data.x, y: data.y })}
      onResizeStop={(_, __, ref, ___, position) =>
        updateWindow(window.id, {
          x: position.x,
          y: position.y,
          width: ref.offsetWidth,
          height: ref.offsetHeight,
        })
      }
    >
      <article className="window-frame">
        <header className="window-titlebar">
          <span className={`window-dot ${window.kind}`} />
          <strong>{window.title}</strong>
          <span className="window-kind">{window.kind}</span>
          {canClose ? (
            <button
              aria-label={`Close ${window.title}`}
              className="window-close"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                closeWindow(window.id);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              ×
            </button>
          ) : null}
        </header>
        <div className="window-body">
          {window.kind === "browser" ? <DataBrowser /> : null}
          {window.kind === "table" && window.datasetId ? (
            <DataTableWindow datasetId={window.datasetId} />
          ) : null}
          {window.kind === "plot" && window.plotId ? <PlotWindow plotId={window.plotId} /> : null}
          {window.kind === "terminal" ? <TerminalPanel /> : null}
          {window.kind === "history" ? <CommandHistoryWindow /> : null}
          {window.kind === "import" && window.importId ? (
            <ImportSettingsWindow importId={window.importId} />
          ) : null}
        </div>
      </article>
    </Rnd>
  );
}
