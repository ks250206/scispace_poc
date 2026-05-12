import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  clickToolbarItem,
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
} from "./workbenchTestUtils";

const getWindowTitle = (title: string): HTMLElement | undefined =>
  Array.from(document.querySelectorAll<HTMLElement>(".window-titlebar strong")).find(
    (element) => element.textContent === title,
  );

describe("Workbench workspace UI", () => {
  setupWorkbenchSuite();

  it("renders a filesystem browser, table window, plot window, and draggable terminal window", async () => {
    await renderWorkbench();
    expect(screen.getByText("~/raw")).toBeInTheDocument();
    expect(getWindowTitle("Table - waveform.csv")).toBeDefined();
    expect(screen.getByText((text) => text.includes("160 rows · virtualized"))).toBeInTheDocument();
    expect(getWindowTitle("Plot - waveform.csv")).toBeDefined();
    expect(getWindowTitle("Terminal")).toBeDefined();
    expect(getWindowTitle("Command History")).toBeDefined();
    expect(screen.getByText("No scispace commands yet.")).toBeInTheDocument();
  });

  it("renders semantic toolbar menus and closes them with escape", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    expect(screen.getByRole("button", { name: "Project selector" })).toBeInTheDocument();
    expect(screen.getByText("Zoom 100%")).toBeInTheDocument();
    const menuLabels = Array.from(
      document.querySelectorAll<HTMLElement>(".toolbar-menus .toolbar-menu-trigger"),
    ).map((button) => button.textContent);
    expect(menuLabels).toEqual(["Project", "Data", "Table", "Plot", "Edit", "View", "Windows"]);

    await user.click(screen.getByRole("button", { name: "Project" }));
    expect(screen.getByRole("menu", { name: "Project menu" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "New Project" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Recent Projects" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Export Project" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Project menu" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Data" }));
    expect(screen.getByRole("menuitem", { name: "Load Data" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "New Folder" })).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "View" }));
    expect(screen.getByRole("menuitem", { name: "SciSpace Help" })).toBeInTheDocument();
  });

  it("switches open toolbar menus on hover", async () => {
    const user = userEvent.setup();
    await renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Project" }));
    expect(screen.getByRole("menu", { name: "Project menu" })).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "Data" }));
    expect(screen.queryByRole("menu", { name: "Project menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "Data menu" })).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "Windows" }));
    expect(screen.queryByRole("menu", { name: "Data menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "Windows menu" })).toBeInTheDocument();
  });

  it("opens toolbar actions from the empty workspace context menu", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const shell = document.querySelector(".canvas-shell") as HTMLElement;

    act(() => storeState().setViewport({ x: -1400, y: -900, scale: 1.5 }));
    fireEvent.contextMenu(shell, { clientX: 160, clientY: 120 });

    const menu = screen.getByRole("menu", { name: "SciSpace" });
    const contextLabels = Array.from(
      menu.querySelectorAll<HTMLElement>(
        ":scope > .context-menu-row > .context-menu-item-main > .context-menu-label",
      ),
    ).map((element) => element.textContent);
    expect(contextLabels).toEqual(["Project", "Data", "Table", "Plot", "Edit", "View", "Windows"]);
    const currentProjectName =
      storeState().projects.find((project) => project.id === storeState().currentProjectId)?.name ??
      "";
    expect(within(menu).getByRole("menuitem", { name: "Project" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Recent Projects" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("menu", { name: "Recent Projects submenu" })).getByRole("menuitem", {
        name: currentProjectName,
      }),
    ).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Windows" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Data" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Table" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Plot" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "View" })).toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitem", { name: "Reset View" }));
    expect(storeState().viewport).toMatchObject({ x: -1920, y: -1080, scale: 1 });

    fireEvent.contextMenu(shell, { clientX: 160, clientY: 120 });
    await user.click(screen.getByRole("menuitem", { name: "SciSpace Help" }));
    await waitFor(() => expect(getWindowTitle("SciSpace Help")).toBeDefined());
    expect(
      await screen.findByText((text) => text.includes("dataset-new <name>")),
    ).toBeInTheDocument();
  });

  it("lists open windows in the Windows menu and focuses the clicked window", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    expect(screen.queryByRole("navigation", { name: "Open windows" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Windows" }));
    const menu = screen.getByRole("menu", { name: "Windows menu" });

    expect(within(menu).getByRole("menuitem", { name: /Data Browser/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Terminal/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Command History/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Tables/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Graphs/ })).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Table - waveform.csv" }),
    ).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Plot - waveform.csv" })).toBeInTheDocument();

    const beforeZ = storeState().windows.find((window) => window.id === "table-seed")?.zIndex ?? 0;
    await user.click(within(menu).getByRole("menuitem", { name: "Table - waveform.csv" }));

    expect(storeState().activeWindowId).toBe("table-seed");
    expect(
      storeState().windows.find((window) => window.id === "table-seed")?.zIndex,
    ).toBeGreaterThan(beforeZ);
  });

  it("toggles utility windows from the Windows menu", async () => {
    const user = userEvent.setup();
    await renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Windows" }));
    await user.click(screen.getByRole("menuitem", { name: "Terminal" }));
    expect(storeState().windows.some((window) => window.kind === "terminal")).toBe(false);
    expect(screen.queryByText("Terminal")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Windows" }));
    expect(screen.getByRole("menuitem", { name: "Terminal" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Terminal" }));
    expect(storeState().windows.some((window) => window.kind === "terminal")).toBe(true);
    expect(getWindowTitle("Terminal")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Windows" }));
    await user.click(screen.getByRole("menuitem", { name: "Command History" }));
    expect(storeState().windows.some((window) => window.kind === "history")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Windows" }));
    await user.click(screen.getByRole("menuitem", { name: "Data Browser" }));
    expect(storeState().windows.some((window) => window.kind === "browser")).toBe(false);
  });

  it("updates current plot and closes closable windows from the Windows menu", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await user.click(screen.getByRole("button", { name: "Windows" }));
    const menu = screen.getByRole("menu", { name: "Windows menu" });

    await user.click(within(menu).getByRole("menuitem", { name: "Plot - waveform.csv" }));
    expect(storeState().activeWindowId).toBe("plot-seed");
    expect(storeState().currentPlotId).toBe("seed-plot");

    expect(
      within(menu).queryByRole("button", { name: "Close window Data Browser" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Windows" }));
    const reopenedMenu = screen.getByRole("menu", { name: "Windows menu" });
    await user.click(
      within(reopenedMenu).getByRole("button", { name: "Close window Plot - waveform.csv" }),
    );

    await waitFor(() => expect(screen.queryByText("Plot - waveform.csv")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Windows" }));
    expect(
      within(screen.getByRole("menu", { name: "Windows menu" })).queryByRole("menuitem", {
        name: "Plot - waveform.csv",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows common window context actions and closes them with escape", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const plotTitle = getWindowTitle("Plot - waveform.csv");
    expect(plotTitle).toBeDefined();
    fireEvent.contextMenu(plotTitle as HTMLElement, { clientX: 400, clientY: 160 });

    expect(screen.getByRole("menu", { name: "Plot - waveform.csv" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Bring to Front" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Close Window" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Plot - waveform.csv" })).not.toBeInTheDocument();
  });

  it("starts terminal in scispace repl and toggles unsafe from terminal context menu", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await screen.findByText("scispace REPL");
    const terminalPanel = document.querySelector(".terminal-panel") as HTMLElement;
    expect(screen.getByText("safe")).toBeInTheDocument();

    fireEvent.contextMenu(terminalPanel, { clientX: 120, clientY: 760 });
    const menu = screen.getByRole("menu", { name: "Terminal" });
    expect(within(menu).getByRole("menuitem", { name: "Unsafe mode" })).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: "Bring to Front" }),
    ).not.toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitem", { name: "Unsafe mode" }));
    expect(screen.getByText("unsafe")).toBeInTheDocument();

    fireEvent.contextMenu(terminalPanel, { clientX: 120, clientY: 760 });
    await user.click(screen.getByRole("menuitem", { name: "Unsafe mode" }));
    expect(screen.getByText("safe")).toBeInTheDocument();
  });

  it("clears active window highlight when clicking empty background", async () => {
    await renderWorkbench();
    const plane = document.querySelector(".workspace-plane") as HTMLElement;
    const plotWindow = Array.from(document.querySelectorAll<HTMLElement>(".canvas-window")).find(
      (element) => element.textContent?.includes("Plot - waveform.csv"),
    );
    expect(plotWindow).toBeDefined();

    fireEvent.mouseDown(plotWindow as HTMLElement);
    expect(storeState().activeWindowId).toBe("plot-seed");
    expect(plotWindow).toHaveClass("is-active");

    fireEvent.pointerDown(plane, { button: 0, clientX: 20, clientY: 20, pointerId: 1 });
    expect(storeState().activeWindowId).toBeUndefined();
    expect(plotWindow).not.toHaveClass("is-active");
  });

  it("pans the workspace from empty background drag without panning from windows", async () => {
    await renderWorkbench();
    const plane = document.querySelector(".workspace-plane") as HTMLElement;
    const windowFrame = document.querySelector(".canvas-window") as HTMLElement;

    fireEvent.pointerDown(plane, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(document.querySelector(".workbench") as HTMLElement, {
      clientX: 42,
      clientY: 55,
      pointerId: 1,
    });
    fireEvent.pointerUp(document.querySelector(".workbench") as HTMLElement, { pointerId: 1 });
    expect(storeState().viewport).toMatchObject({ x: -1888, y: -1035 });

    storeState().setViewport({ x: 0, y: 0, scale: 1 });
    fireEvent.pointerDown(windowFrame, { button: 0, clientX: 10, clientY: 10, pointerId: 2 });
    fireEvent.pointerMove(document.querySelector(".workbench") as HTMLElement, {
      clientX: 42,
      clientY: 55,
      pointerId: 2,
    });
    fireEvent.pointerUp(document.querySelector(".workbench") as HTMLElement, { pointerId: 2 });
    expect(storeState().viewport).toMatchObject({ x: 0, y: 0 });
  });

  it("pans the workspace with wheel and keeps ctrl wheel as zoom", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const shell = document.querySelector(".canvas-shell") as HTMLElement;
    expect(shell).toHaveAttribute("data-grid-mode", "dots");
    expect(shell.style.getPropertyValue("--canvas-dot-step")).toBe("24px");
    expect(shell.style.getPropertyValue("--canvas-major-step")).toBe("240px");

    fireEvent.wheel(shell, { deltaY: 120 });
    expect(storeState().viewport).toMatchObject({ x: -1920, y: -1170, scale: 1 });

    await clickToolbarItem(user, "View", "Reset View");
    fireEvent.wheel(shell, { deltaY: 120, shiftKey: true });
    expect(storeState().viewport).toMatchObject({ x: -2010, y: -1080, scale: 1 });

    await clickToolbarItem(user, "View", "Reset View");
    fireEvent.wheel(shell, { deltaX: 120, deltaY: 0, shiftKey: true });
    expect(storeState().viewport).toMatchObject({ x: -2010, y: -1080, scale: 1 });

    await clickToolbarItem(user, "View", "Reset View");
    fireEvent.wheel(shell, { deltaX: 40 });
    expect(storeState().viewport).toMatchObject({ x: -1950, y: -1080, scale: 1 });

    act(() => storeState().setViewport({ x: -1920, y: -1080, scale: 0.5 }));
    fireEvent.wheel(shell, { deltaY: 120 });
    expect(storeState().viewport).toMatchObject({
      x: -1920,
      y: -1125,
      scale: 0.5,
    });
    expect(shell).toHaveAttribute("data-grid-mode", "dots");

    act(() => storeState().setViewport({ x: -1920, y: -1080, scale: 0.49 }));
    expect(shell).toHaveAttribute("data-grid-mode", "overview");
    expect(shell.style.getPropertyValue("--canvas-major-step")).toBe("117.6px");

    act(() => storeState().setViewport({ x: -1920, y: -1080, scale: 2 }));
    fireEvent.wheel(shell, { deltaY: 120, shiftKey: true });
    expect(storeState().viewport).toMatchObject({
      x: -2100,
      y: -1080,
      scale: 2,
    });

    await clickToolbarItem(user, "View", "Reset View");
    fireEvent.wheel(shell, { clientX: 480, clientY: 320, deltaY: 100, ctrlKey: true });
    expect(storeState().viewport).toMatchObject({
      x: -1680,
      y: -940,
      scale: 0.9,
    });
    expect(shell.style.getPropertyValue("--canvas-dot-step")).toBe("21.6px");

    fireEvent.wheel(shell, { clientX: 480, clientY: 320, deltaY: 5000, ctrlKey: true });
    expect(storeState().viewport.scale).toBe(0.1);

    fireEvent.wheel(shell, { clientX: 480, clientY: 320, deltaY: -5000, ctrlKey: true });
    expect(storeState().viewport.scale).toBe(3);
  });
});
