import type { WorkspaceWindow } from "../../domain/types";
import type { ToolbarMenuItem } from "./ToolbarMenu";

export const isWindowClosable = (window: WorkspaceWindow): boolean =>
  window.kind === "table" || window.kind === "plot" || window.kind === "plot-config";

export const windowMenuItem = (
  window: WorkspaceWindow,
  activeWindowId: string | undefined,
  focusWindow: (id: string) => void,
  closeWindow: (id: string) => void,
): ToolbarMenuItem => ({
  label: window.title,
  active: window.id === activeWindowId,
  onSelect: () => focusWindow(window.id),
  rightLabel: isWindowClosable(window) ? "×" : undefined,
  rightAriaLabel: `Close window ${window.title}`,
  onRightSelect: isWindowClosable(window) ? () => closeWindow(window.id) : undefined,
});

export const emptyWindowMenuItem = (label = "(none)"): ToolbarMenuItem => ({
  label,
  disabled: true,
});
