import { describe, expect, it } from "vitest";
import { createSeedDataset } from "../domain/csv";
import { executeScispaceCommand } from "../domain/scispace";
import {
  buildPlotOptions,
  plotPositionFromClient,
  plotRenderScale,
  plotSizeFromRenderedRect,
  scalePlotSpecForRender,
  sortedPlotSeries,
} from "./plotRendering";

describe("plot rendering options", () => {
  it("maps rich plot spec values to uPlot options", () => {
    const dataset = createSeedDataset();
    const created = executeScispaceCommand("plot waveform.csv x=time y=signal,background", {
      datasets: [dataset],
    });
    expect(created.kind).toBe("plot-created");
    if (created.kind !== "plot-created") return;

    const spec = {
      ...created.spec,
      font: { family: "Arial", size: 14 },
      padding: { top: 8, right: 10, bottom: 12, left: 14 },
      axes: {
        x: {
          ...created.spec.axes.x,
          scale: "linear" as const,
          labelStyle: { family: "Helvetica", size: 16 },
          valueStyle: { family: "Menlo", size: 11 },
          size: 56,
          gap: 8,
          labelGap: 12,
          labelSize: 28,
          color: "#111827",
          gridColor: "#d1d5db",
          tickColor: "#6b7280",
          ticks: { ...created.spec.axes.x.ticks, length: 10, minor: true },
        },
        y: {
          ...created.spec.axes.y,
          scale: "log" as const,
        },
      },
      series: [
        {
          ...created.spec.series[0]!,
          label: "Signal",
          markerShape: "diamond" as const,
          drawOrder: 2,
        },
        {
          ...created.spec.series[1]!,
          label: "Background",
          markerShape: "triangle" as const,
          drawOrder: 1,
        },
      ],
      annotations: [
        {
          id: "annotation-1",
          type: "text-arrow" as const,
          text: "Peak",
          x: 1,
          y: 2,
          dx: 24,
          dy: -24,
          color: "#111827",
          font: { family: "Arial", size: 13 },
        },
      ],
    };

    const options = buildPlotOptions(spec);

    expect(options.padding).toEqual([8, 10, 12, 14]);
    expect(options.scales?.y).toMatchObject({ distr: 3, log: 10 });
    expect(options.axes?.[0]).toMatchObject({
      size: 56,
      gap: 8,
      labelGap: 12,
      labelSize: 28,
      font: "11px Menlo",
      labelFont: "16px Helvetica",
      stroke: "#111827",
      grid: { stroke: "#d1d5db" },
      ticks: { size: 10, stroke: "#6b7280" },
    });
    expect(options.series?.map((series) => series.label)).toEqual(["time", "Background", "Signal"]);
    expect(options.plugins).toHaveLength(2);
  });

  it("sorts trace drawing order deterministically", () => {
    const dataset = createSeedDataset();
    const created = executeScispaceCommand("plot waveform.csv x=time y=signal,background", {
      datasets: [dataset],
    });
    expect(created.kind).toBe("plot-created");
    if (created.kind !== "plot-created") return;

    const series = sortedPlotSeries([
      { ...created.spec.series[0]!, drawOrder: 10 },
      { ...created.spec.series[1]!, drawOrder: 0 },
    ]);

    expect(series.map((item) => item.y)).toEqual(["background", "signal"]);
  });

  it("scales plot render specs for sharp workspace zoom rendering", () => {
    const dataset = createSeedDataset();
    const created = executeScispaceCommand("plot waveform.csv x=time y=signal", {
      datasets: [dataset],
    });
    expect(created.kind).toBe("plot-created");
    if (created.kind !== "plot-created") return;

    const scaled = scalePlotSpecForRender(created.spec, plotRenderScale(2));

    expect(scaled.size).toEqual({ width: created.spec.size.width * 2, height: 720 });
    expect(scaled.padding.left).toBe(created.spec.padding.left * 2);
    expect(scaled.axes.x.size).toBe(created.spec.axes.x.size * 2);
    expect(scaled.axes.x.valueStyle.size).toBe(created.spec.axes.x.valueStyle.size * 2);
    expect(scaled.series[0]?.lineWidth).toBe(created.spec.series[0]!.lineWidth * 2);
    expect(plotRenderScale(10)).toBe(4);
  });

  it("normalizes plot pointer coordinates between workspace and render scales", () => {
    const rect = { left: 100, top: 40, width: 640, height: 360 } as DOMRect;

    expect(plotPositionFromClient({ x: 300, y: 140 }, rect, 2, 2)).toEqual({ left: 200, top: 100 });
    expect(plotPositionFromClient({ x: 300, y: 140 }, rect, 0.5, 1)).toEqual({
      left: 400,
      top: 200,
    });
    expect(plotSizeFromRenderedRect(rect, 0.5, 1)).toEqual({ width: 1280, height: 720 });
  });
});
