import { describe, expect, it } from "vitest";
import {
  SciSpaceDatabase,
  createScispaceStore,
  makeStore,
  openImport,
  stateOf,
  storeSeedDataset,
} from "./scispaceStoreTestUtils";

describe("scispace store workspace behavior", () => {
  it("seeds the workspace with a dataset and initial windows", async () => {
    const { store } = await makeStore();
    const state = stateOf(store);

    expect(state.datasets[0]?.id).toBe("seed-waveform");
    expect(state.files[0]?.path).toBe("~/raw/waveform.csv");
    expect(state.columnSelections["seed-waveform"]).toEqual([
      "index",
      "time",
      "signal",
      "background",
    ]);
    expect(state.windows.map((window) => window.kind)).toEqual([
      "browser",
      "table",
      "plot",
      "terminal",
      "history",
    ]);
    expect(state.windows.find((window) => window.kind === "browser")).toMatchObject({
      x: 1984,
      y: 1152,
    });
    expect(state.windows.find((window) => window.kind === "table")).toMatchObject({
      height: 424,
    });
    expect(state.windows.find((window) => window.kind === "terminal")).toMatchObject({
      x: 1984,
      y: 1836,
      height: 300,
    });
    expect(state.windows.find((window) => window.kind === "history")).toMatchObject({
      title: "Command History",
      x: 3248,
      y: 1612,
    });
    expect(state.currentPlotId).toBe("seed-plot");
    expect(state.viewport).toEqual({ x: -1920, y: -1080, scale: 1 });
  });

  it("handles layout actions and existing table focus", async () => {
    const { store } = await makeStore();

    await store.getState().openTable("missing");
    await store.getState().selectDataset("seed-waveform");
    await store.getState().openTable("seed-waveform");
    store.getState().focusWindow("browser-main");
    store.getState().setViewport({ x: 12, y: 24, scale: 0.75 });

    expect(store.getState().windows.filter((window) => window.id === "table-seed")).toHaveLength(1);
    expect(store.getState().activeWindowId).toBe("browser-main");
    expect(store.getState().viewport).toEqual({ x: 12, y: 24, scale: 0.75 });
  });

  it("opens new import, table, and plot windows inside the current viewport", async () => {
    const { store } = await makeStore();

    store.getState().setViewport({ x: -3200, y: -1800, scale: 2 });
    const visibleOrigin = { x: 1600, y: 900 };

    const importId = openImport(store, "visible.csv", "x,y\n1,2");
    const importWindow = store.getState().windows.find((window) => window.importId === importId);
    expect(importWindow).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    expect(importWindow?.x).toBeGreaterThan(visibleOrigin.x);
    expect(importWindow?.y).toBeGreaterThan(visibleOrigin.y);

    await store.getState().runScispace("elt waveform.csv as derived.csv");
    const derived = store.getState().datasets.find((dataset) => dataset.name === "derived.csv");
    await store.getState().openTable(derived?.id ?? "");
    const tableWindow = store.getState().windows.find((window) => window.datasetId === derived?.id);
    expect(tableWindow?.x).toBeGreaterThan(visibleOrigin.x);
    expect(tableWindow?.y).toBeGreaterThan(visibleOrigin.y);

    await store.getState().runScispace("plot waveform.csv x=time y=signal");
    const plotWindow = store
      .getState()
      .windows.find((window) => window.kind === "plot" && window.id !== "plot-seed");
    expect(plotWindow?.x).toBeGreaterThan(visibleOrigin.x);
    expect(plotWindow?.y).toBeGreaterThan(visibleOrigin.y);
  });

  it("persists layout changes", async () => {
    const { db, store } = await makeStore();
    store.getState().updateWindow("browser-main", { x: 120, y: 140 });

    const layout = await db.layout.get("main");
    expect(layout?.value.windows.find((window) => window.id === "browser-main")).toMatchObject({
      x: 120,
      y: 140,
    });
  });

  it("adds a terminal window when loading an older persisted layout", async () => {
    const db = new SciSpaceDatabase(`test-${crypto.randomUUID()}`);
    await db.open();
    await db.layout.put({
      id: "main",
      value: {
        windows: [
          {
            id: "browser-main",
            kind: "browser",
            title: "Data Browser",
            x: 64,
            y: 72,
            width: 300,
            height: 440,
            zIndex: 1,
          },
        ],
        viewport: { x: 0, y: 0, scale: 1 },
      },
    });

    const store = createScispaceStore(db);
    await store.getState().initialize();

    expect(store.getState().windows.some((window) => window.kind === "terminal")).toBe(true);
    expect(store.getState().windows.some((window) => window.kind === "history")).toBe(true);
  });

  it("restores legacy persisted plot specs without series fields", async () => {
    const db = new SciSpaceDatabase(`test-${crypto.randomUUID()}`);
    await db.open();
    const seed = storeSeedDataset();
    await db.datasets.put(seed.dataset);
    await db.files.put(seed.file);
    await db.layout.put({
      id: "main",
      value: {
        windows: [],
        viewport: { x: 0, y: 0, scale: 1 },
        plotSpecs: [
          {
            id: "legacy-plot",
            type: "line",
            source: "seed-waveform",
            x: "time",
            y: "background",
            title: "legacy plot",
          } as never,
        ],
      },
    });

    const store = createScispaceStore(db);
    await store.getState().initialize();

    expect(store.getState().plotSpecs[0]).toMatchObject({
      id: "legacy-plot",
      series: [
        {
          y: "background",
          label: "background",
          color: "#2563eb",
          lineWidth: 2,
          markerSize: 6,
          markerShape: "circle",
          drawOrder: 0,
        },
      ],
      zoomMode: "xy",
      size: { width: 640, height: 360 },
      font: { family: "Inter, system-ui, sans-serif", size: 12 },
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
      annotations: [],
    });
  });
});
