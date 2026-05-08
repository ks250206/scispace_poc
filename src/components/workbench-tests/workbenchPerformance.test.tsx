import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTableWindow } from "../DataTableWindow";
import { ImportSettingsWindow } from "../ImportSettingsWindow";
import { setupWorkbenchSuite, storeState } from "./workbenchTestUtils";

const largeCsv = (rowCount: number): string =>
  [
    "time,signal,background",
    ...Array.from(
      { length: rowCount },
      (_, index) => `${index},${Math.sin(index / 10).toFixed(4)},${(7 - index / 1000).toFixed(4)}`,
    ),
  ].join("\n");

describe("Workbench performance regressions", () => {
  setupWorkbenchSuite();

  it("keeps large import raw and parsed previews virtualized", async () => {
    let importId = "";
    act(() => {
      importId = storeState().openImportDialog("large.csv", largeCsv(600));
    });
    render(<ImportSettingsWindow importId={importId} />);

    await waitFor(() => expect(screen.getByText("601 lines")).toBeInTheDocument());
    expect(screen.getByText("500 rows")).toBeInTheDocument();
    expect(document.querySelectorAll(".raw-text-table tbody tr").length).toBeLessThan(50);
    expect(document.querySelectorAll(".import-preview tbody tr").length).toBeLessThan(50);
  });

  it("keeps large dataset table body virtualized", async () => {
    await act(async () => {
      await storeState().importTextFile("large-table.csv", largeCsv(800));
    });
    const dataset = storeState().datasets.find((item) => item.name === "large-table.csv");
    expect(dataset).toBeDefined();

    render(<DataTableWindow datasetId={dataset?.id ?? ""} windowId="large-table-window" />);

    await waitFor(() => expect(screen.getByText("800 rows · virtualized")).toBeInTheDocument());
    expect(document.querySelectorAll(".table-scroll tbody tr").length).toBeLessThan(40);
  });
});
