import { screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { renderWorkbench, setupWorkbenchSuite } from "./workbenchTestUtils";

describe("Workbench table UI", () => {
  setupWorkbenchSuite();

  it("renders the seed table window", async () => {
    await renderWorkbench();
    expect(screen.getByText("160 rows · virtualized · rows auto")).toBeInTheDocument();
  });
});
