import { describe, expect, it } from "vitest";
import { datasetColumnNames, makeStore, openImport, stateOf } from "./scispaceStoreTestUtils";

describe("scispace store import behavior", () => {
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
});
