import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { useScispaceStore } from "../store/scispaceStore";

describe("Workbench UI", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await useScispaceStore.getState().createNewProject();
  });

  it("renders a filesystem browser, table window, plot window, and draggable terminal window", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    expect(screen.getByText("~/raw")).toBeInTheDocument();
    expect(screen.getByText("Table - waveform.csv")).toBeInTheDocument();
    expect(screen.getByText("160 rows · virtualized")).toBeInTheDocument();
    expect(screen.getByText("Plot - waveform.csv")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
  });

  it("opens the table path from the data browser selection", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    const fileButton = document.querySelector(".tree-item-main") as HTMLButtonElement;
    await user.click(fileButton);

    expect(document.querySelector(".tree-row.file")).toHaveClass("selected");
    expect(screen.getByText("Table - waveform.csv")).toBeInTheDocument();
  });

  it("opens an import settings window with a virtualized preview after file drop", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    const shell = document.querySelector(".canvas-shell");
    const file = new File(["x,y\n1,2\n3,4"], "dropped.csv", { type: "text/csv" });
    fireEvent.drop(shell as Element, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(screen.getByText("Import - dropped.csv")).toBeInTheDocument());
    await waitFor(() =>
      expect(useScispaceStore.getState().pendingImports[0]?.preview?.rows).toHaveLength(2),
    );
  });

  it("shows close buttons only on table and plot windows and removes the clicked window", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Close Table - waveform.csv" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Plot - waveform.csv" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close Data Browser" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close Terminal" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close Table - waveform.csv" }));

    expect(screen.queryByText("Table - waveform.csv")).not.toBeInTheDocument();
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
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByText("analysis")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Move waveform.csv" }));
    await waitFor(() =>
      expect(useScispaceStore.getState().datasets[0]?.sourcePath).toBe(
        "~/raw/analysis/waveform.csv",
      ),
    );

    await user.click(screen.getByRole("button", { name: "Rename waveform.csv" }));
    await waitFor(() => expect(screen.getByText("renamed.csv")).toBeInTheDocument());
    expect(screen.getByText("Table - renamed.csv")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete renamed.csv" }));
    await waitFor(() => expect(screen.queryByText("renamed.csv")).not.toBeInTheDocument());
    expect(confirm).toHaveBeenCalled();
    expect(prompt).toHaveBeenCalledTimes(3);
  });

  it("edits plot title, axes, series, colors, and zoom mode from the plot window", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    const titleInput = screen.getByLabelText("Plot title");
    await user.click(titleInput);
    await user.keyboard("{Control>}a{/Control}Custom plot");
    await waitFor(() =>
      expect(useScispaceStore.getState().plotSpecs[0]?.title).toBe("Custom plot"),
    );
    await user.selectOptions(screen.getByLabelText("Plot x column"), "index");
    await user.click(screen.getByRole("button", { name: "x" }));
    await user.selectOptions(screen.getByLabelText("Add series"), "background");
    await user.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Plot width"), { target: { value: "720" } });
    fireEvent.change(screen.getByLabelText("Plot height"), { target: { value: "420" } });
    fireEvent.change(screen.getByLabelText("Color background"), { target: { value: "#dc2626" } });
    const backgroundLabel = screen.getByLabelText("Label background");
    await user.click(backgroundLabel);
    await user.keyboard("{Control>}a{/Control}Background");

    const spec = useScispaceStore.getState().plotSpecs.find((plot) => plot.id === "seed-plot");
    expect(spec).toMatchObject({
      title: "Custom plot",
      titleEdited: true,
      x: "index",
      zoomMode: "x",
      size: { width: 720, height: 420 },
    });
    expect(spec?.series).toEqual([
      {
        y: "signal",
        label: "signal",
        color: "#2563eb",
        lineWidth: 2,
        markerSize: 6,
        markerShape: "circle",
      },
      {
        y: "background",
        label: "Background",
        color: "#dc2626",
        lineWidth: 2,
        markerSize: 6,
        markerShape: "circle",
      },
    ]);

    await user.click(screen.getByRole("button", { name: "Remove background" }));
    expect(useScispaceStore.getState().plotSpecs[0]?.series).toHaveLength(1);
  });

  it("resets the workspace after confirming New Project", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Close Table - waveform.csv" }));
    expect(screen.queryByText("Table - waveform.csv")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New Project" }));

    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Table - waveform.csv")).toBeInTheDocument());
    expect(screen.getByText("Plot - waveform.csv")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
  });
});
