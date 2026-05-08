import { describe, expect, it } from "vitest";
import { createScispaceStore, makeStore } from "./scispaceStoreTestUtils";

describe("scispace store history behavior", () => {
  it("undoes and redoes destructive file commands", async () => {
    const { db, store } = await makeStore();

    await store.getState().runScispace("file-delete ~/raw/waveform.csv", { source: "gui" });
    expect(store.getState().files.some((file) => file.path === "~/raw/waveform.csv")).toBe(false);
    expect(store.getState().datasets).toHaveLength(0);

    await store.getState().undo();
    expect(store.getState().files.some((file) => file.path === "~/raw/waveform.csv")).toBe(true);
    expect(store.getState().datasets[0]?.id).toBe("seed-waveform");
    expect(await db.files.get("~/raw/waveform.csv")).toBeDefined();

    await store.getState().redo();
    expect(store.getState().files.some((file) => file.path === "~/raw/waveform.csv")).toBe(false);
    expect(await db.files.get("~/raw/waveform.csv")).toBeUndefined();
  });

  it("records command history errors, sources, replay, and layout persistence", async () => {
    const { db, store } = await makeStore();

    const error = await store.getState().runScispace("plot missing.csv", { source: "gui" });
    expect(error.kind).toBe("error");
    expect(store.getState().commandHistory[0]).toMatchObject({
      command: "plot missing.csv",
      status: "error",
      source: "gui",
    });

    await store.getState().runScispace("table waveform.csv", { source: "history" });
    expect(store.getState().commandHistory.at(-1)).toMatchObject({
      command: "table waveform.csv",
      status: "success",
      source: "history",
    });

    const restoredStore = createScispaceStore(db);
    await restoredStore.getState().initialize();
    expect(restoredStore.getState().commandHistory.map((entry) => entry.command)).toEqual([
      "plot missing.csv",
      "table waveform.csv",
    ]);
    expect(restoredStore.getState().windows.some((window) => window.kind === "history")).toBe(true);
  });

  it("creates derived datasets through command execution", async () => {
    const { db, store } = await makeStore();
    const result = await store.getState().runScispace("elt waveform.csv as derived.csv");

    expect(result.kind).toBe("dataset-created");
    expect(store.getState().datasets.some((dataset) => dataset.name === "derived.csv")).toBe(true);
    expect(await db.files.get("~/raw/derived.csv")).toMatchObject({ name: "derived.csv" });
  });
});
