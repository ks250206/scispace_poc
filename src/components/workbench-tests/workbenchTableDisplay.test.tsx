import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
  waitForTableBodyCells,
} from "./workbenchTestUtils";

describe("Workbench table display", () => {
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
});
