import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  clickToolbarItem,
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
  useScispaceStore,
} from "./workbenchTestUtils";

const switchProjectFromPicker = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole("button", { name: "Project selector" }));
  await user.click(screen.getByRole("menuitem", { name }));
};

const switchRecentProject = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole("button", { name: "Project" }));
  await user.click(screen.getByRole("menuitem", { name: "Recent Projects" }));
  await user.click(screen.getByRole("menuitem", { name }));
};

describe("Workbench project UI", () => {
  setupWorkbenchSuite();

  it("resets the workspace after confirming New Project", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "Close Table - waveform.csv" }));
    await waitFor(() => expect(screen.queryByText("Table - waveform.csv")).not.toBeInTheDocument());

    await clickToolbarItem(user, "Project", "New Project");
    await user.click(screen.getByRole("button", { name: "Create" }));
    const projectName = screen.getByRole("textbox", { name: "Project name" });
    fireEvent.change(projectName, { target: { value: "Scratch Project" } });
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(screen.getAllByText("Table - waveform.csv").length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("Plot - waveform.csv").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Terminal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Command History").length).toBeGreaterThan(0);
  });

  it("shows project controls and switches saved projects", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    expect(screen.getByRole("button", { name: "Project selector" })).toBeInTheDocument();
    const firstProjectName =
      useScispaceStore
        .getState()
        .projects.find((project) => project.id === storeState().currentProjectId)?.name ?? "";

    await act(async () => {
      await storeState().runScispace("elt waveform.csv as derived.csv", {
        source: "gui",
      });
    });
    await clickToolbarItem(user, "Project", "New Project");
    await user.click(screen.getByRole("button", { name: "Create" }));
    const projectName = screen.getByRole("textbox", { name: "Project name" });
    fireEvent.change(projectName, { target: { value: "Second Project" } });
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(storeState().projects.map((project) => project.name)).toContain("Second Project"),
    );

    await switchProjectFromPicker(user, firstProjectName);
    await waitFor(() =>
      expect(storeState().datasets.map((dataset) => dataset.name)).toContain("derived.csv"),
    );
  });

  it("deletes a project from the project selector after confirmation", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await act(async () => {
      await storeState().createNewProject("Disposable Project");
    });

    expect(storeState().projects.map((project) => project.name)).toContain("Disposable Project");
    await user.click(screen.getByRole("button", { name: "Project selector" }));
    await user.click(screen.getByRole("button", { name: "Delete project Disposable Project" }));
    expect(screen.getByText('Delete project "Disposable Project"?')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(storeState().projects.map((project) => project.name)).not.toContain(
        "Disposable Project",
      ),
    );
  });

  it("lists recent projects in the project menu and deletes them after confirmation", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const firstProjectName =
      storeState().projects.find((project) => project.id === storeState().currentProjectId)?.name ??
      "";
    await act(async () => {
      await storeState().createNewProject("Recent Scratch");
    });

    await switchRecentProject(user, firstProjectName);
    await waitFor(() =>
      expect(
        storeState().projects.find((project) => project.id === storeState().currentProjectId)?.name,
      ).toBe(firstProjectName),
    );
    expect(
      storeState().projects.find((project) => project.id === storeState().currentProjectId)?.name,
    ).toBe(firstProjectName);

    await user.click(screen.getByRole("button", { name: "Project" }));
    await user.click(screen.getByRole("menuitem", { name: "Recent Projects" }));
    await user.click(screen.getByRole("button", { name: "Delete project Recent Scratch" }));
    expect(screen.getByText('Delete project "Recent Scratch"?')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(storeState().projects.map((project) => project.name)).not.toContain("Recent Scratch"),
    );
  });

  it("exports and imports project json from the topbar", async () => {
    const user = userEvent.setup();
    const click = vi.fn();
    const createElement = vi.spyOn(document, "createElement");
    createElement.mockImplementation(((tagName: string) => {
      const element = document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
      if (tagName === "a") {
        Object.defineProperty(element, "click", { value: click });
      }
      return element;
    }) as typeof document.createElement);
    await renderWorkbench();
    await act(async () => {
      await storeState().saveCurrentProject("Exported Project");
      await storeState().runScispace("elt waveform.csv as exported-derived.csv", {
        source: "gui",
      });
    });

    await clickToolbarItem(user, "Project", "Export Project");
    const exportLink = createElement.mock.results
      .map((result) => result.value as HTMLAnchorElement)
      .find((element) => element.download?.endsWith(".scispace.json"));
    expect(exportLink?.download).toBe("Exported_Project.scispace.json");
    const exportedJson = decodeURIComponent(exportLink?.href.split(",")[1] ?? "");
    expect(JSON.parse(exportedJson)).toMatchObject({
      version: 1,
      project: { name: "Exported Project" },
    });

    const file = new File([exportedJson], "project.scispace.json", {
      type: "application/json",
    });
    fireEvent.change(screen.getByLabelText("Import project file"), { target: { files: [file] } });

    await waitFor(() =>
      expect(storeState().datasets.map((dataset) => dataset.name)).toContain(
        "exported-derived.csv",
      ),
    );
    await waitFor(() =>
      expect(storeState().projects.map((project) => project.name)).toContain(
        "Exported Project (1)",
      ),
    );
    expect(screen.queryByText("Unsaved")).not.toBeInTheDocument();
  });

  it("shows unsaved project state, clears it on direct save, and confirms dirty switches", async () => {
    const user = userEvent.setup();
    await renderWorkbench();

    expect(screen.queryByText("Unsaved")).not.toBeInTheDocument();

    await act(async () => {
      await storeState().runScispace("elt waveform.csv as derived.csv", { source: "gui" });
    });
    await waitFor(() => expect(storeState().projectDirty).toBe(true));
    expect(await screen.findByText("Unsaved")).toBeInTheDocument();

    await clickToolbarItem(user, "Project", "Save");
    await waitFor(() => expect(screen.queryByText("Unsaved")).not.toBeInTheDocument());

    const firstProjectId = storeState().currentProjectId ?? "";
    await clickToolbarItem(user, "Project", "New Project");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(storeState().currentProjectId).not.toBe(firstProjectId));

    await act(async () => {
      await storeState().runScispace("elt waveform.csv as scratch-derived.csv", { source: "gui" });
    });
    const firstProjectName =
      storeState().projects.find((project) => project.id === firstProjectId)?.name ?? "";
    await switchProjectFromPicker(user, firstProjectName);

    expect(
      screen.getByText("Switch projects and save current unsaved changes?"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Switch" }));
    await waitFor(() => expect(screen.queryByText("Unsaved")).not.toBeInTheDocument());
  });

  it("renames the current project through Save As", async () => {
    const user = userEvent.setup();
    await renderWorkbench();

    await clickToolbarItem(user, "Project", "Save As...");
    const projectName = screen.getByRole("textbox", { name: "Project name" });
    fireEvent.change(projectName, { target: { value: "Renamed Project" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        storeState().projects.find((project) => project.id === storeState().currentProjectId)?.name,
      ).toBe("Renamed Project"),
    );
  });
});
