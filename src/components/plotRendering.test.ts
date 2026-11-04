import { describe, expect, it } from "vite-plus/test";
import { createSeedDataset } from "../domain/csv";
import { seedPlot } from "../store/scispace/workspaceDefaults";
import { buildPlotData } from "./plot-rendering/data";
import { inferPlotDragZoomMode, plotSelectionRectForZoomMode } from "./plot-rendering/dragZoom";
import { plotGeometry, plotScales, plotTicks } from "./plot-rendering/scales";
import { plotTraces } from "./plot-rendering/traces";

describe("SVG plot rendering", () => {
  it("sorts finite x, preserves gaps, and retains the positive extent for logarithmic scales", () => {
    const dataset = {
      ...createSeedDataset(),
      rows: [
        { time: "4", signal: "8" },
        { time: "", signal: "100" },
        { time: "1", signal: "-2" },
        { time: "3", signal: "2" },
        { time: "2", signal: "" },
        { time: "5", signal: "3" },
      ],
    };
    const spec = seedPlot();
    const data = buildPlotData(dataset, spec.x, ["signal"]);
    expect(data.x).toEqual([1, 2, 3, 4, 5]);
    expect(data.columns.get("signal")).toEqual([-2, null, 2, 8, 3]);
    expect(data.extents.y).toEqual({ linear: [-2, 8], log: [2, 8] });
    const geometry = plotGeometry(spec);
    const traces = plotTraces(spec, data, plotScales(spec, data, geometry));
    expect(traces[0]?.path?.match(/M/g)).toHaveLength(2);
    expect(traces[0]?.path).not.toContain("NaN");

    spec.axes.y.scale = "log";
    const scales = plotScales(spec, data, geometry);
    expect(scales.y.domain()).toEqual([2, 8]);
    expect(plotTraces(spec, data, scales)[0]?.path?.match(/M/g)).toHaveLength(1);

    spec.axes.x.range = { mode: "manual", min: 2.5, max: 3.5 };
    expect(plotScales(spec, data, geometry).y.domain()).toEqual([1, 4]);
  });

  it("uses the manual ticks and minor intervals and retains an independent zoom domain", () => {
    const spec = seedPlot();
    spec.axes.x.range = { mode: "manual", min: 1, max: 10 };
    spec.axes.x.ticks = { ...spec.axes.x.ticks, mode: "manual", interval: 2, minor: true };
    spec.size = { width: 240, height: 120 };
    const geometry = plotGeometry(spec);
    const data = buildPlotData(createSeedDataset(), spec.x, ["signal"]);
    const scales = plotScales(spec, data, geometry, { y: [0.5, 2] });
    expect(geometry.height).toBeGreaterThan(0);
    expect(scales.y.domain()).toEqual([0.5, 2]);
    const ticks = plotTicks(spec.axes.x, scales.x, "x");
    expect(ticks.major.map(({ label }) => label)).toEqual(["2", "4", "6", "8", "10"]);
    expect(ticks.minor.map((position) => Math.round(scales.x.invert(position)))).toEqual([
      1, 3, 5, 7, 9,
    ]);
    spec.axes.x.ticks.interval = 1e-12;
    expect(plotTicks(spec.axes.x, scales.x, "x")).toEqual({ major: [], minor: [] });
  });

  it("infers drag direction and expands the selection on the untouched axis", () => {
    expect(inferPlotDragZoomMode(20, 0)).toBe("x");
    expect(inferPlotDragZoomMode(3, 20)).toBe("y");
    expect(inferPlotDragZoomMode(20, 25)).toBe("xy");
    expect(inferPlotDragZoomMode(3, 5)).toBeUndefined();
    expect(
      plotSelectionRectForZoomMode(
        { left: 30, top: 40 },
        { left: 60, top: 70 },
        { width: 110, height: 120 },
        "x",
      ),
    ).toEqual({ left: 30, top: 0, width: 30, height: 120 });
  });
});
