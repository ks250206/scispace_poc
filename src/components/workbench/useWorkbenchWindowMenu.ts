import type { WorkspaceWindow } from "../../domain/types";
import type { ToolbarMenuItem } from "./ToolbarMenu";
import { emptyWindowMenuItem, windowMenuItem } from "./windowMenuItems";

interface UseWorkbenchWindowMenuOptions {
  activeWindowId?: string;
  closeWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  toggleUtilityWindow: (kind: "browser" | "terminal" | "history" | "help") => void;
  windows: WorkspaceWindow[];
}

export const useWorkbenchWindowMenu = ({
  activeWindowId,
  closeWindow,
  focusWindow,
  toggleUtilityWindow,
  windows,
}: UseWorkbenchWindowMenuOptions) => {
  const windowsByKind = {
    browser: windows.filter((window) => window.kind === "browser"),
    terminal: windows.filter((window) => window.kind === "terminal"),
    history: windows.filter((window) => window.kind === "history"),
    help: windows.filter((window) => window.kind === "help"),
    plotConfig: windows.filter((window) => window.kind === "plot-config"),
    tables: windows.filter((window) => window.kind === "table"),
    graphs: windows.filter((window) => window.kind === "plot"),
    imports: windows.filter((window) => window.kind === "import"),
    other: windows.filter(
      (window) =>
        ![
          "browser",
          "terminal",
          "history",
          "help",
          "plot-config",
          "table",
          "plot",
          "import",
        ].includes(window.kind),
    ),
  };

  const windowItems = (items: WorkspaceWindow[]): ToolbarMenuItem[] =>
    items.length
      ? items.map((window) => windowMenuItem(window, activeWindowId, focusWindow, closeWindow))
      : [emptyWindowMenuItem()];

  const directWindowItems: ToolbarMenuItem[] = [
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
    {
      kind: "help" as const,
      label: "SciSpace Help",
      visible: windowsByKind.help.length > 0,
    },
  ].map((window) => ({
    label: window.label,
    active: window.visible,
    onSelect: () => toggleUtilityWindow(window.kind),
  }));

  return {
    directPlotConfigItems: windowsByKind.plotConfig.map((window) =>
      windowMenuItem(window, activeWindowId, focusWindow, closeWindow),
    ),
    directWindowItems,
    windowSubmenuItems: {
      graphs: windowItems(windowsByKind.graphs),
      imports: windowItems(windowsByKind.imports),
      other: windowItems(windowsByKind.other),
      tables: windowItems(windowsByKind.tables),
    },
  };
};
