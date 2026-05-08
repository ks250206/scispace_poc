import { describe, expect, it } from "vitest";
import { buildPlotSvg, plotSchemaJson, safePlotFileName, svgDataUrl } from "./plotExport";
import { createSeedDataset } from "../domain/csv";
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

  it("builds a self-contained svg for the current plot data", () => {
    const svg = buildPlotSvg(seedPlot(), createSeedDataset());

    expect(svg).toContain("<svg");
    expect(svg).toContain('width="640"');
    expect(svg).toContain("waveform.csv: signal vs time");
    expect(svg).toContain('data-series="signal"');
    expect(svg).toContain("<polyline");
    expect(svgDataUrl(svg)).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it("sanitizes plot download file names", () => {
    expect(safePlotFileName("signal / time", "svg")).toBe("signal_time.svg");
    expect(safePlotFileName("", "png")).toBe("plot.png");
  });
});
