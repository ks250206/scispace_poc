import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import { renderWorkbench, setupWorkbenchSuite, storeState } from "./workbenchTestUtils";
import { getWindowTitle } from "./workbenchTestDom";

describe("Workbench Windows menu", () => {
  setupWorkbenchSuite();

  it("lists open windows in the Windows menu and focuses the clicked window", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    expect(screen.queryByRole("navigation", { name: "Open windows" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Windows" }));
    const menu = screen.getByRole("menu", { name: "Windows menu" });

    expect(within(menu).getByRole("menuitem", { name: /Data Browser/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Terminal/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Command History/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /SciSpace Help/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Tables/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Graphs/ })).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Table - waveform.csv" }),
    ).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Plot - waveform.csv" })).toBeInTheDocument();

    const beforeZ = storeState().windows.find((window) => window.id === "table-seed")?.zIndex ?? 0;
    await user.click(within(menu).getByRole("menuitem", { name: "Table - waveform.csv" }));

    expect(storeState().activeWindowId).toBe("table-seed");
    expect(
      storeState().windows.find((window) => window.id === "table-seed")?.zIndex,
    ).toBeGreaterThan(beforeZ);
  });

  it("toggles utility windows from the Windows menu", async () => {
    const user = userEvent.setup();
    await renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Windows" }));
    await user.click(screen.getByRole("menuitem", { name: "Terminal" }));
    expect(storeState().windows.some((window) => window.kind === "terminal")).toBe(false);
    expect(screen.queryByText("Terminal")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Windows" }));
    expect(screen.getByRole("menuitem", { name: "Terminal" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Terminal" }));
    expect(storeState().windows.some((window) => window.kind === "terminal")).toBe(true);
    expect(getWindowTitle("Terminal")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Windows" }));
    await user.click(screen.getByRole("menuitem", { name: "Command History" }));
    expect(storeState().windows.some((window) => window.kind === "history")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Windows" }));
    await user.click(screen.getByRole("menuitem", { name: "Data Browser" }));
    expect(storeState().windows.some((window) => window.kind === "browser")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Windows" }));
    await user.click(screen.getByRole("menuitem", { name: "SciSpace Help" }));
    expect(storeState().windows.some((window) => window.kind === "help")).toBe(true);
    expect(getWindowTitle("SciSpace Help")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Windows" }));
    await user.click(screen.getByRole("menuitem", { name: "SciSpace Help" }));
    expect(storeState().windows.some((window) => window.kind === "help")).toBe(false);
  });

  it("updates current plot and closes closable windows from the Windows menu", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    await user.click(screen.getByRole("button", { name: "Windows" }));
    const menu = screen.getByRole("menu", { name: "Windows menu" });

    await user.click(within(menu).getByRole("menuitem", { name: "Plot - waveform.csv" }));
    expect(storeState().activeWindowId).toBe("plot-seed");
    expect(storeState().currentPlotId).toBe("seed-plot");

    expect(
      within(menu).queryByRole("button", { name: "Close window Data Browser" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Windows" }));
    const reopenedMenu = screen.getByRole("menu", { name: "Windows menu" });
    await user.click(
      within(reopenedMenu).getByRole("button", { name: "Close window Plot - waveform.csv" }),
    );

    await waitFor(() => expect(screen.queryByText("Plot - waveform.csv")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Windows" }));
    expect(
      within(screen.getByRole("menu", { name: "Windows menu" })).queryByRole("menuitem", {
        name: "Plot - waveform.csv",
      }),
    ).not.toBeInTheDocument();
  });
});
