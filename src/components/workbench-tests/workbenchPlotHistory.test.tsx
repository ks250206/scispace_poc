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

describe("Workbench plot and history UI", () => {
  setupWorkbenchSuite();

  it("opens shared plot config and edits the current plot", async () => {
    await renderWorkbench();
    expect(screen.queryByText("Plot Config")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Config" }));
    await waitFor(() => expect(screen.getByText("Plot Config")).toBeInTheDocument());
    expect(storeState().currentPlotId).toBe("seed-plot");
  });

  it("replays and copies commands from the command history window", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await renderWorkbench();
    await initializeStore();
    await act(async () => {
      await storeState().runScispace("table waveform.csv");
    });

    await waitFor(() =>
      expect(storeState().commandHistory.at(-1)?.command).toBe("table waveform.csv"),
    );
    const historyEntry = document.querySelector(".history-entry");
    expect(historyEntry).toHaveTextContent("table waveform.csv");
    const [runButton, copyButton, toCommandLineButton] = Array.from(
      historyEntry?.querySelectorAll("button") ?? [],
    ) as HTMLButtonElement[];
    expect(runButton).toHaveTextContent("Run");
    expect(copyButton).toHaveTextContent("Copy");
    expect(toCommandLineButton).toHaveTextContent("To cmd line");
    await user.click(copyButton);
    expect(writeText).toHaveBeenCalledWith("table waveform.csv");
    await user.click(toCommandLineButton);
    expect(storeState().terminalCommandLineRequest).toMatchObject({
      command: "table waveform.csv",
    });

    await user.click(runButton);
    await waitFor(() =>
      expect(storeState().commandHistory.at(-1)).toMatchObject({
        command: "table waveform.csv",
        source: "history",
      }),
    );
  });

  it("replays file commands from the command history window", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await initializeStore();
    await act(async () => {
      await storeState().runScispace("file-list ~/raw");
    });

    await user.click(await screen.findByRole("button", { name: "Run file-list ~/raw" }));

    await waitFor(() =>
      expect(storeState().commandHistory.at(-1)).toMatchObject({
        command: "file-list ~/raw",
        source: "history",
        status: "success",
      }),
    );
  });

  it("undoes and redoes destructive commands from the topbar", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();

    await act(async () => {
      await useScispaceStore
        .getState()
        .runScispace("table-edit waveform.csv action=set-cell row=1 column=signal value=42.5", {
          source: "gui",
        });
    });
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    expect(storeState().datasets[0]?.rows[0]?.signal).toBe(42.5);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(storeState().datasets[0]?.rows[0]?.signal).toBe(3));
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Redo" }));
    await waitFor(() => expect(storeState().datasets[0]?.rows[0]?.signal).toBe(42.5));
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });
});
