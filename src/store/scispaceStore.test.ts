import { describe, expect, it } from "vitest";
import { createScispaceStore } from "./scispaceStore";
import { SciSpaceDatabase } from "./db";

const makeStore = async () => {
  const db = new SciSpaceDatabase(`test-${crypto.randomUUID()}`);
  await db.open();
  const store = createScispaceStore(db);
  await store.getState().initialize();
  return { db, store };
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

  it("runs pseudo commands and mutates real store state", async () => {
    const { store } = await makeStore();
    const plot = await store.getState().runScispace("plot waveform.csv x=time y=signal");
    const table = await store.getState().runScispace("table waveform.csv");

    expect(plot.kind).toBe("plot");
    expect(table.kind).toBe("open-table");
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
});
