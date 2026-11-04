import { describe, expect, it } from "vite-plus/test";
import { datasetColumnNames, makeStore, openImport, stateOf } from "./scispaceStoreTestUtils";

describe("scispace store import lifecycle behavior", () => {
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

  it("keeps explicit names and renamed exclusions separate from inferred headers", async () => {
    const { store } = await makeStore();
    const importId = openImport(
      store,
      "headers.csv",
      "x,y,z\nDate,Time,Elapsed_sec\n2026-09-10,13:38:13.759,0.118",
    );
    const run = (command: string) => store.getState().runScispace(command);
    await run(`import-column ${importId} column=y action=rename name="Clock time"`);
    await run(`import-set ${importId} skipRows=1`);
    const pending = () => store.getState().pendingImports.find(({ id }) => id === importId);
    expect(pending()?.options.columnNames).toEqual(["", "Clock time"]);
    expect(pending()?.preview?.columns.map(({ name }) => name)).toEqual([
      "Date",
      "Clock time",
      "Elapsed_sec",
    ]);

    await run(`import-column ${importId} column=Clock_time action=exclude`);
    await run(`import-column ${importId} column=Clock_time action=rename name=""`);
    expect(pending()?.options.excludedColumnIds).toEqual(["Time"]);
    expect(pending()?.allPreview?.columns.map(({ name }) => name)).toEqual([
      "Date",
      "Time",
      "Elapsed_sec",
    ]);
    expect(pending()?.preview?.columns.map(({ name }) => name)).toEqual(["Date", "Elapsed_sec"]);
    const result = await store.getState().confirmImport(importId);
    expect(result?.dataset?.rows).toEqual([{ Date: "2026-09-10", Elapsed_sec: 0.118 }]);
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

  it("uses edited column names for header imports before confirming", async () => {
    const { store } = await makeStore();
    const importId = openImport(store, "header.csv", "x,y,label\n1,2,a\n3,4,b");

    await store
      .getState()
      .runScispace(`import-set ${importId} columnNames=time,current,note`, { source: "gui" });
    const result = await store.getState().confirmImport(importId);

    expect(result?.dataset ? datasetColumnNames(result.dataset) : []).toEqual([
      "time",
      "current",
      "note",
    ]);
    expect(result?.dataset?.columns.map((column) => column.dataType)).toEqual([
      "number",
      "number",
      "string",
    ]);
    expect(result?.dataset?.rows[0]).toEqual({ time: 1, current: 2, note: "a" });
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

  it("tracks manual preset overrides and reapplies detected import presets", async () => {
    const { store } = await makeStore();
    const text =
      "EC-Lab ASCII FILE\nNb header lines : 4\nRun on channel : 4\nmode\ttime/s\tEwe/V\n1\t0\t3";
    const importId = openImport(store, "sample.mpt", text);

    await store.getState().runScispace(`import-set ${importId} delimiter=comma`, {
      source: "gui",
    });
    expect(store.getState().pendingImports[0]).toMatchObject({
      presetOverridden: true,
      options: { delimiter: "comma" },
    });

    await store.getState().runScispace(`import-set ${importId} preset=apply`, {
      source: "gui",
    });
    expect(store.getState().pendingImports[0]).toMatchObject({
      presetOverridden: false,
      options: { skipRows: 3, delimiter: "tab", hasHeader: true },
      preview: { rows: [{ mode: 1, time_s: 0, Ewe_V: 3 }] },
    });
  });
});
