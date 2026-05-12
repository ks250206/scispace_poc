import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  clickToolbarItem,
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
  tableBodyCells,
  waitForTableBodyCells,
} from "./workbenchTestUtils";

describe("Workbench table UI", () => {
  setupWorkbenchSuite();

  it("resizes the table window when changing visible row count", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const tableScroll = document.querySelector(".table-scroll") as HTMLElement;
    expect(screen.getByText("160 rows · virtualized · rows auto")).toBeInTheDocument();
    expect(tableScroll.style.getPropertyValue("--table-visible-height")).toBe("");
    expect(storeState().windows.find((window) => window.id === "table-seed")).toMatchObject({
      height: 424,
    });

    await user.click(screen.getByRole("button", { name: "Table" }));
    await user.click(screen.getByRole("menuitem", { name: "Rows" }));
    await user.click(screen.getByRole("menuitem", { name: "Rows 50" }));

    expect(tableScroll.style.getPropertyValue("--table-visible-height")).toBe("1632px");
    expect(screen.getByText("160 rows · virtualized · rows 50")).toBeInTheDocument();
    await waitFor(() =>
      expect(storeState().windows.find((window) => window.id === "table-seed")).toMatchObject({
        height: 1704,
      }),
    );
  });

  it("selects table columns and edits selected cells", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await user.click(screen.getByRole("button", { name: "Select column signal" }));
    expect(screen.getByRole("button", { name: "Select column signal" }).closest("th")).toHaveClass(
      "selected-column",
    );

    const cells = await waitForTableBodyCells(2);
    const firstSignalCell = cells[2] as HTMLElement;
    await user.click(firstSignalCell);
    expect(firstSignalCell).toHaveClass("selected-cell");

    await user.dblClick(firstSignalCell);
    const editor = screen.getByLabelText("Edit row 1 signal");
    await user.clear(editor);
    await user.type(editor, "123.45{Enter}");

    await waitFor(() => expect(storeState().datasets[0]?.rows[0]?.signal).toBe(123.45));
    expect(tableBodyCells()[2]).toHaveTextContent("123.45");
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: "table-edit waveform.csv action=set-cell row=1 column=signal value=123.45",
      source: "gui",
      status: "success",
    });
  });

  it("starts cell editing from printable keys and commits on blur", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const cells = await waitForTableBodyCells(4);
    await user.click(cells[2] as HTMLElement);
    await user.keyboard("9");

    const editor = screen.getByLabelText("Edit row 1 signal");
    expect(editor).toHaveValue("9");
    fireEvent.blur(editor);

    await waitFor(() => expect(storeState().datasets[0]?.rows[0]?.signal).toBe(9));
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: "table-edit waveform.csv action=set-cell row=1 column=signal value=9",
      source: "gui",
    });
  });

  it("moves selected table cells with arrow keys and jumps to edges with command arrows", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const cells = await waitForTableBodyCells(10);
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
    await renderWorkbench();
    const cells = await waitForTableBodyCells(10);
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
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await renderWorkbench();
    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("menuitem", { name: "Copy TSV" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Delete selected cells" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Fill down" })).toBeDisabled();
    await user.keyboard("{Escape}");

    const cells = await waitForTableBodyCells(10);
    await user.click(cells[1] as HTMLElement);
    fireEvent.click(cells[6], { shiftKey: true });

    await clickToolbarItem(user, "Table", "Copy TSV");
    expect(writeText).toHaveBeenCalledWith("0\t3\n0.125\t4.4902");

    await clickToolbarItem(user, "Table", "Delete selected cells");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(storeState().datasets[0]?.rows[0]?.time).toBe(""));
    expect(storeState().datasets[0]?.rows[1]?.signal).toBe("");
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: "table-range waveform.csv action=clear r1=1 c1=time r2=2 c2=signal",
      source: "gui",
    });

    await user.click(cells[3] as HTMLElement);
    fireEvent.click(cells[11], { shiftKey: true });
    await clickToolbarItem(user, "Table", "Fill down");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Fill down" }));
    await waitFor(() => expect(storeState().datasets[0]?.rows[1]?.background).toBe(7));
    expect(storeState().datasets[0]?.rows[2]?.background).toBe(7);
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: "table-range waveform.csv action=fill-down r1=1 c1=background r2=3 c2=background",
      source: "gui",
    });
  });

  it("runs table actions from the right click context menu", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await renderWorkbench();
    const cells = await waitForTableBodyCells(10);

    fireEvent.contextMenu(cells[2], { clientX: 120, clientY: 140 });
    expect(cells[2]).toHaveClass("range-selected");
    await user.click(screen.getByRole("menuitem", { name: "Copy TSV" }));
    expect(writeText).toHaveBeenCalledWith("3");

    fireEvent.contextMenu(cells[2], { clientX: 120, clientY: 140 });
    await user.click(screen.getByRole("menuitem", { name: "Delete selected cells" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(storeState().datasets[0]?.rows[0]?.signal).toBe(""));
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: "table-range waveform.csv action=clear r1=1 c1=signal r2=1 c2=signal",
      source: "gui",
    });

    fireEvent.contextMenu(screen.getByRole("button", { name: "Select column background" }), {
      clientX: 140,
      clientY: 120,
    });
    await user.click(screen.getByRole("menuitem", { name: "Delete column" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(storeState().datasets[0]?.columns.map((column) => column.id)).not.toContain(
        "background",
      ),
    );
  });

  it("changes visible rows from the table context menu", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const cells = await waitForTableBodyCells(2);
    fireEvent.contextMenu(cells[1], { clientX: 120, clientY: 140 });
    await user.click(screen.getByRole("menuitem", { name: "Rows 50" }));

    expect(screen.getByText("160 rows · virtualized · rows 50")).toBeInTheDocument();
    await waitFor(() =>
      expect(storeState().windows.find((window) => window.id === "table-seed")).toMatchObject({
        height: 1704,
      }),
    );
  });

  it("creates plots from selected table columns through scispace commands", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("menuitem", { name: "Plot selection" })).toBeDisabled();
    await user.keyboard("{Escape}");

    const cells = await waitForTableBodyCells(10);
    await user.click(cells[1] as HTMLElement);
    fireEvent.click(cells[7], { shiftKey: true });

    await clickToolbarItem(user, "Table", "Plot selection");

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

  it("creates plots from ordered multi-column header selection", async () => {
    const user = userEvent.setup();
    await renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Select column signal" }));
    fireEvent.click(screen.getByRole("button", { name: "Select column background" }), {
      metaKey: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Select column time" }), {
      metaKey: true,
    });

    await clickToolbarItem(user, "Table", "Plot selection");

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

  it("deletes selected table rows and columns through scispace commands", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("menuitem", { name: "Delete row" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Delete column" })).toBeDisabled();
    await user.keyboard("{Escape}");

    const cells = await waitForTableBodyCells(2);
    await user.click(cells[2] as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("menuitem", { name: "Delete row" })).toBeEnabled();
    await user.click(screen.getByRole("menuitem", { name: "Delete row" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(storeState().datasets[0]?.rows).toHaveLength(159));
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: "table-edit waveform.csv action=delete-row index=1",
      source: "gui",
    });

    await user.click(screen.getByRole("button", { name: "Select column background" }));
    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("menuitem", { name: "Delete column" })).toBeEnabled();
    await user.click(screen.getByRole("menuitem", { name: "Delete column" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(storeState().datasets[0]?.columns.map((column) => column.id)).toEqual([
        "index",
        "time",
        "signal",
      ]),
    );
    expect(screen.queryByRole("button", { name: "Select column background" })).toBeNull();
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: "table-edit waveform.csv action=delete-column column=background",
      source: "gui",
    });
  });

  it("inserts table columns through the table menu", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await user.click(screen.getByRole("button", { name: "Select column signal" }));
    await clickToolbarItem(user, "Table", "Insert column");

    const dialog = within(screen.getByRole("dialog"));
    const input = dialog.getByRole("textbox");
    fireEvent.change(input, { target: { value: "derived" } });
    await user.click(dialog.getByRole("button", { name: "Insert" }));

    await waitFor(() =>
      expect(storeState().datasets[0]?.columns.map((column) => column.id)).toEqual([
        "index",
        "time",
        "derived",
        "signal",
        "background",
      ]),
    );
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: "table-edit waveform.csv action=insert-column column=derived before=signal",
      source: "gui",
      status: "success",
    });
  });

  it("opens calculate column from the active table menu and context menu", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const cells = await waitForTableBodyCells(2);
    await user.click(cells[1] as HTMLElement);

    await clickToolbarItem(user, "Table", "Calculate column");
    expect(await screen.findByLabelText("Calculation dataset")).toHaveValue("seed-waveform");

    await user.click(screen.getByRole("button", { name: "Close Calculate Column" }));
    fireEvent.contextMenu(cells[1], { clientX: 120, clientY: 140 });
    await user.click(screen.getByRole("menuitem", { name: "Calculate column" }));

    expect(await screen.findByLabelText("Calculation dataset")).toHaveValue("seed-waveform");
  });

  it("locks table editing while keeping selection and plotting available", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const cells = await waitForTableBodyCells(4);
    await user.click(cells[2] as HTMLElement);
    await clickToolbarItem(user, "Table", "Lock table");

    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("menuitem", { name: "Delete row" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Insert column" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Unlock table" })).toBeEnabled();
    await user.keyboard("{Escape}");

    const previousHistoryLength = storeState().commandHistory.length;
    await user.keyboard("9");
    expect(screen.queryByLabelText("Edit row 1 signal")).toBeNull();
    expect(storeState().commandHistory).toHaveLength(previousHistoryLength);

    await clickToolbarItem(user, "Table", "Unlock table");
    await user.click(cells[2] as HTMLElement);
    await user.keyboard("9");
    expect(screen.getByLabelText("Edit row 1 signal")).toHaveValue("9");
  });

  it("does not delete table data when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const cells = await waitForTableBodyCells(2);
    await user.click(cells[2] as HTMLElement);
    await clickToolbarItem(user, "Table", "Delete row");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(storeState().datasets[0]?.rows).toHaveLength(160);
    expect(storeState().commandHistory).toHaveLength(0);
  });

  it("resizes table columns and keeps a minimum width with horizontal scrolling", async () => {
    await renderWorkbench();
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

  it("draws filler rows for sparse datasets so the grid fills the window", async () => {
    await renderWorkbench();
    await act(async () => {
      await storeState().runScispace("dataset-new Data1 columns=x,y,z,a,b,c rows=5", {
        source: "gui",
      });
      await storeState().runScispace("table Data1", { source: "gui" });
    });

    await waitFor(() => expect(screen.getByText("Table - Data1")).toBeInTheDocument());
    expect(document.querySelectorAll(".table-filler-row").length).toBeGreaterThan(0);
  });
});
