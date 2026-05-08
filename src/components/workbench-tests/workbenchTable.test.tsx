import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
  tableBodyCells,
  waitForTableBodyCells,
} from "./workbenchTestUtils";

describe("Workbench table UI", () => {
  setupWorkbenchSuite();

  it("resizes the table window when changing visible row count", async () => {
    await renderWorkbench();
    const tableScroll = document.querySelector(".table-scroll") as HTMLElement;
    expect(screen.getByLabelText("Visible rows")).toHaveValue("10");
    expect(tableScroll.style.getPropertyValue("--table-visible-height")).toBe("352px");
    expect(storeState().windows.find((window) => window.id === "table-seed")).toMatchObject({
      height: 424,
    });

    fireEvent.change(screen.getByLabelText("Visible rows"), { target: { value: "50" } });

    expect(tableScroll.style.getPropertyValue("--table-visible-height")).toBe("1632px");
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
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await renderWorkbench();
    expect(screen.getByRole("button", { name: "Copy TSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete selected cells" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fill down" })).toBeDisabled();

    const cells = await waitForTableBodyCells(10);
    await user.click(cells[1] as HTMLElement);
    fireEvent.click(cells[6], { shiftKey: true });

    await user.click(screen.getByRole("button", { name: "Copy TSV" }));
    expect(writeText).toHaveBeenCalledWith("0\t3\n0.125\t4.4902");

    await user.click(screen.getByRole("button", { name: "Delete selected cells" }));
    await waitFor(() => expect(storeState().datasets[0]?.rows[0]?.time).toBe(""));
    expect(storeState().datasets[0]?.rows[1]?.signal).toBe("");
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: "table-range waveform.csv action=clear r1=1 c1=time r2=2 c2=signal",
      source: "gui",
    });

    await user.click(cells[3] as HTMLElement);
    fireEvent.click(cells[11], { shiftKey: true });
    await user.click(screen.getByRole("button", { name: "Fill down" }));
    await waitFor(() => expect(storeState().datasets[0]?.rows[1]?.background).toBe(7));
    expect(storeState().datasets[0]?.rows[2]?.background).toBe(7);
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: "table-range waveform.csv action=fill-down r1=1 c1=background r2=3 c2=background",
      source: "gui",
    });
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("creates plots from selected table columns through scispace commands", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    expect(screen.getByRole("button", { name: "Plot selection" })).toBeDisabled();

    const cells = await waitForTableBodyCells(10);
    await user.click(cells[1] as HTMLElement);
    fireEvent.click(cells[7], { shiftKey: true });

    await user.click(screen.getByRole("button", { name: "Plot selection" }));

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
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderWorkbench();
    expect(screen.getByRole("button", { name: "Delete row" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete column" })).toBeDisabled();

    const cells = await waitForTableBodyCells(2);
    await user.click(cells[2] as HTMLElement);
    expect(screen.getByRole("button", { name: "Delete row" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Delete row" }));

    await waitFor(() => expect(storeState().datasets[0]?.rows).toHaveLength(159));
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: "table-edit waveform.csv action=delete-row index=1",
      source: "gui",
    });

    await user.click(screen.getByRole("button", { name: "Select column background" }));
    expect(screen.getByRole("button", { name: "Delete column" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Delete column" }));

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
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("does not delete table data when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderWorkbench();
    const cells = await waitForTableBodyCells(2);
    await user.click(cells[2] as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Delete row" }));

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
});
