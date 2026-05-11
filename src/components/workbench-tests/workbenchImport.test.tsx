import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ImportSettingsWindow } from "../ImportSettingsWindow";
import {
  clickToolbarItem,
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

    await waitFor(() =>
      expect(screen.getAllByText("Import - dropped.csv").length).toBeGreaterThan(0),
    );
    await waitFor(() => expect(storeState().pendingImports[0]?.preview?.rows).toHaveLength(2));
    await waitFor(() =>
      expect(storeState().commandHistory.at(-1)).toMatchObject({
        command: `upload-open ${storeState().pendingImports[0]?.id} name=dropped.csv ref=${storeState().pendingImports[0]?.id} mode=tabular`,
        source: "gui",
        status: "success",
      }),
    );
    expect(storeState().commandHistory.at(-1)?.command).not.toContain("x%2Cy");
  });

  it("shows tabbed raw text, column editing, and import preview virtual tables", async () => {
    let importId = "";
    act(() => {
      importId = storeState().openImportDialog("imported.csv", "x,y\n1,2\n3,4\n5,6");
    });
    render(<ImportSettingsWindow importId={importId} />);

    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Raw text" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Columns" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Metadata" })).toBeInTheDocument();
    const preview = await waitFor(() => {
      const element = document.querySelector(".import-preview") as HTMLElement | null;
      expect(element).toBeInTheDocument();
      return element as HTMLElement;
    });
    const previewXHeader = preview.querySelectorAll("th")[0] as HTMLElement;
    expect(preview.style.getPropertyValue("--table-width")).toBe("280px");
    expect(previewXHeader).toHaveStyle({ width: "140px", minWidth: "96px" });
    expect(screen.queryByRole("textbox", { name: "Raw text" })).not.toBeInTheDocument();
    expect(preview.querySelector('[aria-label="Resize import column x"]')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Raw text" }));
    expect(screen.getByText("4 lines")).toBeInTheDocument();
    expect(document.querySelector(".raw-text-table")).toBeInTheDocument();
    expect(document.querySelector(".import-preview")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Raw line 2"), { target: { value: "10,20" } });
    await waitFor(() => expect(storeState().pendingImports[0]?.text).toBe("x,y\n10,20\n3,4\n5,6"));
    expect(storeState().commandHistory.at(-1)).toMatchObject({
      command: `import-line ${importId} line=2 value=${encodeURIComponent("10,20")}`,
      source: "gui",
      status: "success",
    });

    fireEvent.click(screen.getByRole("tab", { name: "Columns" }));
    expect(screen.getByDisplayValue("x")).toBeInTheDocument();
    expect(screen.getAllByText("number").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Column name x"), { target: { value: "time" } });
    await waitFor(() =>
      expect(storeState().pendingImports[0]?.preview?.columns[0]).toMatchObject({
        name: "time",
        dataType: "number",
      }),
    );
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
    fireEvent.click(screen.getByRole("tab", { name: "Columns" }));
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

    fireEvent.click(screen.getByRole("tab", { name: "Raw text" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "Metadata" }));
    expect(screen.getAllByText("MEAS_SCAN_UNIT_X").length).toBeGreaterThan(0);
    expect(screen.getAllByText("deg").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Raw text" }));
    expect(screen.getByLabelText("Raw line 5")).toHaveValue("10.0000 3.9658 1.0000");
    expect(document.querySelector(".raw-text-table tbody tr.data-start-row")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Delimiter"), { target: { value: "comma" } });
    await waitFor(() => expect(screen.getByText("Manual override")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Reapply Rigaku RAS preset" }));
    await waitFor(() =>
      expect(storeState().pendingImports[0]).toMatchObject({
        presetOverridden: false,
        options: { delimiter: "space", skipRows: 4 },
      }),
    );
    expect(screen.queryByText("Manual override")).not.toBeInTheDocument();
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
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Raw text" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.getByText("4 raw lines")).toBeInTheDocument();
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

  it("undoes and redoes confirmed imports from the topbar", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    let importId = "";
    act(() => {
      importId = storeState().openImportDialog("undo-import.csv", "x,y\n1,2");
    });

    await waitFor(() =>
      expect(screen.getAllByText("Import - undo-import.csv").length).toBeGreaterThan(0),
    );
    await act(async () => {
      await storeState().confirmImport(importId);
    });
    await waitFor(() =>
      expect(storeState().files.some((file) => file.path === "~/raw/undo-import.csv")).toBe(true),
    );
    expect(storeState().commandHistory.at(-1)?.command).toContain(`import-confirm ${importId}`);

    await clickToolbarItem(user, "Edit", "Undo");
    await waitFor(() =>
      expect(storeState().files.some((file) => file.path === "~/raw/undo-import.csv")).toBe(false),
    );
    expect(storeState().redoStack).toHaveLength(1);

    await clickToolbarItem(user, "Edit", "Redo");
    await waitFor(() =>
      expect(storeState().files.some((file) => file.path === "~/raw/undo-import.csv")).toBe(true),
    );
    expect(storeState().undoStack).toHaveLength(1);
  });
});
