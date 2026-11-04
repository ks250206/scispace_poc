import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vite-plus/test";
import App from "../../App";
import { useScispaceStore } from "../../store/scispaceStore";

export { useScispaceStore } from "../../store/scispaceStore";

export const storeState = () => useScispaceStore.getState();

export const renderWorkbench = async () => {
  render(<App />);
  await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
  await waitFor(() =>
    expect(screen.getByText((text) => text.includes("160 rows · virtualized"))).toBeInTheDocument(),
  );
};

export const initializeStore = async () => {
  await act(async () => {
    await storeState().initialize();
  });
};

export const tableBodyCells = () => document.querySelectorAll(".table-scroll tbody td");

export const waitForTableBodyCells = async (minimumCellCount: number) => {
  await waitFor(() => expect(tableBodyCells().length).toBeGreaterThan(minimumCellCount));
  return tableBodyCells();
};

export const clickToolbarItem = async (
  user: { click: (target: Element) => Promise<void> },
  menuName: string,
  itemName: string,
) => {
  await user.click(screen.getByRole("button", { name: menuName }));
  await user.click(screen.getByRole("menuitem", { name: itemName }));
};

export const setupWorkbenchSuite = () => {
  beforeEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await storeState().createNewProject();
  });

  afterEach(() => {
    cleanup();
  });
};
