import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
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
    expect(screen.getByText("Table - waveform.csv")).toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByText("Import - clicked.csv")).toBeInTheDocument());
    expect(storeState().pendingImports[0]?.fileName).toBe("clicked.csv");
  });

  it("opens raw file parsing from data browser through scispace commands", async () => {
    await act(async () => {
      await storeState().importTextFile("notes.txt", "raw notes");
    });
    await renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "Parse notes.txt" }));

    await waitFor(() => expect(screen.getByText("Import - notes.txt")).toBeInTheDocument());
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
    const prompt = vi
      .spyOn(window, "prompt")
      .mockReturnValueOnce("analysis")
      .mockReturnValueOnce("~/raw/analysis")
      .mockReturnValueOnce("renamed.csv");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderWorkbench();
    await user.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByText("analysis")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Move waveform.csv" }));
    await waitFor(() =>
      expect(storeState().datasets[0]?.sourcePath).toBe("~/raw/analysis/waveform.csv"),
    );

    await user.click(screen.getByRole("button", { name: "Rename waveform.csv" }));
    await waitFor(() => expect(screen.getByText("renamed.csv")).toBeInTheDocument());
    expect(screen.getByText("Table - renamed.csv")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete renamed.csv" }));
    await waitFor(() => expect(screen.queryByText("renamed.csv")).not.toBeInTheDocument());
    expect(confirm).toHaveBeenCalled();
    expect(prompt).toHaveBeenCalledTimes(3);
    expect(storeState().commandHistory.map((entry) => entry.command)).toEqual([
      "file-mkdir ~/raw/analysis",
      "file-move ~/raw/waveform.csv to=~/raw/analysis",
      "file-rename ~/raw/analysis/waveform.csv name=renamed.csv",
      "file-delete ~/raw/analysis/renamed.csv",
    ]);
    expect(storeState().commandHistory.every((entry) => entry.source === "gui")).toBe(true);
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

    await user.click(screen.getByRole("button", { name: "Plot waveform.csv" }));

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
});
