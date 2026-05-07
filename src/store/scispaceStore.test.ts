import { describe, expect, it } from "vitest";
import { createSeedDataset, datasetToDelimitedText } from "../domain/csv";
import { createScispaceStore } from "./scispaceStore";
import { SciSpaceDatabase } from "./db";

const makeStore = async () => {
  const db = new SciSpaceDatabase(`test-${crypto.randomUUID()}`);
  await db.open();
  const store = createScispaceStore(db);
  await store.getState().initialize();
  return { db, store };
};

const storeSeedDataset = () => {
  const dataset = createSeedDataset();
  return {
    dataset,
    file: {
      id: dataset.sourcePath,
      path: dataset.sourcePath,
      name: "waveform.csv",
      kind: "file" as const,
      text: datasetToDelimitedText(dataset),
      datasetId: dataset.id,
      createdAt: Date.now(),
    },
  };
};

describe("scispace zustand store", () => {
  it("seeds the workspace with a dataset and initial windows", async () => {
    const { store } = await makeStore();
    const state = store.getState();

    expect(state.datasets[0]?.id).toBe("seed-waveform");
    expect(state.files[0]?.path).toBe("~/raw/waveform.csv");
    expect(state.windows.map((window) => window.kind)).toEqual([
      "browser",
      "table",
      "plot",
      "terminal",
    ]);
    expect(state.windows.find((window) => window.kind === "terminal")).toMatchObject({
      x: 64,
      y: 612,
      height: 300,
    });
  });

  it("imports text files through Dexie and exposes parsed datasets", async () => {
    const { db, store } = await makeStore();
    const result = await store.getState().importTextFile("sample.csv", "x,y\n0,1\n1,2");

    expect(result.dataset?.name).toBe("sample.csv");
    expect(store.getState().files.some((file) => file.path === "~/raw/sample.csv")).toBe(true);
    expect(await db.datasets.get(result.dataset?.id ?? "")).toMatchObject({ name: "sample.csv" });
    expect(store.getState().terminalEvents.at(-1)).toContain("Imported ~/raw/sample.csv");
  });

  it("keeps unsupported uploads as uniquely named raw files", async () => {
    const { db, store } = await makeStore();
    const first = await store.getState().importTextFile("notes.txt", "raw notes");
    const second = await store.getState().importTextFile("notes.txt", "more notes");

    expect(first.dataset).toBeUndefined();
    expect(first.parseError).toContain("Raw file stored");
    expect(second.file.path).toBe("~/raw/notes (1).txt");
    expect(await db.files.get("~/raw/notes.txt")).toMatchObject({
      text: "raw notes",
      parseError: "Raw file stored without tabular parsing",
    });
    expect(await db.files.get("~/raw/notes (1).txt")).toMatchObject({ text: "more notes" });
  });

  it("stores parse errors for invalid tabular uploads", async () => {
    const { db, store } = await makeStore();
    const result = await store.getState().importTextFile("bad.csv", "\n");

    expect(result.dataset).toBeUndefined();
    expect(result.parseError).toBe("Empty tabular file");
    expect(await db.files.get("~/raw/bad.csv")).toMatchObject({
      parseError: "Empty tabular file",
    });
  });

  it("opens an import dialog before persisting dropped files and confirms through settings", async () => {
    const { db, store } = await makeStore();
    const importId = store
      .getState()
      .openImportDialog("configured.csv", "header\n# comment\nx;y\n1;10\n2;20");

    expect(store.getState().pendingImports).toHaveLength(1);
    expect(store.getState().windows.some((window) => window.kind === "import")).toBe(true);
    expect(await db.files.get("~/raw/configured.csv")).toBeUndefined();

    store.getState().updateImportOptions(importId, {
      skipRows: 1,
      delimiter: "semicolon",
      commentPrefix: "#",
      hasHeader: true,
    });
    expect(store.getState().pendingImports[0]?.preview?.rows[0]).toEqual({ x: 1, y: 10 });

    const result = await store.getState().confirmImport(importId);

    expect(result?.dataset?.name).toBe("configured.csv");
    expect(await db.files.get("~/raw/configured.csv")).toMatchObject({ name: "configured.csv" });
    expect(store.getState().pendingImports).toHaveLength(0);
    expect(store.getState().windows.some((window) => window.kind === "import")).toBe(false);
  });

  it("cancels pending imports without saving files", async () => {
    const { db, store } = await makeStore();
    const importId = store.getState().openImportDialog("cancel.csv", "x,y\n1,2");

    store.getState().cancelImport(importId);

    expect(store.getState().pendingImports).toHaveLength(0);
    expect(await db.files.get("~/raw/cancel.csv")).toBeUndefined();
  });

  it("updates import preview when header row is disabled", async () => {
    const { store } = await makeStore();
    const importId = store.getState().openImportDialog("no-header.csv", "1,2\n3,4");

    store.getState().updateImportOptions(importId, { hasHeader: false });

    expect(store.getState().pendingImports[0]?.preview?.columns).toEqual(["column_1", "column_2"]);
    expect(store.getState().pendingImports[0]?.preview?.rows[0]).toEqual({
      column_1: 1,
      column_2: 2,
    });
  });

  it("uses edited column names for headerless imports", async () => {
    const { store } = await makeStore();
    const importId = store.getState().openImportDialog("no-header.csv", "1,2\n3,4");

    store.getState().updateImportOptions(importId, { hasHeader: false });
    store.getState().updateImportOptions(importId, { columnNames: ["energy", "intensity"] });
    const result = await store.getState().confirmImport(importId);

    expect(result?.dataset?.columns).toEqual(["energy", "intensity"]);
    expect(result?.dataset?.rows[0]).toEqual({ energy: 1, intensity: 2 });
  });

  it("opens raw import dialogs and confirms them without datasets", async () => {
    const { db, store } = await makeStore();
    const importId = store.getState().openImportDialog("notes.txt", "raw notes");

    expect(store.getState().pendingImports[0]?.error).toContain("Raw file stored");
    const result = await store.getState().confirmImport(importId);

    expect(result?.dataset).toBeUndefined();
    expect(result?.parseError).toContain("Raw file stored");
    expect(await db.files.get("~/raw/notes.txt")).toMatchObject({ text: "raw notes" });
  });

  it("returns undefined when confirming a missing pending import", async () => {
    const { store } = await makeStore();

    await expect(store.getState().confirmImport("missing")).resolves.toBeUndefined();
  });

  it("runs pseudo commands and mutates real store state", async () => {
    const { store } = await makeStore();
    const plot = await store.getState().runScispace("plot waveform.csv x=time y=signal,background");
    const table = await store.getState().runScispace("table waveform.csv");

    expect(plot.kind).toBe("plot");
    expect(table.kind).toBe("open-table");
    expect(
      store
        .getState()
        .plotSpecs.at(-1)
        ?.series.map((series) => series.y),
    ).toEqual(["signal", "background"]);
    expect(
      store
        .getState()
        .windows.some((window) => window.kind === "plot" && window.title.includes("signal")),
    ).toBe(true);
    expect(store.getState().terminalEvents.at(-1)).toContain("Table opened");
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

  it("creates derived datasets through command execution", async () => {
    const { db, store } = await makeStore();
    const result = await store.getState().runScispace("elt waveform.csv as derived.csv");

    expect(result.kind).toBe("dataset-created");
    expect(store.getState().datasets.some((dataset) => dataset.name === "derived.csv")).toBe(true);
    expect(await db.files.get("~/raw/derived.csv")).toMatchObject({ name: "derived.csv" });
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

  it("updates and persists plot specs through layout", async () => {
    const { db, store } = await makeStore();

    store.getState().updatePlotSpec("seed-plot", {
      title: "Edited signal plot",
      x: "index",
      zoomMode: "x",
      series: [
        { y: "signal", label: "Signal", color: "#dc2626" },
        { y: "background", label: "Background", color: "#16a34a" },
      ],
    });

    expect(store.getState().plotSpecs[0]).toMatchObject({
      title: "Edited signal plot",
      titleEdited: true,
      x: "index",
      zoomMode: "x",
    });
    expect(store.getState().windows.find((window) => window.id === "plot-seed")?.title).toBe(
      "Edited signal plot",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const restoredStore = createScispaceStore(db);
    await restoredStore.getState().initialize();

    expect(restoredStore.getState().plotSpecs[0]).toMatchObject({
      title: "Edited signal plot",
      x: "index",
      zoomMode: "x",
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

  it("resets Zustand and Dexie to a fresh project", async () => {
    const { db, store } = await makeStore();
    store.getState().openImportDialog("pending.csv", "x,y\n1,2");
    await store.getState().importTextFile("sample.csv", "x,y\n0,1");
    await store.getState().runScispace("elt waveform.csv as derived.csv");
    store.getState().closeWindow("table-seed");
    store.getState().setViewport({ x: 32, y: 48, scale: 0.8 });

    await store.getState().createNewProject();

    const state = store.getState();
    expect(state.files.map((file) => file.path)).toEqual(["~/raw/waveform.csv"]);
    expect(state.datasets.map((dataset) => dataset.id)).toEqual(["seed-waveform"]);
    expect(state.windows.map((window) => window.kind)).toEqual([
      "browser",
      "table",
      "plot",
      "terminal",
    ]);
    expect(state.plotSpecs.map((plot) => plot.id)).toEqual(["seed-plot"]);
    expect(state.pendingImports).toHaveLength(0);
    expect(state.terminalEvents).toHaveLength(0);
    expect(state.activeDatasetId).toBe("seed-waveform");
    expect(state.activeWindowId).toBeUndefined();
    expect(state.viewport).toEqual({ x: 0, y: 0, scale: 1 });
    expect(await db.files.get("~/raw/sample.csv")).toBeUndefined();
    expect((await db.datasets.toArray()).some((dataset) => dataset.name === "derived.csv")).toBe(
      false,
    );
    expect((await db.layout.get("main"))?.value.windows.map((window) => window.kind)).toEqual([
      "browser",
      "table",
      "plot",
      "terminal",
    ]);
  });

  it("creates folders and moves datasets while preserving their names", async () => {
    const { db, store } = await makeStore();
    await store.getState().createDirectory("analysis");

    await store.getState().moveVirtualItem("~/raw/waveform.csv", "~/raw/analysis");

    expect(store.getState().files.some((file) => file.path === "~/raw/analysis")).toBe(true);
    expect(store.getState().files.some((file) => file.path === "~/raw/analysis/waveform.csv")).toBe(
      true,
    );
    expect(store.getState().datasets[0]).toMatchObject({
      name: "waveform.csv",
      sourcePath: "~/raw/analysis/waveform.csv",
    });
    expect(await db.files.get("~/raw/analysis/waveform.csv")).toMatchObject({
      datasetId: "seed-waveform",
    });
  });

  it("normalizes shorthand move target directories", async () => {
    const { store } = await makeStore();
    await store.getState().createDirectory("analysis");

    await store.getState().moveVirtualItem("~/raw/waveform.csv", "analysis");

    expect(store.getState().datasets[0]?.sourcePath).toBe("~/raw/analysis/waveform.csv");
  });

  it("renames dataset files and retitles open windows", async () => {
    const { db, store } = await makeStore();

    await store.getState().renameVirtualItem("~/raw/waveform.csv", "renamed.csv");

    expect(store.getState().files.some((file) => file.path === "~/raw/renamed.csv")).toBe(true);
    expect(store.getState().datasets[0]).toMatchObject({
      name: "renamed.csv",
      sourcePath: "~/raw/renamed.csv",
    });
    expect(store.getState().windows.find((window) => window.id === "table-seed")?.title).toBe(
      "Table - renamed.csv",
    );
    expect(store.getState().plotSpecs[0]?.title).toBe("renamed.csv: signal vs time");
    expect(await db.files.get("~/raw/waveform.csv")).toBeUndefined();
    expect(await db.files.get("~/raw/renamed.csv")).toMatchObject({ name: "renamed.csv" });
  });

  it("keeps manually edited plot titles during dataset rename", async () => {
    const { store } = await makeStore();

    store.getState().updatePlotSpec("seed-plot", { title: "Manual plot title" });
    await store.getState().renameVirtualItem("~/raw/waveform.csv", "renamed.csv");

    expect(store.getState().plotSpecs[0]?.title).toBe("Manual plot title");
    expect(store.getState().windows.find((window) => window.id === "plot-seed")?.title).toBe(
      "Manual plot title",
    );
  });

  it("deletes files with their datasets and dependent windows", async () => {
    const { db, store } = await makeStore();

    await store.getState().deleteVirtualItem("~/raw/waveform.csv");

    expect(store.getState().files).toHaveLength(0);
    expect(store.getState().datasets).toHaveLength(0);
    expect(store.getState().windows.some((window) => window.kind === "table")).toBe(false);
    expect(store.getState().windows.some((window) => window.kind === "plot")).toBe(false);
    expect(store.getState().plotSpecs).toHaveLength(0);
    expect(await db.files.get("~/raw/waveform.csv")).toBeUndefined();
    expect(await db.datasets.get("seed-waveform")).toBeUndefined();
  });

  it("recursively renames and deletes folders", async () => {
    const { db, store } = await makeStore();
    await store.getState().createDirectory("analysis");
    await store.getState().moveVirtualItem("~/raw/waveform.csv", "~/raw/analysis");

    await store.getState().renameVirtualItem("~/raw/analysis", "processed");
    expect(store.getState().datasets[0]?.sourcePath).toBe("~/raw/processed/waveform.csv");

    await store.getState().deleteVirtualItem("~/raw/processed");
    expect(store.getState().files).toHaveLength(0);
    expect(store.getState().datasets).toHaveLength(0);
    expect(await db.files.get("~/raw/processed/waveform.csv")).toBeUndefined();
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
      series: [{ y: "background", label: "background", color: "#2563eb" }],
      zoomMode: "xy",
    });
  });
});
