import { describe, expect, it } from "vitest";
import { createSeedDataset, datasetColumnNames, datasetToDelimitedText } from "../domain/csv";
import { createScispaceStore } from "./scispaceStore";
import { SciSpaceDatabase } from "./db";

const makeStore = async () => {
  const db = new SciSpaceDatabase(`test-${crypto.randomUUID()}`);
  await db.open();
  const store = createScispaceStore(db);
  await store.getState().initialize();
  return { db, store };
};

type StoreFixture = Awaited<ReturnType<typeof makeStore>>;
type TestStore = StoreFixture["store"];
type RunScispaceOptions = Parameters<ReturnType<TestStore["getState"]>["runScispace"]>[1];

const stateOf = (store: TestStore) => store.getState();

const runCommand = (store: TestStore, command: string, options?: RunScispaceOptions) =>
  stateOf(store).runScispace(command, options);

const openImport = (store: TestStore, fileName: string, text: string) =>
  stateOf(store).openImportDialog(fileName, text);

const lastCommand = (store: TestStore) => stateOf(store).commandHistory.at(-1);

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

  it("imports text files through Dexie and exposes parsed datasets", async () => {
    const { db, store } = await makeStore();
    const result = await stateOf(store).importTextFile("sample.csv", "x,y\n0,1\n1,2");

    expect(result.dataset?.name).toBe("sample.csv");
    expect(stateOf(store).files.some((file) => file.path === "~/raw/sample.csv")).toBe(true);
    expect(await db.datasets.get(result.dataset?.id ?? "")).toMatchObject({ name: "sample.csv" });
    expect(stateOf(store).terminalEvents.at(-1)).toContain("Imported ~/raw/sample.csv");
  });

  it("keeps unsupported uploads as uniquely named raw files", async () => {
    const { db, store } = await makeStore();
    const first = await stateOf(store).importTextFile("notes.txt", "raw notes");
    const second = await stateOf(store).importTextFile("notes.txt", "more notes");

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
    const result = await stateOf(store).importTextFile("bad.csv", "\n");

    expect(result.dataset).toBeUndefined();
    expect(result.parseError).toBe("Empty tabular file");
    expect(await db.files.get("~/raw/bad.csv")).toMatchObject({
      parseError: "Empty tabular file",
    });
  });

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
  });

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

  it("opens an import dialog before persisting dropped files and confirms through settings", async () => {
    const { db, store } = await makeStore();
    const importId = store
      .getState()
      .openImportDialog("configured.csv", "header\n# comment\nx;y\n1;10\n2;20");

    expect(store.getState().pendingImports).toHaveLength(1);
    expect(store.getState().windows.some((window) => window.kind === "import")).toBe(true);
    expect(await db.files.get("~/raw/configured.csv")).toBeUndefined();

    await store
      .getState()
      .runScispace(
        `import-set ${importId} skipRows=1 delimiter=semicolon commentPrefix=# hasHeader=true`,
        { source: "gui" },
      );
    expect(store.getState().pendingImports[0]?.preview?.rows[0]).toEqual({ x: 1, y: 10 });

    const result = await store.getState().confirmImport(importId);

    expect(result?.dataset?.name).toBe("configured.csv");
    expect(await db.files.get("~/raw/configured.csv")).toMatchObject({ name: "configured.csv" });
    expect(store.getState().pendingImports).toHaveLength(0);
    expect(store.getState().windows.some((window) => window.kind === "import")).toBe(false);
  });

  it("cancels pending imports without saving files", async () => {
    const { db, store } = await makeStore();
    const importId = openImport(store, "cancel.csv", "x,y\n1,2");

    await store.getState().runScispace(`import-cancel ${importId}`, { source: "gui" });

    expect(store.getState().pendingImports).toHaveLength(0);
    expect(await db.files.get("~/raw/cancel.csv")).toBeUndefined();
  });

  it("updates import preview when header row is disabled", async () => {
    const { store } = await makeStore();
    const importId = openImport(store, "no-header.csv", "1,2\n3,4");

    await store.getState().runScispace(`import-set ${importId} hasHeader=false`, {
      source: "gui",
    });

    const preview = store.getState().pendingImports[0]?.preview;
    expect(preview).toBeDefined();
    expect(preview ? datasetColumnNames(preview) : []).toEqual(["column_1", "column_2"]);
    expect(store.getState().pendingImports[0]?.preview?.rows[0]).toEqual({
      column_1: 1,
      column_2: 2,
    });
  });

  it("uses edited column names for headerless imports", async () => {
    const { store } = await makeStore();
    const importId = openImport(store, "no-header.csv", "1,2\n3,4");

    await store.getState().runScispace(`import-set ${importId} hasHeader=false`, {
      source: "gui",
    });
    await store.getState().runScispace(`import-set ${importId} columnNames=energy,intensity`, {
      source: "gui",
    });
    const result = await store.getState().confirmImport(importId);

    expect(result?.dataset ? datasetColumnNames(result.dataset) : []).toEqual([
      "energy",
      "intensity",
    ]);
    expect(result?.dataset?.rows[0]).toEqual({ energy: 1, intensity: 2 });
  });

  it("defaults import dialogs to tabular mode and excludes empty columns", async () => {
    const { store } = await makeStore();
    const importId = openImport(store, "with-empty.csv", "x,empty,y\n1,,2\n3,,4");
    const pendingImport = store.getState().pendingImports.find((item) => item.id === importId);

    expect(pendingImport).toMatchObject({
      mode: "tabular",
      options: { excludedColumnIds: ["empty"] },
    });
    expect(pendingImport?.allPreview ? datasetColumnNames(pendingImport.allPreview) : []).toEqual([
      "x",
      "empty",
      "y",
    ]);
    expect(pendingImport?.preview ? datasetColumnNames(pendingImport.preview) : []).toEqual([
      "x",
      "y",
    ]);
  });

  it("applies EC-Lab mpt presets when opening imports", async () => {
    const { store } = await makeStore();
    const text =
      "EC-Lab ASCII FILE\nNb header lines : 4\nRun on channel : 4\nmode\ttime/s\tEwe/V\n1\t0\t3";
    const importId = openImport(store, "sample.mpt", text);

    expect(store.getState().pendingImports[0]).toMatchObject({
      id: importId,
      detectedPreset: { id: "ec-lab-mpt", label: "EC-Lab MPT", dataStartLine: 4 },
      options: { skipRows: 3, delimiter: "tab", hasHeader: true },
      preview: { rows: [{ mode: 1, time_s: 0, Ewe_V: 3 }] },
    });
  });

  it("applies Rigaku ras presets when opening imports", async () => {
    const { store } = await makeStore();
    const text = [
      '*MEAS_SCAN_UNIT_X "deg"',
      '*MEAS_SCAN_UNIT_Y "counts"',
      "*RAS_HEADER_END",
      "*RAS_INT_START",
      "10.0000 3.9658 1.0000",
      "10.0200 1.0105 1.0000",
      "*RAS_INT_END",
    ].join("\n");
    const importId = openImport(store, "sample.ras", text);

    expect(store.getState().pendingImports[0]).toMatchObject({
      id: importId,
      detectedPreset: { id: "rigaku-ras", label: "Rigaku RAS", dataStartLine: 5 },
      options: {
        skipRows: 4,
        delimiter: "space",
        commentPrefix: "*",
        hasHeader: false,
        columnNames: ["angle", "intensity", "attenuation"],
      },
      preview: {
        columns: [
          { id: "angle", name: "angle" },
          { id: "intensity", name: "intensity" },
          { id: "attenuation", name: "attenuation" },
        ],
        rows: [
          { angle: 10, intensity: 3.9658, attenuation: 1 },
          { angle: 10.02, intensity: 1.0105, attenuation: 1 },
        ],
      },
    });
  });

  it("updates import settings through scispace commands", async () => {
    const { store } = await makeStore();
    const importId = store
      .getState()
      .openImportDialog("configured.csv", "skip\nx;y;z\n1;2;3\n4;5;6");

    await store
      .getState()
      .runScispace(
        `import-set ${importId} skipRows=1 delimiter=semicolon hasHeader=true mode=tabular`,
        { source: "gui" },
      );
    await store
      .getState()
      .runScispace(`import-column ${importId} column=z action=exclude`, { source: "gui" });

    const pendingImport = store.getState().pendingImports[0];
    expect(pendingImport?.options).toMatchObject({
      skipRows: 1,
      delimiter: "semicolon",
      excludedColumnIds: ["z"],
    });
    expect(pendingImport?.preview ? datasetColumnNames(pendingImport.preview) : []).toEqual([
      "x",
      "y",
    ]);
    expect(
      store
        .getState()
        .commandHistory.slice(-2)
        .map((entry) => entry.command),
    ).toEqual([
      `import-set ${importId} skipRows=1 delimiter=semicolon hasHeader=true mode=tabular`,
      `import-column ${importId} column=z action=exclude`,
    ]);
  });

  it("updates import raw text lines through scispace commands", async () => {
    const { store } = await makeStore();
    const importId = openImport(store, "editable.csv", "x,y\n1,2\n3,4");

    await store
      .getState()
      .runScispace(`import-line ${importId} line=2 value=${encodeURIComponent("10,20")}`, {
        source: "gui",
      });

    const pendingImport = store.getState().pendingImports.find((item) => item.id === importId);
    expect(pendingImport?.text).toBe("x,y\n10,20\n3,4");
    expect(pendingImport?.preview?.rows[0]).toEqual({ x: 10, y: 20 });
    expect(store.getState().commandHistory.at(-1)).toMatchObject({
      command: `import-line ${importId} line=2 value=${encodeURIComponent("10,20")}`,
      source: "gui",
      status: "success",
    });
  });

  it("opens import dialogs through scispace commands", async () => {
    const { store } = await makeStore();
    await store
      .getState()
      .runScispace(`import-open import-1 name=opened.csv text=${encodeURIComponent("x,y\n1,2")}`, {
        source: "gui",
      });

    expect(store.getState().pendingImports).toHaveLength(1);
    expect(store.getState().pendingImports[0]).toMatchObject({
      id: "import-1",
      fileName: "opened.csv",
      preview: { rows: [{ x: 1, y: 2 }] },
    });
    expect(store.getState().windows.find((window) => window.importId === "import-1")).toMatchObject(
      {
        title: "Import - opened.csv",
        kind: "import",
      },
    );
    expect(store.getState().commandHistory.at(-1)).toMatchObject({
      command: `import-open import-1 name=opened.csv text=${encodeURIComponent("x,y\n1,2")}`,
      source: "gui",
      status: "success",
    });
  });

  it("keeps confirmed import dataset paths aligned after path collisions", async () => {
    const { db, store } = await makeStore();
    await store
      .getState()
      .runScispace(`import-open import-a name=replay.csv text=${encodeURIComponent("x,y\n1,2")}`, {
        source: "history",
      });
    await store.getState().runScispace("import-confirm import-a path=~/raw/replay.csv", {
      source: "history",
    });
    await store
      .getState()
      .runScispace(`import-open import-b name=replay.csv text=${encodeURIComponent("x,y\n3,4")}`, {
        source: "history",
      });
    await store.getState().runScispace("import-confirm import-b path=~/raw/replay.csv", {
      source: "history",
    });

    const replayedFile = await db.files.get("~/raw/replay (1).csv");
    const replayedDataset = replayedFile?.datasetId
      ? await db.datasets.get(replayedFile.datasetId)
      : undefined;
    expect(replayedFile).toMatchObject({ path: "~/raw/replay (1).csv" });
    expect(replayedDataset).toMatchObject({
      name: "replay (1).csv",
      sourcePath: "~/raw/replay (1).csv",
    });
  });

  it("opens raw import dialogs and confirms them without datasets", async () => {
    const { db, store } = await makeStore();
    const importId = openImport(store, "notes.txt", "raw notes");

    await store.getState().runScispace(`import-set ${importId} mode=raw`, { source: "gui" });
    const result = await store.getState().confirmImport(importId);

    expect(result?.dataset).toBeUndefined();
    expect(result?.parseError).toContain("Raw file stored");
    expect(await db.files.get("~/raw/notes.txt")).toMatchObject({ text: "raw notes" });
    expect(store.getState().commandHistory.at(-1)).toMatchObject({
      command: expect.stringContaining("import-confirm"),
      source: "gui",
      status: "success",
    });
  });

  it("returns undefined when confirming a missing pending import", async () => {
    const { store } = await makeStore();

    await expect(store.getState().confirmImport("missing")).resolves.toBeUndefined();
  });

  it("cancels pending imports through scispace commands", async () => {
    const { store } = await makeStore();
    const importId = openImport(store, "cancel-me.csv", "x,y\n1,2");

    await store.getState().runScispace(`import-cancel ${importId}`, { source: "gui" });

    expect(store.getState().pendingImports.some((item) => item.id === importId)).toBe(false);
    expect(store.getState().windows.some((window) => window.importId === importId)).toBe(false);
    expect(store.getState().commandHistory.at(-1)).toMatchObject({
      command: `import-cancel ${importId}`,
      source: "gui",
      status: "success",
    });
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

  it("initializes visible columns for imported datasets", async () => {
    const { db, store } = await makeStore();
    const importId = openImport(store, "drop-cols.csv", "x,empty,y\n1,,2\n3,,4");
    expect(store.getState().pendingImports[0]?.options.excludedColumnIds).toEqual(["empty"]);

    await store.getState().runScispace(`import-column ${importId} column=y action=exclude`, {
      source: "gui",
    });
    const result = await store.getState().confirmImport(importId);

    expect(result?.dataset?.columns.map((column) => column.id)).toEqual(["x"]);
    expect(store.getState().columnSelections[result?.dataset?.id ?? ""]).toEqual(["x"]);
    expect(
      (await db.layout.get("main"))?.value.columnSelections?.[result?.dataset?.id ?? ""],
    ).toEqual(["x"]);
  });

  it("lets raw text imports become tabular datasets after switching mode", async () => {
    const { store } = await makeStore();
    const importId = openImport(store, "notes.txt", "x y\n1 2");

    await store.getState().runScispace(`import-set ${importId} mode=tabular delimiter=space`, {
      source: "gui",
    });
    const result = await store.getState().confirmImport(importId);

    expect(result?.parseError).toBeUndefined();
    expect(result?.dataset?.name).toBe("notes.txt");
    expect(result?.dataset ? datasetColumnNames(result.dataset) : []).toEqual(["x", "y"]);
    expect(result?.dataset?.rows[0]).toEqual({ x: 1, y: 2 });
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

  it("resets Zustand and Dexie to a fresh project", async () => {
    const { db, store } = await makeStore();
    openImport(store, "pending.csv", "x,y\n1,2");
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
      "history",
    ]);
    expect(state.plotSpecs.map((plot) => plot.id)).toEqual(["seed-plot"]);
    expect(state.pendingImports).toHaveLength(0);
    expect(state.terminalEvents).toHaveLength(0);
    expect(state.commandHistory).toHaveLength(0);
    expect(state.activeDatasetId).toBe("seed-waveform");
    expect(state.activeWindowId).toBeUndefined();
    expect(state.currentPlotId).toBe("seed-plot");
    expect(state.viewport).toEqual({ x: -1920, y: -1080, scale: 1 });
    expect(await db.files.get("~/raw/sample.csv")).toBeUndefined();
    expect((await db.datasets.toArray()).some((dataset) => dataset.name === "derived.csv")).toBe(
      false,
    );
    expect((await db.layout.get("main"))?.value.windows.map((window) => window.kind)).toEqual([
      "browser",
      "table",
      "plot",
      "terminal",
      "history",
    ]);
  });

  it("saves the current project before creating and switching projects", async () => {
    const { db, store } = await makeStore();
    const firstProjectId = store.getState().currentProjectId;

    await store.getState().runScispace("elt waveform.csv as derived.csv");
    await store.getState().createNewProject("Second Project");

    const secondProjectId = store.getState().currentProjectId;
    expect(secondProjectId).not.toBe(firstProjectId);
    expect(store.getState().projects.map((project) => project.name)).toContain("Second Project");
    expect(store.getState().datasets.map((dataset) => dataset.name)).toEqual(["waveform.csv"]);

    expect(
      (await db.projects.get(firstProjectId ?? ""))?.datasets.map((dataset) => dataset.name),
    ).toContain("derived.csv");

    await store.getState().switchProject(firstProjectId ?? "");

    expect(store.getState().currentProjectId).toBe(firstProjectId);
    expect(store.getState().datasets.map((dataset) => dataset.name)).toContain("derived.csv");
    expect((await db.layout.get("main"))?.value.currentProjectId).toBe(firstProjectId);
  });

  it("renames saved projects and deletes non-current projects", async () => {
    const { db, store } = await makeStore();
    const firstProjectId = store.getState().currentProjectId;

    await store.getState().saveCurrentProject("Analysis");
    expect(
      store.getState().projects.find((project) => project.id === firstProjectId),
    ).toMatchObject({
      name: "Analysis",
    });
    expect(await db.projects.get(firstProjectId ?? "")).toMatchObject({ name: "Analysis" });

    await store.getState().createNewProject("Scratch");
    const secondProjectId = store.getState().currentProjectId;
    await store.getState().deleteProject(firstProjectId ?? "");

    expect(store.getState().currentProjectId).toBe(secondProjectId);
    expect(store.getState().projects.some((project) => project.id === firstProjectId)).toBe(false);
    expect(await db.projects.get(firstProjectId ?? "")).toBeUndefined();
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
