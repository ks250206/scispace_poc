import { describe, expect, it } from "vite-plus/test";
import { buildPlotSvg, plotSchemaJson, safePlotFileName, svgDataUrl } from "./plotExport";
import { createSeedDataset } from "../domain/csv";
import { buildSortedAlignedPlotData } from "./plotRendering";
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
    const spec = seedPlot();
    const svg = buildPlotSvg(spec, buildSortedAlignedPlotData(createSeedDataset(), spec), {
      left: 60,
      top: 30,
      width: 560,
      height: 280,
      ticks: { x: [{ value: 10, label: "10" }], y: [{ value: 5, label: "5" }] },
      position: (value, axis) => (axis === "x" ? 60 + value * 20 : 250 - value * 10),
    });

    expect(svg).toContain("<svg");
    expect(svg).toContain('width="640"');
    expect(svg).toContain("waveform.csv: signal vs time");
    expect(svg).toContain('data-series="signal"');
    expect(svg).toContain("<polyline");
    const svgDoc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(svgDoc.querySelector('[data-axis-ticks="x"] text')?.textContent).toBe("10");
    expect(svgDoc.querySelector('[data-axis-ticks="y"] text')?.textContent).toBe("5");
    expect(svgDataUrl(svg)).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it("sanitizes plot download file names", () => {
    expect(safePlotFileName("signal / time", "svg")).toBe("signal_time.svg");
    expect(safePlotFileName("", "png")).toBe("plot.png");
  });
});
