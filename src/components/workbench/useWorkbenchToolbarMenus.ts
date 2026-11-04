import type { ContextMenuItem } from "../context-menu/ContextMenuProvider";
import { toContextMenuItem, type ToolbarMenuItem, type ToolbarMenuProps } from "./ToolbarMenu";
import { centerViewport } from "./workbenchView";
import type { Dataset, PlotSpec, ViewportState } from "../../domain/types";
import type { TableMenuState } from "../../store/scispace/stateTypes";

interface WorkbenchToolbarMenuOptions {
  activePlotSpec?: PlotSpec;
  activeTableMenuState?: TableMenuState;
  activeWindowId?: string;
  copyActivePlotSchema: () => Promise<void>;
  currentProjectId?: string;
  datasets: Dataset[];
  directPlotConfigItems: ToolbarMenuItem[];
  directWindowItems: ToolbarMenuItem[];
  exportActivePlotPng: () => void;
  exportActivePlotSvg: () => void;
  canExportActivePlot: boolean;
  handleDeleteProject: () => Promise<void>;
  handleExportProject: () => Promise<void>;
  handleNewFolder: () => Promise<void>;
  handleNewProject: () => Promise<void>;
  handleSaveProjectAs: () => Promise<void>;
  openActivePlotConfig: () => void;
  openActivePlotSchemaApply: () => void;
  openDatasetCalcWindow: (datasetId?: string) => void;
  openHelpWindow: () => void;
  openMenu: string | undefined;
  openNewDatasetWindow: () => void;
  openNewPlotWindow: () => void;
  openProjectImportFile: () => void;
  redo: () => Promise<void>;
  redoStackLength: number;
  recentProjectItems: ToolbarMenuItem[];
  saveCurrentProject: () => Promise<void>;
  setOpenMenu: (label: string | undefined) => void;
  setViewport: (viewport: ViewportState) => void;
  showDataLoadPicker: () => void;
  undo: () => Promise<void>;
  undoStackLength: number;
  viewport: ViewportState;
  focusWindow: (windowId: string) => void;
  windowSubmenuItems: {
    tables: ToolbarMenuItem[];
    graphs: ToolbarMenuItem[];
    imports: ToolbarMenuItem[];
    other: ToolbarMenuItem[];
  };
}

const tableRowsMenu = (activeTableMenuState?: TableMenuState): ToolbarMenuItem => ({
  kind: "submenu",
  label: "Rows",
  disabled: !activeTableMenuState,
  items: [
    {
      label: "Rows Auto",
      onSelect: () => activeTableMenuState?.actions.setVisibleRows("auto"),
      disabled: !activeTableMenuState || activeTableMenuState.visibleRows === "auto",
    },
    {
      label: "Rows 10",
      onSelect: () => activeTableMenuState?.actions.setVisibleRows(10),
      disabled: !activeTableMenuState || activeTableMenuState.visibleRows === 10,
    },
    {
      label: "Rows 20",
      onSelect: () => activeTableMenuState?.actions.setVisibleRows(20),
      disabled: !activeTableMenuState || activeTableMenuState.visibleRows === 20,
    },
    {
      label: "Rows 50",
      onSelect: () => activeTableMenuState?.actions.setVisibleRows(50),
      disabled: !activeTableMenuState || activeTableMenuState.visibleRows === 50,
    },
  ],
});

