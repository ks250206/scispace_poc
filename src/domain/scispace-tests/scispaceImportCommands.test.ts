import { describe, expect, it } from "vitest";
import { configuredImport, runEmptyCommand } from "./scispaceCommandTestUtils";

describe("scispace import commands", () => {
  it("routes import preview and confirm through the scispace command path", () => {
    const pendingImport = configuredImport({
      text: "# ignored\nx;y\n1;2",
      options: {
        skipRows: 0,
        delimiter: "semicolon" as const,
        commentPrefix: "#",
        hasHeader: true,
        columnNames: [],
        excludedColumnIds: [],
      },
    });

    const preview = runEmptyCommand("import-preview import-1", { pendingImports: [pendingImport] });
    const confirmed = runEmptyCommand(
      `import-confirm import-1 path=${encodeURIComponent("~/raw/configured.csv")}`,
      { pendingImports: [pendingImport] },
    );

    expect(preview.kind).toBe("import-preview");
    if (preview.kind === "import-preview") expect(preview.preview?.rows[0]).toEqual({ x: 1, y: 2 });
    expect(confirmed.kind).toBe("import-confirm");
    if (confirmed.kind === "import-confirm") expect(confirmed.dataset?.name).toBe("configured.csv");
  });

  it("opens pending imports through commands", () => {
    const opened = runEmptyCommand(
      `import-open import-1 name=configured.csv text=${encodeURIComponent("x,y\n1,2")}`,
    );
    const uploaded = runEmptyCommand(
      "upload-open upload-1 name=uploaded.csv ref=upload-1 mode=raw",
      {
        uploadPayloads: {
          "upload-1": {
            id: "upload-1",
            fileName: "uploaded.csv",
            text: "a,b\n3,4",
            mode: "raw",
            createdAt: 1,
          },
        },
      },
    );
    const missingPayload = runEmptyCommand(
      "upload-open missing-upload name=missing.csv ref=missing-upload",
    );
    const missingName = runEmptyCommand("import-open import-1 text=abc");

    expect(opened).toMatchObject({
      kind: "import-open",
      importId: "import-1",
      pendingImport: {
        fileName: "configured.csv",
        text: "x,y\n1,2",
        mode: "tabular",
      },
    });
    expect(uploaded).toMatchObject({
      kind: "import-open",
      importId: "upload-1",
      pendingImport: {
        fileName: "uploaded.csv",
        text: "a,b\n3,4",
        mode: "raw",
      },
      output: "Upload opened: uploaded.csv",
    });
    expect(missingPayload).toMatchObject({
      kind: "error",
      output: "Upload payload not found: missing-upload",
    });
    expect(missingName).toMatchObject({ kind: "error" });
  });

  it("updates import settings and column exclusions through commands", () => {
    const pendingImport = configuredImport({
      text: "skip\nx;y;z\n1;2;3",
      options: {
        skipRows: 0,
        delimiter: "auto" as const,
        commentPrefix: "",
        hasHeader: true,
        columnNames: [],
        excludedColumnIds: [],
      },
    });

    const settings = runEmptyCommand(
      "import-set import-1 skipRows=1 delimiter=semicolon commentPrefix=# hasHeader=false mode=raw columnNames=a,b,c",
      { pendingImports: [pendingImport] },
    );
    expect(settings.kind).toBe("import-updated");
    if (settings.kind === "import-updated") {
      expect(settings.pendingImport).toMatchObject({
        mode: "raw",
        options: {
          skipRows: 1,
          delimiter: "semicolon",
          commentPrefix: "#",
          hasHeader: false,
          columnNames: ["a", "b", "c"],
        },
      });
    }

    const excluded = runEmptyCommand("import-column import-1 column=z action=exclude", {
      pendingImports: [pendingImport],
    });
    expect(excluded).toMatchObject({ kind: "import-updated" });
    if (excluded.kind === "import-updated") {
      expect(excluded.pendingImport.options.excludedColumnIds).toEqual(["z"]);
    }
  });

  it("updates import raw text lines through commands", () => {
    const pendingImport = configuredImport({
      text: "x,y\n1,2\n3,4",
    });

    const updated = runEmptyCommand("import-line import-1 line=2 value=10,20", {
      pendingImports: [pendingImport],
    });
    const invalid = runEmptyCommand("import-line import-1 line=0 value=bad", {
      pendingImports: [pendingImport],
    });

    expect(updated).toMatchObject({ kind: "import-updated" });
    if (updated.kind === "import-updated") {
      expect(updated.pendingImport.text).toBe("x,y\n10,20\n3,4");
    }
    expect(invalid).toMatchObject({ kind: "error" });
  });

  it("cancels pending imports through commands", () => {
    const pendingImport = configuredImport();

    const cancelled = runEmptyCommand("import-cancel import-1", {
      pendingImports: [pendingImport],
    });
    const missing = runEmptyCommand("import-cancel missing", { pendingImports: [pendingImport] });

    expect(cancelled).toMatchObject({
      kind: "import-cancel",
      importId: "import-1",
      output: "Import cancelled: configured.csv",
    });
    expect(missing).toMatchObject({ kind: "error" });
  });

  it("reports import command failures and raw confirmations", () => {
    const pendingImport = configuredImport({
      id: "import-raw",
      fileName: "notes.txt",
      text: "hello",
      mode: "raw" as const,
      options: {
        skipRows: 0,
        delimiter: "auto" as const,
        commentPrefix: "",
        hasHeader: true,
        columnNames: [],
        excludedColumnIds: [],
      },
    });

    expect(runEmptyCommand("import-preview missing").kind).toBe("error");
    expect(
      runEmptyCommand("import-confirm import-raw", { pendingImports: [pendingImport] }).kind,
    ).toBe("error");
    const raw = runEmptyCommand(
      `import-confirm import-raw path=${encodeURIComponent("~/raw/notes.txt")} raw=true`,
      { pendingImports: [pendingImport] },
    );

    expect(raw).toMatchObject({
      kind: "import-confirm",
      parseError: "Raw file stored without tabular parsing",
    });
  });

  it("reports tabular import parse failures and supports full previews", () => {
    const pendingImport = configuredImport({
      id: "bad-import",
      fileName: "bad.csv",
      text: "\n",
      options: {
        skipRows: 0,
        delimiter: "auto" as const,
        commentPrefix: "",
        hasHeader: true,
        columnNames: [],
        excludedColumnIds: [],
      },
    });
    const fullPreview = runEmptyCommand("import-preview good full=true", {
      pendingImports: [
        {
          ...pendingImport,
          id: "good",
          text: "x,y\n1,2\n3,4",
        },
      ],
    });
    const failedPreview = runEmptyCommand("import-preview bad-import", {
      pendingImports: [pendingImport],
    });
    const failedConfirm = runEmptyCommand(
      `import-confirm bad-import path=${encodeURIComponent("~/raw/bad.csv")}`,
      { pendingImports: [pendingImport] },
    );

    expect(fullPreview.kind).toBe("import-preview");
    if (fullPreview.kind === "import-preview") expect(fullPreview.preview?.rows).toHaveLength(2);
    expect(failedPreview).toMatchObject({ kind: "import-preview", error: "Empty tabular file" });
    expect(failedConfirm).toMatchObject({
      kind: "import-confirm",
      parseError: "Empty tabular file",
    });
  });
});
