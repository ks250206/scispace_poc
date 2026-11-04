import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  clickToolbarItem,
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
} from "./workbenchTestUtils";

describe("Workbench reproducible workflow", () => {
  setupWorkbenchSuite();

  it("creates datasets and calculates columns from the Data menu", async () => {
    const user = userEvent.setup();
    await renderWorkbench();

    await clickToolbarItem(user, "Data", "New Dataset");
    fireEvent.change(await screen.findByRole("textbox", { name: "Dataset name" }), {
      target: { value: "scratch" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Dataset column 1 name" }), {
      target: { value: "x" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Dataset column 2 name" }), {
      target: { value: "label" },
    });
    fireEvent.change(screen.getByLabelText("Dataset column 2 type"), {
      target: { value: "string" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Dataset rows" }), {
      target: { value: "2" },
    });
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(storeState().datasets.map((dataset) => dataset.name)).toContain("scratch"),
    );
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: "dataset-new scratch columns=x:number,label:string rows=2",
      source: "gui",
    });
    expect(
      storeState()
        .datasets.find((dataset) => dataset.name === "scratch")
        ?.columns.map((column) => column.dataType),
    ).toEqual(["number", "string"]);

    await clickToolbarItem(user, "Data", "Calculate Column");
    await screen.findByLabelText("Calculation dataset");
    fireEvent.change(screen.getByLabelText("Calculation dataset"), {
      target: { value: "seed-waveform" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Target column" }), {
      target: { value: "sum" },
    });
    fireEvent.change(screen.getByLabelText("Column expression"), {
      target: { value: "signal + background" },
    });
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(storeState().datasets[0]?.rows[0]?.sum).toBe(10));
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: 'dataset-calc waveform.csv column=sum expr="signal + background"',
      source: "gui",
    });
  });

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

    await waitFor(() =>
      expect(screen.getAllByText("Import - workflow.csv").length).toBeGreaterThan(0),
    );

    await act(async () => {
      await storeState().confirmImport(storeState().pendingImports[0]!.id);
    });
    await waitFor(() =>
      expect(storeState().datasets.map((dataset) => dataset.name)).toContain("workflow.csv"),
    );

    await act(async () => {
      await storeState().runScispace("table workflow.csv", { source: "gui" });
      await storeState().runScispace("plot workflow.csv x=time y=signal", { source: "gui" });
    });
    await waitFor(() =>
      expect(screen.getAllByText("Table - workflow.csv").length).toBeGreaterThan(0),
    );
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