export const useWorkbenchToolbarMenus = ({
  activePlotSpec,
  activeTableMenuState,
  activeWindowId,
  copyActivePlotSchema,
  currentProjectId,
  datasets,
  directPlotConfigItems,
  directWindowItems,
  exportActivePlotPng,
  exportActivePlotSvg,
  focusWindow,
  handleDeleteProject,
  handleExportProject,
  handleNewFolder,
  handleNewProject,
  handleSaveProjectAs,
  canExportActivePlot,
  openActivePlotConfig,
  openActivePlotSchemaApply,
  openDatasetCalcWindow,
  openHelpWindow,
  openMenu,
  openNewDatasetWindow,
  openNewPlotWindow,
  openProjectImportFile,
  redo,
  redoStackLength,
  recentProjectItems,
  saveCurrentProject,
  setOpenMenu,
  setViewport,
  showDataLoadPicker,
  undo,
  undoStackLength,
  viewport,
  windowSubmenuItems,
}: WorkbenchToolbarMenuOptions): {
  backgroundContextItems: ContextMenuItem[];
  toolbarMenus: ToolbarMenuProps[];
} => {
  const toolbarMenus: ToolbarMenuProps[] = [
    {
      label: "Project",
      openMenu,
      setOpenMenu,
      items: [
        { label: "New Project", onSelect: () => void handleNewProject() },
        { label: "Save", onSelect: () => void saveCurrentProject() },
        { label: "Save As...", onSelect: () => void handleSaveProjectAs() },
        {
          label: "Delete Project",
          onSelect: () => void handleDeleteProject(),
          disabled: !currentProjectId,
        },
        { kind: "separator" },
        { kind: "submenu", label: "Recent Projects", items: recentProjectItems },
        { kind: "separator" },
        { label: "Import Project", onSelect: openProjectImportFile },
        { label: "Export Project", onSelect: () => void handleExportProject() },
      ],
    },
    {
      label: "Data",
      openMenu,
      setOpenMenu,
      items: [
        { label: "Load Data", onSelect: showDataLoadPicker },
        { label: "New Dataset", onSelect: openNewDatasetWindow },
        {
          label: "Calculate Column",
          onSelect: () => openDatasetCalcWindow(),
          disabled: datasets.length === 0,
        },
        { label: "New Folder", onSelect: () => void handleNewFolder() },
      ],
    },
    {
      label: "Table",
      openMenu,
      setOpenMenu,
      items: [
        {
          label: "Copy TSV",
          onSelect: () => activeTableMenuState?.actions.copySelectedRange(),
          disabled: !activeTableMenuState?.hasSelectedRange,
        },
        {
          label: "Delete selected cells",
          onSelect: () => activeTableMenuState?.actions.clearSelectedRange(),
          disabled: !activeTableMenuState?.hasSelectedRange || activeTableMenuState?.isLocked,
        },
        {
          label: "Fill down",
          onSelect: () => activeTableMenuState?.actions.fillDownSelectedRange(),
          disabled: !activeTableMenuState?.canFillDownRange || activeTableMenuState?.isLocked,
        },
        {
          label: "Plot selection",
          onSelect: () => activeTableMenuState?.actions.plotSelectedColumns(),
          disabled: !activeTableMenuState?.canPlotSelection,
        },
        {
          label: "Delete row",
          onSelect: () => activeTableMenuState?.actions.deleteSelectedRow(),
          disabled: !activeTableMenuState?.hasSelectedCell || activeTableMenuState?.isLocked,
        },
        {
          label: "Delete column",
          onSelect: () => activeTableMenuState?.actions.deleteSelectedColumn(),
          disabled: !activeTableMenuState?.hasSelectedColumn || activeTableMenuState?.isLocked,
        },
        {
          label: "Insert column",
          onSelect: () => activeTableMenuState?.actions.insertColumn(),
          disabled: !activeTableMenuState || activeTableMenuState.isLocked,
        },
        {
          label: "Calculate column",
          onSelect: () => activeTableMenuState?.actions.calculateColumn(),
          disabled: !activeTableMenuState || activeTableMenuState.isLocked,
        },
        {
          label: activeTableMenuState?.isLocked ? "Unlock table" : "Lock table",
          onSelect: () => activeTableMenuState?.actions.toggleLock(),
          disabled: !activeTableMenuState,
        },
        tableRowsMenu(activeTableMenuState),
      ],
    },
    {
      label: "Plot",
      openMenu,
      setOpenMenu,
      items: [
        {
          label: "New Plot",
          onSelect: openNewPlotWindow,
          disabled: datasets.length === 0,
        },
        {
          label: "Plot Config",
          onSelect: openActivePlotConfig,
        },
        {
          label: "Copy plot schema",
          onSelect: () => void copyActivePlotSchema(),
        },
        {
          label: "Apply plot schema",
          onSelect: openActivePlotSchemaApply,
          disabled: !activePlotSpec,
        },
        {
          label: "Export plot PNG",
          onSelect: exportActivePlotPng,
          disabled: !canExportActivePlot,
        },
        {
          label: "Export plot SVG",
          onSelect: exportActivePlotSvg,
          disabled: !canExportActivePlot,
        },
      ],
    },
    {
      label: "Edit",
      openMenu,
      setOpenMenu,
      items: [
        { label: "Undo", onSelect: () => void undo(), disabled: undoStackLength === 0 },
        { label: "Redo", onSelect: () => void redo(), disabled: redoStackLength === 0 },
      ],
    },
    {
      label: "View",
      openMenu,
      setOpenMenu,
      items: [
        { label: "Reset View", onSelect: () => setViewport(centerViewport) },
        { label: `Zoom ${Math.round(viewport.scale * 100)}%`, disabled: true },
      ],
    },
    {
      label: "Help",
      openMenu,
      setOpenMenu,
      items: [
        { label: "SciSpace Help", onSelect: openHelpWindow },
        { label: "Command Help", onSelect: openHelpWindow },
        { label: "Keyboard Shortcuts", onSelect: openHelpWindow },
      ],
    },
    {
      label: "Windows",
      openMenu,
      setOpenMenu,
      items: [
        {
          label: "Bring to Front",
          onSelect: () => {
            if (activeWindowId) focusWindow(activeWindowId);
          },
          disabled: !activeWindowId,
        },
        { label: "Send to Back", disabled: true },
        { kind: "separator" },
        ...directWindowItems,
        ...directPlotConfigItems,
        { kind: "separator" },
        { kind: "submenu", label: "Tables", items: windowSubmenuItems.tables },
        { kind: "submenu", label: "Graphs", items: windowSubmenuItems.graphs },
        { kind: "submenu", label: "Imports", items: windowSubmenuItems.imports },
        { kind: "submenu", label: "Other Windows", items: windowSubmenuItems.other },
      ],
    },
  ];

  return {
    backgroundContextItems: toolbarMenus.map((menu) => ({
      kind: "submenu",
      label: menu.label,
      items: menu.items.map(toContextMenuItem),
    })),
    toolbarMenus,
  };
};
