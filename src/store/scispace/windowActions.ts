import type { StoreApi } from "zustand/vanilla";
import type { SciSpaceDatabase } from "../db";
import { persistLayout } from "./projectPersistence";
import type { ScispaceState } from "./stateTypes";

interface WindowActionContext {
  db: SciSpaceDatabase;
  get: StoreApi<ScispaceState>["getState"];
  set: StoreApi<ScispaceState>["setState"];
}

export const createWindowActions = ({
  db,
  get,
  set,
}: WindowActionContext): Pick<
  ScispaceState,
  "closeWindow" | "updateWindow" | "focusWindow" | "setViewport" | "sendCommandToTerminalLine"
> => ({
  closeWindow: (id) => {
    set((state) => {
      const target = state.windows.find((window) => window.id === id);
      if (!target) return state;

      const windows = state.windows.filter((window) => window.id !== id);
      const plotSpecs =
        target.kind === "plot" &&
        target.plotId &&
        !windows.some((window) => window.kind === "plot" && window.plotId === target.plotId)
          ? state.plotSpecs.filter((plot) => plot.id !== target.plotId)
          : state.plotSpecs;

      return {
        windows,
        plotSpecs,
        projectDirty: true,
        activeWindowId: state.activeWindowId === id ? undefined : state.activeWindowId,
        tableMenuState: state.tableMenuState?.windowId === id ? undefined : state.tableMenuState,
        plotMenuState:
          target.kind === "plot" && target.plotId === state.plotMenuState?.plotId
            ? undefined
            : state.plotMenuState,
        currentPlotId:
          target.kind === "plot" && target.plotId === state.currentPlotId
            ? plotSpecs[0]?.id
            : state.currentPlotId,
      };
    });
    persistLayout(db, get());
  },

  updateWindow: (id, patch) => {
    set((state) => ({
      windows: state.windows.map((window) => (window.id === id ? { ...window, ...patch } : window)),
      projectDirty: true,
    }));
    persistLayout(db, get());
  },

  focusWindow: (id) => {
    set((state) => {
      const zIndex = Math.max(0, ...state.windows.map((window) => window.zIndex)) + 1;
      const target = state.windows.find((window) => window.id === id);
      return {
        windows: state.windows.map((window) => (window.id === id ? { ...window, zIndex } : window)),
        activeWindowId: id,
        currentPlotId:
          target?.kind === "plot" && target.plotId ? target.plotId : state.currentPlotId,
      };
    });
    persistLayout(db, get());
  },

  setViewport: (viewport) => {
    set({ viewport, projectDirty: true });
    persistLayout(db, get());
  },

  sendCommandToTerminalLine: (command) => {
    set({ terminalCommandLineRequest: { id: crypto.randomUUID(), command } });
  },
});
