import { describe, expect, it } from "vitest";
import {
  createScispaceStore,
  datasetColumnNames,
  makeStore,
  openImport,
} from "./scispaceStoreTestUtils";

describe("scispace store import command behavior", () => {
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

  it("opens upload dialogs through scispace commands", async () => {
    const { store } = await makeStore();
    const uploadId = store.getState().stageUploadPayload("uploaded.csv", "x,y\n1,2");
    await store
      .getState()
      .runScispace(`upload-open ${uploadId} name=uploaded.csv ref=${uploadId}`, {
        source: "gui",
      });

    expect(store.getState().pendingImports).toHaveLength(1);
    expect(store.getState().pendingImports[0]).toMatchObject({
      id: uploadId,
      fileName: "uploaded.csv",
      preview: { rows: [{ x: 1, y: 2 }] },
    });
    expect(store.getState().windows.find((window) => window.importId === uploadId)).toMatchObject({
      title: "Import - uploaded.csv",
      kind: "import",
    });
    expect(store.getState().commandHistory.at(-1)).toMatchObject({
      command: `upload-open ${uploadId} name=uploaded.csv ref=${uploadId}`,
      source: "gui",
      status: "success",
    });
    expect(store.getState().commandHistory.at(-1)?.command).not.toContain("x%2Cy");
  });

  it("replays compact upload commands after layout reload", async () => {
    const { db, store } = await makeStore();
    const uploadId = store.getState().stageUploadPayload("reload-upload.csv", "x,y\n9,10");
    const command = `upload-open ${uploadId} name=reload-upload.csv ref=${uploadId}`;
    await store.getState().runScispace(command, { source: "gui" });

    const reloadedStore = createScispaceStore(db);
    await reloadedStore.getState().initialize();
    await reloadedStore.getState().runScispace(command, { source: "history" });

    expect(reloadedStore.getState().pendingImports.at(-1)).toMatchObject({
      id: uploadId,
      fileName: "reload-upload.csv",
      preview: { rows: [{ x: 9, y: 10 }] },
    });
    expect(reloadedStore.getState().commandHistory.at(-1)).toMatchObject({
      command,
      source: "history",
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
