import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  clickToolbarItem,
  initializeStore,
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
  useScispaceStore,
} from "./workbenchTestUtils";

describe("Workbench data browser UI", () => {
  setupWorkbenchSuite();

  it("opens the table path from the data browser selection", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const fileButton = document.querySelector(".tree-item-main") as HTMLButtonElement;
    await user.click(fileButton);

    expect(document.querySelector(".tree-row.file")).toHaveClass("selected");
    expect(screen.getAllByText("Table - waveform.csv").length).toBeGreaterThan(0);
  });

  it("collapses and expands dataset columns in the data browser", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    expect(document.querySelectorAll(".tree-row.column")).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "Collapse waveform.csv" }));
    expect(document.querySelectorAll(".tree-row.column")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Expand waveform.csv" }));
    expect(document.querySelectorAll(".tree-row.column")).toHaveLength(4);
  });

  it("opens an import settings window from the data browser load field", async () => {
    await renderWorkbench();
    const file = new File(["x,y\n5,6"], "clicked.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Load data files"), { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getAllByText("Import - clicked.csv").length).toBeGreaterThan(0),
    );
    expect(storeState().pendingImports[0]?.fileName).toBe("clicked.csv");
    expect(storeState().pendingImports[0]?.text).toBe("x,y\n5,6");
  });

  it("opens raw file parsing from data browser through scispace commands", async () => {
    const user = userEvent.setup();
    await act(async () => {
      await storeState().importTextFile("notes.txt", "raw notes");
    });
    await renderWorkbench();
    await user.click(screen.getByRole("button", { name: "Actions notes.txt" }));
    await user.click(screen.getByRole("menuitem", { name: "Load notes.txt" }));

    await waitFor(() =>
      expect(screen.getAllByText("Import - notes.txt").length).toBeGreaterThan(0),
    );
  });

  it("opens calculate column for a dataset from the data browser menu", async () => {
    const user = userEvent.setup();
    await renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Actions waveform.csv" }));
    await user.click(screen.getByRole("menuitem", { name: "Calculate Column waveform.csv" }));

    await screen.findByLabelText("Calculation dataset");
    expect(screen.getAllByText("Calculate Column").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Calculation dataset")).toHaveValue("seed-waveform");
  });

  it("shows close buttons only on table and plot windows and removes the clicked window", async () => {
    await renderWorkbench();
    expect(screen.getByRole("button", { name: "Close Table - waveform.csv" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Plot - waveform.csv" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close Data Browser" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close Terminal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close Command History" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close Table - waveform.csv" }));

    await waitFor(() => expect(screen.queryByText("Table - waveform.csv")).not.toBeInTheDocument());
    expect(document.querySelector(".tree-row.file")).toBeInTheDocument();
  });

  it("creates, moves, renames, and deletes raw tree items from the data browser", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await user.click(screen.getByRole("button", { name: "+" }));
    let input = screen.getByRole("textbox", { name: "Folder name" });
    fireEvent.change(input, { target: { value: "analysis" } });
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByText("analysis")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actions waveform.csv" }));
    await user.click(screen.getByRole("menuitem", { name: "Move waveform.csv" }));
    input = screen.getByRole("textbox", { name: "Move to directory" });
    fireEvent.change(input, { target: { value: "~/raw/analysis" } });
    await user.click(screen.getByRole("button", { name: "Move" }));
    await waitFor(() =>
      expect(storeState().datasets[0]?.sourcePath).toBe("~/raw/analysis/waveform.csv"),
    );

    await user.click(screen.getByRole("button", { name: "Actions waveform.csv" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename waveform.csv" }));
    input = screen.getByRole("textbox", { name: "Rename" });
    fireEvent.change(input, { target: { value: "renamed.csv" } });
    await user.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(screen.getByText("renamed.csv")).toBeInTheDocument());
    expect(screen.getAllByText("Table - renamed.csv").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Actions renamed.csv" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete renamed.csv" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("renamed.csv")).not.toBeInTheDocument());
    expect(storeState().commandHistory.map((entry) => entry.command)).toEqual([
      "file-mkdir ~/raw/analysis",
      "file-move ~/raw/waveform.csv to=~/raw/analysis",
      "file-rename ~/raw/analysis/waveform.csv name=renamed.csv",
      "file-delete ~/raw/analysis/renamed.csv",
    ]);
    expect(storeState().commandHistory.every((entry) => entry.source === "gui")).toBe(true);
  });

  it("undoes and redoes data browser file operations from the topbar", async () => {
    const user = userEvent.setup();
    await renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Actions waveform.csv" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete waveform.csv" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(storeState().files.some((file) => file.path === "~/raw/waveform.csv")).toBe(false),
    );
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: "file-delete ~/raw/waveform.csv",
      source: "gui",
    });

    await clickToolbarItem(user, "Edit", "Undo");
    await waitFor(() =>
      expect(storeState().files.some((file) => file.path === "~/raw/waveform.csv")).toBe(true),
    );
    expect(storeState().datasets[0]?.id).toBe("seed-waveform");

    await clickToolbarItem(user, "Edit", "Redo");
    await waitFor(() =>
      expect(storeState().files.some((file) => file.path === "~/raw/waveform.csv")).toBe(false),
    );
  });

  it("opens tables with the checked data browser columns", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await initializeStore();
    await act(async () => {
      useScispaceStore
        .getState()
        .setDatasetColumnSelection("seed-waveform", ["index", "time", "signal"]);
    });
    await waitFor(() =>
      expect(storeState().columnSelections["seed-waveform"]).toEqual(["index", "time", "signal"]),
    );

    await user.click(screen.getByRole("button", { name: "▦waveform.csv" }));
    await waitFor(() =>
      expect(storeState().commandHistory.at(-1)).toMatchObject({
        command: "table waveform.csv columns=index,time,signal",
        source: "gui",
      }),
    );
    expect(storeState().windows.find((window) => window.id === "table-seed")).toMatchObject({
      columnIds: ["index", "time", "signal"],
    });
  });

  it("creates plots from checked data browser columns through scispace commands", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await initializeStore();
    await act(async () => {
      useScispaceStore
        .getState()
        .setDatasetColumnSelection("seed-waveform", ["time", "signal", "background"]);
    });

    await user.click(screen.getByRole("button", { name: "Actions waveform.csv" }));
    await user.click(screen.getByRole("menuitem", { name: "Plot waveform.csv" }));

    await waitFor(() =>
      expect(storeState().commandHistory.at(-1)).toMatchObject({
        command: "plot waveform.csv x=time y=signal,background",
        source: "gui",
        status: "success",
      }),
    );
    expect(storeState().plotSpecs.at(-1)).toMatchObject({
      x: "time",
      series: [{ y: "signal" }, { y: "background" }],
    });
  });

  it("shows item actions by data browser item kind", async () => {
    const user = userEvent.setup();
    await act(async () => {
      await storeState().runScispace("file-mkdir ~/raw/analysis");
      await storeState().importTextFile("notes.txt", "raw notes");
    });
    await renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Actions waveform.csv" }));
    expect(screen.getByRole("menuitem", { name: "Table" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Plot waveform.csv" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Load waveform.csv" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actions notes.txt" }));
    expect(screen.getByRole("menuitem", { name: "Load notes.txt" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Plot notes.txt" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actions analysis" }));
    expect(screen.queryByRole("menuitem", { name: "Load analysis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Plot analysis" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Rename analysis" })).toBeInTheDocument();
  });

  it("opens data browser item actions from right click", async () => {
    await renderWorkbench();
    const waveformRow = document.querySelector(".tree-row.file") as HTMLElement;
    fireEvent.contextMenu(waveformRow, { clientX: 90, clientY: 140 });

    expect(screen.getByRole("menu", { name: "~/raw/waveform.csv" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Table" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Plot waveform.csv" })).toBeInTheDocument();
  });
});
