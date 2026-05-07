import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { ImportSettingsWindow } from "./ImportSettingsWindow";
import { useScispaceStore } from "../store/scispaceStore";

describe("Workbench UI", () => {
  beforeEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await useScispaceStore.getState().createNewProject();
  });

  afterEach(() => {
    cleanup();
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
    expect(useScispaceStore.getState().commandHistory.at(-1)).toMatchObject({
      command: "table-edit waveform.csv action=set-cell row=1 column=signal value=123.45",
      source: "gui",
      status: "success",
    });
  });

  it("moves selected table cells with arrow keys and jumps to edges with command arrows", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    await waitFor(() =>
      expect(document.querySelectorAll(".table-scroll tbody td").length).toBeGreaterThan(10),
    );
    const cells = document.querySelectorAll(".table-scroll tbody td");
    await user.click(cells[2] as HTMLElement);
    expect(cells[2]).toHaveClass("selected-cell");

    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(cells[3]).toHaveClass("selected-cell"));

    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(cells[7]).toHaveClass("selected-cell"));

    await user.keyboard("{Meta>}{ArrowLeft}{/Meta}");
    await waitFor(() => expect(cells[4]).toHaveClass("selected-cell"));

    await user.keyboard("{Meta>}{ArrowRight}{/Meta}");
    await waitFor(() => expect(cells[7]).toHaveClass("selected-cell"));

    await user.keyboard("{Meta>}{ArrowUp}{/Meta}");
    await waitFor(() => expect(cells[3]).toHaveClass("selected-cell"));
  });

  it("selects multiple table cells with shift click and drag", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    await waitFor(() =>
      expect(document.querySelectorAll(".table-scroll tbody td").length).toBeGreaterThan(10),
    );
    const cells = document.querySelectorAll(".table-scroll tbody td");
    await user.click(cells[1] as HTMLElement);
    fireEvent.click(cells[6], { shiftKey: true });

    expect(cells[1]).toHaveClass("range-selected");
    expect(cells[2]).toHaveClass("range-selected");
    expect(cells[5]).toHaveClass("range-selected");
    expect(cells[6]).toHaveClass("range-selected");
    expect(cells[7]).not.toHaveClass("range-selected");

    fireEvent.pointerDown(cells[8], { shiftKey: true, pointerId: 1 });
    fireEvent.pointerEnter(cells[14], { shiftKey: true, pointerId: 1 });
    fireEvent.pointerUp(cells[14], { pointerId: 1 });

    expect(cells[8]).toHaveClass("range-selected");
    expect(cells[14]).toHaveClass("range-selected");
    expect(cells[15]).not.toHaveClass("range-selected");
  });

  it("copies, clears, and fills selected table ranges through scispace commands", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Copy TSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete selected cells" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fill down" })).toBeDisabled();

    await waitFor(() =>
      expect(document.querySelectorAll(".table-scroll tbody td").length).toBeGreaterThan(10),
    );
    const cells = document.querySelectorAll(".table-scroll tbody td");
    await user.click(cells[1] as HTMLElement);
    fireEvent.click(cells[6], { shiftKey: true });

    await user.click(screen.getByRole("button", { name: "Copy TSV" }));
    expect(writeText).toHaveBeenCalledWith("0\t3\n0.125\t4.4902");

    await user.click(screen.getByRole("button", { name: "Delete selected cells" }));
    await waitFor(() => expect(useScispaceStore.getState().datasets[0]?.rows[0]?.time).toBe(""));
    expect(useScispaceStore.getState().datasets[0]?.rows[1]?.signal).toBe("");
    expect(useScispaceStore.getState().commandHistory.at(-1)).toMatchObject({
      command: "table-range waveform.csv action=clear r1=1 c1=time r2=2 c2=signal",
      source: "gui",
    });

    await user.click(cells[3] as HTMLElement);
    fireEvent.click(cells[11], { shiftKey: true });
    await user.click(screen.getByRole("button", { name: "Fill down" }));
    await waitFor(() =>
      expect(useScispaceStore.getState().datasets[0]?.rows[1]?.background).toBe(7),
    );
    expect(useScispaceStore.getState().datasets[0]?.rows[2]?.background).toBe(7);
    expect(useScispaceStore.getState().commandHistory.at(-1)).toMatchObject({
      command: "table-range waveform.csv action=fill-down r1=1 c1=background r2=3 c2=background",
      source: "gui",
    });
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("deletes selected table rows and columns through scispace commands", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Delete row" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete column" })).toBeDisabled();

    await waitFor(() =>
      expect(document.querySelectorAll(".table-scroll tbody td").length).toBeGreaterThan(2),
    );
    await user.click(document.querySelectorAll(".table-scroll tbody td")[2] as HTMLElement);
    expect(screen.getByRole("button", { name: "Delete row" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Delete row" }));

    await waitFor(() => expect(useScispaceStore.getState().datasets[0]?.rows).toHaveLength(159));
    expect(useScispaceStore.getState().commandHistory.at(-1)).toMatchObject({
      command: "table-edit waveform.csv action=delete-row index=1",
      source: "gui",
    });

    await user.click(screen.getByRole("button", { name: "Select column background" }));
    expect(screen.getByRole("button", { name: "Delete column" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Delete column" }));

    await waitFor(() =>
      expect(useScispaceStore.getState().datasets[0]?.columns.map((column) => column.id)).toEqual([
        "index",
        "time",
        "signal",
      ]),
    );
    expect(screen.queryByRole("button", { name: "Select column background" })).toBeNull();
    expect(useScispaceStore.getState().commandHistory.at(-1)).toMatchObject({
      command: "table-edit waveform.csv action=delete-column column=background",
      source: "gui",
    });
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("does not delete table data when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    await waitFor(() =>
      expect(document.querySelectorAll(".table-scroll tbody td").length).toBeGreaterThan(2),
    );
    await user.click(document.querySelectorAll(".table-scroll tbody td")[2] as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Delete row" }));

    expect(useScispaceStore.getState().datasets[0]?.rows).toHaveLength(160);
    expect(useScispaceStore.getState().commandHistory).toHaveLength(0);
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
    let importId = "";
    act(() => {
      importId = useScispaceStore.getState().openImportDialog("imported.csv", "x,y\n1,2\n3,4\n5,6");
    });
    render(<ImportSettingsWindow importId={importId} />);

    const preview = await waitFor(() => {
      const element = document.querySelector(".import-preview") as HTMLElement | null;
      expect(element).toBeInTheDocument();
      return element as HTMLElement;
    });
    const editorGrid = preview.closest(".import-editor-grid") as HTMLElement;
    const previewXHeader = preview.querySelectorAll("th")[0] as HTMLElement;
    expect(editorGrid).toHaveClass("stacked");
    expect(preview.style.getPropertyValue("--table-width")).toBe("280px");
    expect(previewXHeader).toHaveStyle({ width: "140px", minWidth: "96px" });
    expect(screen.queryByRole("textbox", { name: "Raw text" })).not.toBeInTheDocument();

    expect(preview.querySelector('[aria-label="Resize import column x"]')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Raw line 2"), { target: { value: "10,20" } });
    await waitFor(() =>
      expect(useScispaceStore.getState().pendingImports[0]?.text).toBe("x,y\n10,20\n3,4\n5,6"),
    );
    expect(useScispaceStore.getState().commandHistory.at(-1)).toMatchObject({
      command: `import-line ${importId} line=2 value=${encodeURIComponent("10,20")}`,
      source: "gui",
      status: "success",
    });
  });

  it("can mark import columns for deletion and grays skipped raw rows", async () => {
    let importId = "";
    act(() => {
      importId = useScispaceStore
        .getState()
        .openImportDialog("drop-cols.csv", "x,empty,y\n1,,2\n3,,4");
    });
    render(<ImportSettingsWindow importId={importId} />);

    await waitFor(() => expect(screen.getByText("drop-cols.csv")).toBeInTheDocument());
    expect(document.querySelector(".column-import-list label.excluded span")?.textContent).toBe(
      "empty",
    );

    const yColumnToggle = Array.from(document.querySelectorAll(".column-import-list label"))
      .find((label) => label.querySelector("span")?.textContent === "y")
      ?.querySelector("input");
    fireEvent.click(yColumnToggle as Element);

    await waitFor(() =>
      expect(useScispaceStore.getState().pendingImports[0]?.options.excludedColumnIds).toEqual([
        "empty",
        "y",
      ]),
    );

    fireEvent.change(screen.getByDisplayValue("0"), { target: { value: "1" } });
    await waitFor(() =>
      expect(document.querySelector(".raw-text-table tbody tr")).toHaveClass("skipped-row"),
    );
    expect(
      useScispaceStore
        .getState()
        .commandHistory.slice(-2)
        .map((entry) => entry.source),
    ).toEqual(["gui", "gui"]);
  });

  it("shows detected import presets and highlights data start lines", async () => {
    let importId = "";
    act(() => {
      importId = useScispaceStore
        .getState()
        .openImportDialog(
          "sample.ras",
          [
            '*MEAS_SCAN_UNIT_X "deg"',
            '*MEAS_SCAN_UNIT_Y "counts"',
            "*RAS_HEADER_END",
            "*RAS_INT_START",
            "10.0000 3.9658 1.0000",
            "*RAS_INT_END",
          ].join("\n"),
        );
    });
    render(<ImportSettingsWindow importId={importId} />);

    await waitFor(() => expect(screen.getByText("Detected: Rigaku RAS")).toBeInTheDocument());
    expect(screen.getByText("Data starts at line 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Raw line 5")).toHaveValue("10.0000 3.9658 1.0000");
    expect(document.querySelector(".raw-text-table tbody tr.data-start-row")).toBeInTheDocument();
  });

  it("uses the whole import body for raw text mode", async () => {
    let importId = "";
    await act(async () => {
      importId = useScispaceStore
        .getState()
        .openImportDialog("notes.mpt", "EC-Lab ASCII FILE\nNb header lines : 70\n\nmetadata");
      await useScispaceStore
        .getState()
        .runScispace(`import-set ${importId} mode=raw`, { source: "gui" });
    });
    render(<ImportSettingsWindow importId={importId} />);

    await waitFor(() => expect(screen.getByText("notes.mpt")).toBeInTheDocument());
    expect(screen.getByText("4 raw lines")).toBeInTheDocument();
    expect(document.querySelector(".import-editor-grid")).toHaveClass("raw-only");
    expect(document.querySelector(".raw-text-table")).toBeInTheDocument();
    expect(document.querySelector(".import-preview")).not.toBeInTheDocument();
  });

  it("opens an import settings window from the data browser load field", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    const file = new File(["x,y\n5,6"], "clicked.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Load data files"), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText("Import - clicked.csv")).toBeInTheDocument());
    expect(useScispaceStore.getState().pendingImports[0]?.fileName).toBe("clicked.csv");
  });

  it("cancels import windows through scispace commands", async () => {
    let importId = "";
    act(() => {
      importId = useScispaceStore.getState().openImportDialog("cancel-ui.csv", "x,y\n1,2");
    });
    render(<ImportSettingsWindow importId={importId} />);

    await waitFor(() => expect(screen.getByText("cancel-ui.csv")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(useScispaceStore.getState().pendingImports.some((item) => item.id === importId)).toBe(
        false,
      ),
    );
    expect(useScispaceStore.getState().commandHistory.at(-1)).toMatchObject({
      command: `import-cancel ${importId}`,
      source: "gui",
      status: "success",
    });
  });

  it("opens raw file parsing from data browser through scispace commands", async () => {
    await act(async () => {
      await useScispaceStore.getState().importTextFile("notes.txt", "raw notes");
    });
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Parse notes.txt" }));

    await waitFor(() => expect(screen.getByText("Import - notes.txt")).toBeInTheDocument());
  });

  it("shows close buttons only on table and plot windows and removes the clicked window", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
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
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    expect(screen.queryByText("Plot Config")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Config" }));
    await waitFor(() => expect(screen.getByText("Plot Config")).toBeInTheDocument());
    expect(useScispaceStore.getState().currentPlotId).toBe("seed-plot");
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

  it("opens tables with the checked data browser columns", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    await act(async () => {
      await useScispaceStore.getState().initialize();
    });
    await act(async () => {
      useScispaceStore
        .getState()
        .setDatasetColumnSelection("seed-waveform", ["index", "time", "signal"]);
    });
    await waitFor(() =>
      expect(useScispaceStore.getState().columnSelections["seed-waveform"]).toEqual([
        "index",
        "time",
        "signal",
      ]),
    );

    await user.click(screen.getByRole("button", { name: "▦waveform.csv" }));
    await waitFor(() =>
      expect(useScispaceStore.getState().commandHistory.at(-1)).toMatchObject({
        command: "table waveform.csv columns=index,time,signal",
        source: "gui",
      }),
    );
    expect(
      useScispaceStore.getState().windows.find((window) => window.id === "table-seed"),
    ).toMatchObject({
      columnIds: ["index", "time", "signal"],
    });
  });

  it("undoes and redoes destructive commands from the topbar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
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
    expect(useScispaceStore.getState().datasets[0]?.rows[0]?.signal).toBe(42.5);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(useScispaceStore.getState().datasets[0]?.rows[0]?.signal).toBe(3));
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Redo" }));
    await waitFor(() =>
      expect(useScispaceStore.getState().datasets[0]?.rows[0]?.signal).toBe(42.5),
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("resets the workspace after confirming New Project", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Close Table - waveform.csv" }));
    await waitFor(() => expect(screen.queryByText("Table - waveform.csv")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "New Project" }));

    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Table - waveform.csv")).toBeInTheDocument());
    expect(screen.getByText("Plot - waveform.csv")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByText("Command History")).toBeInTheDocument();
  });
});
