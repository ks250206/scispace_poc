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
    const help = executeScispaceCommand("help", { datasets: [] }).output;
    expect(help).toContain("scispace commands");
    expect(help).toContain("file-list [path]");
    expect(help).toContain("file-rename <path> name=<newName>");
    expect(executeScispaceCommand("lsdata", { datasets: [] }).output).toBe("No datasets loaded");
  });

  it("opens a table for a dataset", () => {
    const result = executeScispaceCommand("table waveform.csv", { datasets: [dataset] });
    expect(result).toMatchObject({ kind: "open-table", datasetId: "seed-waveform" });
  });

  it("deletes table rows and columns through table-edit commands", () => {
    const deletedRow = executeScispaceCommand("table-edit waveform.csv action=delete-row index=1", {
      datasets: [dataset],
    });
    expect(deletedRow.kind).toBe("dataset-updated");
    if (deletedRow.kind === "dataset-updated") {
      expect(deletedRow.dataset.rows).toHaveLength(dataset.rows.length - 1);
      expect(deletedRow.dataset.rows[0]?.index).toBe(1);
      expect(deletedRow.output).toBe("Deleted row 1 from waveform.csv");
    }

    const deletedColumn = executeScispaceCommand(
      "table-edit waveform.csv action=delete-column column=signal",
      { datasets: [dataset] },
    );
    expect(deletedColumn.kind).toBe("dataset-updated");
    if (deletedColumn.kind === "dataset-updated") {
      expect(deletedColumn.dataset.columns.map((column) => column.id)).toEqual([
        "index",
        "time",
        "background",
      ]);
      expect(deletedColumn.dataset.rows[0]).not.toHaveProperty("signal");
      expect(deletedColumn.output).toBe("Deleted column signal from waveform.csv");
    }
  });

  it("updates table cells through table-edit commands", () => {
    const updated = executeScispaceCommand(
      "table-edit waveform.csv action=set-cell row=1 column=signal value=123.45",
      { datasets: [dataset] },
    );

    expect(updated.kind).toBe("dataset-updated");
    if (updated.kind === "dataset-updated") {
      expect(updated.dataset.rows[0]?.signal).toBe(123.45);
      expect(updated.output).toBe("Updated cell row 1 column signal in waveform.csv");
    }
  });

  it("reports malformed table-edit commands", () => {
    const singleColumnDataset = { ...dataset, columns: [dataset.columns[0]], rows: [{ index: 0 }] };
    expect(
      executeScispaceCommand("table-edit missing.csv action=delete-row index=1", {
        datasets: [dataset],
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("table-edit waveform.csv action=delete-row index=0", {
        datasets: [dataset],
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("table-edit waveform.csv action=delete-row index=999", {
        datasets: [dataset],
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("table-edit waveform.csv action=delete-column column=missing", {
        datasets: [dataset],
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("table-edit waveform.csv action=delete-column column=index", {
        datasets: [singleColumnDataset],
      }).kind,
    ).toBe("error");
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
            drawOrder: 0,
          },
        ],
        zoomMode: "xy",
        grid: { x: true, y: true },
        border: true,
        size: { width: 640, height: 360 },
        font: { family: "Inter, system-ui, sans-serif", size: 12 },
        padding: { top: 12, right: 12, bottom: 12, left: 12 },
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
          drawOrder: 0,
        },
        {
          y: "background",
          label: "background",
          color: "#dc2626",
          lineWidth: 2,
          markerSize: 6,
          markerShape: "circle",
          drawOrder: 1,
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
      'plot-set plot-1 title="Edited Plot" type=marker border=false zoom=x width=800 height=480 fontFamily=Arial fontSize=14 padding=8:16:24:32',
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
        font: { family: "Arial", size: 14 },
        padding: { top: 8, right: 16, bottom: 24, left: 32 },
      },
    });

    const axis = executeScispaceCommand(
      'plot-axis plot-1 axis=y label="Signal axis" range=0.1:10 tick=2 tickDir=in scale=linear labelFontFamily=Helvetica labelFontSize=16 valueFontFamily=Menlo valueFontSize=11 size=56 gap=8 labelGap=12 labelSize=28 color=#111827 gridColor=#d1d5db tickColor=#6b7280 tickLength=10 minorTick=true',
      { datasets: [dataset], plotSpecs },
    );
    expect(axis).toMatchObject({
      kind: "plot-axis-updated",
      spec: {
        axes: {
          y: {
            label: "Signal axis",
            range: { mode: "manual", min: 0.1, max: 10 },
            ticks: {
              mode: "manual",
              interval: 2,
              orientation: "in",
              length: 10,
              minor: true,
            },
            scale: "linear",
            labelStyle: { family: "Helvetica", size: 16 },
            valueStyle: { family: "Menlo", size: 11 },
            size: 56,
            gap: 8,
            labelGap: 12,
            labelSize: 28,
            color: "#111827",
            gridColor: "#d1d5db",
            tickColor: "#6b7280",
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
      "plot-series plot-1 y=signal label=Signal color=#dc2626 lineWidth=3 markerSize=8 markerShape=diamond order=4",
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
            markerShape: "diamond",
            drawOrder: 4,
          },
        ],
      },
    });
  });

  it("updates text-arrow plot annotations through scispace commands", () => {
    const created = executeScispaceCommand("plot waveform.csv x=time y=signal", {
      datasets: [dataset],
    });
    expect(created.kind).toBe("plot-created");
    if (created.kind !== "plot-created") return;

    const plotSpecs = [{ ...created.spec, id: "plot-1" }];
    const added = executeScispaceCommand(
      'plot-annotation plot-1 action=add type=text-arrow text="Peak A" x=1.5 y=0.5 dx=24 dy=-32 color=#111827 fontFamily=Arial fontSize=13',
      { datasets: [dataset], plotSpecs },
    );
    expect(added.kind).toBe("plot-annotation-updated");
    if (added.kind !== "plot-annotation-updated") return;
    expect(added.spec.annotations).toHaveLength(1);
    expect(added.spec.annotations[0]).toMatchObject({
      type: "text-arrow",
      text: "Peak A",
      x: 1.5,
      y: 0.5,
      dx: 24,
      dy: -32,
      color: "#111827",
      font: { family: "Arial", size: 13 },
    });

    const annotationId = added.spec.annotations[0]?.id ?? "";
    const updated = executeScispaceCommand(
      `plot-annotation plot-1 action=update id=${annotationId} text=PeakB dx=12`,
      { datasets: [dataset], plotSpecs: [added.spec] },
    );
    expect(updated).toMatchObject({
      kind: "plot-annotation-updated",
      spec: { annotations: [{ id: annotationId, text: "PeakB", dx: 12 }] },
    });

    const removed = executeScispaceCommand(
      `plot-annotation plot-1 action=remove id=${annotationId}`,
      { datasets: [dataset], plotSpecs: [added.spec] },
    );
    expect(removed).toMatchObject({
      kind: "plot-annotation-updated",
      spec: { annotations: [] },
    });
  });

  it("allows log scale only for positive axis data", () => {
    const positiveDataset = {
      ...dataset,
      id: "positive",
      name: "positive.csv",
      rows: [
        { time: 1, signal: 2 },
        { time: 2, signal: 4 },
      ],
    };
    const created = executeScispaceCommand("plot positive.csv x=time y=signal", {
      datasets: [positiveDataset],
    });
    expect(created.kind).toBe("plot-created");
    if (created.kind !== "plot-created") return;

    const result = executeScispaceCommand("plot-axis plot-positive axis=x scale=log", {
      datasets: [positiveDataset],
      plotSpecs: [{ ...created.spec, id: "plot-positive" }],
    });
    expect(result).toMatchObject({
      kind: "plot-axis-updated",
      spec: { axes: { x: { scale: "log" } } },
    });
  });

  it("prints the plot schema and current plot spec", () => {
    const schema = executeScispaceCommand("plot-schema", { datasets: [dataset] });
    expect(schema.kind).toBe("text");
    expect(schema.output).toContain('"plotType"');
    expect(schema.output).toContain('"size"');
    expect(schema.output).toContain('"annotations"');

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
      executeScispaceCommand("plot-axis plot-1 axis=x scale=log", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-axis plot-1 axis=x tickLength=-1", {
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
    ).toBe("plot-series-updated");
    expect(
      executeScispaceCommand("plot-series plot-1 y=signal lineWidth=wide", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-series plot-1 y=signal order=bad", {
        datasets: [dataset],
        plotSpecs,
      }).kind,
    ).toBe("error");
    expect(
      executeScispaceCommand("plot-annotation plot-1 action=add x=1 y=2", {
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

  it("parses virtual file operation commands", () => {
    expect(executeScispaceCommand("file-mkdir ~/raw/analysis", { datasets: [] })).toMatchObject({
      kind: "file-command",
      action: "mkdir",
      path: "~/raw/analysis",
    });
    expect(
      executeScispaceCommand('file-rename ~/raw/waveform.csv name="renamed file.csv"', {
        datasets: [],
      }),
    ).toMatchObject({
      kind: "file-command",
      action: "rename",
      path: "~/raw/waveform.csv",
      name: "renamed file.csv",
    });
    expect(
      executeScispaceCommand("file-move ~/raw/waveform.csv to=~/raw/analysis", { datasets: [] }),
    ).toMatchObject({
      kind: "file-command",
      action: "move",
      path: "~/raw/waveform.csv",
      targetDirectory: "~/raw/analysis",
    });
    expect(
      executeScispaceCommand("file-delete ~/raw/waveform.csv", { datasets: [] }),
    ).toMatchObject({
      kind: "file-command",
      action: "delete",
      path: "~/raw/waveform.csv",
    });
    expect(executeScispaceCommand("file-list ~/raw", { datasets: [] })).toMatchObject({
      kind: "file-command",
      action: "list",
      path: "~/raw",
    });
    expect(executeScispaceCommand("file-list", { datasets: [] })).toMatchObject({
      kind: "file-command",
      action: "list",
      path: "~/raw",
    });
  });

  it("reports malformed virtual file operation commands", () => {
    expect(executeScispaceCommand("file-mkdir /tmp", { datasets: [] }).kind).toBe("error");
    expect(executeScispaceCommand("file-rename ~/raw/a.csv", { datasets: [] }).kind).toBe("error");
    expect(
      executeScispaceCommand("file-rename ~/raw/a.csv name=../bad.csv", { datasets: [] }).kind,
    ).toBe("error");
    expect(executeScispaceCommand("file-move ~/raw/a.csv", { datasets: [] }).kind).toBe("error");
    expect(executeScispaceCommand("file-move ~/raw/a.csv to=/tmp", { datasets: [] }).kind).toBe(
      "error",
    );
    expect(executeScispaceCommand("file-delete", { datasets: [] }).kind).toBe("error");
  });

  it("prints virtual file lists with parsed and raw statuses", () => {
    const result = executeScispaceCommand("file-list ~/raw", {
      datasets: [dataset],
      files: [
        {
          id: "~/raw/analysis",
          path: "~/raw/analysis",
          name: "analysis",
          kind: "directory",
          createdAt: 1,
        },
        {
          id: "~/raw/waveform.csv",
          path: "~/raw/waveform.csv",
          name: "waveform.csv",
          kind: "file",
          datasetId: "seed-waveform",
          text: "index,time\n0,0",
          createdAt: 1,
        },
        {
          id: "~/raw/notes.txt",
          path: "~/raw/notes.txt",
          name: "notes.txt",
          kind: "file",
          text: "hello",
          parseError: "Raw file stored without tabular parsing",
          createdAt: 1,
        },
      ],
    });

    expect(result).toMatchObject({ kind: "file-command", action: "list" });
    expect(result.output).toContain("[dir] ~/raw/analysis");
    expect(result.output).toContain(
      "[dataset] ~/raw/waveform.csv -> waveform.csv (160 rows, 4 cols)",
    );
    expect(result.output).toContain("[raw] ~/raw/notes.txt");
  });

  it("routes import preview and confirm through the scispace command path", () => {
    const pendingImport = {
      id: "import-1",
      fileName: "configured.csv",
      text: "# ignored\nx;y\n1;2",
      mode: "tabular" as const,
      options: {
        skipRows: 0,
        delimiter: "semicolon" as const,
        commentPrefix: "#",
        hasHeader: true,
        columnNames: [],
        excludedColumnIds: [],
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

  it("updates import settings and column exclusions through commands", () => {
    const pendingImport = {
      id: "import-1",
      fileName: "configured.csv",
      text: "skip\nx;y;z\n1;2;3",
      mode: "tabular" as const,
      options: {
        skipRows: 0,
        delimiter: "auto" as const,
        commentPrefix: "",
        hasHeader: true,
        columnNames: [],
        excludedColumnIds: [],
      },
    };

    const settings = executeScispaceCommand(
      "import-set import-1 skipRows=1 delimiter=semicolon commentPrefix=# hasHeader=false mode=raw columnNames=a,b,c",
      { datasets: [], pendingImports: [pendingImport] },
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

    const excluded = executeScispaceCommand("import-column import-1 column=z action=exclude", {
      datasets: [],
      pendingImports: [pendingImport],
    });
    expect(excluded).toMatchObject({ kind: "import-updated" });
    if (excluded.kind === "import-updated") {
      expect(excluded.pendingImport.options.excludedColumnIds).toEqual(["z"]);
    }
  });

  it("reports import command failures and raw confirmations", () => {
    const pendingImport = {
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
      mode: "tabular" as const,
      options: {
        skipRows: 0,
        delimiter: "auto" as const,
        commentPrefix: "",
        hasHeader: true,
        columnNames: [],
        excludedColumnIds: [],
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
