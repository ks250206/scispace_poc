import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import {
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
  tableBodyCells,
  waitForTableBodyCells,
} from "./workbenchTestUtils";

describe("Workbench table editing and selection", () => {
  setupWorkbenchSuite();

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
});
