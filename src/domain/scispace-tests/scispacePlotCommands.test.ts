import { describe, expect, it } from "vite-plus/test";
import { dataset, executeScispaceCommand, runCommand } from "./scispaceCommandTestUtils";

describe("scispace plot commands", () => {
  it("creates plot specs from column options", () => {
    const result = runCommand("plot waveform.csv x=time y=signal");
    expect(result.kind).toBe("plot-created");
    if (result.kind === "plot-created") {
      expect(result.spec).toMatchObject({
        source: "seed-waveform",
        x: "time",
        y: "signal",
        type: "line",
        plotType: "line",
        series: [
          {
            y: "signal",
            label: "signal",
            color: "#2563eb",
            lineWidth: 2,
            markerSize: 6,
            markerShape: "circle",
            drawOrder: 0,
          },
        ],
        zoomMode: "xy",
        grid: { x: true, y: true },
        border: true,
        size: { width: 640, height: 360 },
        font: { family: "Inter, system-ui, sans-serif", size: 12 },
        padding: { top: 12, right: 12, bottom: 12, left: 12 },
      });
    }
  });

  it("creates multi-series plot specs from comma-separated y columns", () => {
    const result = runCommand("plot waveform.csv x=time y=signal,background");

    expect(result.kind).toBe("plot-created");
    if (result.kind === "plot-created") {
      expect(result.spec.series).toEqual([
        {
          y: "signal",
          label: "signal",
          color: "#2563eb",
          lineWidth: 2,
          markerSize: 6,
          markerShape: "circle",
          drawOrder: 0,
        },
        {
          y: "background",
          label: "background",
          color: "#dc2626",
          lineWidth: 2,
          markerSize: 6,
          markerShape: "circle",
          drawOrder: 1,
        },
      ]);
      expect(result.spec.title).toBe("waveform.csv: signal, background vs time");
    }
  });

  it("updates rich plot settings through plot commands", () => {
    const created = runCommand("plot waveform.csv x=time y=signal type=line-marker");
    expect(created.kind).toBe("plot-created");
    if (created.kind !== "plot-created") return;

    const plotSpecs = [{ ...created.spec, id: "plot-1" }];
    const set = runCommand(
      'plot-set plot-1 title="Edited Plot" type=marker border=false zoom=x width=800 height=480 fontFamily=Arial fontSize=14 padding=8:16:24:32',
      { plotSpecs },
    );
    expect(set).toMatchObject({
      kind: "plot-updated",
      spec: {
        title: "Edited Plot",
        plotType: "marker",
        border: false,
        zoomMode: "x",
        size: { width: 800, height: 480 },
        font: { family: "Arial", size: 14 },
        padding: { top: 8, right: 16, bottom: 24, left: 32 },
      },
    });

    const axis = runCommand(
      'plot-axis plot-1 axis=y label="Signal axis" range=0.1:10 tick=2 tickDir=in scale=linear labelFontFamily=Helvetica labelFontSize=16 valueFontFamily=Menlo valueFontSize=11 size=56 gap=8 labelGap=12 labelSize=28 color=#111827 gridColor=#d1d5db tickColor=#6b7280 tickLength=10 minorTick=true mirrorTick=true mirrorAxis=true',
      { plotSpecs },
    );
    expect(axis).toMatchObject({
      kind: "plot-axis-updated",
      spec: {
        axes: {
          y: {
            label: "Signal axis",
            mirror: true,
            range: { mode: "manual", min: 0.1, max: 10 },
            ticks: {
              mode: "manual",
              interval: 2,
              orientation: "in",
              length: 10,
              minor: true,
              mirror: true,
            },
            scale: "linear",
            labelStyle: { family: "Helvetica", size: 16 },
            valueStyle: { family: "Menlo", size: 11 },
            size: 56,
            gap: 8,
            labelGap: 12,
            labelSize: 28,
            color: "#111827",
            gridColor: "#d1d5db",
            tickColor: "#6b7280",
          },
        },
      },
    });

    const grid = runCommand("plot-grid plot-1 x=false y=true", { plotSpecs });
    expect(grid).toMatchObject({ kind: "plot-updated", spec: { grid: { x: false, y: true } } });

    const series = runCommand(
      "plot-series plot-1 y=signal label=Signal color=#dc2626 lineWidth=3 markerSize=8 markerShape=diamond order=4",
      { plotSpecs },
    );
    expect(series).toMatchObject({
      kind: "plot-series-updated",
      spec: {
        series: [
          {
            y: "signal",
            label: "Signal",
            color: "#dc2626",
            lineWidth: 3,
            markerSize: 8,
            markerShape: "diamond",
            drawOrder: 4,
          },
        ],
      },
    });
  });

  it("updates text-arrow plot annotations through scispace commands", () => {
    const created = runCommand("plot waveform.csv x=time y=signal");
    expect(created.kind).toBe("plot-created");
    if (created.kind !== "plot-created") return;

    const plotSpecs = [{ ...created.spec, id: "plot-1" }];
    const added = runCommand(
      'plot-annotation plot-1 action=add type=text-arrow text="Peak A" x=1.5 y=0.5 dx=24 dy=-32 color=#111827 fontFamily=Arial fontSize=13',
      { plotSpecs },
    );
    expect(added.kind).toBe("plot-annotation-updated");
    if (added.kind !== "plot-annotation-updated") return;
    expect(added.spec.annotations).toHaveLength(1);
    expect(added.spec.annotations[0]).toMatchObject({
      type: "text-arrow",
      text: "Peak A",
      x: 1.5,
      y: 0.5,
      dx: 24,
      dy: -32,
      color: "#111827",
      font: { family: "Arial", size: 13 },
    });

    const annotationId = added.spec.annotations[0]?.id ?? "";
    const updated = runCommand(
      `plot-annotation plot-1 action=update id=${annotationId} text=PeakB dx=12`,
      { plotSpecs: [added.spec] },
    );
    expect(updated).toMatchObject({
      kind: "plot-annotation-updated",
      spec: { annotations: [{ id: annotationId, text: "PeakB", dx: 12 }] },
    });

    const removed = runCommand(`plot-annotation plot-1 action=remove id=${annotationId}`, {
      plotSpecs: [added.spec],
    });
    expect(removed).toMatchObject({
      kind: "plot-annotation-updated",
      spec: { annotations: [] },
    });
  });

  it("allows log scale only for positive axis data", () => {
    const positiveDataset = {
      ...dataset,
      id: "positive",
      name: "positive.csv",
      rows: [
        { time: 1, signal: 2 },
        { time: 2, signal: 4 },
      ],
    };
    const created = executeScispaceCommand("plot positive.csv x=time y=signal", {
      datasets: [positiveDataset],
    });
    expect(created.kind).toBe("plot-created");
    if (created.kind !== "plot-created") return;

    const result = executeScispaceCommand("plot-axis plot-positive axis=x scale=log", {
      datasets: [positiveDataset],
      plotSpecs: [{ ...created.spec, id: "plot-positive" }],
    });
    expect(result).toMatchObject({
      kind: "plot-axis-updated",
      spec: { axes: { x: { scale: "log" } } },
    });
  });

  it("prints the plot schema and current plot spec", () => {
    const schema = runCommand("plot-schema");
    expect(schema.kind).toBe("text");
    expect(schema.output).toContain('"plotType"');
    expect(schema.output).toContain('"size"');
    expect(schema.output).toContain('"annotations"');

    const created = runCommand("plot waveform.csv x=time y=signal width=700 height=420");
    expect(created.kind).toBe("plot-created");
    if (created.kind !== "plot-created") return;

    const current = runCommand("plot-schema plot-1", {
      plotSpecs: [{ ...created.spec, id: "plot-1" }],
    });
    expect(current.kind).toBe("text");
    expect(JSON.parse(current.output)).toMatchObject({
      id: "plot-1",
      size: { width: 700, height: 420 },
      plotType: "line",
    });
  });

  it("applies encoded plot schema json to an existing plot", () => {
    const created = runCommand("plot waveform.csv x=time y=signal width=700 height=420");
    expect(created.kind).toBe("plot-created");
    if (created.kind !== "plot-created") return;
    const plotSpecs = [{ ...created.spec, id: "plot-1" }];
    const schema = {
      ...plotSpecs[0],
      title: "Applied schema",
      x: "index",
      size: { width: 820, height: 460 },
      series: [{ ...plotSpecs[0].series[0], y: "background", label: "Background" }],
    };

    const result = runCommand(
      `plot-apply-schema plot-1 json=${encodeURIComponent(JSON.stringify(schema))}`,
      { plotSpecs },
    );

    expect(result).toMatchObject({
      kind: "plot-updated",
      spec: {
        id: "plot-1",
        title: "Applied schema",
        source: "seed-waveform",
        x: "index",
        size: { width: 820, height: 460 },
        series: [{ y: "background", label: "Background" }],
      },
    });
  });

  it("reports invalid rich plot updates", () => {
    const result = runCommand("plot waveform.csv x=time y=signal");
    expect(result.kind).toBe("plot-created");
    if (result.kind !== "plot-created") return;
    const plotSpecs = [{ ...result.spec, id: "plot-1" }];

    expect(runCommand("plot-set missing title=x", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot-set plot-1 type=bars", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot waveform.csv x=time y=signal type=bars", { plotSpecs }).kind).toBe(
      "error",
    );
    expect(runCommand("plot-set plot-1 zoom=z", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot-set plot-1 border=maybe", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot-set plot-1 width=20", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot waveform.csv x=time y=signal height=5000", { plotSpecs }).kind).toBe(
      "error",
    );
    expect(runCommand("plot-axis plot-1 axis=x range=10:0", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot-axis plot-1 axis=x tick=bad", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot-axis plot-1 axis=x tickDir=sideways", { plotSpecs }).kind).toBe(
      "error",
    );
    expect(runCommand("plot-axis plot-1 axis=x scale=log", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot-axis plot-1 axis=x tickLength=-1", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot-axis plot-1 axis=x mirrorTick=yes", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot-axis plot-1 axis=x mirrorAxis=yes", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot-grid plot-1 x=maybe", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot-grid plot-1 y=maybe", { plotSpecs })).toMatchObject({
      kind: "error",
      output: "Invalid grid y value: maybe",
    });
    expect(runCommand("plot-series plot-1 y=missing action=add", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot-series plot-1 y=signal markerShape=triangle", { plotSpecs }).kind).toBe(
      "plot-series-updated",
    );
    expect(runCommand("plot-series plot-1 y=signal lineWidth=wide", { plotSpecs }).kind).toBe(
      "error",
    );
    expect(runCommand("plot-series plot-1 y=signal order=bad", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot-annotation plot-1 action=add x=1 y=2", { plotSpecs }).kind).toBe(
      "error",
    );
    expect(runCommand("plot-apply-schema missing json=%7B%7D", { plotSpecs }).kind).toBe("error");
    expect(runCommand("plot-apply-schema plot-1 json=not-json", { plotSpecs }).kind).toBe("error");
    expect(
      runCommand(
        `plot-apply-schema plot-1 json=${encodeURIComponent(JSON.stringify({ x: "missing" }))}`,
        { plotSpecs },
      ).kind,
    ).toBe("error");
  });
});
