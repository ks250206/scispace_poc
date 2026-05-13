import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  clickToolbarItem,
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
  waitForTableBodyCells,
} from "./workbenchTestUtils";

describe("Workbench table range actions", () => {
  setupWorkbenchSuite();

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
});
