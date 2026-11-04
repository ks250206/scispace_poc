import { describe, expect, it } from "vite-plus/test";
import { createScispaceStore, makeStore } from "./scispaceStoreTestUtils";

describe("scispace store plot behavior", () => {
  it("updates and persists plot specs through layout", async () => {
    const { db, store } = await makeStore();

    await store
      .getState()
      .runScispace(
        'plot-set seed-plot title="Edited signal plot" x=index zoom=x width=820 height=440 fontFamily=Arial fontSize=14 padding=8:10:12:14',
      );
    await store
      .getState()
      .runScispace(
        "plot-axis seed-plot axis=y label=Signal color=#111827 gridColor=#d1d5db tickColor=#6b7280 tickLength=10 minorTick=true",
      );
    await store
      .getState()
      .runScispace(
        "plot-series seed-plot y=signal label=Signal color=#dc2626 markerShape=diamond order=2",
      );
    await store.getState().runScispace("plot-series seed-plot y=background action=add");
    await store
      .getState()
      .runScispace("plot-series seed-plot y=background label=Background color=#16a34a");
    await store
      .getState()
      .runScispace("plot-annotation seed-plot action=add type=text-arrow text=Peak x=1 y=0.5");

    expect(store.getState().plotSpecs[0]).toMatchObject({
      title: "Edited signal plot",
      titleEdited: true,
      x: "index",
      zoomMode: "x",
      size: { width: 820, height: 440 },
      font: { family: "Arial", size: 14 },
      padding: { top: 8, right: 10, bottom: 12, left: 14 },
      axes: {
        y: {
          label: "Signal",
          color: "#111827",
          gridColor: "#d1d5db",
          tickColor: "#6b7280",
          ticks: { length: 10, minor: true },
        },
      },
    });
    expect(store.getState().plotSpecs[0]?.series[0]).toMatchObject({
      markerShape: "diamond",
      drawOrder: 2,
    });
    expect(store.getState().plotSpecs[0]?.annotations[0]).toMatchObject({
      type: "text-arrow",
      text: "Peak",
      x: 1,
      y: 0.5,
    });
    expect(store.getState().windows.find((window) => window.id === "plot-seed")?.title).toBe(
      "Edited signal plot",
    );
    expect(store.getState().windows.find((window) => window.id === "plot-seed")).toMatchObject({
      width: 820,
      height: 534,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const restoredStore = createScispaceStore(db);
    await restoredStore.getState().initialize();

    expect(restoredStore.getState().plotSpecs[0]).toMatchObject({
      title: "Edited signal plot",
      x: "index",
      zoomMode: "x",
      size: { width: 820, height: 440 },
      font: { family: "Arial", size: 14 },
      padding: { top: 8, right: 10, bottom: 12, left: 14 },
      annotations: [{ type: "text-arrow", text: "Peak" }],
    });
    expect(restoredStore.getState().plotSpecs[0]?.series.map((series) => series.y)).toEqual([
      "signal",
      "background",
    ]);
  });

  it("closes table windows without deleting the source dataset", async () => {
    const { db, store } = await makeStore();

    store.getState().closeWindow("table-seed");

    expect(store.getState().windows.some((window) => window.id === "table-seed")).toBe(false);
    expect(store.getState().datasets.some((dataset) => dataset.id === "seed-waveform")).toBe(true);
    expect(await db.datasets.get("seed-waveform")).toMatchObject({ name: "waveform.csv" });
    expect(
      (await db.layout.get("main"))?.value.windows.some((window) => window.id === "table-seed"),
    ).toBe(false);
  });

  it("removes unreferenced plot specs when closing plot windows", async () => {
    const { store } = await makeStore();

    store.getState().closeWindow("plot-seed");

    expect(store.getState().windows.some((window) => window.id === "plot-seed")).toBe(false);
    expect(store.getState().plotSpecs.some((plot) => plot.id === "seed-plot")).toBe(false);
    expect(store.getState().datasets.some((dataset) => dataset.id === "seed-waveform")).toBe(true);
  });

  it("opens a singleton plot config window for the current plot", async () => {
    const { db, store } = await makeStore();

    store.getState().openPlotConfig("seed-plot");
    store.getState().openPlotConfig("seed-plot");

    expect(store.getState().currentPlotId).toBe("seed-plot");
    expect(store.getState().windows.filter((window) => window.kind === "plot-config")).toHaveLength(
      1,
    );
    expect((await db.layout.get("main"))?.value.windows).toContainEqual(
      expect.objectContaining({ kind: "plot-config", plotId: "seed-plot" }),
    );
  });

  it("applies plot schema through scispace and resizes the plot window", async () => {
    const { store } = await makeStore();
    const schema = {
      ...store.getState().plotSpecs[0],
      title: "Schema applied",
      x: "index",
      size: { width: 780, height: 420 },
      series: [{ ...store.getState().plotSpecs[0]?.series[0], y: "background" }],
    };

    await store
      .getState()
      .runScispace(
        `plot-apply-schema seed-plot json=${encodeURIComponent(JSON.stringify(schema))}`,
      );

    expect(store.getState().plotSpecs[0]).toMatchObject({
      id: "seed-plot",
      title: "Schema applied",
      x: "index",
      size: { width: 780, height: 420 },
      series: [{ y: "background" }],
    });
    expect(store.getState().windows.find((window) => window.id === "plot-seed")).toMatchObject({
      width: 780,
      height: 514,
    });
    expect(store.getState().commandHistory.at(-1)).toMatchObject({
      command: expect.stringContaining("plot-apply-schema seed-plot"),
      status: "success",
    });
  });
});
