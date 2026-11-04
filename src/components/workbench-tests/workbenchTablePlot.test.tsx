import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import {
  clickToolbarItem,
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
  waitForTableBodyCells,
} from "./workbenchTestUtils";

describe("Workbench table plot actions", () => {
  setupWorkbenchSuite();

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
});
