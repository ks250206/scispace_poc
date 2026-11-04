import { describe, expect, it } from "vite-plus/test";
import { lastCommand, makeStore, runCommand, stateOf } from "./scispaceStoreTestUtils";

describe("scispace store dataset commands", () => {
  it("creates datasets and backing files through scispace", async () => {
    const { db, store } = await makeStore();

    const result = await runCommand(store, "dataset-new calc columns=x,y rows=3", {
      source: "gui",
    });

    expect(result.kind).toBe("dataset-created");
    const created = stateOf(store).datasets.find((dataset) => dataset.name === "calc");
    expect(created).toBeDefined();
    expect(created?.rows).toHaveLength(3);
    expect(created?.columns.map((column) => column.id)).toEqual(["x", "y"]);
    expect(created?.columns.map((column) => column.dataType)).toEqual(["string", "string"]);
    expect(stateOf(store).files.find((file) => file.path === "~/raw/calc.csv")).toMatchObject({
      datasetId: created?.id,
      text: "x,y\n,\n,\n,",
    });
    expect(stateOf(store).columnSelections[created!.id]).toEqual(["x", "y"]);
    expect((await db.datasets.get(created!.id))?.rows).toHaveLength(3);
    expect((await db.files.get("~/raw/calc.csv"))?.text).toBe("x,y\n,\n,\n,");
    expect(lastCommand(store)).toMatchObject({
      command: "dataset-new calc columns=x,y rows=3",
      source: "gui",
      status: "success",
    });
  });

  it("persists explicit dataset-new column types", async () => {
    const { db, store } = await makeStore();

    await runCommand(store, "dataset-new typed columns=x:number,label:string rows=2");

    const created = stateOf(store).datasets.find((dataset) => dataset.name === "typed");
    expect(created?.columns.map((column) => [column.id, column.dataType])).toEqual([
      ["x", "number"],
      ["label", "string"],
    ]);
    expect((await db.datasets.get(created!.id))?.columns.map((column) => column.dataType)).toEqual([
      "number",
      "string",
    ]);
  });

  it("calculates dataset columns and rewrites backing files", async () => {
    const { db, store } = await makeStore();

    const result = await runCommand(
      store,
      'dataset-calc waveform.csv column=sum expr="signal + background"',
      { source: "terminal" },
    );

    expect(result.kind).toBe("dataset-updated");
    expect(stateOf(store).datasets[0]?.columns.at(-1)).toMatchObject({
      id: "sum",
      dataType: "number",
    });
    expect(stateOf(store).datasets[0]?.rows[0]?.sum).toBe(10);
    expect((await db.datasets.get("seed-waveform"))?.rows[0]?.sum).toBe(10);
    expect((await db.files.get("~/raw/waveform.csv"))?.text?.split("\n")[0]).toBe(
      "index,time,signal,background,sum",
    );
    expect(lastCommand(store)).toMatchObject({
      command: 'dataset-calc waveform.csv column=sum expr="signal + background"',
      source: "terminal",
      status: "success",
    });
  });

  it("persists converted date and time columns and undoes values and metadata together", async () => {
    const { db, store } = await makeStore();
    const state = () => stateOf(store);
    const dataset = () => state().datasets.find(({ name }) => name === "dates");
    await runCommand(store, "dataset-new dates columns=measured,clock rows=2");
    await runCommand(
      store,
      "table-edit dates action=set-cell row=1 column=measured value=01/02/2026",
    );
    const before = state().undoStack.length;
    await runCommand(
      store,
      "table-edit dates action=preview-conversion column=measured type=date format=dmy",
    );
    expect(state().undoStack).toHaveLength(before);
    await runCommand(
      store,
      "table-edit dates action=convert-column column=measured type=date format=dmy",
    );
    expect(state().undoStack).toHaveLength(before + 1);
    expect(dataset()?.rows[0]?.measured).toBe("2026-02-01");
    expect(dataset()?.columns[0]?.dataType).toBe("date");
    expect((await db.datasets.get(dataset()!.id))?.columns[0]?.dataType).toBe("date");

    await state().undo();
    expect(dataset()?.rows[0]?.measured).toBe("01/02/2026");
    expect(dataset()?.columns[0]?.dataType).toBe("string");
    await state().redo();

    await runCommand(store, "table-edit dates action=set-cell row=1 column=clock value=9:30");
    await runCommand(store, "table-edit dates action=convert-column column=clock type=time");

    const json = await state().exportCurrentProjectJson();
    await state().importProjectJson(json);
    expect(dataset()?.rows[0]?.measured).toBe("2026-02-01");
    expect(dataset()?.columns[0]).toMatchObject({
      id: "measured",
      dataType: "date",
      explicitType: true,
    });
    expect(dataset()?.rows[0]?.clock).toBe("09:30:00");
    expect(dataset()?.columns[1]).toMatchObject({
      id: "clock",
      dataType: "time",
      explicitType: true,
    });
  });

  it("undoes and redoes dataset creation and calculation snapshots", async () => {
    const { store } = await makeStore();

    await runCommand(store, "dataset-new calc columns=x,y rows=2");
    expect(stateOf(store).datasets.some((dataset) => dataset.name === "calc")).toBe(true);
    expect(stateOf(store).undoStack).toHaveLength(1);

    await stateOf(store).undo();
    expect(stateOf(store).datasets.some((dataset) => dataset.name === "calc")).toBe(false);
    expect(stateOf(store).redoStack).toHaveLength(1);

    await stateOf(store).redo();
    expect(stateOf(store).datasets.some((dataset) => dataset.name === "calc")).toBe(true);

    await runCommand(store, 'dataset-calc waveform.csv column=sum expr="signal + background"');
    expect(stateOf(store).datasets[0]?.rows[0]?.sum).toBe(10);

    await stateOf(store).undo();
    expect(stateOf(store).datasets[0]?.rows[0]).not.toHaveProperty("sum");

    await stateOf(store).redo();
    expect(stateOf(store).datasets[0]?.rows[0]?.sum).toBe(10);
  });
});
