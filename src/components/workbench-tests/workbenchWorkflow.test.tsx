import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  clickToolbarItem,
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
} from "./workbenchTestUtils";

describe("Workbench reproducible workflow", () => {
  setupWorkbenchSuite();

  it("uploads, imports, opens table and plot, exports, and reimports the project", async () => {
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

    const file = new File(["time,signal\n0,1\n1,2\n2,3"], "workflow.csv", {
      type: "text/csv",
    });
    fireEvent.drop(document.querySelector(".canvas-shell") as Element, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => expect(screen.getByText("Import - workflow.csv")).toBeInTheDocument());
    expect(storeState().commandHistory.at(-1)?.command).toContain("upload-open");

    await user.click(await screen.findByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(storeState().datasets.map((dataset) => dataset.name)).toContain("workflow.csv"),
    );

    await act(async () => {
      await storeState().runScispace("table workflow.csv", { source: "gui" });
      await storeState().runScispace("plot workflow.csv x=time y=signal", { source: "gui" });
    });
    await waitFor(() => expect(screen.getByText("Table - workflow.csv")).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getAllByText("workflow.csv: signal vs time").length).toBeGreaterThan(0),
    );

    await clickToolbarItem(user, "Plot", "Export plot SVG");
    expect(
      createElement.mock.results
        .map((result) => result.value as HTMLAnchorElement)
        .some((element) => element.download?.endsWith(".svg")),
    ).toBe(true);

    await clickToolbarItem(user, "Project", "Export Project");
    const projectLink = createElement.mock.results
      .map((result) => result.value as HTMLAnchorElement)
      .find((element) => element.download?.endsWith(".scispace.json"));
    const exportedProjectJson = decodeURIComponent(projectLink?.href.split(",")[1] ?? "");

    await act(async () => {
      await storeState().createNewProject("Empty Scratch");
      await storeState().importProjectJson(exportedProjectJson);
    });

    expect(storeState().projectDirty).toBe(false);
    expect(storeState().datasets.map((dataset) => dataset.name)).toContain("workflow.csv");
    expect(storeState().plotSpecs.some((plot) => plot.title.includes("workflow.csv"))).toBe(true);
  });
});
