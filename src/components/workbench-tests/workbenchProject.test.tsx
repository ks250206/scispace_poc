import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
  useScispaceStore,
} from "./workbenchTestUtils";

describe("Workbench project UI", () => {
  setupWorkbenchSuite();

  it("resets the workspace after confirming New Project", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "prompt").mockReturnValue("Scratch Project");
    await renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "Close Table - waveform.csv" }));
    await waitFor(() => expect(screen.queryByText("Table - waveform.csv")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "New Project" }));

    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Table - waveform.csv")).toBeInTheDocument());
    expect(screen.getByText("Plot - waveform.csv")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByText("Command History")).toBeInTheDocument();
  });

  it("shows project controls and switches saved projects", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Second Project");
    await renderWorkbench();
    expect(screen.getByRole("combobox", { name: "Project" })).toBeInTheDocument();
    const firstProjectName =
      useScispaceStore
        .getState()
        .projects.find((project) => project.id === storeState().currentProjectId)?.name ?? "";

    await act(async () => {
      await storeState().runScispace("elt waveform.csv as derived.csv", {
        source: "gui",
      });
    });
    await user.click(screen.getByRole("button", { name: "New Project" }));
    await waitFor(() =>
      expect(storeState().projects.map((project) => project.name)).toContain("Second Project"),
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Project" }), firstProjectName);
    await waitFor(() =>
      expect(storeState().datasets.map((dataset) => dataset.name)).toContain("derived.csv"),
    );
    expect(confirm).toHaveBeenCalled();
    expect(prompt).toHaveBeenCalled();
  });

  it("shows unsaved project state, clears it on save, and confirms dirty switches", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "prompt").mockReturnValue("Main Project");
    await renderWorkbench();

    expect(screen.queryByText("Unsaved")).not.toBeInTheDocument();

    await act(async () => {
      await storeState().runScispace("elt waveform.csv as derived.csv", { source: "gui" });
    });
    expect(await screen.findByText("Unsaved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save Project" }));
    await waitFor(() => expect(screen.queryByText("Unsaved")).not.toBeInTheDocument());

    const firstProjectId = storeState().currentProjectId ?? "";
    await user.click(screen.getByRole("button", { name: "New Project" }));
    await waitFor(() => expect(storeState().currentProjectId).not.toBe(firstProjectId));

    await act(async () => {
      await storeState().runScispace("elt waveform.csv as scratch-derived.csv", { source: "gui" });
    });
    await user.selectOptions(screen.getByRole("combobox", { name: "Project" }), firstProjectId);

    expect(confirm).toHaveBeenCalledWith("Switch projects and save current unsaved changes?");
    await waitFor(() => expect(screen.queryByText("Unsaved")).not.toBeInTheDocument());
  });
});
