import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByText("Command History")).toBeInTheDocument();
    expect(screen.getByText("No scispace commands yet.")).toBeInTheDocument();
  });

  it("pans the workspace from empty background drag without panning from windows", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    const plane = document.querySelector(".workspace-plane") as HTMLElement;
    const windowFrame = document.querySelector(".canvas-window") as HTMLElement;

    fireEvent.pointerDown(plane, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(document.querySelector(".workbench") as HTMLElement, {
      clientX: 42,
      clientY: 55,
      pointerId: 1,
    });
    fireEvent.pointerUp(document.querySelector(".workbench") as HTMLElement, { pointerId: 1 });
    expect(useScispaceStore.getState().viewport).toMatchObject({ x: -1888, y: -1035 });

    useScispaceStore.getState().setViewport({ x: 0, y: 0, scale: 1 });
    fireEvent.pointerDown(windowFrame, { button: 0, clientX: 10, clientY: 10, pointerId: 2 });
    fireEvent.pointerMove(document.querySelector(".workbench") as HTMLElement, {
      clientX: 42,
      clientY: 55,
      pointerId: 2,
    });
    fireEvent.pointerUp(document.querySelector(".workbench") as HTMLElement, { pointerId: 2 });
    expect(useScispaceStore.getState().viewport).toMatchObject({ x: 0, y: 0 });
  });

  it("pans the workspace with wheel and keeps ctrl wheel as zoom", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    const shell = document.querySelector(".canvas-shell") as HTMLElement;
    expect(shell).toHaveAttribute("data-grid-mode", "dots");
    expect(shell.style.getPropertyValue("--canvas-dot-step")).toBe("24px");
    expect(shell.style.getPropertyValue("--canvas-major-step")).toBe("240px");

    fireEvent.wheel(shell, { deltaY: 120 });
    expect(useScispaceStore.getState().viewport).toMatchObject({ x: -1920, y: -1170, scale: 1 });

    await user.click(screen.getByRole("button", { name: "Reset View" }));
    fireEvent.wheel(shell, { deltaY: 120, shiftKey: true });
    expect(useScispaceStore.getState().viewport).toMatchObject({ x: -2010, y: -1080, scale: 1 });

    await user.click(screen.getByRole("button", { name: "Reset View" }));
    fireEvent.wheel(shell, { deltaX: 120, deltaY: 0, shiftKey: true });
    expect(useScispaceStore.getState().viewport).toMatchObject({ x: -2010, y: -1080, scale: 1 });

    await user.click(screen.getByRole("button", { name: "Reset View" }));
    fireEvent.wheel(shell, { deltaX: 40 });
    expect(useScispaceStore.getState().viewport).toMatchObject({ x: -1950, y: -1080, scale: 1 });

    act(() => useScispaceStore.getState().setViewport({ x: -1920, y: -1080, scale: 0.5 }));
    fireEvent.wheel(shell, { deltaY: 120 });
    expect(useScispaceStore.getState().viewport).toMatchObject({
      x: -1920,
      y: -1125,
      scale: 0.5,
    });
    expect(shell).toHaveAttribute("data-grid-mode", "dots");

    act(() => useScispaceStore.getState().setViewport({ x: -1920, y: -1080, scale: 0.49 }));
    expect(shell).toHaveAttribute("data-grid-mode", "overview");
    expect(shell.style.getPropertyValue("--canvas-major-step")).toBe("117.6px");

    act(() => useScispaceStore.getState().setViewport({ x: -1920, y: -1080, scale: 2 }));
    fireEvent.wheel(shell, { deltaY: 120, shiftKey: true });
    expect(useScispaceStore.getState().viewport).toMatchObject({
      x: -2100,
      y: -1080,
      scale: 2,
    });

    await user.click(screen.getByRole("button", { name: "Reset View" }));
    fireEvent.wheel(shell, { clientX: 480, clientY: 320, deltaY: 100, ctrlKey: true });
    expect(useScispaceStore.getState().viewport).toMatchObject({
      x: -1680,
      y: -940,
      scale: 0.9,
    });
    expect(shell.style.getPropertyValue("--canvas-dot-step")).toBe("21.6px");

    fireEvent.wheel(shell, { clientX: 480, clientY: 320, deltaY: 5000, ctrlKey: true });
    expect(useScispaceStore.getState().viewport.scale).toBe(0.1);

    fireEvent.wheel(shell, { clientX: 480, clientY: 320, deltaY: -5000, ctrlKey: true });
    expect(useScispaceStore.getState().viewport.scale).toBe(3);
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

  it("collapses and expands dataset columns in the data browser", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    expect(document.querySelectorAll(".tree-row.column")).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "Collapse waveform.csv" }));
    expect(document.querySelectorAll(".tree-row.column")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Expand waveform.csv" }));
    expect(document.querySelectorAll(".tree-row.column")).toHaveLength(4);
  });

  it("resizes the table window when changing visible row count", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    const tableScroll = document.querySelector(".table-scroll") as HTMLElement;
    expect(screen.getByLabelText("Visible rows")).toHaveValue("10");
    expect(tableScroll.style.getPropertyValue("--table-visible-height")).toBe("352px");
    expect(
      useScispaceStore.getState().windows.find((window) => window.id === "table-seed"),
    ).toMatchObject({
      height: 424,
    });

    fireEvent.change(screen.getByLabelText("Visible rows"), { target: { value: "50" } });

    expect(tableScroll.style.getPropertyValue("--table-visible-height")).toBe("1632px");
    await waitFor(() =>
      expect(
        useScispaceStore.getState().windows.find((window) => window.id === "table-seed"),
      ).toMatchObject({
        height: 1704,
      }),
    );
  });

  it("selects table columns and edits selected cells", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Select column signal" }));
    expect(screen.getByRole("button", { name: "Select column signal" }).closest("th")).toHaveClass(
      "selected-column",
    );

    await waitFor(() =>
      expect(document.querySelectorAll(".table-scroll tbody td").length).toBeGreaterThan(2),
    );
    const firstSignalCell = document.querySelectorAll(".table-scroll tbody td")[2] as HTMLElement;
    await user.click(firstSignalCell);
    expect(firstSignalCell).toHaveClass("selected-cell");

    await user.dblClick(firstSignalCell);
    const editor = screen.getByLabelText("Edit row 1 signal");
    await user.clear(editor);
    await user.type(editor, "123.45{Enter}");

    await waitFor(() =>
      expect(useScispaceStore.getState().datasets[0]?.rows[0]?.signal).toBe(123.45),
    );
    expect(document.querySelectorAll(".table-scroll tbody td")[2]).toHaveTextContent("123.45");
  });

  it("resizes table columns and keeps a minimum width with horizontal scrolling", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    const tableScroll = document.querySelector(".table-scroll") as HTMLElement;
    const signalHeader = tableScroll.querySelectorAll("th")[2] as HTMLElement;
    expect(tableScroll).toHaveClass("table-scroll");
    expect(tableScroll.style.getPropertyValue("--table-width")).toBe("560px");
    expect(signalHeader).toHaveStyle({ width: "140px", minWidth: "96px" });

    fireEvent.pointerDown(screen.getByRole("separator", { name: "Resize column signal" }), {
      clientX: 200,
    });
    fireEvent.pointerMove(document, { clientX: 280 });
    fireEvent.pointerUp(document);

    expect(signalHeader).toHaveStyle({ width: "220px" });
    expect(tableScroll.style.getPropertyValue("--table-width")).toBe("640px");

    fireEvent.pointerDown(screen.getByRole("separator", { name: "Resize column signal" }), {
      clientX: 280,
    });
    fireEvent.pointerMove(document, { clientX: 0 });
    fireEvent.pointerUp(document);

    expect(signalHeader).toHaveStyle({ width: "96px" });
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

  it("stacks raw text and import preview virtual tables with resizable columns", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    const shell = document.querySelector(".canvas-shell");
    const file = new File(["x,y\n1,2\n3,4\n5,6"], "imported.csv", { type: "text/csv" });
    fireEvent.drop(shell as Element, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(screen.getByText("Import - imported.csv")).toBeInTheDocument());
    const editorGrid = document.querySelector(".import-editor-grid") as HTMLElement;
    const rawTable = document.querySelector(".raw-text-table") as HTMLElement;
    const preview = document.querySelector(".import-preview") as HTMLElement;
    const previewXHeader = preview.querySelectorAll("th")[0] as HTMLElement;
    expect(editorGrid).toHaveClass("stacked");
    expect(rawTable).toBeInTheDocument();
    expect(preview.style.getPropertyValue("--table-width")).toBe("280px");
    expect(previewXHeader).toHaveStyle({ width: "140px", minWidth: "96px" });
    expect(screen.queryByRole("textbox", { name: "Raw text" })).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("separator", { name: "Resize import column x" }), {
      clientX: 120,
    });
    fireEvent.pointerMove(document, { clientX: 200 });
    fireEvent.pointerUp(document);

    expect(previewXHeader).toHaveStyle({ width: "220px" });
    expect(preview.style.getPropertyValue("--table-width")).toBe("360px");

    const secondLineInput = screen.getByRole("textbox", { name: "Raw line 2" });
    fireEvent.change(secondLineInput, { target: { value: "10,20" } });
    await waitFor(() =>
      expect(useScispaceStore.getState().pendingImports[0]?.preview?.rows[0]).toEqual({
        x: 10,
        y: 20,
      }),
    );
  });

  it("opens an import settings window from the data browser load field", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    const file = new File(["x,y\n5,6"], "clicked.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Load data files"), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText("Import - clicked.csv")).toBeInTheDocument());
    expect(useScispaceStore.getState().pendingImports[0]?.fileName).toBe("clicked.csv");
  });

  it("shows close buttons only on table and plot windows and removes the clicked window", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Close Table - waveform.csv" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Plot - waveform.csv" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close Data Browser" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close Terminal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close Command History" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close Table - waveform.csv" }));

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
    expect(useScispaceStore.getState().commandHistory.map((entry) => entry.command)).toEqual([
      "file-mkdir ~/raw/analysis",
      "file-move ~/raw/waveform.csv to=~/raw/analysis",
      "file-rename ~/raw/analysis/waveform.csv name=renamed.csv",
      "file-delete ~/raw/analysis/renamed.csv",
    ]);
    expect(
      useScispaceStore.getState().commandHistory.every((entry) => entry.source === "gui"),
    ).toBe(true);
  });

  it("opens shared plot config and edits the current plot", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    expect(screen.queryByText("Plot Config")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Config" }));
    expect(screen.getByText("Plot Config")).toBeInTheDocument();
    expect(useScispaceStore.getState().currentPlotId).toBe("seed-plot");
    expect(screen.getByRole("tab", { name: "Basic" })).toHaveAttribute("aria-selected", "true");

    const titleInput = screen.getByLabelText("Plot title");
    await user.click(titleInput);
    await user.keyboard("{Control>}a{/Control}Custom plot");
    await waitFor(() =>
      expect(useScispaceStore.getState().plotSpecs[0]?.title).toBe("Custom plot"),
    );
    await user.selectOptions(screen.getByLabelText("Plot x column"), "index");
    fireEvent.change(screen.getByLabelText("Plot width"), { target: { value: "720" } });
    fireEvent.change(screen.getByLabelText("Plot height"), { target: { value: "420" } });
    expect(useScispaceStore.getState().plotSpecs[0]?.size).toEqual({ width: 640, height: 360 });
    fireEvent.blur(screen.getByLabelText("Plot height"));
    await waitFor(() =>
      expect(useScispaceStore.getState().plotSpecs[0]?.size).toEqual({
        width: 720,
        height: 420,
      }),
    );
    fireEvent.change(screen.getByLabelText("Plot font family"), { target: { value: "Arial" } });
    fireEvent.change(screen.getByLabelText("Plot font size"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("Plot padding left"), { target: { value: "18" } });
    expect(
      useScispaceStore.getState().windows.find((window) => window.id === "plot-seed"),
    ).toMatchObject({
      width: 720,
      height: 514,
    });

    await user.click(screen.getByRole("tab", { name: "Axes" }));
    fireEvent.change(screen.getByLabelText("y axis label"), { target: { value: "Signal axis" } });
    fireEvent.change(screen.getByLabelText("y tick length"), { target: { value: "10" } });
    fireEvent.click(screen.getByLabelText("y minor tick"));
    fireEvent.change(screen.getByLabelText("y axis color"), { target: { value: "#111827" } });

    await user.click(screen.getByRole("tab", { name: "Series" }));
    expect(screen.getByRole("tab", { name: "Series" })).toHaveAttribute("aria-selected", "true");
    await user.selectOptions(screen.getByLabelText("Add series"), "background");
    await user.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Color background"), { target: { value: "#dc2626" } });
    await user.selectOptions(screen.getByLabelText("Marker shape background"), "triangle");
    fireEvent.change(screen.getByLabelText("Draw order background"), { target: { value: "3" } });
    const backgroundLabel = screen.getByLabelText("Label background");
    await user.click(backgroundLabel);
    await user.keyboard("{Control>}a{/Control}Background");

    await user.click(screen.getByRole("tab", { name: "Annotations" }));
    fireEvent.change(screen.getByLabelText("Annotation text"), { target: { value: "Peak" } });
    fireEvent.change(screen.getByLabelText("Annotation x"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Annotation y"), { target: { value: "0.5" } });
    await user.click(screen.getByRole("button", { name: "Add annotation" }));

    const spec = useScispaceStore.getState().plotSpecs.find((plot) => plot.id === "seed-plot");
    expect(spec).toMatchObject({
      title: "Custom plot",
      titleEdited: true,
      x: "index",
      zoomMode: "xy",
      size: { width: 720, height: 420 },
      font: { family: "Arial", size: 14 },
      padding: { left: 18 },
      axes: {
        y: {
          label: "Signal axis",
          color: "#111827",
          ticks: { length: 10, minor: true },
        },
      },
    });
    expect(spec?.series).toEqual([
      {
        y: "signal",
        label: "signal",
        color: "#2563eb",
        lineWidth: 2,
        markerSize: 6,
        markerShape: "circle",
        drawOrder: 0,
      },
      {
        y: "background",
        label: "Background",
        color: "#dc2626",
        lineWidth: 2,
        markerSize: 6,
        markerShape: "triangle",
        drawOrder: 3,
      },
    ]);
    expect(spec?.annotations[0]).toMatchObject({ text: "Peak", x: 1, y: 0.5 });

    await user.click(screen.getByRole("tab", { name: "Series" }));
    await user.click(screen.getByRole("button", { name: "Remove background" }));
    expect(useScispaceStore.getState().plotSpecs[0]?.series).toHaveLength(1);
    expect(useScispaceStore.getState().commandHistory.some((entry) => entry.source === "gui")).toBe(
      true,
    );
    expect(screen.getAllByText(/plot-/).length).toBeGreaterThan(0);
  });

  it("replays and copies commands from the command history window", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    await act(async () => {
      await useScispaceStore.getState().initialize();
    });
    await act(async () => {
      await useScispaceStore.getState().runScispace("table waveform.csv");
    });

    await waitFor(() =>
      expect(useScispaceStore.getState().commandHistory.at(-1)?.command).toBe("table waveform.csv"),
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
    expect(useScispaceStore.getState().terminalCommandLineRequest).toMatchObject({
      command: "table waveform.csv",
    });

    await user.click(runButton);
    await waitFor(() =>
      expect(useScispaceStore.getState().commandHistory.at(-1)).toMatchObject({
        command: "table waveform.csv",
        source: "history",
      }),
    );
  });

  it("replays file commands from the command history window", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    await act(async () => {
      await useScispaceStore.getState().initialize();
    });
    await act(async () => {
      await useScispaceStore.getState().runScispace("file-list ~/raw");
    });

    await user.click(await screen.findByRole("button", { name: "Run file-list ~/raw" }));

    await waitFor(() =>
      expect(useScispaceStore.getState().commandHistory.at(-1)).toMatchObject({
        command: "file-list ~/raw",
        source: "history",
        status: "success",
      }),
    );
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
    expect(screen.getByText("Command History")).toBeInTheDocument();
  });
});
