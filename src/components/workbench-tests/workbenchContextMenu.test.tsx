import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWorkbench, setupWorkbenchSuite, storeState } from "./workbenchTestUtils";
import { getWindowTitle } from "./workbenchTestDom";

describe("Workbench context menus", () => {
  setupWorkbenchSuite();

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
    expect(contextLabels).toEqual([
      "Project",
      "Data",
      "Table",
      "Plot",
      "Edit",
      "View",
      "Help",
      "Windows",
    ]);
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
    expect(within(menu).getByRole("menuitem", { name: "Help" })).toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitem", { name: "Reset View" }));
    expect(storeState().viewport).toMatchObject({ x: -1920, y: -1080, scale: 1 });

    fireEvent.contextMenu(shell, { clientX: 160, clientY: 120 });
    await user.click(screen.getAllByRole("menuitem", { name: "SciSpace Help" })[0]!);
    await waitFor(() => expect(getWindowTitle("SciSpace Help")).toBeDefined());
    expect(
      await screen.findByText((text) => text.includes("dataset-new <name>")),
    ).toBeInTheDocument();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
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
});
