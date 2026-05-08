import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImportSettingsWindow } from "../ImportSettingsWindow";
import {
  renderWorkbench,
  setupWorkbenchSuite,
  storeState,
  useScispaceStore,
} from "./workbenchTestUtils";

describe("Workbench import UI", () => {
  setupWorkbenchSuite();

  it("opens an import settings window with a virtualized preview after file drop", async () => {
    await renderWorkbench();
    const shell = document.querySelector(".canvas-shell");
    const file = new File(["x,y\n1,2\n3,4"], "dropped.csv", { type: "text/csv" });
    fireEvent.drop(shell as Element, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(screen.getByText("Import - dropped.csv")).toBeInTheDocument());
    await waitFor(() => expect(storeState().pendingImports[0]?.preview?.rows).toHaveLength(2));
  });

  it("stacks raw text and import preview virtual tables with resizable columns", async () => {
    let importId = "";
    act(() => {
      importId = storeState().openImportDialog("imported.csv", "x,y\n1,2\n3,4\n5,6");
    });
    render(<ImportSettingsWindow importId={importId} />);

    const preview = await waitFor(() => {
      const element = document.querySelector(".import-preview") as HTMLElement | null;
      expect(element).toBeInTheDocument();
      return element as HTMLElement;
    });
    const editorGrid = preview.closest(".import-editor-grid") as HTMLElement;
    const previewXHeader = preview.querySelectorAll("th")[0] as HTMLElement;
    expect(editorGrid).toHaveClass("stacked");
    expect(preview.style.getPropertyValue("--table-width")).toBe("280px");
    expect(previewXHeader).toHaveStyle({ width: "140px", minWidth: "96px" });
    expect(screen.queryByRole("textbox", { name: "Raw text" })).not.toBeInTheDocument();

    expect(preview.querySelector('[aria-label="Resize import column x"]')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Raw line 2"), { target: { value: "10,20" } });
    await waitFor(() => expect(storeState().pendingImports[0]?.text).toBe("x,y\n10,20\n3,4\n5,6"));
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: `import-line ${importId} line=2 value=${encodeURIComponent("10,20")}`,
      source: "gui",
      status: "success",
    });
  });

  it("can mark import columns for deletion and grays skipped raw rows", async () => {
    let importId = "";
    act(() => {
      importId = useScispaceStore
        .getState()
        .openImportDialog("drop-cols.csv", "x,empty,y\n1,,2\n3,,4");
    });
    render(<ImportSettingsWindow importId={importId} />);

    await waitFor(() => expect(screen.getByText("drop-cols.csv")).toBeInTheDocument());
    expect(document.querySelector(".column-import-list label.excluded span")?.textContent).toBe(
      "empty",
    );

    const yColumnToggle = Array.from(document.querySelectorAll(".column-import-list label"))
      .find((label) => label.querySelector("span")?.textContent === "y")
      ?.querySelector("input");
    fireEvent.click(yColumnToggle as Element);

    await waitFor(() =>
      expect(storeState().pendingImports[0]?.options.excludedColumnIds).toEqual(["empty", "y"]),
    );

    fireEvent.change(screen.getByDisplayValue("0"), { target: { value: "1" } });
    await waitFor(() =>
      expect(document.querySelector(".raw-text-table tbody tr")).toHaveClass("skipped-row"),
    );
    expect(
      useScispaceStore
        .getState()
        .commandHistory.slice(-2)
        .map((entry) => entry.source),
    ).toEqual(["gui", "gui"]);
  });

  it("shows detected import presets and highlights data start lines", async () => {
    let importId = "";
    act(() => {
      importId = useScispaceStore
        .getState()
        .openImportDialog(
          "sample.ras",
          [
            '*MEAS_SCAN_UNIT_X "deg"',
            '*MEAS_SCAN_UNIT_Y "counts"',
            "*RAS_HEADER_END",
            "*RAS_INT_START",
            "10.0000 3.9658 1.0000",
            "*RAS_INT_END",
          ].join("\n"),
        );
    });
    render(<ImportSettingsWindow importId={importId} />);

    await waitFor(() => expect(screen.getByText("Detected: Rigaku RAS")).toBeInTheDocument());
    expect(screen.getByText("Data starts at line 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Raw line 5")).toHaveValue("10.0000 3.9658 1.0000");
    expect(document.querySelector(".raw-text-table tbody tr.data-start-row")).toBeInTheDocument();
  });

  it("uses the whole import body for raw text mode", async () => {
    let importId = "";
    await act(async () => {
      importId = useScispaceStore
        .getState()
        .openImportDialog("notes.mpt", "EC-Lab ASCII FILE\nNb header lines : 70\n\nmetadata");
      await useScispaceStore
        .getState()
        .runScispace(`import-set ${importId} mode=raw`, { source: "gui" });
    });
    render(<ImportSettingsWindow importId={importId} />);

    await waitFor(() => expect(screen.getByText("notes.mpt")).toBeInTheDocument());
    expect(screen.getByText("4 raw lines")).toBeInTheDocument();
    expect(document.querySelector(".import-editor-grid")).toHaveClass("raw-only");
    expect(document.querySelector(".raw-text-table")).toBeInTheDocument();
    expect(document.querySelector(".import-preview")).not.toBeInTheDocument();
  });

  it("cancels import windows through scispace commands", async () => {
    let importId = "";
    act(() => {
      importId = storeState().openImportDialog("cancel-ui.csv", "x,y\n1,2");
    });
    render(<ImportSettingsWindow importId={importId} />);

    await waitFor(() => expect(screen.getByText("cancel-ui.csv")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(storeState().pendingImports.some((item) => item.id === importId)).toBe(false),
    );
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: `import-cancel ${importId}`,
      source: "gui",
      status: "success",
    });
  });
});
