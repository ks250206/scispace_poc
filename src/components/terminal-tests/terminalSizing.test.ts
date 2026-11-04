import { describe, expect, it } from "vite-plus/test";
import { applyTerminalLogicalMetrics, calculateTerminalGrid } from "../TerminalPanel";

describe("terminal sizing", () => {
  it("keeps terminal grid sizing stable under workspace scale", () => {
    const base = {
      viewportWidth: 800,
      viewportHeight: 400,
      charWidth: 8,
      rowHeight: 16,
      horizontalPadding: 24,
      verticalPadding: 16,
      workspaceScale: 1,
    };

    expect(calculateTerminalGrid(base)).toEqual({ cols: 97, rows: 24 });
    expect(
      calculateTerminalGrid({
        ...base,
        viewportWidth: 1600,
        viewportHeight: 800,
        charWidth: 16,
        rowHeight: 32,
        workspaceScale: 2,
      }),
    ).toEqual({ cols: 97, rows: 24 });
    expect(
      calculateTerminalGrid({
        ...base,
        viewportWidth: 400,
        viewportHeight: 200,
        charWidth: 4,
        rowHeight: 8,
        workspaceScale: 0.5,
      }),
    ).toEqual({ cols: 97, rows: 24 });
  });

  it("keeps wterm logical row height independent from workspace scale measurements", () => {
    const element = document.createElement("div");
    const terminal = { element, _rowHeight: 9 } as unknown as Parameters<
      typeof applyTerminalLogicalMetrics
    >[0];

    applyTerminalLogicalMetrics(terminal);

    expect(element.style.getPropertyValue("--term-row-height")).toBe("17px");
    expect(terminal).toMatchObject({ _rowHeight: 17 });
  });
});
