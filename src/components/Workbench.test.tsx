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
    const fileButton = document.querySelector(".tree-row.file") as HTMLButtonElement;
    await user.click(fileButton);

    expect(fileButton).toHaveClass("selected");
    expect(screen.getByText("Table - waveform.csv")).toBeInTheDocument();
  });

  it("opens an import settings window with a virtualized preview after file drop", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    const shell = document.querySelector(".canvas-shell");
    const file = new File(["x,y\n1,2\n3,4"], "dropped.csv", { type: "text/csv" });
    fireEvent.drop(shell as Element, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(screen.getByText("Import - dropped.csv")).toBeInTheDocument());
    expect(screen.getByText("dropped.csv")).toBeInTheDocument();
    expect(screen.getByText("2 preview rows")).toBeInTheDocument();
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
