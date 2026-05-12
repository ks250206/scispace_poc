import { Rnd } from "react-rnd";
import { lazy, Suspense, type MouseEvent } from "react";
import { CommandHistoryWindow } from "./CommandHistoryWindow";
import { useContextMenu, type ContextMenuItem } from "./context-menu/ContextMenuProvider";
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
const PlotSchemaApplyWindow = lazy(() =>
  import("./PlotSchemaApplyWindow").then((module) => ({ default: module.PlotSchemaApplyWindow })),
);
const NewPlotWindow = lazy(() =>
  import("./NewPlotWindow").then((module) => ({ default: module.NewPlotWindow })),
);
const NewDatasetWindow = lazy(() =>
  import("./NewDatasetWindow").then((module) => ({ default: module.NewDatasetWindow })),
);
const DatasetCalcWindow = lazy(() =>
  import("./DatasetCalcWindow").then((module) => ({ default: module.DatasetCalcWindow })),
);
const PlotWindow = lazy(() =>
  import("./PlotWindow").then((module) => ({ default: module.PlotWindow })),
);
const ScispaceHelpWindow = lazy(() =>
  import("./ScispaceHelpWindow").then((module) => ({ default: module.ScispaceHelpWindow })),
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
  const tableMenuState = useScispaceStore((state) => state.tableMenuState);
  const plotMenuState = useScispaceStore((state) => state.plotMenuState);
  const { openContextMenu } = useContextMenu();
  const canClose =
    window.kind === "table" ||
    window.kind === "plot" ||
    window.kind === "plot-new" ||
    window.kind === "dataset-new" ||
    window.kind === "dataset-calc" ||
    window.kind === "help" ||
    window.kind === "plot-schema-apply" ||
    window.kind === "plot-config";
  const handleClose = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    closeWindow(window.id);
  };
  const windowContextItems = (): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        label: "Bring to Front",
        onSelect: () => focusWindow(window.id),
      },
    ];
    if (window.kind === "table" && tableMenuState?.windowId === window.id) {
      items.push(
        {
          label: "Copy TSV",
          disabled: !tableMenuState.hasSelectedRange,
          onSelect: tableMenuState.actions.copySelectedRange,
        },
        {
          label: "Delete selected cells",
          disabled: !tableMenuState.hasSelectedRange || tableMenuState.isLocked,
          danger: true,
          onSelect: tableMenuState.actions.clearSelectedRange,
        },
        {
          label: "Fill down",
          disabled: !tableMenuState.canFillDownRange || tableMenuState.isLocked,
          onSelect: tableMenuState.actions.fillDownSelectedRange,
        },
        {
          label: "Plot selection",
          disabled: !tableMenuState.canPlotSelection,
          onSelect: tableMenuState.actions.plotSelectedColumns,
        },
        {
          label: "Delete row",
          disabled: !tableMenuState.hasSelectedCell || tableMenuState.isLocked,
          danger: true,
          onSelect: tableMenuState.actions.deleteSelectedRow,
        },
        {
          label: "Delete column",
          disabled: !tableMenuState.hasSelectedColumn || tableMenuState.isLocked,
          danger: true,
          onSelect: tableMenuState.actions.deleteSelectedColumn,
        },
        {
          label: "Insert column",
          disabled: tableMenuState.isLocked,
          onSelect: tableMenuState.actions.insertColumn,
        },
        {
          label: "Calculate column",
          disabled: tableMenuState.isLocked,
          onSelect: tableMenuState.actions.calculateColumn,
        },
        {
          label: tableMenuState.isLocked ? "Unlock table" : "Lock table",
          onSelect: tableMenuState.actions.toggleLock,
        },
        {
          kind: "submenu",
          label: "Rows",
          items: [
            {
              label: "Rows Auto",
              disabled: tableMenuState.visibleRows === "auto",
              onSelect: () => tableMenuState.actions.setVisibleRows("auto"),
            },
            {
              label: "Rows 10",
              disabled: tableMenuState.visibleRows === 10,
              onSelect: () => tableMenuState.actions.setVisibleRows(10),
            },
            {
              label: "Rows 20",
              disabled: tableMenuState.visibleRows === 20,
              onSelect: () => tableMenuState.actions.setVisibleRows(20),
            },
            {
              label: "Rows 50",
              disabled: tableMenuState.visibleRows === 50,
              onSelect: () => tableMenuState.actions.setVisibleRows(50),
            },
          ],
        },
      );
    }
    if (window.kind === "plot" && window.plotId && plotMenuState?.plotId === window.plotId) {
      items.push(
        { label: "Plot Config", onSelect: plotMenuState.actions.openConfig },
        { label: "Copy plot schema", onSelect: plotMenuState.actions.copySchema },
        { label: "Apply plot schema", onSelect: plotMenuState.actions.applySchema },
        { label: "Export plot PNG", onSelect: plotMenuState.actions.exportPng },
        { label: "Export plot SVG", onSelect: plotMenuState.actions.exportSvg },
      );
    }
    if (canClose) {
      items.push({
        label: "Close Window",
        danger: true,
        onSelect: () => closeWindow(window.id),
      });
    }
    return items;
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
      <article
        className="window-frame"
        onContextMenu={(event) => {
          event.preventDefault();
          focusWindow(window.id);
          openContextMenu({
            x: event.clientX,
            y: event.clientY,
            title: window.title,
            items: windowContextItems(),
          });
        }}
      >
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
            {window.kind === "plot" && window.plotId ? (
              <PlotWindow plotId={window.plotId} windowId={window.id} />
            ) : null}
            {window.kind === "plot-new" ? <NewPlotWindow windowId={window.id} /> : null}
            {window.kind === "dataset-new" ? <NewDatasetWindow windowId={window.id} /> : null}
            {window.kind === "dataset-calc" ? (
              <DatasetCalcWindow
                key={window.datasetId ?? "dataset-calc"}
                windowId={window.id}
                datasetId={window.datasetId}
              />
            ) : null}
            {window.kind === "plot-config" ? <PlotConfigWindow /> : null}
            {window.kind === "plot-schema-apply" && window.plotId ? (
              <PlotSchemaApplyWindow plotId={window.plotId} windowId={window.id} />
            ) : null}
            {window.kind === "help" ? <ScispaceHelpWindow /> : null}
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
