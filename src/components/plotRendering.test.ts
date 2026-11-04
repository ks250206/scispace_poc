import type uPlot from "uplot";
import { describe, expect, it, vi } from "vite-plus/test";
import { createSeedDataset } from "../domain/csv";
import { executeScispaceCommand } from "../domain/scispace";
import {
  buildPlotOptions,
  buildSortedAlignedPlotData,
  createScaledPlotMouseEvent,
  inferPlotDragZoomMode,
  normalizePlotClientPoint,
  plotRenderScale,
  plotScaleRange,
  plotSelectionRectForZoomMode,
  plotSizeFromRenderedRect,
  scalePlotSpecForRender,
  scaledPlotClientPoint,
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

  it.each([
    { min: 0, max: 10, interval: 2, expected: [1, 3, 5, 7, 9] },
    { min: 0, max: 20, interval: 0.01, expected: [] },
  ])("bounds minor ticks for range $min–$max and interval $interval", (testCase) => {
    const { min, max, interval, expected } = testCase;
    const created = executeScispaceCommand("plot waveform.csv x=time y=signal", {
      datasets: [createSeedDataset()],
    });
    if (created.kind !== "plot-created") throw new Error(created.output);
    const { spec } = created;
    const { ticks } = spec.axes.x;
    spec.axes.x.ticks = { ...ticks, mode: "manual", interval, minor: true };
    const draw = buildPlotOptions(spec).plugins?.[0]?.hooks?.draw;
    if (typeof draw !== "function") throw new Error("Minor tick draw hook is missing");

    const valToPos = vi.fn((value: number) => value);
    const plot = {
      ctx: document.createElement("canvas").getContext("2d"),
      scales: { x: { min, max } },
      bbox: { top: 0, height: 100 },
      valToPos,
    } as unknown as uPlot;
    draw(plot);
    expect(valToPos.mock.calls.map(([value]) => value)).toEqual(expected);
  });

  it("sorts finite plot data by x before passing it to uPlot", () => {
    const dataset = createSeedDataset();
    const created = executeScispaceCommand("plot waveform.csv x=time y=signal", {
      datasets: [dataset],
    });
    expect(created.kind).toBe("plot-created");
    if (created.kind !== "plot-created") return;

    const unsortedDataset = {
      ...dataset,
      rows: [
        { time: 3, signal: 30 },
        { time: 1, signal: 10 },
        { time: "not-number", signal: 99 },
        { time: 2, signal: 20 },
      ],
    };

    expect(buildSortedAlignedPlotData(unsortedDataset, created.spec)).toEqual([
      [1, 2, 3],
      [10, 20, 30],
    ]);
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
    expect(plotRenderScale(0.31)).toBe(1);
    expect(plotRenderScale(10)).toBe(4);
  });

  it("normalizes plot pointer coordinates between workspace and render scales", () => {
    const rect = { left: 100, top: 40, width: 640, height: 360 } as DOMRect;

    expect(normalizePlotClientPoint({ x: 300, y: 140 }, rect, 2, 2)).toEqual({
      left: 200,
      top: 100,
    });
    expect(normalizePlotClientPoint({ x: 300, y: 140 }, rect, 1, 1)).toEqual({
      left: 200,
      top: 100,
    });
    expect(normalizePlotClientPoint({ x: 300, y: 140 }, rect, 0.5, 1)).toEqual({
      left: 400,
      top: 200,
    });
    expect(plotSizeFromRenderedRect(rect, 0.5, 1)).toEqual({ width: 1280, height: 720 });
  });

  it("creates scaled cursor events for uPlot internal cursor handling", () => {
    const target = document.createElement("div");
    target.getBoundingClientRect = () =>
      ({ left: 100, top: 40, width: 320, height: 180 }) as DOMRect;
    const event = new MouseEvent("mousemove", {
      clientX: 260,
      clientY: 130,
      bubbles: true,
      cancelable: true,
    });

    expect(
      scaledPlotClientPoint({ x: 260, y: 130 }, target.getBoundingClientRect(), 0.5, 1),
    ).toEqual({ x: 420, y: 220 });
    const scaled = createScaledPlotMouseEvent(event, target, 0.5, 1);

    expect(scaled.clientX).toBe(420);
    expect(scaled.clientY).toBe(220);
    expect(scaled.type).toBe("mousemove");
  });

  it("infers drag zoom mode from selection dimensions", () => {
    expect(inferPlotDragZoomMode(7, 7)).toBeUndefined();
    expect(inferPlotDragZoomMode(120, 4)).toBe("x");
    expect(inferPlotDragZoomMode(120, 40)).toBe("x");
    expect(inferPlotDragZoomMode(5, 100)).toBe("y");
    expect(inferPlotDragZoomMode(40, 120)).toBe("y");
    expect(inferPlotDragZoomMode(80, 80)).toBe("xy");
  });

  it("extends visual selection rectangles for axis-only drag zoom modes", () => {
    const plotSize = { width: 640, height: 360 };

    expect(
      plotSelectionRectForZoomMode({ left: 20, top: 100 }, { left: 180, top: 104 }, plotSize),
    ).toEqual({ left: 20, top: 0, width: 160, height: 360 });
    expect(
      plotSelectionRectForZoomMode({ left: 120, top: 40 }, { left: 124, top: 180 }, plotSize),
    ).toEqual({ left: 0, top: 40, width: 640, height: 140 });
    expect(
      plotSelectionRectForZoomMode({ left: 120, top: 40 }, { left: 220, top: 140 }, plotSize),
    ).toEqual({ left: 120, top: 40, width: 100, height: 100 });
  });

  it("keeps only valid finite plot scale ranges", () => {
    expect(plotScaleRange({ min: 0, max: 10 })).toEqual({ min: 0, max: 10 });
    expect(plotScaleRange({ min: 10, max: 0 })).toBeUndefined();
    expect(plotScaleRange({ min: undefined, max: 10 })).toBeUndefined();
    expect(plotScaleRange(undefined)).toBeUndefined();
  });
});
