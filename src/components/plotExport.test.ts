import { describe, expect, it } from "vite-plus/test";
import { plotSchemaJson, safePlotFileName, svgDataUrl } from "./plotExport";
import { seedPlot } from "../store/scispace/workspaceDefaults";

describe("plot export helpers", () => {
  it("serializes plot schema using the command schema shape", () => {
    const schema = JSON.parse(plotSchemaJson(seedPlot()));

    expect(schema).toMatchObject({
      id: "seed-plot",
      size: { width: 640, height: 360 },
      series: [{ y: "signal" }],
    });
  });

  it("sanitizes plot download file names", () => {
    expect(safePlotFileName("signal / time", "svg")).toBe("signal_time.svg");
    expect(safePlotFileName("", "png")).toBe("plot.png");
    expect(svgDataUrl("<svg/>")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
  });
});
