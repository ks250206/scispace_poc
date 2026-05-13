import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  clickToolbarItem,
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
  waitForTableBodyCells,
} from "./workbenchTestUtils";

describe("Workbench table commands", () => {
  setupWorkbenchSuite();

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

    const dialog = screen.getByRole("dialog");
    const input = dialog.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "derived" } });
    await user.click(screen.getByRole("button", { name: "Insert" }));

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

    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.getByText(/rows auto · locked/)).toBeInTheDocument();
    expect(document.querySelector(".table-window.is-locked")).toBeInTheDocument();

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
    expect(screen.queryByText("Locked")).not.toBeInTheDocument();
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
});
