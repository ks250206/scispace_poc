import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
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
  afterEach(() => vi.unstubAllGlobals());

  function mockPngDecode() {
    vi.stubGlobal(
      "Image",
      class {
        decode = vi.fn().mockResolvedValue(undefined);
      },
    );
  }

  it("opens a new plot chooser from the plot menu and creates a plot via scispace", async () => {
    const user = userEvent.setup();
    await renderWorkbench();

    await clickToolbarItem(user, "Plot", "New Plot");

    await waitFor(() => expect(screen.getByLabelText("Plot dataset")).toBeInTheDocument());
    expect(screen.getByText("Display signal vs time")).toBeInTheDocument();
    expect(screen.getByText("plot waveform.csv x=time y=signal type=line")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Do It" }));

    await waitFor(() =>
      expect(storeState().commandHistory.at(-1)).toMatchObject({
        command: "plot waveform.csv x=time y=signal type=line",
        source: "gui",
        status: "success",
      }),
    );
    expect(storeState().windows.some((window) => window.kind === "plot-new")).toBe(false);
    expect(
      storeState().windows.some(
        (window) => window.kind === "plot" && window.title === "waveform.csv: signal vs time",
      ),
    ).toBe(true);
  });

  it("sends a new plot command to the terminal line", async () => {
    const user = userEvent.setup();
    await renderWorkbench();

    await clickToolbarItem(user, "Plot", "New Plot");
    await user.click(await screen.findByRole("button", { name: "To Cmd Line" }));

    expect(storeState().terminalCommandLineRequest).toMatchObject({
      command: "plot waveform.csv x=time y=signal type=line",
    });
  });

  it("opens shared plot config and edits the current plot", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    expect(screen.queryByText("Plot Config")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Config" })).not.toBeInTheDocument();
    await clickToolbarItem(user, "Plot", "Plot Config");
    await waitFor(() => expect(screen.getAllByText("Plot Config").length).toBeGreaterThan(0));
    expect(storeState().currentPlotId).toBe("seed-plot");
  });

  it("shows rejected plot settings and clears the error after a valid edit", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await clickToolbarItem(user, "Plot", "Plot Config");
    await user.click(await screen.findByRole("tab", { name: "Axes" }));

    const scale = screen.getByLabelText("x scale");
    await user.selectOptions(scale, "log");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Log scale requires positive x values",
    );
    expect(scale).toHaveValue("linear");

    fireEvent.change(screen.getByLabelText("x axis label"), { target: { value: "Time (s)" } });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(storeState().plotSpecs[0]?.axes.x.label).toBe("Time (s)");
  });

  it("keeps errors per plot until that plot is updated, including from the terminal", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await clickToolbarItem(user, "Plot", "Plot Config");
    const fontSize = await screen.findByLabelText("Plot font size");
    fireEvent.change(fontSize, { target: { value: "0" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid font size: 0");

    const seedWindow = storeState().windows.find((window) => window.plotId === "seed-plot");
    if (!seedWindow) throw new Error("Missing seed plot window");
    await act(async () => {
      await storeState().runScispace("plot waveform.csv x=time y=background");
    });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    const otherPlotId = storeState().currentPlotId;
    expect(otherPlotId).not.toBe("seed-plot");
    const title = screen.getByLabelText("Plot title");
    fireEvent.change(title, { target: { value: "Background" } });
    fireEvent.blur(title);
    await waitFor(() =>
      expect(storeState().plotSpecs.find((plot) => plot.id === otherPlotId)?.title).toBe(
        "Background",
      ),
    );

    act(() => storeState().focusWindow(seedWindow.id));
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid font size: 0");

    await act(async () => {
      await storeState().runScispace("plot-set seed-plot fontSize=18", { source: "terminal" });
    });
    expect(screen.getByLabelText("Plot font size")).toHaveValue(18);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the newer error when a rejected plot command finishes out of order", async () => {
    const runScispace = storeState().runScispace;
    let releaseRejection = () => {};
    const delay = new Promise<void>((resolve) => {
      releaseRejection = resolve;
    });
    const delayedRun = vi.fn<typeof runScispace>(async (...args) => {
      const result = await runScispace(...args);
      if (args[0].includes("fontSize=0")) await delay;
      return result;
    });
    useScispaceStore.setState({ runScispace: delayedRun });

    try {
      const user = userEvent.setup();
      await renderWorkbench();
      await clickToolbarItem(user, "Plot", "Plot Config");
      const fontSize = await screen.findByLabelText("Plot font size");
      fireEvent.change(fontSize, { target: { value: "0" } });
      fireEvent.change(fontSize, { target: { value: "-1" } });
      expect(await screen.findByRole("alert")).toHaveTextContent("Invalid font size: -1");

      await act(async () => {
        releaseRejection();
        await delayedRun.mock.results[0]?.value;
      });
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid font size: -1");
    } finally {
      releaseRejection();
      useScispaceStore.setState({ runScispace });
    }
  });

  it("commits both manual range bounds together and keeps an invalid draft", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await clickToolbarItem(user, "Plot", "Plot Config");
    await user.click(await screen.findByRole("tab", { name: "Axes" }));
    await user.selectOptions(screen.getByLabelText("x range mode"), "manual");
    const min = screen.getByLabelText("x range min");
    const max = screen.getByLabelText("x range max");
    fireEvent.change(min, { target: { value: "10" } });
    const apply = screen.getByRole("button", { name: "Apply X range" });
    await user.click(apply);
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a minimum");
    expect(min).toHaveValue(10);
    expect(storeState().plotSpecs[0]?.axes.x.range.mode).toBe("auto");
    fireEvent.change(max, { target: { value: "20" } });
    await user.click(apply);
    await waitFor(() =>
      expect(storeState().plotSpecs[0]?.axes.x.range).toEqual({ mode: "manual", min: 10, max: 20 }),
    );
  });

  it("commits literal plot title edits once, and can undo and replay the command", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await clickToolbarItem(user, "Plot", "Plot Config");
    const input = await screen.findByLabelText("Plot title");
    const original = storeState().plotSpecs[0]?.title;
    const edited = 'Sample "A" = C:\\raw';
    const historyBefore = storeState().commandHistory.length;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "Sample" } });
    fireEvent.change(input, { target: { value: edited } });
    expect(storeState().commandHistory).toHaveLength(historyBefore);
    fireEvent.blur(input);
    await waitFor(() => expect(storeState().commandHistory).toHaveLength(historyBefore + 1));
    expect(storeState().plotSpecs[0]?.title).toBe(edited);
    const command = storeState().commandHistory.at(-1)?.command;
    if (!command) throw new Error("Missing title command");
    await act(async () => storeState().undo());
    expect(storeState().plotSpecs[0]?.title).toBe(original);
    await act(async () => storeState().runScispace(command, { source: "history" }));
    expect(storeState().plotSpecs[0]?.title).toBe(edited);
  });

  it("commits series and annotation labels as separate undoable edits", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await clickToolbarItem(user, "Plot", "Plot Config");
    await user.click(await screen.findByRole("tab", { name: "Series" }));
    const series = screen.getByLabelText("Series label signal");
    const label = 'Raw "signal" = C:\\raw';
    fireEvent.change(series, { target: { value: "" } });
    fireEvent.change(series, { target: { value: label } });
    expect(storeState().commandHistory).toHaveLength(0);
    fireEvent.blur(series);
    await waitFor(() => expect(storeState().commandHistory).toHaveLength(1));
    expect(storeState().plotSpecs[0]?.series[0]?.label).toBe(label);

    await user.click(screen.getByRole("tab", { name: "Annotations" }));
    await user.click(screen.getByRole("button", { name: "Add annotation" }));
    const annotation = await screen.findByLabelText(/^Annotation label /);
    const text = 'Peak "A" = C:\\samples';
    fireEvent.change(annotation, { target: { value: "" } });
    fireEvent.change(annotation, { target: { value: text } });
    expect(storeState().commandHistory).toHaveLength(2);
    fireEvent.blur(annotation);
    await waitFor(() => expect(storeState().commandHistory).toHaveLength(3));
    expect(storeState().plotSpecs[0]?.annotations[0]?.text).toBe(text);
    await act(async () => storeState().undo());
    expect(storeState().plotSpecs[0]?.annotations[0]?.text).toBe("Annotation");
    await act(async () => storeState().undo());
    expect(storeState().plotSpecs[0]?.annotations).toHaveLength(0);
    await act(async () => storeState().undo());
    expect(storeState().plotSpecs[0]?.series[0]?.label).toBe("signal");
  });

  it("copies plot schema and exports the displayed plot as png and svg", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    mockPngDecode();
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
    await waitFor(() => expect(toDataUrl).toHaveBeenCalledWith("image/png"));
    expect(click).toHaveBeenCalled();

    await clickToolbarItem(userEvent.setup(), "Plot", "Export plot SVG");
    const svgLink = createElement.mock.results
      .map((result) => result.value as HTMLAnchorElement)
      .find((element) => element.download?.endsWith(".svg"));
    expect(svgLink?.href).toMatch(/^data:image\/svg\+xml/);
    expect(svgLink?.download).toBe("waveform.csv_signal_vs_time.svg");
    const figure = document.querySelector(".plot-figure") as SVGSVGElement;
    const svg = decodeURIComponent(svgLink?.href.split(",")[1] ?? "");
    expect(svg).toBe(new XMLSerializer().serializeToString(figure));
    const exported = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(exported.documentElement.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(exported.querySelector("[data-plot-title]")?.textContent).toBe(
      "waveform.csv: signal vs time",
    );
    expect(exported.querySelector("[data-series] path")).not.toBeNull();
    expect(exported.querySelector('[data-axis-label="x"]')?.textContent).toBe("time");
    expect(exported.querySelector(".plot-interaction")).toBeNull();
  });

  it("zooms on the configured axis in a scaled plot and resets on double click", async () => {
    await renderWorkbench();
    await act(async () => {
      await storeState().runScispace("plot-set seed-plot zoom=x", { source: "gui" });
    });
    const interaction = document.querySelector(".plot-interaction") as SVGSVGElement;
    vi.spyOn(interaction, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 50, 1280, 720));
    const ticks = (axis: "x" | "y") =>
      [...document.querySelectorAll(`[data-plot-axis="${axis}"] [data-tick-value]`)].map((tick) =>
        tick.getAttribute("data-tick-value"),
      );
    const before = { x: ticks("x"), y: ticks("y") };
    const pointer = { isPrimary: true, pointerId: 1, button: 0 };
    fireEvent.pointerDown(interaction, { ...pointer, clientX: 400, clientY: 140 });
    fireEvent.pointerMove(interaction, { ...pointer, clientX: 500, clientY: 520 });
    expect(interaction.querySelector("rect")).not.toBeNull();
    fireEvent.pointerUp(interaction, { ...pointer, clientX: 500, clientY: 520 });
    expect(interaction.querySelector("rect")).toBeNull();
    expect(ticks("x")).not.toEqual(before.x);
    expect(ticks("y")).toEqual(before.y);

    fireEvent.doubleClick(interaction);
    expect(ticks("x")).toEqual(before.x);
    expect(storeState().plotSpecs[0]?.axes.x.range.mode).toBe("auto");
  });

  it("opens the plot schema apply window and applies pasted json", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const schema = {
      ...storeState().plotSpecs[0],
      title: "Applied from GUI",
      size: { width: 760, height: 410 },
    };

    await clickToolbarItem(user, "Plot", "Apply plot schema");

    const textarea = await screen.findByLabelText("Plot schema JSON");
    fireEvent.change(textarea, { target: { value: JSON.stringify(schema) } });
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(storeState().plotSpecs[0]).toMatchObject({
        title: "Applied from GUI",
        size: { width: 760, height: 410 },
      }),
    );
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: expect.stringContaining("plot-apply-schema seed-plot"),
      source: "gui",
      status: "success",
    });
  });

  it("runs plot actions from the right click context menu", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    mockPngDecode();
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
    await user.click(screen.getByRole("menuitem", { name: "Apply plot schema" }));
    expect(await screen.findByLabelText("Plot schema JSON")).toBeInTheDocument();
    storeState().closeWindow("plot-schema-apply-main");

    fireEvent.contextMenu(plotHost, { clientX: 360, clientY: 240 });
    await user.click(screen.getByRole("menuitem", { name: "Export plot PNG" }));
    await waitFor(() => expect(toDataUrl).toHaveBeenCalledWith("image/png"));

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
    expect(screen.getByText("1 commands")).toBeInTheDocument();
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
    expect(storeState().terminalCommandLineRequest?.execute).toBeUndefined();

    await user.click(runButton);
    expect(storeState().terminalCommandLineRequest).toMatchObject({
      command: "table waveform.csv",
      execute: true,
    });
    await waitFor(() =>
      expect(storeState().commandHistory.at(-1)).toMatchObject({
        command: "table waveform.csv",
        source: "terminal",
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
        source: "terminal",
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
