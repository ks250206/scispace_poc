import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  clickToolbarItem,
  initializeStore,
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
  useScispaceStore,
} from "./workbenchTestUtils";

describe("Workbench plot and history UI", () => {
  setupWorkbenchSuite();

  it("opens shared plot config and edits the current plot", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    expect(screen.queryByText("Plot Config")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Config" })).not.toBeInTheDocument();
    await clickToolbarItem(user, "Plot", "Plot Config");
    await waitFor(() => expect(screen.getAllByText("Plot Config").length).toBeGreaterThan(0));
    expect(storeState().currentPlotId).toBe("seed-plot");
  });

  it("copies plot schema and exports the current plot canvas as png and svg", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const toDataUrl = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png;base64,plot");
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
    await initializeStore();
    expect(screen.queryByRole("button", { name: "Copy plot schema" })).not.toBeInTheDocument();
    await clickToolbarItem(userEvent.setup(), "Plot", "Copy plot schema");

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(JSON.parse(writeText.mock.calls[0]?.[0] ?? "{}")).toMatchObject({
      id: "seed-plot",
      size: { width: 640, height: 360 },
    });
    await waitFor(() =>
      expect(storeState().commandHistory.at(-1)).toMatchObject({
        command: "plot-schema seed-plot",
        source: "gui",
        status: "success",
      }),
    );

    await clickToolbarItem(userEvent.setup(), "Plot", "Export plot PNG");
    expect(toDataUrl).toHaveBeenCalledWith("image/png");
    expect(click).toHaveBeenCalled();

    await clickToolbarItem(userEvent.setup(), "Plot", "Export plot SVG");
    const svgLink = createElement.mock.results
      .map((result) => result.value as HTMLAnchorElement)
      .find((element) => element.download?.endsWith(".svg"));
    expect(svgLink?.href).toMatch(/^data:image\/svg\+xml/);
    expect(svgLink?.download).toBe("waveform.csv_signal_vs_time.svg");
  });

  it("runs plot actions from the right click context menu", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const toDataUrl = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png;base64,plot");
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
    const plotHost = document.querySelector(".plot-host") as HTMLElement;
    fireEvent.contextMenu(plotHost, { clientX: 360, clientY: 240 });
    await user.click(screen.getByRole("menuitem", { name: "Copy plot schema" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());

    fireEvent.contextMenu(plotHost, { clientX: 360, clientY: 240 });
    await user.click(screen.getByRole("menuitem", { name: "Export plot PNG" }));
    expect(toDataUrl).toHaveBeenCalledWith("image/png");

    fireEvent.contextMenu(plotHost, { clientX: 360, clientY: 240 });
    await user.click(screen.getByRole("menuitem", { name: "Export plot SVG" }));
    expect(click).toHaveBeenCalled();
  });

  it("replays and copies commands from the command history window", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
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
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("menuitem", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Redo" })).toBeDisabled();
    await user.keyboard("{Escape}");

    await act(async () => {
      await useScispaceStore
        .getState()
        .runScispace("table-edit waveform.csv action=set-cell row=1 column=signal value=42.5", {
          source: "gui",
        });
    });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("menuitem", { name: "Undo" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "Redo" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(storeState().datasets[0]?.rows[0]?.signal).toBe(42.5);

    await clickToolbarItem(user, "Edit", "Undo");
    await waitFor(() => expect(storeState().datasets[0]?.rows[0]?.signal).toBe(3));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("menuitem", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Redo" })).toBeEnabled();
    await user.keyboard("{Escape}");

    await clickToolbarItem(user, "Edit", "Redo");
    await waitFor(() => expect(storeState().datasets[0]?.rows[0]?.signal).toBe(42.5));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("menuitem", { name: "Undo" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "Redo" })).toBeDisabled();
  });
});
