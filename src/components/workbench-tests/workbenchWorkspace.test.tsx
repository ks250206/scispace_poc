import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWorkbench, setupWorkbenchSuite } from "./workbenchTestUtils";
import { getWindowTitle } from "./workbenchTestDom";

describe("Workbench workspace UI", () => {
  setupWorkbenchSuite();

  it("renders a filesystem browser, table window, plot window, and draggable terminal window", async () => {
    await renderWorkbench();
    expect(screen.getByText("~/raw")).toBeInTheDocument();
    expect(getWindowTitle("Table - waveform.csv")).toBeDefined();
    expect(screen.getByText((text) => text.includes("160 rows · virtualized"))).toBeInTheDocument();
    expect(getWindowTitle("Plot - waveform.csv")).toBeDefined();
    expect(getWindowTitle("Terminal")).toBeDefined();
    expect(getWindowTitle("Command History")).toBeDefined();
    expect(screen.getByText("No scispace commands yet.")).toBeInTheDocument();
  });
});
