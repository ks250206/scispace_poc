import { describe, expect, it } from "vitest";
import { createSeedDataset } from "./csv";
import { executeScispaceCommand } from "./scispace";

describe("scispace pseudo command interpreter", () => {
  const dataset = createSeedDataset();

  it("lists loaded datasets", () => {
    const result = executeScispaceCommand("lsdata", { datasets: [dataset] });
    expect(result.output).toContain("waveform.csv");
    expect(result.output).toContain("columns: index, time, signal, background");
  });

  it("prints help and empty dataset states", () => {
    expect(executeScispaceCommand("help", { datasets: [] }).output).toContain("scispace commands");
    expect(executeScispaceCommand("lsdata", { datasets: [] }).output).toBe("No datasets loaded");
  });

  it("opens a table for a dataset", () => {
    const result = executeScispaceCommand("table waveform.csv", { datasets: [dataset] });
    expect(result).toMatchObject({ kind: "open-table", datasetId: "seed-waveform" });
  });

  it("creates plot specs from column options", () => {
    const result = executeScispaceCommand("plot waveform.csv x=time y=signal", {
      datasets: [dataset],
    });
    expect(result.kind).toBe("plot");
    if (result.kind === "plot") {
      expect(result.spec).toMatchObject({
        source: "seed-waveform",
        x: "time",
        y: "signal",
        type: "line",
        series: [{ y: "signal", label: "signal", color: "#2563eb" }],
        zoomMode: "xy",
      });
    }
  });

  it("creates multi-series plot specs from comma-separated y columns", () => {
    const result = executeScispaceCommand("plot waveform.csv x=time y=signal,background", {
      datasets: [dataset],
    });

    expect(result.kind).toBe("plot");
    if (result.kind === "plot") {
      expect(result.spec.series).toEqual([
        { y: "signal", label: "signal", color: "#2563eb" },
        { y: "background", label: "background", color: "#dc2626" },
      ]);
      expect(result.spec.title).toBe("waveform.csv: signal, background vs time");
    }
  });

  it("creates derived datasets through elt", () => {
    const result = executeScispaceCommand("elt waveform.csv as filtered.csv", {
      datasets: [dataset],
    });
    expect(result.kind).toBe("dataset-created");
    if (result.kind === "dataset-created") {
      expect(result.dataset.name).toBe("filtered.csv");
      expect(result.dataset.rows).toHaveLength(dataset.rows.length);
    }
  });

  it("reports invalid commands as errors", () => {
    const result = executeScispaceCommand("plot waveform.csv x=missing y=signal", {
      datasets: [dataset],
    });
    expect(result.kind).toBe("error");
  });

  it("reports missing datasets and malformed commands", () => {
    expect(executeScispaceCommand("table missing.csv", { datasets: [dataset] }).kind).toBe("error");
    expect(executeScispaceCommand("plot missing.csv", { datasets: [dataset] }).kind).toBe("error");
    expect(
      executeScispaceCommand("elt missing.csv as copy.csv", { datasets: [dataset] }).kind,
    ).toBe("error");
    expect(executeScispaceCommand("elt waveform.csv", { datasets: [dataset] }).output).toContain(
      "Usage",
    );
    expect(executeScispaceCommand("unknown", { datasets: [dataset] }).output).toContain("Unknown");
  });

  it("routes import preview and confirm through the scispace command path", () => {
    const pendingImport = {
      id: "import-1",
      fileName: "configured.csv",
      text: "# ignored\nx;y\n1;2",
      options: {
        skipRows: 0,
        delimiter: "semicolon" as const,
        commentPrefix: "#",
        hasHeader: true,
        columnNames: [],
      },
    };

    const preview = executeScispaceCommand("import-preview import-1", {
      datasets: [],
      pendingImports: [pendingImport],
    });
    const confirmed = executeScispaceCommand(
      `import-confirm import-1 path=${encodeURIComponent("~/raw/configured.csv")}`,
      {
        datasets: [],
        pendingImports: [pendingImport],
      },
    );

    expect(preview.kind).toBe("import-preview");
    if (preview.kind === "import-preview") expect(preview.preview?.rows[0]).toEqual({ x: 1, y: 2 });
    expect(confirmed.kind).toBe("import-confirm");
    if (confirmed.kind === "import-confirm") expect(confirmed.dataset?.name).toBe("configured.csv");
  });

  it("reports import command failures and raw confirmations", () => {
    const pendingImport = {
      id: "import-raw",
      fileName: "notes.txt",
      text: "hello",
      options: {
        skipRows: 0,
        delimiter: "auto" as const,
        commentPrefix: "",
        hasHeader: true,
        columnNames: [],
      },
    };

    expect(executeScispaceCommand("import-preview missing", { datasets: [] }).kind).toBe("error");
    expect(
      executeScispaceCommand("import-confirm import-raw", {
        datasets: [],
        pendingImports: [pendingImport],
      }).kind,
    ).toBe("error");
    const raw = executeScispaceCommand(
      `import-confirm import-raw path=${encodeURIComponent("~/raw/notes.txt")} raw=true`,
      {
        datasets: [],
        pendingImports: [pendingImport],
      },
    );

    expect(raw).toMatchObject({
      kind: "import-confirm",
      parseError: "Raw file stored without tabular parsing",
    });
  });

  it("reports tabular import parse failures and supports full previews", () => {
    const pendingImport = {
      id: "bad-import",
      fileName: "bad.csv",
      text: "\n",
      options: {
        skipRows: 0,
        delimiter: "auto" as const,
        commentPrefix: "",
        hasHeader: true,
        columnNames: [],
      },
    };
    const fullPreview = executeScispaceCommand("import-preview good full=true", {
      datasets: [],
      pendingImports: [
        {
          ...pendingImport,
          id: "good",
          text: "x,y\n1,2\n3,4",
        },
      ],
    });
    const failedPreview = executeScispaceCommand("import-preview bad-import", {
      datasets: [],
      pendingImports: [pendingImport],
    });
    const failedConfirm = executeScispaceCommand(
      `import-confirm bad-import path=${encodeURIComponent("~/raw/bad.csv")}`,
      { datasets: [], pendingImports: [pendingImport] },
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
