import { Rnd } from "react-rnd";
import { lazy, Suspense, type MouseEvent } from "react";
import { CommandHistoryWindow } from "./CommandHistoryWindow";
import { DataBrowser } from "./DataBrowser";
import type { WorkspaceWindow } from "../domain/types";
import { useScispaceStore } from "../store/scispaceStore";

const DataTableWindow = lazy(() =>
  import("./DataTableWindow").then((module) => ({ default: module.DataTableWindow })),
);
const ImportSettingsWindow = lazy(() =>
  import("./ImportSettingsWindow").then((module) => ({ default: module.ImportSettingsWindow })),
);
const PlotConfigWindow = lazy(() =>
  import("./PlotConfigWindow").then((module) => ({ default: module.PlotConfigWindow })),
);
const PlotWindow = lazy(() =>
  import("./PlotWindow").then((module) => ({ default: module.PlotWindow })),
);
const TerminalPanel = lazy(() =>
  import("./TerminalPanel").then((module) => ({ default: module.TerminalPanel })),
);

interface CanvasWindowProps {
  window: WorkspaceWindow;
}

export function CanvasWindow({ window }: CanvasWindowProps) {
  const activeWindowId = useScispaceStore((state) => state.activeWindowId);
  const scale = useScispaceStore((state) => state.viewport.scale);
  const updateWindow = useScispaceStore((state) => state.updateWindow);
  const focusWindow = useScispaceStore((state) => state.focusWindow);
  const closeWindow = useScispaceStore((state) => state.closeWindow);
  const canClose =
    window.kind === "table" || window.kind === "plot" || window.kind === "plot-config";
  const handleClose = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    closeWindow(window.id);
  };

  return (
    <Rnd
      className={`canvas-window ${activeWindowId === window.id ? "is-active" : ""}`}
      size={{ width: window.width, height: window.height }}
      position={{ x: window.x, y: window.y }}
      minWidth={260}
      minHeight={220}
      scale={scale}
      style={{ zIndex: window.zIndex }}
      dragHandleClassName="window-titlebar"
      cancel=".window-close, button, input, select, textarea"
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
              onClick={handleClose}
              onMouseDown={handleClose}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
            >
              ×
            </button>
          ) : null}
        </header>
        <div className="window-body">
          {window.kind === "browser" ? <DataBrowser /> : null}
          {window.kind === "history" ? <CommandHistoryWindow /> : null}
          <Suspense fallback={<div className="window-loading">Loading window...</div>}>
            {window.kind === "table" && window.datasetId ? (
              <DataTableWindow
                datasetId={window.datasetId}
                windowId={window.id}
                columnIds={window.columnIds}
              />
            ) : null}
            {window.kind === "plot" && window.plotId ? <PlotWindow plotId={window.plotId} /> : null}
            {window.kind === "plot-config" ? <PlotConfigWindow /> : null}
            {window.kind === "terminal" ? <TerminalPanel /> : null}
            {window.kind === "import" && window.importId ? (
              <ImportSettingsWindow importId={window.importId} />
            ) : null}
          </Suspense>
        </div>
      </article>
    </Rnd>
  );
}
