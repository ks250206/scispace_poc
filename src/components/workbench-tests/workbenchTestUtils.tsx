import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import App from "../../App";
import { useScispaceStore } from "../../store/scispaceStore";

export { useScispaceStore } from "../../store/scispaceStore";

export const storeState = () => useScispaceStore.getState();

export const renderWorkbench = async () => {
  render(<App />);
  await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
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
