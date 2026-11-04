import { describe, expect, it } from "vite-plus/test";
import { makeStore } from "./scispaceStoreTestUtils";

describe("scispace store file behavior", () => {
  it("executes virtual file commands through runScispace and persists their effects", async () => {
    const { db, store } = await makeStore();

    const mkdir = await store.getState().runScispace("file-mkdir ~/raw/analysis", {
      source: "terminal",
    });
    expect(mkdir).toMatchObject({ kind: "file-command", action: "mkdir" });
    expect(store.getState().files.some((file) => file.path === "~/raw/analysis")).toBe(true);
    expect(await db.files.get("~/raw/analysis")).toMatchObject({ kind: "directory" });

    await store.getState().runScispace("file-move ~/raw/waveform.csv to=~/raw/analysis");
    expect(store.getState().datasets[0]).toMatchObject({
      name: "waveform.csv",
      sourcePath: "~/raw/analysis/waveform.csv",
    });

    await store
      .getState()
      .runScispace('file-rename ~/raw/analysis/waveform.csv name="renamed.csv"', {
        source: "gui",
      });
    expect(store.getState().datasets[0]).toMatchObject({
      name: "renamed.csv",
      sourcePath: "~/raw/analysis/renamed.csv",
    });
    expect(store.getState().windows.find((window) => window.id === "table-seed")?.title).toBe(
      "Table - renamed.csv",
    );

    await store.getState().runScispace("file-delete ~/raw/analysis/renamed.csv");
    expect(store.getState().datasets).toHaveLength(0);
    expect(store.getState().windows.some((window) => window.kind === "table")).toBe(false);
    expect(await db.files.get("~/raw/analysis/renamed.csv")).toBeUndefined();
    expect(store.getState().commandHistory.map((entry) => entry.command)).toEqual([
      "file-mkdir ~/raw/analysis",
      "file-move ~/raw/waveform.csv to=~/raw/analysis",
      'file-rename ~/raw/analysis/waveform.csv name="renamed.csv"',
      "file-delete ~/raw/analysis/renamed.csv",
    ]);
    expect(store.getState().commandHistory[2]).toMatchObject({
      source: "gui",
      status: "success",
    });
  });

  it("records virtual file command execution errors in command history", async () => {
    const { store } = await makeStore();

    const result = await store.getState().runScispace("file-delete ~/raw/missing.csv", {
      source: "gui",
    });

    expect(result).toMatchObject({ kind: "error", output: "File not found: ~/raw/missing.csv" });
    expect(store.getState().commandHistory[0]).toMatchObject({
      command: "file-delete ~/raw/missing.csv",
      status: "error",
      source: "gui",
    });
  });

  it("lists virtual files through terminal-sourced scispace commands", async () => {
    const { store } = await makeStore();

    const result = await store.getState().runScispace("file-list ~/raw");

    expect(result.output).toContain(
      "[dataset] ~/raw/waveform.csv -> waveform.csv (160 rows, 4 cols)",
    );
    expect(store.getState().terminalEvents.at(-1)).toContain("[dataset] ~/raw/waveform.csv");
    expect(store.getState().commandHistory[0]).toMatchObject({
      command: "file-list ~/raw",
      source: "terminal",
      status: "success",
    });
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

    await store.getState().runScispace('plot-set seed-plot title="Manual plot title"');
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
});
