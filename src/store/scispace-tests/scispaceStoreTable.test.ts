import { describe, expect, it } from "vite-plus/test";
import {
  datasetColumnNames,
  lastCommand,
  makeStore,
  runCommand,
  stateOf,
} from "./scispaceStoreTestUtils";

describe("scispace store table behavior", () => {
  it("updates dataset cells and rewrites the backing virtual file", async () => {
    const { db, store } = await makeStore();

    await runCommand(
      store,
      "table-edit waveform.csv action=set-cell row=1 column=signal value=42.5",
    );

    expect(stateOf(store).datasets[0]?.rows[0]?.signal).toBe(42.5);
    expect((await db.datasets.get("seed-waveform"))?.rows[0]?.signal).toBe(42.5);
    expect((await db.files.get("~/raw/waveform.csv"))?.text?.split("\n")[1]).toBe("0,0,42.5,7");
    expect(lastCommand(store)).toMatchObject({
      command: "table-edit waveform.csv action=set-cell row=1 column=signal value=42.5",
      status: "success",
    });
  });

  it("inserts columns and keeps table selections in sync", async () => {
    const { db, store } = await makeStore();

    const result = await runCommand(
      store,
      "table-edit waveform.csv action=insert-column column=derived before=signal",
      { source: "gui" },
    );

    expect(result.kind).toBe("dataset-updated");
    expect(stateOf(store).datasets[0]?.columns.map((column) => column.id)).toEqual([
      "index",
      "time",
      "derived",
      "signal",
      "background",
    ]);
    expect(stateOf(store).datasets[0]?.rows[0]?.derived).toBe("");
    expect(stateOf(store).columnSelections["seed-waveform"]).toEqual([
      "index",
      "time",
      "derived",
      "signal",
      "background",
    ]);
    expect(stateOf(store).windows.find((window) => window.id === "table-seed")).toMatchObject({
      columnIds: ["index", "time", "derived", "signal", "background"],
    });
    expect((await db.files.get("~/raw/waveform.csv"))?.text?.split("\n")[0]).toBe(
      "index,time,derived,signal,background",
    );
    expect(lastCommand(store)).toMatchObject({
      command: "table-edit waveform.csv action=insert-column column=derived before=signal",
      source: "gui",
      status: "success",
    });
  });

  it("runs table-edit row and column deletes through scispace and persists datasets", async () => {
    const { db, store } = await makeStore();

    const rowResult = await runCommand(store, "table-edit waveform.csv action=delete-row index=1", {
      source: "gui",
    });
    expect(rowResult.kind).toBe("dataset-updated");
    expect(stateOf(store).datasets[0]?.rows).toHaveLength(159);
    expect((await db.files.get("~/raw/waveform.csv"))?.text).not.toContain("0,0,3,7");
    expect(lastCommand(store)).toMatchObject({
      command: "table-edit waveform.csv action=delete-row index=1",
      source: "gui",
      status: "success",
    });

    const columnResult = await runCommand(
      store,
      "table-edit waveform.csv action=delete-column column=background",
      { source: "history" },
    );
    expect(columnResult.kind).toBe("dataset-updated");
    expect(datasetColumnNames(stateOf(store).datasets[0]!)).toEqual(["index", "time", "signal"]);
    expect(stateOf(store).windows.find((window) => window.id === "table-seed")).toMatchObject({
      columnIds: ["index", "time", "signal"],
    });
    expect(stateOf(store).plotSpecs[0]?.series.map((series) => series.y)).toEqual(["signal"]);
    expect((await db.datasets.get("seed-waveform"))?.columns.map((column) => column.id)).toEqual([
      "index",
      "time",
      "signal",
    ]);
    expect((await db.files.get("~/raw/waveform.csv"))?.text?.split("\n")[0]).toBe(
      "index,time,signal",
    );
  });

  it("removes plot windows when table-edit deletes required plot columns", async () => {
    const { store } = await makeStore();

    await runCommand(store, "table-edit waveform.csv action=delete-column column=time");

    expect(stateOf(store).plotSpecs).toHaveLength(0);
    expect(stateOf(store).windows.some((window) => window.kind === "plot")).toBe(false);
    expect(stateOf(store).currentPlotId).toBeUndefined();
  });

  it("runs table-range edits through scispace and rewrites backing files", async () => {
    const { db, store } = await makeStore();

    const cleared = await runCommand(
      store,
      "table-range waveform.csv action=clear r1=1 c1=time r2=2 c2=signal",
      { source: "gui" },
    );
    expect(cleared.kind).toBe("dataset-updated");
    expect(stateOf(store).datasets[0]?.rows[0]).toMatchObject({ time: "", signal: "" });
    expect((await db.files.get("~/raw/waveform.csv"))?.text?.split("\n")[1]).toBe("0,,,7");
    expect(lastCommand(store)).toMatchObject({
      command: "table-range waveform.csv action=clear r1=1 c1=time r2=2 c2=signal",
      source: "gui",
      status: "success",
    });

    const filled = await runCommand(
      store,
      "table-range waveform.csv action=fill-down r1=1 c1=background r2=3 c2=background",
      { source: "history" },
    );
    expect(filled.kind).toBe("dataset-updated");
    expect(stateOf(store).datasets[0]?.rows[1]?.background).toBe(7);
    expect(stateOf(store).datasets[0]?.rows[2]?.background).toBe(7);
    expect((await db.datasets.get("seed-waveform"))?.rows[2]?.background).toBe(7);
    expect(lastCommand(store)).toMatchObject({
      command: "table-range waveform.csv action=fill-down r1=1 c1=background r2=3 c2=background",
      source: "history",
      status: "success",
    });
  });

  it("undoes and redoes destructive table edits from snapshots", async () => {
    const { db, store } = await makeStore();

    await runCommand(
      store,
      "table-edit waveform.csv action=set-cell row=1 column=signal value=42.5",
    );
    expect(stateOf(store).datasets[0]?.rows[0]?.signal).toBe(42.5);
    expect(stateOf(store).undoStack).toHaveLength(1);
    expect(stateOf(store).redoStack).toHaveLength(0);

    await stateOf(store).undo();
    expect(stateOf(store).datasets[0]?.rows[0]?.signal).toBe(3);
    expect((await db.files.get("~/raw/waveform.csv"))?.text?.split("\n")[1]).toBe("0,0,3,7");
    expect(stateOf(store).undoStack).toHaveLength(0);
    expect(stateOf(store).redoStack).toHaveLength(1);

    await stateOf(store).redo();
    expect(stateOf(store).datasets[0]?.rows[0]?.signal).toBe(42.5);
    expect((await db.files.get("~/raw/waveform.csv"))?.text?.split("\n")[1]).toBe("0,0,42.5,7");
    expect(stateOf(store).undoStack).toHaveLength(1);
    expect(stateOf(store).redoStack).toHaveLength(0);

    await runCommand(store, "table-edit waveform.csv action=insert-column column=derived");
    expect(stateOf(store).datasets[0]?.columns.map((column) => column.id)).toContain("derived");

    await stateOf(store).undo();
    expect(stateOf(store).datasets[0]?.columns.map((column) => column.id)).not.toContain("derived");

    await stateOf(store).redo();
    expect(stateOf(store).datasets[0]?.columns.map((column) => column.id)).toContain("derived");
  });

  it("persists table lock state in the layout", async () => {
    const { db, store } = await makeStore();

    stateOf(store).updateWindow("table-seed", { locked: true });

    expect(stateOf(store).windows.find((window) => window.id === "table-seed")).toMatchObject({
      locked: true,
    });
    expect(
      (await db.layout.get("main"))?.value.windows.find((window) => window.id === "table-seed"),
    ).toMatchObject({ locked: true });
  });

  it("runs pseudo commands and mutates real store state", async () => {
    const { store } = await makeStore();
    const plot = await store.getState().runScispace("plot waveform.csv x=time y=signal,background");
    const table = await store.getState().runScispace("table waveform.csv");

    expect(plot.kind).toBe("plot-created");
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
    expect(store.getState().commandHistory.map((entry) => entry.command)).toEqual([
      "plot waveform.csv x=time y=signal,background",
      "table waveform.csv",
    ]);
    expect(store.getState().commandHistory[0]).toMatchObject({
      kind: "plot-created",
      status: "success",
      source: "terminal",
    });
  });

  it("opens existing table windows with selected command columns", async () => {
    const { db, store } = await makeStore();

    store.getState().setDatasetColumnSelection("seed-waveform", ["time", "signal"]);
    await store.getState().selectDataset("seed-waveform");

    expect(store.getState().windows.find((window) => window.id === "table-seed")).toMatchObject({
      columnIds: ["time", "signal"],
    });
    expect(store.getState().commandHistory.at(-1)).toMatchObject({
      command: "table waveform.csv columns=time,signal",
      source: "gui",
    });
    expect((await db.layout.get("main"))?.value.columnSelections).toEqual({
      "seed-waveform": ["time", "signal"],
    });
  });
});
