import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import { renderWorkbench, setupWorkbenchSuite } from "./workbenchTestUtils";

describe("Workbench toolbar menus", () => {
  setupWorkbenchSuite();

  it("renders semantic toolbar menus and closes them with escape", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    expect(screen.getByRole("button", { name: "Project selector" })).toBeInTheDocument();
    expect(screen.getByText("Zoom 100%")).toBeInTheDocument();
    const menuLabels = Array.from(
      document.querySelectorAll<HTMLElement>(".toolbar-menus .toolbar-menu-trigger"),
    ).map((button) => button.textContent);
    expect(menuLabels).toEqual([
      "Project",
      "Data",
      "Table",
      "Plot",
      "Edit",
      "View",
      "Help",
      "Windows",
    ]);

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

    await user.hover(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("menuitem", { name: "SciSpace Help" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Keyboard Shortcuts" })).toBeInTheDocument();
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
});
