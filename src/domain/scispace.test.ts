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
    expect(result.kind).toBe("plot-created");
    if (result.kind === "plot-created") {
      expect(result.spec).toMatchObject({
        source: "seed-waveform",
        x: "time",
        y: "signal",
        type: "line",
        plotType: "line",
        series: [
          {
            y: "signal",
            label: "signal",
            color: "#2563eb",
            lineWidth: 2,
            markerSize: 6,
            markerShape: "circle",
          },
        ],
        zoomMode: "xy",
        grid: { x: true, y: true },
        border: true,
        size: { width: 640, height: 360 },
      });
    }
  });

  it("creates multi-series plot specs from comma-separated y columns", () => {
    const result = executeScispaceCommand("plot waveform.csv x=time y=signal,background", {
      datasets: [dataset],
    });

    expect(result.kind).toBe("plot-created");
    if (result.kind === "plot-created") {
      expect(result.spec.series).toEqual([
        {
          y: "signal",
          label: "signal",
          color: "#2563eb",
          lineWidth: 2,
          markerSize: 6,
          markerShape: "circle",
        },
        {
          y: "background",
          label: "background",
          color: "#dc2626",
          lineWidth: 2,
          markerSize: 6,
          markerShape: "circle",
        },
      ]);
      expect(result.spec.title).toBe("waveform.csv: signal, background vs time");
    }
  });

  it("updates rich plot settings through plot commands", () => {
    const created = executeScispaceCommand("plot waveform.csv x=time y=signal type=line-marker", {
      datasets: [dataset],
    });
    expect(created.kind).toBe("plot-created");
    if (created.kind !== "plot-created") return;

    const plotSpecs = [{ ...created.spec, id: "plot-1" }];
    const set = executeScispaceCommand(
      'plot-set plot-1 title="Edited Plot" type=marker border=false zoom=x width=800 height=480',
      {
        datasets: [dataset],
        plotSpecs,
      },
    );
    expect(set).toMatchObject({
      kind: "plot-updated",
      spec: {
        title: "Edited Plot",
        plotType: "marker",
        border: false,
        zoomMode: "x",
        size: { width: 800, height: 480 },
      },
    });

    const axis = executeScispaceCommand(
      'plot-axis plot-1 axis=x label="Time axis" range=0:10 tick=2 tickDir=in',
      { datasets: [dataset], plotSpecs },
    );
    expect(axis).toMatchObject({
      kind: "plot-axis-updated",
      spec: {
        axes: {
          x: {
            label: "Time axis",
            range: { mode: "manual", min: 0, max: 10 },
            ticks: { mode: "manual", interval: 2, orientation: "in" },
          },
        },
      },
    });

    const grid = executeScispaceCommand("plot-grid plot-1 x=false y=true", {
      datasets: [dataset],
      plotSpecs,
    });
    expect(grid).toMatchObject({ kind: "plot-updated", spec: { grid: { x: false, y: true } } });

    const series = executeScispaceCommand(
      "plot-series plot-1 y=signal label=Signal color=#dc2626 lineWidth=3 markerSize=8 markerShape=square",
      { datasets: [dataset], plotSpecs },
    );
    expect(series).toMatchObject({
      kind: "plot-series-updated",
      spec: {
        series: [
          {
            y: "signal",
            label: "Signal",
            color: "#dc2626",
            lineWidth: 3,
            markerSize: 8,
            markerShape: "square",
          },
        ],
      },
    });
  });

  it("prints the plot schema and current plot spec", () => {
    const schema = executeScispaceCommand("plot-schema", { datasets: [dataset] });
    expect(schema.kind).toBe("text");
    expect(schema.output).toContain('"plotType"');
    expect(schema.output).toContain('"size"');

    const created = executeScispaceCommand(
      "plot waveform.csv x=time y=signal width=700 height=420",
      {
        datasets: [dataset],
      },
    );
    expect(created.kind).toBe("plot-created");
    if (created.kind !== "plot-created") return;

    const current = executeScispaceCommand("plot-schema plot-1", {
      datasets: [dataset],
      plotSpecs: [{ ...created.spec, id: "plot-1" }],
    });
    expect(current.kind).toBe("text");
    expect(JSON.parse(current.output)).toMatchObject({
      id: "plot-1",
      size: { width: 700, height: 420 },
      plotType: "line",
    });
  });

  it("reports invalid rich plot updates", () => {
    const result = executeScispaceCommand("plot waveform.csv x=time y=signal", {
      datasets: [dataset],
    });
    expect(result.kind).toBe("plot-created");
    if (result.kind !== "plot-created") return;
    const plotSpecs = [{ ...result.spec, id: "plot-1" }];

    expect(
      executeScispaceCommand("plot-set missing title=x", { datasets: [dataset], plotSpecs }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-set plot-1 type=bars", { datasets: [dataset], plotSpecs }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot waveform.csv x=time y=signal type=bars", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-set plot-1 zoom=z", { datasets: [dataset], plotSpecs }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-set plot-1 border=maybe", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-set plot-1 width=20", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot waveform.csv x=time y=signal height=5000", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-axis plot-1 axis=x range=10:0", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-axis plot-1 axis=x tick=bad", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-axis plot-1 axis=x tickDir=sideways", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-grid plot-1 x=maybe", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-series plot-1 y=missing action=add", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-series plot-1 y=signal markerShape=triangle", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-series plot-1 y=signal lineWidth=wide", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
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
